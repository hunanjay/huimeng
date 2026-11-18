import { Router } from 'express';
import { getDocument, patchDocument } from '../db.js';
import { llm } from '../llm.js';

const router = Router();

const disabled = res => res.status(503).json({
  error: 'LLM 未启用：在 server/.env 里设置 LLM_PROVIDER=ark 并填 ARK_API_KEY',
});

/* 通用对话：前端需要时可直接调用 */
router.post('/ai/chat', async (req, res) => {
  const { messages, json = false } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages 不能为空' });
  }
  if (!llm.isEnabled()) return disabled(res);
  try {
    const result = await llm.chat(messages.slice(-12), { json, maxTokens: 1200, kind: 'chat' });
    return res.json(result);
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
});

/* 剧本 → 分镜：豆包输出结构化 JSON，写回 documents(scripts) */
router.post('/scripts/:id/split', async (req, res) => {
  const doc = getDocument(req.params.id);
  if (!doc || doc.kind !== 'scripts') return res.status(404).json({ error: '剧本不存在' });
  if (!llm.isEnabled()) return disabled(res);

  const content = (doc.content || '').slice(0, 8000);
  if (!content.trim()) {
    return res.status(400).json({ error: '这本剧本没有正文，无法拆分镜（.docx 解析还未接入）' });
  }

  try {
    const { data, usage, model } = await llm.chatJson([
      {
        role: 'system',
        content: '你是短剧/漫剧的分镜师。把剧本拆成可直接出片的分镜，只输出 JSON，不要解释。',
      },
      {
        role: 'user',
        content: `剧本标题：${doc.title}\n\n正文：\n${content}\n\n` +
          '请输出 JSON：{"shots":[{"no":1,"scene":"场次","summary":"这一镜发生什么","prompt":"出片提示词(中文,含景别/光线/镜头运动)","duration":3}]}。' +
          '要求 6-16 个分镜，duration 取 3/5/8 之一，prompt 具体可执行。',
      },
    ], { maxTokens: 2200, temperature: 0.5, kind: 'script_split' });

    const shots = Array.isArray(data?.shots) ? data.shots.slice(0, 24).map((shot, index) => ({
      no: Number(shot.no) || index + 1,
      scene: String(shot.scene || '').slice(0, 40),
      summary: String(shot.summary || '').slice(0, 80),
      prompt: String(shot.prompt || '').slice(0, 300),
      duration: [3, 5, 8].includes(Number(shot.duration)) ? Number(shot.duration) : 5,
    })) : [];

    if (!shots.length) throw new Error('模型没有返回可用的 shots');

    const updated = patchDocument(doc.id, {
      shots,
      scenes: shots.length,
      splitStatus: 'done',
      splitModel: model,
    });
    return res.json({ ...updated, usage });
  } catch (error) {
    patchDocument(doc.id, { splitStatus: 'failed' });
    return res.status(502).json({ error: `拆分镜失败：${error.message}` });
  }
});

/* 拆解记录 → 分析要点 */
router.post('/breakdowns/:id/analyze', async (req, res) => {
  const doc = getDocument(req.params.id);
  if (!doc || doc.kind !== 'breakdowns') return res.status(404).json({ error: '拆解记录不存在' });
  if (!llm.isEnabled()) return disabled(res);

  try {
    const { data, model } = await llm.chatJson([
      {
        role: 'system',
        content: '你是短剧爆款拆解专家。基于给定信息，分析原片的叙事结构与可复用套路。只输出 JSON。',
      },
      {
        role: 'user',
        content: `对标片：${doc.fileName || doc.name}\n改编档位：${doc.tier}\n目标画幅：${doc.ratio}\n改编备注：${doc.note || '无'}\n\n` +
          '输出 JSON：{"formula":"一句话爆款公式","points":["要点1","要点2","要点3","要点4"],"suggestion":"给创作的一句建议"}。' +
          'points 要具体到镜头/节奏/情绪，不要空话。',
      },
    ], { maxTokens: 900, temperature: 0.7, kind: 'breakdown' });

    const insights = {
      formula: String(data?.formula || '').slice(0, 120),
      points: Array.isArray(data?.points) ? data.points.slice(0, 6).map(point => String(point).slice(0, 160)) : [],
      suggestion: String(data?.suggestion || '').slice(0, 160),
      model,
    };
    return res.json(patchDocument(doc.id, { insights }));
  } catch (error) {
    return res.status(502).json({ error: `分析失败：${error.message}` });
  }
});

export default router;
