import { Router } from 'express';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createTask, getTask, getTaskByRunId, listTasks, recordTaskEvent, removeTask, updateTask } from '../db.js';
import { config } from '../config.js';
import { providerInfo } from '../providers/index.js';

const router = Router();

// 前端画布/成片页提交的参数键
const PARAM_KEYS = [
  'width', 'height', 'seed', 'aspect_ratio', 'ratio', 'duration', 'frames',
  'resolution', 'use_pre_llm', 'image_urls', 'image_ref', 'image_refs', 'canvasId', 'nodeId',
];

const present = task => task && ({
  id: task.id,
  type: task.type,
  status: task.status,
  progress: task.progress,
  prompt: task.prompt,
  params: task.params,
  reqKey: task.req_key,
  remoteTaskId: task.remote_task_id,
  resultUrl: task.result_url,
  error: task.error,
  costMs: task.cost_ms,
  quotaPoints: task.type === 'video' ? 8 : 1,
  createdAt: task.created_at,
  updatedAt: task.updated_at,
  projectId: task.project_id || null,
});

function pickParams(input) {
  const params = {};
  if (!input || typeof input !== 'object') return params;
  for (const key of PARAM_KEYS) {
    if (input[key] !== undefined && input[key] !== null && input[key] !== '') params[key] = input[key];
  }
  return params;
}

/** 创建任务：立刻返回本地 id，真正的提交交给后台轮询器 */
router.post('/tasks', (req, res) => {
  const { type = 'image', prompt, params, runId, projectId } = req.body || {};

  if (!['image', 'video'].includes(type)) {
    return res.status(400).json({ error: 'type 只能是 image 或 video' });
  }
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'prompt 不能为空' });
  }
  if (prompt.length > 800) {
    return res.status(400).json({ error: 'prompt 不能超过 800 字符' });
  }

  const idempotentId = typeof runId === 'string' && runId.length <= 64 ? runId : null;
  if (idempotentId) {
    const existing = getTaskByRunId(idempotentId);
    if (existing) return res.status(200).json(present(existing));
  }

  const info = providerInfo();
  const task = createTask({
    type,
    reqKey: info.reqKeys[type],
    prompt: prompt.trim(),
    params: pickParams(params),
    runId: idempotentId || randomUUID(),
    projectId: typeof projectId === 'string' ? projectId : null,
    userId: req.user.id,
  });

  recordTaskEvent(task.id, 'created', { type: task.type, model: task.req_key, prompt: task.prompt.slice(0, 80) });
  return res.status(202).json(present(task));
});

router.get('/tasks', (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
  const { items, total } = listTasks({ status, projectId, limit, offset });
  res.json({ items: items.map(present), total, limit, offset });
});

router.get('/tasks/:id', (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: '任务不存在' });
  res.json(present(task));
});

router.post('/tasks/:id/retry', (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: '任务不存在' });
  if (task.status !== 'failed') return res.status(409).json({ error: '只有失败的任务可以重试' });

  // 已经有上游任务 ID 的（视频）只重新查询/下载，不再提交一次，避免重复计费；
  // 图片是同步接口、没有 remote id，重试等于重新生成（用户主动操作）
  const resume = Boolean(task.remote_task_id);
  const next = updateTask(task.id, {
    status: 'queued',
    progress: 0,
    attempts: 0,
    error: null,
    ...(resume ? {} : { remote_task_id: null }),
    result_url: null,
    local_path: null,
    cost_ms: null,
    // 重置创建时间，让超时计时重新开始
    created_at: Date.now(),
  }, req.user.id);
  recordTaskEvent(task.id, 'retried', { resume, remoteTaskId: next.remote_task_id || null });
  res.json(present(next));
});

router.delete('/tasks/:id', (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: '任务不存在' });
  if (['queued', 'running'].includes(task.status)) return res.status(409).json({ error: '任务执行中，完成或失败后才能删除' });
  if (task.local_path) {
    const file = join(config.uploadDir, task.local_path);
    if (existsSync(file)) unlinkSync(file);
  }
  removeTask(task.id);
  res.status(204).end();
});

export default router;
