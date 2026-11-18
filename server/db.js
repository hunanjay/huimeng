import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID, randomBytes, scryptSync, createHash, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import { currentOrgId } from './org-context.js';

mkdirSync(config.dataDir, { recursive: true });
mkdirSync(config.uploadDir, { recursive: true });

const db = new DatabaseSync(join(config.dataDir, 'tasks.db'));

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS orgs (id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS org_members (org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE, user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK(role IN ('org.admin','org.user')), created_at INTEGER NOT NULL, PRIMARY KEY(org_id,user_id));
  CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS org_invites (id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE, email TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('org.admin','org.user')), token_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS org_audit_logs (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, actor_user_id TEXT, action TEXT NOT NULL, target TEXT, details TEXT, created_at INTEGER NOT NULL);
  INSERT OR IGNORE INTO orgs(id,name,created_at) VALUES ('bootstrap','默认工作区',${Date.now()});
`);
{
  const columns = db.prepare('PRAGMA table_info(org_invites)').all().map(row => row.name);
  if (!columns.includes('id')) {
    const legacyInvites = db.prepare('SELECT token_hash,org_id,email,role,expires_at FROM org_invites').all();
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec('ALTER TABLE org_invites RENAME TO org_invites_legacy');
      db.exec(`CREATE TABLE org_invites (
        id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
        email TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('org.admin','org.user')),
        token_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
      )`);
      const insert = db.prepare('INSERT INTO org_invites VALUES(?,?,?,?,?,?,?)');
      for (const invite of legacyInvites) insert.run(randomUUID(), invite.org_id, invite.email, invite.role, invite.token_hash, invite.expires_at - 7 * 86400000, invite.expires_at);
      db.exec('DROP TABLE org_invites_legacy');
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
}
{
  const columns = db.prepare('PRAGMA table_info(orgs)').all().map(row => row.name);
  if (!columns.includes('status')) db.exec("ALTER TABLE orgs ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
}
{
  const columns = db.prepare('PRAGMA table_info(sessions)').all().map(row => row.name);
  if (!columns.includes('created_at')) db.exec('ALTER TABLE sessions ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0');
}
db.exec(`CREATE TABLE IF NOT EXISTS file_owners (path TEXT PRIMARY KEY, org_id TEXT NOT NULL)`);
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    req_key TEXT NOT NULL,
    prompt TEXT NOT NULL,
    params TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'queued',
    progress INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    run_id TEXT UNIQUE,
    remote_task_id TEXT,
    project_id TEXT,
    result_url TEXT,
    local_path TEXT,
    error TEXT,
    cost_ms INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`);
{
  const columns = db.prepare('PRAGMA table_info(tasks)').all().map(row => row.name);
  if (!columns.includes('project_id')) db.exec('ALTER TABLE tasks ADD COLUMN project_id TEXT');
  if (!columns.includes('created_by')) db.exec('ALTER TABLE tasks ADD COLUMN created_by TEXT');
}
db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)');
db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at DESC)');

// 通用文档表：剧本 / 项目 / 画布 / 拆解记录 / 智能体消息都放这里，按 kind 区分
db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    data TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`);
db.exec('CREATE INDEX IF NOT EXISTS idx_documents_kind ON documents(kind, updated_at DESC)');
// 调用记录：LLM 的 token 用量 + 媒体生成耗时，统一记账
db.exec(`
  CREATE TABLE IF NOT EXISTS ai_calls (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'ark',
    model TEXT NOT NULL DEFAULT '',
    task_id TEXT,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    reasoning_tokens INTEGER NOT NULL DEFAULT 0,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ok',
    error TEXT,
    meta TEXT,
    created_at INTEGER NOT NULL
  )
`);
db.exec('CREATE INDEX IF NOT EXISTS idx_ai_calls_created ON ai_calls(created_at DESC)');
// 迁移：老库补 cost_cny（元）
{
  const columns = db.prepare('PRAGMA table_info(ai_calls)').all().map(row => row.name);
  if (!columns.includes('cost_cny')) db.exec('ALTER TABLE ai_calls ADD COLUMN cost_cny REAL NOT NULL DEFAULT 0');
}

// 任务事件：submit / progress / done / failed / retry，给 tracing 页画时间线
db.exec(`
  CREATE TABLE IF NOT EXISTS task_events (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    event TEXT NOT NULL,
    detail TEXT,
    created_at INTEGER NOT NULL
  )
`);
db.exec('CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id, created_at ASC)');

for (const table of ['tasks', 'documents', 'ai_calls']) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name);
  if (!columns.includes('org_id')) db.exec(`ALTER TABLE ${table} ADD COLUMN org_id TEXT NOT NULL DEFAULT 'bootstrap'`);
}
db.exec(`
  CREATE TABLE IF NOT EXISTS org_quota_grants (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    period TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount > 0),
    actor_user_id TEXT, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS member_quota_allocations (
    org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount >= 0),
    actor_user_id TEXT, updated_at INTEGER NOT NULL, PRIMARY KEY(org_id,user_id,period)
  );
  CREATE TABLE IF NOT EXISTS quota_task_usage (
    task_id TEXT PRIMARY KEY, org_id TEXT NOT NULL, user_id TEXT NOT NULL,
    period TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount > 0),
    status TEXT NOT NULL CHECK(status IN ('reserved','settled','released')),
    created_at INTEGER NOT NULL, settled_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_quota_usage_org_period ON quota_task_usage(org_id,period,status);
`);
{
  const columns = db.prepare('PRAGMA table_info(task_events)').all().map(row => row.name);
  if (!columns.includes('org_id')) db.exec("ALTER TABLE task_events ADD COLUMN org_id TEXT NOT NULL DEFAULT 'bootstrap'");
}

const toTask = row => (row ? { ...row, params: JSON.parse(row.params || '{}') } : null);
const scoped = () => currentOrgId();

const insertStmt = db.prepare(`
  INSERT INTO tasks (id, type, req_key, prompt, params, status, progress, attempts, run_id, project_id, created_at, updated_at, org_id, created_by)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const getStmt = db.prepare('SELECT * FROM tasks WHERE id = ? AND (? IS NULL OR org_id = ?)');
const byRunStmt = db.prepare('SELECT * FROM tasks WHERE run_id = ? AND (? IS NULL OR org_id = ?)');
const activeStmt = db.prepare("SELECT * FROM tasks WHERE status IN ('queued', 'running') ORDER BY created_at ASC LIMIT 20");
const deleteStmt = db.prepare('DELETE FROM tasks WHERE id = ?');

const WRITABLE = new Set([
  'status', 'progress', 'attempts', 'remote_task_id', 'result_url',
  'local_path', 'error', 'cost_ms', 'created_at',
]);

const quotaPeriod = () => new Date().toISOString().slice(0, 7);
// shortcut: only image/video generation tasks spend points; meter LLM calls when their quota price is defined.
const taskQuotaAmount = type => type === 'video' ? 8 : 1;
const insufficientQuota = message => Object.assign(new Error(message), { status: 402 });

function reserveTaskQuota(taskId, orgId, userId, type) {
  const period = quotaPeriod();
  const amount = taskQuotaAmount(type);
  const previous = db.prepare('SELECT status FROM quota_task_usage WHERE task_id=?').get(taskId);
  if (previous?.status === 'reserved' || previous?.status === 'settled') return;
  const granted = db.prepare('SELECT COALESCE(SUM(amount),0) AS n FROM org_quota_grants WHERE org_id=? AND period=?').get(orgId, period).n;
  const total = db.prepare(`SELECT
    COALESCE(SUM(CASE WHEN status='settled' THEN amount ELSE 0 END),0) AS used,
    COALESCE(SUM(CASE WHEN status='reserved' THEN amount ELSE 0 END),0) AS reserved
    FROM quota_task_usage WHERE org_id=? AND period=?`).get(orgId, period);
  const member = db.prepare(`SELECT COALESCE(a.amount,0) AS allocation,
    COALESCE(SUM(CASE WHEN q.status='settled' THEN q.amount ELSE 0 END),0) AS used,
    COALESCE(SUM(CASE WHEN q.status='reserved' THEN q.amount ELSE 0 END),0) AS reserved
    FROM org_members m LEFT JOIN member_quota_allocations a ON a.org_id=m.org_id AND a.user_id=m.user_id AND a.period=?
    LEFT JOIN quota_task_usage q ON q.org_id=m.org_id AND q.user_id=m.user_id AND q.period=?
    WHERE m.org_id=? AND m.user_id=? GROUP BY m.user_id`).get(period, period, orgId, userId);
  if (!member) throw insufficientQuota('当前账号不属于此组织');
  if (granted - total.used - total.reserved < amount) throw insufficientQuota('组织可用额度不足，请联系组织管理员');
  if (member.allocation - member.used - member.reserved < amount) throw insufficientQuota('个人额度不足，请联系组织管理员分配额度');
  const now = Date.now();
  if (previous) db.prepare("UPDATE quota_task_usage SET period=?,amount=?,status='reserved',created_at=?,settled_at=NULL WHERE task_id=?").run(period, amount, now, taskId);
  else db.prepare("INSERT INTO quota_task_usage(task_id,org_id,user_id,period,amount,status,created_at) VALUES(?,?,?,?,?,'reserved',?)").run(taskId, orgId, userId, period, amount, now);
}

function updateTaskQuota(taskId, status) {
  if (status === 'done') db.prepare("UPDATE quota_task_usage SET status='settled',settled_at=? WHERE task_id=? AND status='reserved'").run(Date.now(), taskId);
  else if (['failed', 'cancelled', 'canceled'].includes(status)) db.prepare("UPDATE quota_task_usage SET status='released',settled_at=NULL WHERE task_id=? AND status='reserved'").run(taskId);
}

export function createTask({ type, reqKey, prompt, params, runId, projectId, userId }) {
  const now = Date.now();
  const id = randomUUID();
  const orgId = scoped() || 'bootstrap';
  db.exec('BEGIN IMMEDIATE');
  try {
    reserveTaskQuota(id, orgId, userId, type);
    insertStmt.run(id, type, reqKey, prompt, JSON.stringify(params || {}), 'queued', 0, 0, runId ? `${orgId}:${runId}` : null, projectId || null, now, now, orgId, userId);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return getTask(id);
}

export const getTask = id => toTask(getStmt.get(id, scoped(), scoped()));
export const getTaskByRunId = runId => (runId ? toTask(byRunStmt.get(`${scoped() || 'bootstrap'}:${runId}`, scoped(), scoped())) : null);
export const activeTasks = () => activeStmt.all().map(toTask);

export function updateTask(id, patch, actorUserId = null) {
  const fields = Object.keys(patch).filter(key => WRITABLE.has(key));
  if (!fields.length) return getTask(id);
  const current = getTask(id);
  if (!current) return null;
  db.exec('BEGIN IMMEDIATE');
  try {
    if (patch.status === 'queued' && ['failed', 'cancelled', 'canceled'].includes(current.status)) {
      const quotaUserId = current.created_by || actorUserId;
      reserveTaskQuota(id, current.org_id, quotaUserId, current.type);
      if (!current.created_by && actorUserId) db.prepare('UPDATE tasks SET created_by=? WHERE id=?').run(actorUserId, id);
    }
  const sql = `UPDATE tasks SET ${fields.map(field => `${field} = ?`).join(', ')}, updated_at = ? WHERE id = ?`;
    db.prepare(sql.replace('WHERE id = ?', 'WHERE id = ? AND (? IS NULL OR org_id = ?)')).run(...fields.map(field => patch[field]), Date.now(), id, scoped(), scoped());
    if (patch.status) updateTaskQuota(id, patch.status);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return getTask(id);
}

export function removeTask(id) {
  db.prepare("UPDATE quota_task_usage SET status='released' WHERE task_id=? AND status='reserved'").run(id);
  db.prepare('DELETE FROM tasks WHERE id = ? AND (? IS NULL OR org_id = ?)').run(id, scoped(), scoped());
}

export function listTasks({ status, projectId, limit = 20, offset = 0 } = {}) {
  const clauses = [];
  if (scoped()) clauses.push('org_id = ?');
  if (status) clauses.push('status = ?');
  if (projectId) clauses.push('project_id = ?');
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const values = [];
  if (scoped()) values.push(scoped());
  if (status) values.push(status);
  if (projectId) values.push(projectId);
  const rows = db.prepare(`SELECT * FROM tasks ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...values, limit, offset);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM tasks ${where}`).get(...values);
  return { items: rows.map(toTask), total: total.n };
}

export function stats() {
  const row = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN status IN ('queued', 'running') THEN 1 ELSE 0 END) AS active
    FROM tasks WHERE (? IS NULL OR org_id = ?)
  `).get(scoped(), scoped());
  return { total: row.total || 0, done: row.done || 0, failed: row.failed || 0, active: row.active || 0 };
}

/* ===== 通用文档（kind: scripts / projects / canvases / breakdowns / messages） ===== */

const docToObject = row => (row ? { id: row.id, kind: row.kind, ...JSON.parse(row.data || '{}'), createdAt: row.created_at, updatedAt: row.updated_at } : null);

const docInsert = db.prepare('INSERT INTO documents (id, kind, data, created_at, updated_at, org_id) VALUES (?, ?, ?, ?, ?, ?)');
const docGet = db.prepare('SELECT * FROM documents WHERE id = ? AND (? IS NULL OR org_id = ?)');
const docDelete = db.prepare('DELETE FROM documents WHERE id = ? AND (? IS NULL OR org_id = ?)');

export function createDocument(kind, data = {}) {
  const id = randomUUID();
  const now = Date.now();
  docInsert.run(id, kind, JSON.stringify(data), now, now, scoped() || 'bootstrap');
  return docToObject(docGet.get(id, scoped(), scoped()));
}

export function getDocument(id) {
  return docToObject(docGet.get(id, scoped(), scoped()));
}

export function patchDocument(id, patch = {}) {
  const current = docToObject(docGet.get(id, scoped(), scoped()));
  if (!current) return null;
  const { id: _ignored, kind, createdAt, updatedAt, ...rest } = current;
  const next = { ...rest, ...patch };
  db.prepare('UPDATE documents SET data = ?, updated_at = ? WHERE id = ? AND (? IS NULL OR org_id = ?)').run(JSON.stringify(next), Date.now(), id, scoped(), scoped());
  return getDocument(id);
}

export function removeDocument(id) {
  docDelete.run(id, scoped(), scoped());
}

export function listDocuments(kind, limit = 100) {
  return db.prepare('SELECT * FROM documents WHERE kind = ? AND (? IS NULL OR org_id = ?) ORDER BY updated_at DESC LIMIT ?')
    .all(kind, scoped(), scoped(), limit)
    .map(docToObject);
}

export function countDocuments(kind) {
  const row = db.prepare('SELECT COUNT(*) AS n FROM documents WHERE kind = ? AND (? IS NULL OR org_id = ?)').get(kind, scoped(), scoped());
  return row.n || 0;
}

// 按天聚合：生产报表用
export function dailyTaskSeries(days = 30) {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - (days - 1));
  const fromTs = from.getTime();

  const rows = db.prepare(`
    SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch', 'localtime') AS day,
           COUNT(*) AS total,
           SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
    FROM tasks
    WHERE created_at >= ? AND (? IS NULL OR org_id = ?)
    GROUP BY day
    ORDER BY day ASC
  `).all(fromTs, scoped(), scoped());

  const scripts = db.prepare(`
    SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch', 'localtime') AS day, COUNT(*) AS total
    FROM documents WHERE kind = 'scripts' AND created_at >= ? AND (? IS NULL OR org_id = ?)
    GROUP BY day
  `).all(fromTs, scoped(), scoped());

  const series = [];
  for (let i = 0; i < days; i += 1) {
    const date = new Date(fromTs + i * 86400000);
    const key = `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
    const task = rows.find(row => row.day === key);
    const script = scripts.find(row => row.day === key);
    series.push({
      date: key,
      tasks: task?.total || 0,
      done: task?.done || 0,
      failed: task?.failed || 0,
      scripts: script?.total || 0,
    });
  }
  return series;
}

/* ===== 调用记账 / 任务事件（tracing） ===== */

const callInsert = db.prepare(`
  INSERT INTO ai_calls (id, kind, provider, model, task_id, prompt_tokens, completion_tokens, total_tokens, reasoning_tokens, latency_ms, status, error, meta, created_at, cost_cny, org_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const eventInsert = db.prepare('INSERT INTO task_events (id, task_id, event, detail, created_at, org_id) VALUES (?, ?, ?, ?, ?, ?)');
const taskOrg = taskId => scoped() || db.prepare('SELECT org_id FROM tasks WHERE id = ?').get(taskId)?.org_id || 'bootstrap';

export function recordAiCall({
  kind,
  provider = 'ark',
  model = '',
  taskId = null,
  promptTokens = 0,
  completionTokens = 0,
  totalTokens = 0,
  reasoningTokens = 0,
  latencyMs = 0,
  status = 'ok',
  error = null,
  meta = null,
  costCny = 0,
}) {
  callInsert.run(
    randomUUID(), kind, provider, model, taskId,
    promptTokens || 0, completionTokens || 0, totalTokens || 0, reasoningTokens || 0,
    latencyMs || 0, status, error, meta ? JSON.stringify(meta) : null, Date.now(), costCny || 0, taskOrg(taskId),
  );
}

export function recordTaskEvent(taskId, event, detail = null) {
  eventInsert.run(randomUUID(), taskId, event, detail ? JSON.stringify(detail) : null, Date.now(), taskOrg(taskId));
}

export function listTaskEvents(taskId) {
  return db.prepare('SELECT * FROM task_events WHERE task_id = ? AND (? IS NULL OR org_id = ?) ORDER BY created_at ASC')
    .all(taskId, scoped(), scoped())
    .map(row => ({ id: row.id, event: row.event, detail: row.detail ? JSON.parse(row.detail) : null, at: row.created_at }));
}

export function listAiCalls({ limit = 60, kind, model } = {}) {
  const where = [];
  const args = [];
  if (scoped()) { where.push('org_id = ?'); args.push(scoped()); }
  if (kind) { where.push('kind = ?'); args.push(kind); }
  if (model) { where.push('model = ?'); args.push(model); }
  const sql = `SELECT * FROM ai_calls ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT ?`;
  return db.prepare(sql).all(...args, limit).map(row => ({
    id: row.id,
    kind: row.kind,
    provider: row.provider,
    model: row.model,
    taskId: row.task_id,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    totalTokens: row.total_tokens,
    reasoningTokens: row.reasoning_tokens,
    latencyMs: row.latency_ms,
    costCny: row.cost_cny || 0,
    status: row.status,
    error: row.error,
    createdAt: row.created_at,
  }));
}

export function aiUsageSummary(fromTs) {
  const totals = db.prepare(`
    SELECT COUNT(*) AS calls,
           SUM(prompt_tokens) AS prompt_tokens,
           SUM(completion_tokens) AS completion_tokens,
           SUM(total_tokens) AS total_tokens,
           SUM(reasoning_tokens) AS reasoning_tokens,
           AVG(latency_ms) AS avg_latency,
           SUM(cost_cny) AS cost,
           SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END) AS errors
    FROM ai_calls WHERE created_at >= ?
      AND (? IS NULL OR org_id = ?)
  `).get(fromTs, scoped(), scoped());

  const byModel = db.prepare(`
    SELECT model, COUNT(*) AS calls, SUM(total_tokens) AS tokens, AVG(latency_ms) AS avg_latency, SUM(cost_cny) AS cost
    FROM ai_calls WHERE created_at >= ? AND (? IS NULL OR org_id = ?)
    GROUP BY model ORDER BY tokens DESC
  `).all(fromTs, scoped(), scoped());

  const byKind = db.prepare(`
    SELECT kind, COUNT(*) AS calls, SUM(total_tokens) AS tokens, AVG(latency_ms) AS avg_latency, SUM(cost_cny) AS cost
    FROM ai_calls WHERE created_at >= ? AND (? IS NULL OR org_id = ?)
    GROUP BY kind ORDER BY calls DESC
  `).all(fromTs, scoped(), scoped());

  return {
    totals: {
      calls: totals.calls || 0,
      promptTokens: totals.prompt_tokens || 0,
      completionTokens: totals.completion_tokens || 0,
      totalTokens: totals.total_tokens || 0,
      reasoningTokens: totals.reasoning_tokens || 0,
      avgLatency: Math.round(totals.avg_latency || 0),
      cost: Number((totals.cost || 0).toFixed(4)),
      errors: totals.errors || 0,
    },
    byModel: byModel.map(row => ({ ...row, cost: Number((row.cost || 0).toFixed(4)) })),
    byKind: byKind.map(row => ({ ...row, cost: Number((row.cost || 0).toFixed(4)) })),
  };
}

export function recentTaskTraces(limit = 20) {
  return db.prepare(`
    SELECT t.*,
           (SELECT COUNT(*) FROM task_events e WHERE e.task_id = t.id) AS event_count,
           (SELECT event FROM task_events e WHERE e.task_id = t.id ORDER BY created_at DESC LIMIT 1) AS last_event
    FROM tasks t WHERE (? IS NULL OR t.org_id = ?) ORDER BY t.created_at DESC LIMIT ?
  `).all(scoped(), scoped(), limit).map(task => ({
    id: task.id,
    type: task.type,
    status: task.status,
    progress: task.progress,
    model: task.req_key,
    prompt: task.prompt,
    costMs: task.cost_ms,
    attempts: task.attempts,
    remoteTaskId: task.remote_task_id,
    resultUrl: task.result_url,
    error: task.error,
    eventCount: task.event_count,
    lastEvent: task.last_event,
    createdAt: task.created_at,
  }));
}
// 同一条任务是否已经记过一次成功的媒体成本（重试续传时避免重复记账）
export function hasMediaCall(taskId) {
  const row = db.prepare("SELECT COUNT(*) AS n FROM ai_calls WHERE task_id = ? AND kind IN ('image', 'video') AND status = 'ok' AND (? IS NULL OR org_id = ?)").get(taskId, scoped(), scoped());
  return (row.n || 0) > 0;
}

const passwordKey = (password, salt) => scryptSync(password, salt, 64).toString('hex');
const tokenDigest = token => createHash('sha256').update(token).digest('hex');
const withSavepoint = fn => {
  db.exec('SAVEPOINT org_operation');
  try {
    const result = fn();
    db.exec('RELEASE org_operation');
    return result;
  } catch (error) {
    db.exec('ROLLBACK TO org_operation');
    db.exec('RELEASE org_operation');
    throw error;
  }
};

export function createAccount({ email, password, orgName }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const name = String(orgName || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error('请输入有效邮箱');
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) throw new Error('密码长度须为 10 至 128 位');
  if (!name || name.length > 80) throw new Error('组织名称须为 1 至 80 个字符');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(normalizedEmail)) throw new Error('邮箱已注册');
  const id = randomUUID();
  const orgId = randomUUID();
  const now = Date.now();
  const salt = randomBytes(16).toString('hex');
  const token = randomBytes(32).toString('base64url');
  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO users VALUES (?, ?, ?, ?)').run(id, normalizedEmail, `${salt}:${passwordKey(password, salt)}`, now);
    db.prepare("INSERT INTO orgs(id,name,status,created_at) VALUES(?,?,'active',?)").run(orgId, name, now);
    db.prepare("INSERT INTO org_members VALUES (?, ?, 'org.admin', ?)").run(orgId, id, now);
    db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES (?, ?, ?, ?)').run(tokenDigest(token), id, now, now + 30 * 86400000);
    if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 1) {
      for (const table of ['tasks', 'documents', 'ai_calls', 'task_events', 'file_owners']) {
        db.prepare(`UPDATE ${table} SET org_id = ? WHERE org_id = 'bootstrap'`).run(orgId);
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { token, user: { id, email: normalizedEmail }, role: config.superadminEmails.includes(normalizedEmail) ? 'superadmin' : 'org.admin', org: { id: orgId, name, role: 'org.admin' } };
}

export function loginAccount({ email, password }) {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').trim().toLowerCase());
  if (!user || typeof password !== 'string') throw new Error('邮箱或密码错误');
  const [salt, expected] = user.password_hash.split(':');
  const actual = Buffer.from(passwordKey(password, salt), 'hex');
  if (!timingSafeEqual(actual, Buffer.from(expected, 'hex'))) throw new Error('邮箱或密码错误');
  const membership = db.prepare('SELECT o.id, o.name, o.status, m.role FROM org_members m JOIN orgs o ON o.id = m.org_id WHERE m.user_id = ?').get(user.id);
  if (!membership) throw new Error('账号没有所属组织');
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES (?, ?, ?, ?)').run(tokenDigest(token), user.id, now, now + 30 * 86400000);
  return { token, user: { id: user.id, email: user.email }, role: config.superadminEmails.includes(user.email) ? 'superadmin' : membership.role, org: { id: membership.id, name: membership.name, status: membership.status, role: membership.role } };
}

export function getSession(token) {
  if (!token) return null;
  const row = db.prepare(`SELECT u.id, u.email, o.id AS org_id, o.name AS org_name, o.status AS org_status, m.role
    FROM sessions s JOIN users u ON u.id = s.user_id
    JOIN org_members m ON m.user_id = u.id JOIN orgs o ON o.id = m.org_id
    WHERE s.token_hash = ? AND s.expires_at > ?`).get(tokenDigest(token), Date.now());
  return row ? { user: { id: row.id, email: row.email }, role: config.superadminEmails.includes(row.email) ? 'superadmin' : row.role, org: { id: row.org_id, name: row.org_name, status: row.org_status, role: row.role } } : null;
}

export function platformOverview() {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const period = quotaPeriod();
  const organizations = db.prepare(`SELECT o.id, o.name, o.status, o.created_at,
    (SELECT COUNT(*) FROM org_members m WHERE m.org_id = o.id) AS member_count,
    (SELECT u.email FROM org_members m JOIN users u ON u.id = m.user_id WHERE m.org_id = o.id AND m.role = 'org.admin' LIMIT 1) AS admin_email,
    (SELECT COUNT(*) FROM documents d WHERE d.org_id = o.id AND d.kind = 'projects') AS project_count,
    (SELECT COUNT(*) FROM tasks t WHERE t.org_id = o.id) AS task_count,
    (SELECT COALESCE(SUM(a.total_tokens), 0) FROM ai_calls a WHERE a.org_id = o.id AND a.created_at >= ?) AS month_tokens,
    (SELECT COALESCE(SUM(g.amount), 0) FROM org_quota_grants g WHERE g.org_id=o.id AND g.period=?) AS quota_granted,
    (SELECT COALESCE(SUM(q.amount), 0) FROM quota_task_usage q WHERE q.org_id=o.id AND q.period=? AND q.status='settled') AS quota_used
    FROM orgs o WHERE o.id != 'bootstrap' ORDER BY o.created_at DESC`).all(monthStart.getTime(), period, period);
  const totals = db.prepare(`SELECT
    (SELECT COUNT(*) FROM orgs WHERE id != 'bootstrap') AS organizations,
    (SELECT COUNT(*) FROM users) AS users,
    (SELECT COUNT(*) FROM documents WHERE kind = 'projects') AS projects,
    (SELECT COUNT(*) FROM tasks) AS tasks,
    (SELECT SUM(CASE WHEN status IN ('queued','running') THEN 1 ELSE 0 END) FROM tasks) AS active_tasks,
    (SELECT SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) FROM tasks) AS failed_tasks,
    (SELECT COALESCE(SUM(total_tokens), 0) FROM ai_calls WHERE created_at >= ?) AS month_tokens,
    (SELECT COALESCE(SUM(amount),0) FROM org_quota_grants WHERE period=?) AS quota_granted,
    (SELECT COALESCE(SUM(amount),0) FROM quota_task_usage WHERE period=? AND status='settled') AS quota_used`).get(monthStart.getTime(), period, period);
  for (const org of organizations) {
    org.quota_remaining = org.quota_granted - org.quota_used;
  }
  const auditLogs = db.prepare(`SELECT l.id, l.action, l.target, l.created_at, u.email AS actor_email
    FROM org_audit_logs l LEFT JOIN users u ON u.id = l.actor_user_id
    ORDER BY l.created_at DESC LIMIT 100`).all();
  return { totals: Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, value || 0])), organizations, auditLogs };
}

export function deleteSession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenDigest(token));
}

export function listOrgMembers(orgId) {
  return db.prepare(`SELECT u.id,u.email,m.role,m.created_at AS createdAt FROM org_members m
    JOIN users u ON u.id=m.user_id WHERE m.org_id=? ORDER BY m.created_at`).all(orgId);
}

export function listOrganizations() {
  return db.prepare(`SELECT o.id, o.name, o.status, o.created_at AS createdAt, COUNT(m.user_id) AS memberCount,
    (SELECT u.email FROM org_members x JOIN users u ON u.id=x.user_id WHERE x.org_id=o.id AND x.role='org.admin' LIMIT 1) AS adminEmail
    FROM orgs o LEFT JOIN org_members m ON m.org_id=o.id
    WHERE o.id!='bootstrap' GROUP BY o.id ORDER BY o.created_at DESC`).all();
}

export function createOrganization({ name, adminEmail, actorUserId }) {
  const orgName = String(name || '').trim();
  if (!orgName || orgName.length > 80) throw new Error('组织名称须为 1 至 80 个字符');
  const id = randomUUID();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare("INSERT INTO orgs(id,name,status,created_at) VALUES(?,?,'active',?)").run(id, orgName, Date.now());
    const invite = createOrgInvite({ orgId: id, actorUserId, email: adminEmail, role: 'org.admin' });
    db.exec('COMMIT');
    return { id, name: orgName, status: 'active', invite };
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function setOrganizationStatus({ orgId, actorUserId, status }) {
  if (!['active', 'suspended'].includes(status)) throw new Error('组织状态无效');
  const org = db.prepare("SELECT name,status FROM orgs WHERE id=? AND id!='bootstrap'").get(orgId);
  if (!org) return null;
  db.prepare('UPDATE orgs SET status=? WHERE id=?').run(status, orgId);
  if (org.status !== status) recordOrgAudit({ orgId, actorUserId, action: 'organization.status_changed', target: org.name, details: { from: org.status, to: status } });
  return { id: orgId, name: org.name, status };
}

export function setOrganizationAdmin({ orgId, actorUserId, email }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const member = db.prepare(`SELECT u.id FROM users u JOIN org_members m ON m.user_id=u.id
    WHERE m.org_id=? AND lower(u.email)=?`).get(orgId, normalizedEmail);
  if (!member) throw new Error('该邮箱不是组织成员');
  if (!changeOrgMemberRole({ orgId, actorUserId, userId: member.id, role: 'org.admin' })) throw new Error('成员不存在');
  return { email: normalizedEmail, role: 'org.admin' };
}

export const organizationExists = id => Boolean(db.prepare('SELECT 1 FROM orgs WHERE id=?').get(id));

export function listOrgInvites(orgId) {
  return db.prepare(`SELECT id,email,role,created_at AS createdAt,expires_at AS expiresAt FROM org_invites
    WHERE org_id=? AND expires_at>? ORDER BY created_at DESC`).all(orgId, Date.now());
}

export function createOrgInvite({ orgId, actorUserId, email, role }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) throw new Error('请输入有效邮箱');
  if (!['org.admin', 'org.user'].includes(role)) throw new Error('成员角色无效');
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(normalizedEmail)) throw new Error('该邮箱已注册，MVP 暂不支持跨组织加入');
  return withSavepoint(() => {
    const id = randomUUID();
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    const expiresAt = now + 7 * 86400000;
    db.prepare('DELETE FROM org_invites WHERE org_id=? AND email=?').run(orgId, normalizedEmail);
    db.prepare('INSERT INTO org_invites VALUES(?,?,?,?,?,?,?)').run(id, orgId, normalizedEmail, role, tokenDigest(token), now, expiresAt);
    recordOrgAudit({ orgId, actorUserId, action: 'invite.created', target: normalizedEmail, details: { role } });
    return { id, token, email: normalizedEmail, role, expiresAt };
  });
}

export function resendOrgInvite({ orgId, actorUserId, inviteId }) {
  const invite = db.prepare('SELECT * FROM org_invites WHERE id=? AND org_id=?').get(inviteId, orgId);
  if (!invite) return null;
  return withSavepoint(() => {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + 7 * 86400000;
    db.prepare('UPDATE org_invites SET token_hash=?,created_at=?,expires_at=? WHERE id=? AND org_id=?').run(tokenDigest(token), Date.now(), expiresAt, inviteId, orgId);
    recordOrgAudit({ orgId, actorUserId, action: 'invite.resent', target: invite.email });
    return { id: invite.id, token, email: invite.email, role: invite.role, expiresAt };
  });
}

export function revokeOrgInvite({ orgId, actorUserId, inviteId }) {
  const invite = db.prepare('SELECT email FROM org_invites WHERE id=? AND org_id=?').get(inviteId, orgId);
  if (!invite) return false;
  return withSavepoint(() => {
    db.prepare('DELETE FROM org_invites WHERE id=? AND org_id=?').run(inviteId, orgId);
    recordOrgAudit({ orgId, actorUserId, action: 'invite.revoked', target: invite.email });
    return true;
  });
}

export function acceptOrgInvite({ token, email, password }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error('请输入有效邮箱');
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) throw new Error('密码长度须为 10 至 128 位');
  const invite = db.prepare('SELECT * FROM org_invites WHERE token_hash=? AND email=? AND expires_at>?').get(tokenDigest(token || ''), normalizedEmail, Date.now());
  if (!invite) throw new Error('邀请链接已失效或邮箱不匹配');
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(normalizedEmail)) throw new Error('该账号已注册，MVP 暂不支持跨组织加入');
  const id = randomUUID();
  const sessionToken = randomBytes(32).toString('base64url');
  const now = Date.now();
  const salt = randomBytes(16).toString('hex');
  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(id, normalizedEmail, `${salt}:${passwordKey(password, salt)}`, now);
    db.prepare('INSERT INTO org_members VALUES(?,?,?,?)').run(invite.org_id, id, invite.role, now);
    db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)').run(tokenDigest(sessionToken), id, now, now + 30 * 86400000);
    db.prepare('DELETE FROM org_invites WHERE id=?').run(invite.id);
    db.prepare('INSERT INTO org_audit_logs VALUES(?,?,?,?,?,?,?)').run(randomUUID(), invite.org_id, id, 'invite.accepted', normalizedEmail, null, now);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  const org = db.prepare('SELECT id,name FROM orgs WHERE id=?').get(invite.org_id);
  return { token: sessionToken, user: { id, email: normalizedEmail }, role: invite.role, org: { ...org, role: invite.role } };
}

export function changeOrgMemberRole({ orgId, actorUserId, userId, role }) {
  if (!['org.admin', 'org.user'].includes(role)) throw new Error('成员角色无效');
  db.exec('BEGIN IMMEDIATE');
  try {
    const current = db.prepare('SELECT u.email,m.role FROM org_members m JOIN users u ON u.id=m.user_id WHERE m.org_id=? AND m.user_id=?').get(orgId, userId);
    if (!current) { db.exec('COMMIT'); return false; }
    if (current.role === 'org.admin' && role !== 'org.admin' && db.prepare("SELECT COUNT(*) AS n FROM org_members WHERE org_id=? AND role='org.admin'").get(orgId).n < 2) throw new Error('组织至少需要一名管理员');
    db.prepare('UPDATE org_members SET role=? WHERE org_id=? AND user_id=?').run(role, orgId, userId);
    recordOrgAudit({ orgId, actorUserId, action: 'member.role_changed', target: current.email, details: { from: current.role, to: role } });
    db.exec('COMMIT');
    return true;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function removeOrgMember({ orgId, actorUserId, userId }) {
  if (userId === actorUserId) throw new Error('不能移除自己');
  db.exec('BEGIN IMMEDIATE');
  try {
    const current = db.prepare('SELECT u.email,m.role FROM org_members m JOIN users u ON u.id=m.user_id WHERE m.org_id=? AND m.user_id=?').get(orgId, userId);
    if (!current) { db.exec('COMMIT'); return false; }
    if (current.role === 'org.admin' && db.prepare("SELECT COUNT(*) AS n FROM org_members WHERE org_id=? AND role='org.admin'").get(orgId).n < 2) throw new Error('组织至少需要一名管理员');
    db.prepare('DELETE FROM org_members WHERE org_id=? AND user_id=?').run(orgId, userId);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
    recordOrgAudit({ orgId, actorUserId, action: 'member.removed', target: current.email, details: { role: current.role } });
    db.exec('COMMIT');
    return true;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function recordOrgAudit({ orgId, actorUserId = null, action, target = null, details = null }) {
  db.prepare('INSERT INTO org_audit_logs VALUES(?,?,?,?,?,?,?)').run(randomUUID(), orgId, actorUserId, action, target, details ? JSON.stringify(details) : null, Date.now());
}

export function listOrgAudit(orgId, limit = 100) {
  return db.prepare(`SELECT a.id,a.action,a.target,a.details,a.created_at AS createdAt,u.email AS actorEmail
    FROM org_audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id WHERE a.org_id=?
    ORDER BY a.created_at DESC LIMIT ?`).all(orgId, limit).map(row => ({ ...row, details: row.details ? JSON.parse(row.details) : null }));
}

export function getOrgQuota(orgId) {
  const period = quotaPeriod();
  const grants = db.prepare('SELECT COALESCE(SUM(amount),0) AS amount FROM org_quota_grants WHERE org_id=? AND period=?').get(orgId, period).amount;
  const usageRows = db.prepare(`SELECT user_id,
    COALESCE(SUM(CASE WHEN status='settled' THEN amount ELSE 0 END),0) AS used,
    COALESCE(SUM(CASE WHEN status='reserved' THEN amount ELSE 0 END),0) AS reserved
    FROM quota_task_usage WHERE org_id=? AND period=? GROUP BY user_id`).all(orgId, period);
  const usageByUser = new Map(usageRows.map(row => [row.user_id, row]));
  const members = db.prepare(`SELECT u.id,u.email,m.role,COALESCE(a.amount,0) AS allocation
    FROM org_members m JOIN users u ON u.id=m.user_id
    LEFT JOIN member_quota_allocations a ON a.org_id=m.org_id AND a.user_id=m.user_id AND a.period=?
    WHERE m.org_id=? ORDER BY m.created_at`).all(period, orgId).map(member => {
    const usage = usageByUser.get(member.id) || { used: 0, reserved: 0 };
    return { ...member, ...usage, available: Math.max(0, member.allocation - usage.used - usage.reserved) };
  });
  const used = usageRows.reduce((sum, row) => sum + row.used, 0);
  const reserved = usageRows.reduce((sum, row) => sum + row.reserved, 0);
  const remaining = Math.max(0, grants - used - reserved);
  const memberAvailable = members.reduce((sum, member) => sum + member.available, 0);
  return { period, granted: grants, used, reserved, remaining, unallocated: Math.max(0, remaining - memberAvailable), members };
}

export function getMemberQuota(orgId, userId) {
  const summary = getOrgQuota(orgId);
  const member = summary.members.find(item => item.id === userId);
  if (!member) return null;
  return { period: summary.period, allocation: member.allocation, used: member.used, reserved: member.reserved, available: member.available };
}

export function grantOrgQuota({ orgId, amount, actorUserId }) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1000000000) throw new Error('额度必须是 1 至 1,000,000,000 之间的整数点数');
  if (!db.prepare("SELECT 1 FROM orgs WHERE id=? AND id!='bootstrap'").get(orgId)) return null;
  const period = quotaPeriod();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('INSERT INTO org_quota_grants(id,org_id,period,amount,actor_user_id,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(), orgId, period, amount, actorUserId, Date.now());
    recordOrgAudit({ orgId, actorUserId, action: 'quota.org.granted', target: orgId, details: { period, amount } });
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return getOrgQuota(orgId);
}

export function setMemberQuota({ orgId, userId, amount, actorUserId }) {
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 1000000000) throw new Error('成员额度须为 0 至 1,000,000,000 之间的整数点数');
  const period = quotaPeriod();
  db.exec('BEGIN IMMEDIATE');
  try {
    const summary = getOrgQuota(orgId);
    const member = summary.members.find(item => item.id === userId);
    if (!member) throw new Error('成员不存在');
    const othersAvailable = summary.members.filter(item => item.id !== userId).reduce((sum, item) => sum + item.available, 0);
    const minimum = member.used + member.reserved;
    const maximum = minimum + summary.remaining - othersAvailable;
    if (amount < minimum) throw new Error(`额度不能低于已用和预占额度（${minimum} 点）`);
    if (amount > maximum) throw new Error(`组织当前最多可分配 ${maximum} 点`);
    db.prepare(`INSERT INTO member_quota_allocations(org_id,user_id,period,amount,actor_user_id,updated_at) VALUES(?,?,?,?,?,?)
      ON CONFLICT(org_id,user_id,period) DO UPDATE SET amount=excluded.amount,actor_user_id=excluded.actor_user_id,updated_at=excluded.updated_at`)
      .run(orgId, userId, period, amount, actorUserId, Date.now());
    recordOrgAudit({ orgId, actorUserId, action: 'quota.member.allocated', target: member.email, details: { period, from: member.allocation, to: amount } });
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return getOrgQuota(orgId);
}

export function registerFile(path, orgId = scoped() || 'bootstrap') {
  db.prepare('INSERT OR REPLACE INTO file_owners(path, org_id) VALUES (?, ?)').run(path, orgId);
}

export function registerTaskFile(taskId, path) {
  const row = db.prepare('SELECT org_id FROM tasks WHERE id = ?').get(taskId);
  if (row && path) registerFile(path, row.org_id);
}

export function canAccessFile(path, orgId) {
  return Boolean(db.prepare(`SELECT 1 FROM file_owners WHERE path = ? AND org_id = ?
    UNION SELECT 1 FROM tasks WHERE local_path = ? AND org_id = ? LIMIT 1`).get(path, orgId, path, orgId));
}
