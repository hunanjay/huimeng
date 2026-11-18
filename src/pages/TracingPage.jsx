import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, ChevronDown, Clock, Loader2, RefreshCw, Zap } from 'lucide-react';
import { api } from '../api.js';
import './TracingPage.css';

const RANGES = [['今天', '1'], ['近 7 天', '7'], ['近 30 天', '30']];

const KIND_LABEL = {
  chat: '对话',
  agent: '智能体',
  script_split: '拆分镜',
  breakdown: '拆解分析',
  image: '生图',
  video: '生视频',
};

const num = value => (value >= 10000 ? `${(value / 1000).toFixed(1)}k` : `${value || 0}`);
const ms = value => (value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value || 0)}ms`);
const money = value => {
  const amount = Number(value || 0);
  return `¥${amount > 0 && amount < 0.01 ? amount.toFixed(4) : amount.toFixed(2)}`;
};
const time = timestamp => new Date(timestamp).toLocaleString('zh-CN', {
  month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

export default function TracingPage({ platformAdmin = false }) {
  const [days, setDays] = useState('7');
  const [organizations, setOrganizations] = useState([]);
  const [orgId, setOrgId] = useState('');
  const [view, setView] = useState('tokens');
  const [summary, setSummary] = useState(null);
  const [calls, setCalls] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!platformAdmin) return;
    api.platformOrganizations()
      .then(data => {
        setOrganizations(data.items);
        setOrgId(current => current || data.items[0]?.id || '');
      })
      .catch(err => setError(err.message));
  }, [platformAdmin]);

  const load = useCallback(async () => {
    if (platformAdmin && !orgId) {
      setSummary(null);
      setCalls([]);
      setTasks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [summaryData, callsData, tasksData] = await Promise.all([
        api.tracingSummary(days, platformAdmin ? orgId : undefined),
        api.tracingCalls(80, platformAdmin ? orgId : undefined),
        api.tracingTasks(20, platformAdmin ? orgId : undefined),
      ]);
      setSummary(summaryData);
      setCalls(callsData.items);
      setTasks(tasksData.items);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [days, orgId, platformAdmin]);

  useEffect(() => { load(); }, [load]);

  const openTask = async id => {
    if (detail?.task?.id === id) { setDetail(null); return; }
    try {
      const data = await api.tracingTask(id, platformAdmin ? orgId : undefined);
      setDetail(data);
    } catch (err) {
      setError(err.message);
    }
  };

  const totals = summary?.totals || { calls: 0, totalTokens: 0, promptTokens: 0, completionTokens: 0, avgLatency: 0, errors: 0 };
  const taskTotals = summary?.taskTotals || { tasks: 0, done: 0, failed: 0, running: 0 };

  return <section className="tracing-page">
    <div className="tracing-head">
      <div>
        <h1>调用追踪</h1>
        <p>{platformAdmin ? `${organizations.find(org => org.id === orgId)?.name || '选择一个组织'} · 模型调用与生成任务追踪` : '模型 token 消耗与任务全链路事件，按调用逐条记账。'}</p>
      </div>
      <div className="tracing-actions">
        {platformAdmin && <select className="tracing-org-select" aria-label="选择组织" value={orgId} onChange={event => { setOrgId(event.target.value); setDetail(null); }}>
          <option value="" disabled>选择组织</option>
          {organizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
        </select>}
        <div className="tracing-ranges">
          {RANGES.map(([label, value]) => <button key={value} type="button"
            className={days === value ? 'current' : ''} onClick={() => setDays(value)}>{label}</button>)}
        </div>
        <button type="button" className="tracing-refresh" onClick={load}><RefreshCw size={15} />刷新</button>
      </div>
    </div>

    {error && <div className="tracing-error"><AlertTriangle size={15} />{error}</div>}

    <div className="tracing-stats">
      {[
        ['调用次数', num(totals.calls), '所有模型调用（含生图/生视频）'],
        ['总 Tokens', num(totals.totalTokens), `输入 ${num(totals.promptTokens)} · 输出 ${num(totals.completionTokens)}`],
        ['预估花费', money(totals.cost), '按方舟刊例价估算'],
        ['平均延迟', ms(totals.avgLatency), '含生图/生视频'],
        ['失败调用', num(totals.errors), totals.errors ? '有失败，去日志看原因' : '全部成功'],
        ['任务数', num(taskTotals.tasks), `完成 ${taskTotals.done} · 失败 ${taskTotals.failed}`],
      ].map(([label, value, hint]) => <div className="tracing-stat" key={label}>
        <span>{label}</span>
        <b>{value}</b>
        <small>{hint}</small>
      </div>)}
    </div>

    <div className="tracing-tabs">
      <button type="button" className={view === 'tokens' ? 'current' : ''} onClick={() => setView('tokens')}><Zap size={15} />Token 消耗</button>
      <button type="button" className={view === 'tasks' ? 'current' : ''} onClick={() => setView('tasks')}><Activity size={15} />任务追踪</button>
    </div>

    {loading ? <div className="tracing-loading"><Loader2 size={18} className="spin" />正在读取追踪数据…</div>
      : view === 'tokens' ? <>
        <section className="tracing-card">
          <h2>按模型</h2>
          <div className="tracing-table">
            <div className="tracing-row head"><span>模型</span><span>调用</span><span>Tokens</span><span>花费</span><span>平均延迟</span></div>
            {(summary?.byModel || []).length === 0 && <p className="tracing-empty">还没有调用记录，去智能体或成片页生成一次。</p>}
            {(summary?.byModel || []).map(row => <div className="tracing-row" key={row.model}>
              <span className="model-name" title={row.model}>{row.model}</span>
              <span>{row.calls}</span>
              <span>{num(row.tokens)}</span>
              <span>{money(row.cost)}</span>
              <span>{ms(row.avg_latency)}</span>
            </div>)}
          </div>
        </section>

        <section className="tracing-card">
          <h2>按类型</h2>
          <div className="tracing-kinds">
            {(summary?.byKind || []).map(row => <div className="tracing-kind" key={row.kind}>
              <span>{KIND_LABEL[row.kind] || row.kind}</span>
              <b>{num(row.tokens)}</b>
              <small>{row.calls} 次 · {ms(row.avg_latency)} · {money(row.cost)}</small>
            </div>)}
            {(!summary?.byKind || summary.byKind.length === 0) && <p className="tracing-empty">暂无数据</p>}
          </div>
        </section>

        <section className="tracing-card">
          <h2>最近调用</h2>
          <div className="tracing-calls">
            {calls.length === 0 && <p className="tracing-empty">还没有调用记录。</p>}
            {calls.map(call => <div className="tracing-call" key={call.id}>
              <span className={`call-kind kind-${call.kind}`}>{KIND_LABEL[call.kind] || call.kind}</span>
              <span className="call-model" title={call.model}>{call.model}</span>
              <span className="call-tokens">{call.totalTokens ? `${num(call.promptTokens)} + ${num(call.completionTokens)} = ${num(call.totalTokens)}` : '—'}</span>
              <span className="call-cost">{money(call.costCny)}</span>
              <span className="call-latency"><Clock size={12} />{ms(call.latencyMs)}</span>
              <span className={`call-status ${call.status === 'ok' ? 'ok' : 'err'}`}>{call.status === 'ok' ? '成功' : '失败'}</span>
              <span className="call-time">{time(call.createdAt)}</span>
            </div>)}
          </div>
        </section>
      </> : <section className="tracing-card">
        <h2>最近的生成任务</h2>
        <div className="tracing-tasks">
          {tasks.length === 0 && <p className="tracing-empty">还没有任务。</p>}
          {tasks.map(task => {
            const open = detail?.task?.id === task.id;
            return <div className={`tracing-task ${open ? 'open' : ''}`} key={task.id}>
              <button type="button" className="task-row" onClick={() => openTask(task.id)}>
                <i className={`status-dot dot-${task.status === 'done' ? 'done' : task.status === 'failed' ? 'failed' : 'processing'}`} />
                <span className="task-type">{task.type === 'video' ? '视频' : '图片'}</span>
                <span className="task-prompt" title={task.prompt}>{task.prompt}</span>
                <span className="task-model" title={task.model}>{task.model}</span>
                <span className="task-meta">{task.costMs ? ms(task.costMs) : '—'} · {task.eventCount} 个事件</span>
                <ChevronDown size={15} className={`task-chevron ${open ? 'open' : ''}`} />
              </button>
              {open && detail && <div className="task-detail">
                <div className="task-timeline">
                  {detail.events.map(event => <div className="timeline-item" key={event.id}>
                    <i />
                    <div>
                      <strong>{event.event}</strong>
                      <small>{time(event.at)} · +{ms(event.at - detail.task.createdAt)}</small>
                      {event.detail && <code>{JSON.stringify(event.detail)}</code>}
                    </div>
                  </div>)}
                  {detail.events.length === 0 && <p className="tracing-empty">这个任务还没记录到事件。</p>}
                </div>
                {detail.calls.length > 0 && <div className="task-calls">
                  <span>关联调用</span>
                  {detail.calls.map(call => <small key={call.id}>{KIND_LABEL[call.kind] || call.kind} · {ms(call.latencyMs)} · {call.status}</small>)}
                </div>}
              </div>}
            </div>;
          })}
        </div>
      </section>}
  </section>;
}
