import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, Check, ChevronDown, Clock3, Copy, Film, Image, Loader2, RefreshCw, Search, Sparkles, X } from 'lucide-react';
import { api } from '../api.js';
import './TracingPage.css';

const ranges = [['今天','1'],['7 天','7'],['30 天','30']];
const kindName = { image:'图片', video:'视频', chat:'对话', agent:'Agent', script_split:'拆分镜', breakdown:'拆解' };
const fmt = n => Number(n||0).toLocaleString('zh-CN');
const duration = n => n>=1000?`${(n/1000).toFixed(1)}s`:`${Math.round(n||0)}ms`;
const cost = n => `¥${Number(n||0).toFixed(2)}`;
const stamp = n => new Date(n).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});

function Sparkline({values=[]}) { const max=Math.max(1,...values.map(Number)); const points=values.map((value,i)=>`${values.length<2?0:i/(values.length-1)*100},${28-(Number(value)||0)/max*24}`).join(' '); return <svg className="trace-sparkline" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points={points||'0,26 100,26'}/></svg>; }

export default function TracingPage({ platformAdmin = false }) {
  const initial = new URLSearchParams(location.search);
  const [days,setDays] = useState(initial.get('days')||'7');
  const [orgs,setOrgs] = useState([]);
  const [orgId,setOrgId] = useState(platformAdmin ? (initial.get('org')||'') : '');
  const [kind,setKind] = useState(initial.get('kind')||'all');
  const [status,setStatus] = useState(initial.get('status')||'all');
  const [query,setQuery] = useState(initial.get('q')||'');
  const [tasks,setTasks] = useState([]);
  const [calls,setCalls] = useState([]);
  const [summary,setSummary] = useState(null);
  const [detail,setDetail] = useState(null);
  const [selectedId,setSelectedId] = useState(initial.get('trace')||'');
  const [detailTab,setDetailTab] = useState('瀑布图');
  const [tree,setTree] = useState(false);
  const [auto,setAuto] = useState(true);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const cursorRef = useRef('');
  const [more,setMore] = useState(false);
  const [listScroll,setListScroll] = useState(0);
  const [expanded,setExpanded] = useState(-1);
  const listRef = useRef(null);

  useEffect(()=>{ if(platformAdmin) api.platformOrganizations().then(d=>setOrgs(d.items||[])).catch(e=>setError(e.message)); },[platformAdmin]);
  const orgParam = platformAdmin ? (orgId||'all') : undefined;
  const load = useCallback(async (append=false,silent=false) => {
    if(!silent) setLoading(true);
    try {
      const [s,c,t] = await Promise.all([api.tracingSummary(days,orgParam),api.tracingCalls(200,orgParam),api.tracingTasks(100,orgParam,append?cursorRef.current:undefined)]);
      setSummary(s); setCalls(c.items||[]);
      const next=append?[...tasks,...(t.items||[])]:t.items||[];
      setTasks(current=>append?[...current,...(t.items||[])]:t.items||[]); cursorRef.current=t.nextCursor||''; setMore(Boolean(t.nextCursor)); setError('');
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  },[days,orgParam,platformAdmin,orgId]);
  useEffect(()=>{load();},[days,orgId,load]);
  useEffect(()=>{
    const p=new URLSearchParams(); if(platformAdmin&&orgId)p.set('org',orgId); if(days!=='7')p.set('days',days); if(kind!=='all')p.set('kind',kind); if(status!=='all')p.set('status',status); if(query)p.set('q',query); if(selectedId)p.set('trace',selectedId);
    const url=`${location.pathname}${p.size?`?${p}`:''}`; if(`${location.pathname}${location.search}`!==url)history.replaceState({},'',url);
  },[platformAdmin,orgId,days,kind,status,query,selectedId]);
  const selectTask=useCallback(async id=>{
    if(!id){setSelectedId('');setDetail(null);return;}
    setSelectedId(id);
    try { const d=await api.tracingTask(id,orgParam); setDetail(d); }
    catch(e){setError(e.message);setDetail(null);}
  },[orgParam]);
  useEffect(()=>{if(selectedId&&!detail)selectTask(selectedId);},[selectedId,detail,selectTask]);
  useEffect(()=>{
    if(!auto||!tasks.some(t=>['queued','running'].includes(t.status))) return;
    const id=setInterval(()=>{load(false,true);if(selectedId)selectTask(selectedId)},3000); return ()=>clearInterval(id);
  },[auto,tasks,load,selectedId,selectTask]);
  const filtered=useMemo(()=>{const since=Date.now()-Number(days)*86400000;return tasks.filter(t=>t.createdAt>=since&&(kind==='all'||t.type===kind)&&(status==='all'||t.status===status)&&`${t.id} ${t.prompt||''}`.toLowerCase().includes(query.toLowerCase()))},[tasks,kind,status,query,days]);
  useEffect(()=>setListScroll(0),[kind,status,query,days,orgId]);
  const activeIndex=filtered.findIndex(t=>t.id===selectedId);
  const listStart=Math.floor(listScroll/68);
  const visibleTasks=filtered.slice(listStart,listStart+18);
  useEffect(()=>{const key=e=>{if(e.target.matches('input,textarea,select'))return;if(e.key==='j'||e.key==='k'){e.preventDefault();const i=Math.max(0,Math.min(filtered.length-1,(activeIndex<0?0:activeIndex)+(e.key==='j'?1:-1)));if(filtered[i])selectTask(filtered[i].id)}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[filtered,activeIndex,selectTask]);
  const taskTotals=summary?.taskTotals||{}; const totalCalls=summary?.totals||{};
  const p95=[...calls.filter(c=>c.createdAt>=Date.now()-Number(days)*86400000)].map(c=>Number(c.latencyMs||0)).sort((a,b)=>a-b)[Math.floor(Math.max(0,calls.length-1)*.95)]||0;
  const success=taskTotals.tasks?Math.round((taskTotals.done||0)/taskTotals.tasks*100):0;
  const events=detail?.events||[]; const callsForTask=detail?.calls||[];
  const phases=detail?[
    {name:'排队',ms:300,color:'#8ca5bb'},
    {name:'提交',ms:200,color:'#7b94ac'},
    {name:'生成等待',ms:Math.max(200,Number(detail.task.costMs||0)-1010),color:'#467da5'},
    {name:'下载',ms:500,color:'#75a98b'},
    {name:'结算',ms:10,color:'#d6a54b'},
  ]:[];
  const phaseTotal=phases.reduce((a,p)=>a+p.ms,0)||1;
  const emptyTitle=error?'加载失败':tasks.length?'没有匹配的任务':platformAdmin&&orgId==='all'?'平台暂无追踪数据':'该组织暂无追踪数据';

  return <section className="trace-workspace">
    <div className="platform-overview-head trace-overview-head"><div><h2>调用追踪</h2><p>以生成任务为主线查看全链路调用与事件</p></div><div className="trace-head-actions"><label className="trace-auto"><input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)}/>自动刷新</label><button onClick={()=>load()}><RefreshCw size={14}/>刷新</button></div></div>
    <div className="admin-metrics trace-kpis">{[['任务',taskTotals.tasks||0],['调用',totalCalls.calls||0],['成功率',`${success}%`],['P95 延迟',duration(p95)],['Tokens',fmt(totalCalls.totalTokens)],['花费',`¥${Number(totalCalls.cost||0).toFixed(2)}`]].map(([label,value])=><button className="admin-metric trace-kpi" key={label} onClick={()=>label==='成功率'&&setStatus('failed')}><div className="admin-metric-top"><span className="admin-metric-label">{label}</span><Sparkline values={(summary?.series||[]).map(d=>label==='任务'?d.tasks:label==='调用'?d.calls:label==='成功率'?d.done:label==='Tokens'?d.tokens:label==='花费'?d.cost:d.latency)}/></div><strong>{value}</strong></button>)}</div>
    {error&&<div className="trace-error"><AlertTriangle size={15}/>{error}<button onClick={()=>load()}>重试</button></div>}
    <article className="admin-card trace-directory"><div className="admin-card-head trace-directory-head"><div><h3>任务列表</h3><p>{filtered.length} 条记录 · j/k 切换</p></div></div>
    <div className="trace-filters">{platformAdmin&&<select aria-label="组织" value={orgId||'all'} onChange={e=>{setOrgId(e.target.value);setDetail(null);setSelectedId('')}}><option value="all">全部组织</option>{orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select>}<div className="trace-range">{ranges.map(([label,value])=><button className={days===value?'selected':''} key={value} onClick={()=>setDays(value)}>{label}</button>)}</div><select value={kind} onChange={e=>setKind(e.target.value)}><option value="all">全部类型</option>{Object.entries(kindName).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">全部状态</option><option value="done">成功</option><option value="failed">失败</option><option value="running">运行中</option><option value="queued">排队中</option></select><label className="trace-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="任务 ID / 提示词"/></label></div>
    <div className="trace-split"><aside className="trace-list"><div className="trace-list-scroll" ref={listRef} onScroll={e=>setListScroll(e.currentTarget.scrollTop)}>{loading&&!tasks.length?<div className="trace-skeleton">正在读取任务…</div>:filtered.length?filtered.map((task,i)=><button key={task.id} className={`trace-item ${task.id===selectedId?'selected':''}`} onClick={()=>selectTask(task.id)}><i className={`trace-state ${task.status}`}/><span className="trace-item-icon">{task.type==='video'?<Film size={15}/>:<Image size={15}/>}</span><div className="trace-item-info"><b title={task.prompt}>{task.prompt||'（无提示词）'}</b><small>{platformAdmin?(task.organization||orgs.find(o=>o.id===orgId)?.name||'全部组织'):'当前组织'} · {task.createdBy||'系统'} · {stamp(task.createdAt)}</small><small>{duration(task.costMs)} · {fmt(calls.filter(c=>c.taskId===task.id).reduce((a,c)=>a+(c.totalTokens||0),0))} tok · {cost(calls.filter(c=>c.taskId===task.id).reduce((a,c)=>a+(c.costCny||0),0))}</small></div><span className="trace-item-status">{task.status==='done'?'完成':task.status==='failed'?'失败':task.status==='queued'?'排队':'运行中'}</span></button>):<div className="trace-empty"><Activity size={22}/><b>{emptyTitle}</b><p>{error?'检查连接后重试':tasks.length?'调整筛选条件，或清除搜索':platformAdmin&&orgId==='all'?'去成片或画布发起一次生成。':'切换组织或调整时间范围试试。'}</p>{tasks.length>0&&<button onClick={()=>{setQuery('');setKind('all');setStatus('all')}}>清除筛选</button>}{!tasks.length&&platformAdmin&&orgId!=='all'&&<button onClick={()=>setOrgId('all')}>查看全部组织</button>}{!tasks.length&&(!platformAdmin||orgId==='all')&&<a href="/app/videos">去生成一次</a>}</div>}</div>{more&&<button className="trace-load-more" onClick={()=>load(true)}>加载更多</button>}</aside>
      <main className="trace-detail">{detail?<>
        <header className="trace-detail-head"><div><div className="trace-id-row"><b>#{detail.task.id}</b><button title="复制任务 ID" onClick={()=>navigator.clipboard.writeText(detail.task.id)}><Copy size={13}/></button><span className={`trace-status-pill ${detail.task.status}`}>{detail.task.status==='done'?'完成':detail.task.status==='failed'?'失败':'运行中'}</span></div><p>{platformAdmin?orgs.find(o=>o.id===orgId)?.name||'全部组织':'当前组织'} · {detail.task.model} · 尝试 {detail.task.attempts||1} 次</p></div><div><b>{duration(detail.task.costMs)}</b><small>{cost(callsForTask.reduce((n,c)=>n+(c.costCny||0),0))}</small></div></header><nav className="trace-detail-tabs">{['瀑布图','树形图','事件','输入','输出','错误'].map(t=><button className={detailTab===t?'selected':''} key={t} onClick={()=>setDetailTab(t)}>{t}</button>)}</nav>{detailTab==='瀑布图'?<div className="trace-waterfall"><p className="trace-estimate-note">分阶段耗时为估算；任务事件暂未分别记录下载与结算时长。</p><div className="trace-time-axis"><span>0s</span><span>{duration(phaseTotal/2)}</span><span>{duration(phaseTotal)}</span></div>{phases.map((p,i)=><button key={p.name} className="trace-span" onClick={()=>setExpanded(expanded===i?-1:i)}><span>{p.name}</span><div><i style={{width:`${Math.max(2,p.ms/phaseTotal*100)}%`,background:p.color}}/></div><small>{duration(p.ms)}</small>{expanded===i&&<code>阶段估算 · {stamp(detail.task.createdAt+i*1000)} · {duration(p.ms)}</code>}</button>)}</div>:detailTab==='树形图'?<div className="trace-tree"><b>任务 {detail.task.type==='video'?'视频':'图片'} 生成</b>{events.map(e=><div key={e.id}>↳ {e.event} · {stamp(e.at)}</div>)}{callsForTask.map(c=><div key={c.id}>↳ {c.model} · {duration(c.latencyMs)} · {c.status}</div>)}</div>:detailTab==='事件'?<div className="trace-events">{events.map(e=><div key={e.id}><time>{stamp(e.at)}</time><b>{e.event}</b><code>{e.detail?JSON.stringify(e.detail,null,2):'—'}</code></div>)}</div>:detailTab==='输入'?<div className="trace-payload"><div><b>Prompt</b><button onClick={()=>navigator.clipboard.writeText(detail.task.prompt||'')}><Copy size={13}/>复制</button></div><pre>{detail.task.prompt||'无提示词'}</pre><div><b>Params</b><button onClick={()=>navigator.clipboard.writeText(JSON.stringify(detail.task.params||{},null,2))}><Copy size={13}/>复制</button></div><pre>{JSON.stringify(detail.task.params||{},null,2)}</pre></div>:detailTab==='输出'?<div className="trace-output">{detail.task.resultUrl?<>{detail.task.type==='video'?<video controls src={detail.task.resultUrl}/>:<img src={detail.task.resultUrl} alt="任务生成结果"/>}<a href={detail.task.resultUrl} target="_blank" rel="noreferrer">打开结果链接</a></>:<p>任务尚无输出结果。</p>}</div>:<div className="trace-error-detail">{detail.task.error?<><AlertTriangle size={18}/><b>{detail.task.error}</b><p>已尝试 {detail.task.attempts||1} 次</p><button onClick={async()=>{try{await api.retryTask(detail.task.id);await load();await selectTask(detail.task.id)}catch(e){setError(e.message)}}}>重试任务</button></>:<p>此任务没有错误记录。</p>}</div>}</>:<div className="trace-no-selection"><Sparkles size={23}/><b>选择一条任务查看完整追踪</b><span>查看调用树、耗时瀑布、输入输出与错误</span></div>}</main></div>
    </article>
  </section>;
}
