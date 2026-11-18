import { Router } from 'express';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import { createDocument, getDocument, listDocuments, patchDocument, removeDocument, registerFile } from '../db.js';
import { llm } from '../llm.js';

const router = Router();

mkdirSync(config.uploadDir, { recursive: true });

const fallbackCopy = doc => ({
  title: (doc.sourceTitle || '新视频').slice(0, 20),
  body: [
    `这条视频来自抖音：${doc.sourceTitle || '未命名视频'}`,
    '',
    '做了一个试试看，过程比想象中费劲，但结果还挺满意。',
    '你们觉得这个节奏怎么样？',
    '',
    '想看完整过程的可以留言，我把细节整理出来。',
  ].join('\n'),
  tags: ['视频创作', '日常记录', '创作分享'],
});

/* 视频上传：前端直接 POST 二进制，body 就是文件本身 */
router.post('/distribute/upload', express.raw({ type: () => true, limit: '300mb' }), (req, res) => {
  const headerName = decodeURIComponent(req.get('X-File-Name') || 'video.mp4');
  const extMatch = /\.([a-z0-9]{2,5})$/i.exec(headerName);
  const ext = (extMatch ? extMatch[1] : 'mp4').toLowerCase();
  if (!req.body || !req.body.length) return res.status(400).json({ error: '没有收到文件内容' });

  const name = `${randomUUID()}.${ext}`;
  writeFileSync(join(config.uploadDir, name), req.body);
  registerFile(name);
  return res.status(201).json({ videoUrl: `/api/files/${name}`, videoName: headerName, size: req.body.length });
});

/* 列表 */
router.get('/distribute/drafts', (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const items = listDocuments('distributions', 100)
    .filter(item => !status || item.status === status)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  res.json({ items });
});

/* 新建草稿：链接 + 视频（可选）+ 原始标题 */
router.post('/distribute/drafts', (req, res) => {
  const { sourceUrl = '', sourceTitle = '', videoUrl = '', videoName = '' } = req.body || {};
  if (!sourceUrl && !videoUrl) return res.status(400).json({ error: '至少给一个抖音链接或上传视频' });

  const doc = createDocument('distributions', {
    sourceUrl,
    sourceTitle,
    videoUrl,
    videoName,
    title: sourceTitle.slice(0, 30),
    body: '',
    tags: [],
    status: 'pending',
    rewriteStatus: 'idle',
  });
  return res.status(201).json(doc);
});

/* 豆包改写成小红书笔记 */
router.post('/distribute/drafts/:id/rewrite', async (req, res) => {
  const doc = getDocument(req.params.id);
  if (!doc || doc.kind !== 'distributions') return res.status(404).json({ error: '草稿不存在' });

  if (!llm.isEnabled()) {
    const copy = fallbackCopy(doc);
    return res.json(patchDocument(doc.id, { ...copy, rewriteStatus: 'fallback' }));
  }

  patchDocument(doc.id, { rewriteStatus: 'running' });
  try {
    const { data, model } = await llm.chatJson([
      {
        role: 'system',
        content: '你是小红书内容运营。把抖音视频内容改写成一篇小红书笔记，只输出 JSON，不要解释。',
      },
      {
        role: 'user',
        content:
          `视频来源：抖音\n原始标题：${doc.sourceTitle || '无'}\n链接：${doc.sourceUrl || '无'}\n\n` +
          '输出 JSON：{"title":"≤20字，有钩子","body":"300-500字，口语化，分3-4段，适度用emoji，不要抖音腔","tags":["3-6个话题标签，不带#"]}',
      },
    ], { maxTokens: 900, temperature: 0.9, kind: 'xhs_rewrite' });

    const copy = {
      title: String(data?.title || doc.sourceTitle || '未命名笔记').slice(0, 30),
      body: String(data?.body || '').slice(0, 1200),
      tags: Array.isArray(data?.tags) ? data.tags.slice(0, 6).map(tag => String(tag).replace(/^#/, '')) : [],
      rewriteStatus: 'done',
      rewriteModel: model,
    };
    return res.json(patchDocument(doc.id, copy));
  } catch (error) {
    patchDocument(doc.id, { rewriteStatus: 'failed' });
    return res.status(502).json({ error: `改写失败：${error.message}` });
  }
});

/* 编辑 / 标记已发布 */
router.patch('/distribute/drafts/:id', (req, res) => {
  const doc = getDocument(req.params.id);
  if (!doc || doc.kind !== 'distributions') return res.status(404).json({ error: '草稿不存在' });

  const { title, body, tags, status } = req.body || {};
  const patch = {};
  if (typeof title === 'string') patch.title = title.slice(0, 60);
  if (typeof body === 'string') patch.body = body.slice(0, 3000);
  if (Array.isArray(tags)) patch.tags = tags.slice(0, 10).map(tag => String(tag).replace(/^#/, ''));
  if (status === 'published' || status === 'pending') {
    patch.status = status;
    patch.publishedAt = status === 'published' ? Date.now() : null;
  }
  return res.json(patchDocument(doc.id, patch));
});

router.delete('/distribute/drafts/:id', (req, res) => {
  const doc = getDocument(req.params.id);
  if (!doc || doc.kind !== 'distributions') return res.status(404).json({ error: '草稿不存在' });
  if (doc.videoUrl && doc.videoUrl.startsWith('/api/files/')) {
    const file = join(config.uploadDir, doc.videoUrl.replace('/api/files/', ''));
    if (existsSync(file)) {
      try { unlinkSync(file); } catch { /* 文件删不掉不影响草稿删除 */ }
    }
  }
  removeDocument(doc.id);
  res.status(204).end();
});

export default router;
