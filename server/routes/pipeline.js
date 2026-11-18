import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { config } from '../config.js';
import { llm } from '../llm.js';
import { canAccessFile, registerFile } from '../db.js';

const run = promisify(execFile);
const router = Router();

const ffmpegPath = ffmpegInstaller?.path || '';
export const ffmpegAvailable = Boolean(ffmpegPath) && existsSync(ffmpegPath);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const toNum = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

/**
 * 剧本 → 分镜（含时间戳）+ 角色列表。
 * 「全局配置」里的剧本和画风是背景信息，作为 system 层喂给模型。
 */
router.post('/pipeline/split', async (req, res) => {
  const { script = '', style = '', instruction = '', ratio = '16:9' } = req.body || {};
  if (!String(script).trim()) return res.status(400).json({ error: '全局配置里还没有剧本内容' });
  if (!llm.isEnabled()) return res.status(503).json({ error: 'LLM 未启用，先在 server/.env 配好 ARK_API_KEY' });

  try {
    const { data, model } = await llm.chatJson([
      {
        role: 'system',
        content:
          '你是短剧分镜师。把剧本拆成带时间戳的连续分镜，并识别本场所有主要角色（每个角色一条独立定妆描述）。只输出 JSON，不要解释。\n' +
          `背景信息（剧本原文）：${script}\n` +
          `统一画风（所有画面都要遵守）：${style || '写实电影感'}\n` +
          `画幅：${ratio}\n` +
          '输出格式：{"characters":[{"name":"角色名","prompt":"用于生成定妆照的外貌/服装/气质描述"}],' +
          '"shots":[{"start":0,"end":3,"visual":"画面内容","motion":"镜头运动/动作，注明真实速度","narration":"该镜旁白，没有就空字符串","dialogue":"该镜对白（角色：台词），没有就空字符串"}]}\n' +
          '要求：shots 3-6 个，时间戳从 0 开始连续不重叠，单镜 3-8 秒；每个角色必须有独立的具体外貌描述，不要合并角色。',
      },
      { role: 'user', content: `分镜要求：${instruction || '按剧本自然分镜，保留关键动作与情绪'}` },
    ], { maxTokens: 1600, temperature: 0.6, kind: 'pipeline_split' });

    const characters = (Array.isArray(data?.characters) ? data.characters : [])
      .slice(0, 4)
      .map((item, index) => ({
        id: `char-${index + 1}`,
        name: String(item?.name || `角色 ${index + 1}`).slice(0, 20),
        prompt: String(item?.prompt || '').slice(0, 300),
      }))
      .filter(item => item.prompt);

    let cursor = 0;
    const shots = (Array.isArray(data?.shots) ? data.shots : [])
      .slice(0, 8)
      .map((item, index) => {
        const start = clamp(toNum(item?.start, cursor), 0, 120);
        const end = clamp(toNum(item?.end, start + 5), start + 1, 130);
        cursor = end;
        return {
          id: `shot-${index + 1}`,
          start: Number(start.toFixed(2)),
          end: Number(end.toFixed(2)),
          duration: Number(Math.min(10, Math.max(1, Math.round(end - start))).toFixed(0)),
          visual: String(item?.visual || '').slice(0, 400),
          motion: String(item?.motion || '').slice(0, 200),
          narration: String(item?.narration || '').slice(0, 200),
          dialogue: String(item?.dialogue || '').slice(0, 200),
        };
      });

    if (!shots.length) return res.status(502).json({ error: '模型没有返回有效分镜，重试一次' });
    return res.json({ characters, shots, model, totalDuration: shots[shots.length - 1].end });
  } catch (error) {
    return res.status(502).json({ error: `拆解失败：${error.message}` });
  }
});

/** 多段视频拼接：ffmpeg concat demuxer，优先无损 copy，失败再转码；speed 可整体倍速 */
router.post('/pipeline/concat', async (req, res) => {
  if (!ffmpegAvailable) return res.status(501).json({ error: '当前环境没有可用的 ffmpeg' });
  const { videoUrls = [], name = '', speed = 1 } = req.body || {};
  const rate = clamp(toNum(speed, 1), 0.5, 3);
  const files = (Array.isArray(videoUrls) ? videoUrls : [])
    .map(url => String(url || '').replace('/api/files/', ''))
    .map(file => basename(file))
    .filter(file => file && canAccessFile(file, req.org.id) && existsSync(join(config.uploadDir, file)));
  if (!files.length) return res.status(400).json({ error: '没有可拼接的视频片段' });
  if (files.length === 1 && rate === 1) {
    const only = files[0];
    return res.json({ resultUrl: `/api/files/${only}`, count: 1, speed: rate, note: '只有一个片段，直接返回原片' });
  }

  const listFile = join(config.uploadDir, `concat-${randomUUID()}.txt`);
  const outName = `concat-${randomUUID()}.mp4`;
  const outFile = join(config.uploadDir, outName);
  const tmpFile = join(config.uploadDir, `concat-${randomUUID()}-raw.mp4`);
  writeFileSync(listFile, files
    .map(file => `file '${join(config.uploadDir, file).replace(/\\/g, '/')}'`)
    .join('\n'), 'utf8');

  try {
    try {
      await run(ffmpegPath, ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', tmpFile], { timeout: 180000 });
    } catch {
      // 编码参数不一致时 copy 会失败，退一步重编码
      await run(ffmpegPath, [
        '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k', tmpFile,
      ], { timeout: 600000 });
    }

    if (rate !== 1) {
      // 倍速：setpts 重定时让动作更接近正常速度（生成的片子没有音轨，直接丢掉音频）
      await run(ffmpegPath, [
        '-y', '-i', tmpFile,
        '-filter:v', `setpts=PTS/${rate}`,
        '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
        outFile,
      ], { timeout: 600000 });
    } else {
      writeFileSync(outFile, readFileSync(tmpFile));
    }

    registerFile(outName);
    const size = readFileSync(outFile).length;
    return res.json({ resultUrl: `/api/files/${outName}`, count: files.length, size, speed: rate, name });
  } catch (error) {
    return res.status(502).json({ error: `拼接失败：${error.message}` });
  } finally {
    for (const temp of [listFile, tmpFile]) {
      try { unlinkSync(temp); } catch { /* 临时文件删不掉无所谓 */ }
    }
  }
});

export default router;
