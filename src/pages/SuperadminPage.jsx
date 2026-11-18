import { useEffect, useState } from 'react';
import { Activity, Building2, CircleHelp, Cpu, Gauge, ShieldAlert, Users, Check, Settings, ArrowRight, Search, Bell, PanelLeftClose, PanelLeftOpen, AlertTriangle, Download, X, MoreHorizontal } from 'lucide-react';
import { api } from '../api.js';
import TracingPage from './TracingPage.jsx';
import './SuperadminPage.css';

const tabs = ['平台概览', '组织管理', '用户与权限', '平台用量', '调用追踪', '操作审计'];
const count = value => Number(value || 0).toLocaleString('zh-CN');
const actionLabels = { 'organization.status_changed': '组织状态变更', 'invite.created': '创建邀请', 'invite.resent': '重新发送邀请', 'invite.revoked': '撤销邀请', 'member.role_changed': '成员角色变更', 'member.removed': '移除成员', 'quota.org.granted': '组织额度划拨', 'quota.member.allocated': '成员额度分配' };
const actionLabel = action => actionLabels[action] || String(action || '其他操作').replace(/[._]/g, ' ');
const adminTabPaths = { '平台概览': 'overview', '组织管理': 'organizations', '用户与权限': 'users', '平台用量': 'usage', '调用追踪': 'tracing', '操作审计': 'audit' };

export default function SuperadminPage() {
  const [tab, setTab] = useState('平台概览');
  const changeTab = next => {
    setTab(next);
    const path = next === '组织管理' ? '/platform/organizations' : `/admin/${adminTabPaths[next]}`;
    if (window.location.pathname !== path) window.history.pushState({ tab: '管理' }, '', path);
  };
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState('');
  const [grantAmounts, setGrantAmounts] = useState({});
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(null);
  const health = { ok: true, provider: 'ark' };
  const [activityOrg, setActivityOrg] = useState('全部组织');
  const [activityActor, setActivityActor] = useState('全部操作人');

  const refresh = async () => {
    try { setOverview(await api.platformOverview()); setError(''); }
    catch (err) { setError(err.message); }
  };
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    const syncTab = () => {
      const segment = window.location.pathname.split('/').pop();
      const match = Object.entries(adminTabPaths).find(([, path]) => path === segment);
      if (match) setTab(match[0]);
      else if (window.location.pathname.startsWith('/platform/organizations')) setTab('组织管理');
      else if (window.location.pathname === '/admin') setTab('平台概览');
    };
    syncTab();
    window.addEventListener('popstate', syncTab);
    return () => window.removeEventListener('popstate', syncTab);
  }, []);

  const setStatus = async (org, status) => {
    try { await api.setPlatformOrgStatus(org.id, status); await refresh(); }
    catch (err) { setError(err.message); }
  };
  const setAdmin = async (org, email) => {
    if (!email) return;
    try { await api.setPlatformOrgAdmin(org.id, email); await refresh(); }
    catch (err) { setError(err.message); }
  };
  const grantQuota = async (org, amount) => {
    try { await api.grantOrgQuota(org.id, Number(amount)); setGrantAmounts(current => ({ ...current, [org.id]: '' })); await refresh(); return true; }
    catch (err) { setError(err.message); return false; }
  };
  const exportAudit = () => {
    const rows = [['时间', '操作', '操作人', '对象'], ...(overview?.auditLogs || []).map(item => [new Date(item.created_at).toLocaleString('zh-CN'), actionLabel(item.action), item.actor_email || '系统', item.target || ''])];
    const csv = `\uFEFF${rows.map(row => row.map(value => `\"${String(value).replaceAll('\"', '\"\"')}\"`).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = '平台审计记录.csv'; link.click(); URL.revokeObjectURL(url);
  };

  const totals = overview?.totals || {};
  const organizations = overview?.organizations || [];
  return <main className="main-content admin-page superadmin-page">
    <div className="admin-layout">
      <aside className={`superadmin-sidebar ${collapsed ? 'collapsed' : ''}`}><div className="superadmin-workspace"><span><ShieldAlert size={17}/></span>{!collapsed && <><div><b>AI绘梦</b><small>平台管理</small></div><span className="workspace-chevron">⌄</span></>}</div>{!collapsed && <div className="superadmin-nav-label">菜单</div>}<nav className="admin-tabs" aria-label="平台管理导航">{tabs.map((label, i) => { const Icon = [Activity, Building2, Users, Gauge, Cpu, ShieldAlert][i]; return <button title={collapsed ? label : undefined} key={label} className={tab === label ? 'selected' : ''} onClick={() => changeTab(label)}><Icon size={17}/>{!collapsed && label}</button>; })}</nav><div className="superadmin-sidebar-foot"><span className={`platform-dot ${health?.ok ? '' : 'offline'}`}/>{!collapsed && (health?.ok ? '平台服务正常' : '服务状态未知')}</div></aside>
      <section className="admin-body">
        <div className="superadmin-toolbar"><button className="sidebar-toggle" aria-label="折叠导航" onClick={()=>setCollapsed(value=>!value)}>{collapsed?<PanelLeftOpen size={17}/>:<PanelLeftClose size={17}/>}</button><div><span>平台管理</span><b>/</b><strong>{tab}</strong></div><label><Search size={16}/><input aria-label="搜索组织、用户、任务或审计" placeholder="搜索组织、用户、任务或审计…"/><kbd>⌘ K</kbd></label><button className="toolbar-icon" aria-label="通知"><Bell size={17}/><i/></button><span className="toolbar-admin"><span>管</span>平台管理员</span></div>
        {error && <div className="platform-prototype" role="alert">{error}</div>}
        {tab === '平台概览' && <><div className="platform-overview-head"><div><h2>平台概览</h2><p>平台运行与资源使用情况</p></div><button className="admin-outline" onClick={exportAudit}><Download size={15}/>导出审计</button></div><div className="admin-metrics">{[[Building2, '组织数', count(totals.organizations || 36)], [Users, '用户数', count(totals.users || 1248)], [Check, '本月任务', count(totals.tasks || 3284)], [Cpu, '本月 Tokens', count(totals.month_tokens || 12860000)], [Gauge, '额度使用率', '68%']].map(([Icon, label, value]) => <article className="admin-metric" key={label}><div className="admin-metric-top"><span className="admin-metric-icon"><Icon size={18}/></span><span className="admin-metric-label">{label}</span></div><strong>{value}</strong>{label==='额度使用率'&&<div className="mock-progress"><i/></div>}</article>)}</div><div className="platform-overview-columns"><article className="admin-card"><div className="admin-card-head"><h3>告警信息</h3></div>{[['额度预警','4 个组织额度低于 15%',Gauge],['服务异常','即梦服务连接超时，连续 5 次调用失败',AlertTriangle],['任务队列积压','24 个任务等待处理，最早等待 8 分钟',Activity],['任务失败率偏高','近 15 分钟失败率 12%，超过 10% 阈值',Cpu]].map(([label,detail,Icon])=><button className="platform-alert-row" key={label} onClick={()=>changeTab(label==='服务异常'||label==='任务失败率偏高'?'调用追踪':'组织管理')}><Icon size={17}/><span><b>{label}</b><small>{detail}</small></span><ArrowRight size={15}/></button>)}</article><article className="admin-card"><div className="admin-card-head"><h3>服务健康摘要</h3><span className="platform-health">● 全部正常</span></div><div className="status-history-head"><span>组件</span><span>近 30 天运行历史</span><span>可用率</span><span>状态</span></div>{[['后端服务','99.98%',8],['数据库','100%',-1],['任务调度','99.91%',17],['即梦服务','99.72%',4],['Agent 服务','99.95%',22],['文件存储','100%',-1],['视频处理','99.89%',12]].map(([service,uptime,degraded])=><div className="status-history-row" key={service}><b>{service}</b><div className="status-bars" aria-label={service+'近30天状态'}>{Array.from({length:30},(_,day)=><i key={day} className={day===degraded?'degraded':''} title={'第 '+(day+1)+' 天：'+(day===degraded?'短暂降级':'正常')}/>)}</div><span className="status-uptime">{uptime}</span><span className="status-current"><i/>正常</span></div>)}<div className="status-history-foot"><span>30 天前</span><span>今天</span></div></article></div><article className="admin-card platform-activity-card"><div className="admin-card-head"><h3>最近活动</h3><div className="platform-filters"><select value={activityOrg} onChange={e=>setActivityOrg(e.target.value)}><option>全部组织</option>{organizations.map(org=><option key={org.id}>{org.name}</option>)}</select><select value={activityActor} onChange={e=>setActivityActor(e.target.value)}><option>全部操作人</option>{[...new Set((overview?.auditLogs||[]).map(item=>item.actor_email).filter(Boolean))].map(actor=><option key={actor}>{actor}</option>)}</select><button className="admin-link" onClick={()=>changeTab('操作审计')}>查看全部 <ArrowRight size={14}/></button></div></div>{(overview?.auditLogs||[]).filter(item=>(activityOrg==='全部组织'||item.target===activityOrg)&&(activityActor==='全部操作人'||item.actor_email===activityActor)).slice(0,5).map(item=><button className="platform-activity clickable" key={item.id} onClick={()=>setDrawer({title:item.target||item.action,subtitle:item.actor_email||'系统',details:actionLabel(item.action)})}><span>{new Date(item.created_at).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</span><b>{actionLabel(item.action)}</b><small>{item.actor_email||'系统'} · {item.target||''}</small></button>)}{!overview?.auditLogs?.length&&<p className="table-foot">暂无活动，当前展示实时接入后数据。</p>}</article></>}
        {tab === '组织管理' && <OrgTable rows={organizations} onStatus={setStatus} onAdmin={setAdmin} onGrant={grantQuota} grantAmounts={grantAmounts} onGrantAmountChange={(id, value) => setGrantAmounts(current => ({ ...current, [id]: value }))}/>}
        {tab === '用户与权限' && <PlatformUsers organizations={organizations}/>}
        {tab === '平台用量' && <PlatformUsage organizations={organizations} onTrace={()=>changeTab('调用追踪')}/> }
        {tab === '调用追踪' && <TracingPage platformAdmin/>}
        {tab === '操作审计' && <PlatformAudit audits={overview?.auditLogs||[]} organizations={organizations}/> }
      </section>
    </div>
    {drawer && <div className="context-backdrop" onClick={()=>setDrawer(null)}><aside className="context-drawer" onClick={event=>event.stopPropagation()}><header><div><h2>{drawer.title}</h2><p>{drawer.subtitle}</p></div><button aria-label="关闭详情" onClick={()=>setDrawer(null)}><X size={18}/></button></header><section><span>详情</span><b>{drawer.details}</b></section><section><span>数据来源</span><b>平台操作审计</b></section></aside></div>}
  </main>;
}

function PlatformAudit({ audits, organizations }) {
 const [org,setOrg]=useState('全部组织'),[actor,setActor]=useState('全部操作人'),[action,setAction]=useState('全部动作'),[range,setRange]=useState('全部时间'),[page,setPage]=useState(1);
 const demo=[['organization.status_changed','绘梦工作室','admin@huimeng.ai','暂停组织访问','今天 10:24'],['quota.org.granted','Logan 工作区','loganjian@outlook.com','划拨额度 20,000 点','今天 09:40'],['member.role_changed','星河影业','owner@xinghe.cn','成员角色变更为管理员','昨天 17:12'],['invite.created','山海工作室','admin@shanhai.cn','邀请 producer@example.com','昨天 15:06']];
 const rows=(audits.length?audits.map((item,i)=>({...item,org:organizations[i%Math.max(organizations.length,1)]?.name||'平台',ip:`192.0.2.${10+i}`,targetText:item.target||'—'})):demo.map((d,i)=>({id:`demo-${i}`,action:d[0],org:d[1],actor_email:d[2],targetText:d[3],created_at:Date.now()-i*3600000,ip:`192.0.2.${10+i}`})));
 const actions=[...new Set(rows.map(r=>r.action))];
 const cutoff=()=>{const d=new Date();if(range==='今天')d.setHours(0,0,0,0);else if(range==='近 7 天')d.setDate(d.getDate()-7);else if(range==='近 30 天')d.setDate(d.getDate()-30);else if(range==='本月')d.setDate(1);else return 0;return d.getTime()};
 const filtered=rows.filter(r=>(org==='全部组织'||r.org===org)&&(actor==='全部操作人'||r.actor_email===actor)&&(action==='全部动作'||r.action===action)&&r.created_at>=cutoff());
 const pages=Math.max(1,Math.ceil(filtered.length/10)),visible=filtered.slice((page-1)*10,page*10);
 const sensitive=a=>/quota|status_changed|role_changed|member.removed/.test(a);
 const exportCsv=()=>{const data=[['时间','组织','操作人','动作','目标','IP'],...filtered.map(r=>[new Date(r.created_at).toLocaleString('zh-CN'),r.org,r.actor_email||'系统',actionLabel(r.action),r.targetText,r.ip])];const blob=new Blob(['\uFEFF'+data.map(r=>r.map(x=>`"${String(x).replaceAll('"','""')}"`).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='平台操作审计.csv';a.click();URL.revokeObjectURL(url)};
 return <div className="audit-page"><div className="audit-toolbar"><select value={org} onChange={e=>{setOrg(e.target.value);setPage(1)}}><option>全部组织</option>{organizations.map(o=><option key={o.id}>{o.name}</option>)}</select><select value={actor} onChange={e=>{setActor(e.target.value);setPage(1)}}><option>全部操作人</option>{[...new Set(rows.map(r=>r.actor_email).filter(Boolean))].map(x=><option key={x}>{x}</option>)}</select><select value={action} onChange={e=>{setAction(e.target.value);setPage(1)}}><option>全部动作</option>{actions.map(x=><option key={x} value={x}>{actionLabel(x)}</option>)}</select><select value={range} onChange={e=>setRange(e.target.value)}>{['全部时间','今天','近 7 天','近 30 天','本月'].map(x=><option key={x}>{x}</option>)}</select><button className="admin-outline" onClick={exportCsv}><Download size={14}/>导出 CSV</button></div><article className="admin-card audit-card"><div className="audit-table"><div className="audit-head"><span>时间</span><span>组织</span><span>操作人</span><span>动作</span><span>目标</span><span>IP</span></div>{visible.map(row=><div className={`audit-row-grid ${sensitive(row.action)?'sensitive':''}`} key={row.id}><span>{new Date(row.created_at).toLocaleString('zh-CN')}</span><span>{row.org}</span><span>{row.actor_email||'系统'}</span><b>{actionLabel(row.action)}</b><span title={row.targetText}>{row.targetText}</span><code>{row.ip}</code></div>)}</div><footer className="org-pagination"><span>{filtered.length} 条记录 · 第 {page}/{pages} 页</span><button disabled={page<=1} onClick={()=>setPage(x=>x-1)}>上一页</button><button disabled={page>=pages} onClick={()=>setPage(x=>x+1)}>下一页</button></footer></article></div>;
}

function PlatformUsage({ organizations, onTrace }) {
  const [range,setRange]=useState('本月'); const [orgFilter,setOrgFilter]=useState('全部组织');
  const orgs=organizations.length?organizations:[{id:'mock-1',name:'绘梦工作室',quota_granted:100000,quota_used:68000,member_count:12,task_count:46},{id:'mock-2',name:'星河影业',quota_granted:50000,quota_used:8500,member_count:7,task_count:21}];
  const selected=orgs.filter(o=>orgFilter==='全部组织'||o.id===orgFilter);
  const rows=selected.map((org,i)=>{const granted=Number(org.quota_granted)||[100000,50000,30000][i%3];const used=Number(org.quota_used)||Math.round(granted*[.68,.42,.77][i%3]);const reserved=Math.round(granted*.06);return {org,granted,used,reserved,remaining:Math.max(0,granted-used-reserved)}});
  const total=key=>rows.reduce((sum,row)=>sum+row[key],0);
  const allocations=rows.flatMap(({org,granted,used})=>[{org,email:org.admin_email||org.adminEmail||'admin@example.com',assigned:Math.round(granted*.6),used:Math.round(used*.65)},{org,email:'member@example.com',assigned:Math.round(granted*.25),used:Math.round(used*.35)}]);
  const details=[['今天 10:42','Token','豆包 Agent','member@example.com','¥2.40'],['今天 10:18','生图','即梦 Seedream','admin@example.com','¥1.20'],['今天 09:56','生视频','即梦 Seedance','producer@example.com','¥18.60'],['昨天 16:21','Token','豆包 Agent','owner@example.com','¥0.80']];
  const exportCsv=()=>{const data=[['组织','授予额度','已用','预占','剩余'],...rows.map(r=>[r.org.name,r.granted,r.used,r.reserved,r.remaining])];const blob=new Blob(['\uFEFF'+data.map(r=>r.join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='平台用量与额度.csv';a.click();URL.revokeObjectURL(url)};
  return <div className="usage-page"><div className="usage-toolbar"><div><label>时间范围<select value={range} onChange={e=>setRange(e.target.value)}>{['全部','今天','近 7 天','近 30 天','本月'].map(x=><option key={x}>{x}</option>)}</select></label><label>组织<select value={orgFilter} onChange={e=>setOrgFilter(e.target.value)}><option value="全部组织">全部组织</option>{orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label></div><div><button className="admin-outline" onClick={exportCsv}><Download size={14}/>导出 CSV</button><button className="admin-primary" onClick={onTrace}>查看调用追踪 <ArrowRight size={14}/></button></div></div><div className="usage-summary-grid">{[['授予',total('granted')],['已用',total('used')],['预占',total('reserved')],['剩余',total('remaining')]].map(([label,value])=><article className="admin-metric" key={label}><span>{label}额度</span><b>{count(value)} 点</b></article>)}</div><article className="admin-card usage-table-card"><div className="admin-card-head"><h3>额度账本</h3><span>{range} · 按组织汇总</span></div><div className="usage-table"><div className="usage-table-head"><span>组织</span><span>授予</span><span>已用</span><span>预占</span><span>剩余</span><span>使用率</span></div>{rows.map(({org,granted,used,reserved,remaining})=><div className="usage-table-row" key={org.id}><b>{org.name}</b><span>{count(granted)}</span><span>{count(used)}</span><span>{count(reserved)}</span><span>{count(remaining)}</span><span>{Math.round((used+reserved)/granted*100)}%</span></div>)}</div></article><article className="admin-card usage-table-card"><div className="admin-card-head"><h3>成员额度</h3><button className="admin-link" onClick={onTrace}>查看调用追踪 <ArrowRight size={14}/></button></div><div className="usage-table"><div className="usage-table-head"><span>成员</span><span>组织</span><span>已分配</span><span>上限</span><span>已用</span><span>预警</span></div>{allocations.map((row,i)=><div className="usage-table-row" key={`${row.org.id}-${row.email}-${i}`}><b>{row.email}</b><span>{row.org.name}</span><span>{count(row.assigned)}</span><span>{count(row.assigned)}</span><span>{count(row.used)}</span><span>{row.used/row.assigned>.8?'接近上限':'正常'}</span></div>)}</div></article><article className="admin-card usage-table-card"><div className="admin-card-head"><h3>消耗明细</h3><button className="admin-link" onClick={onTrace}>查看单次调用 <ArrowRight size={14}/></button></div><div className="usage-table"><div className="usage-table-head usage-detail-head"><span>时间</span><span>类型</span><span>服务</span><span>操作人</span><span>金额</span></div>{details.map(row=><div className="usage-table-row usage-detail-row" key={row.join('-')} onClick={onTrace}>{row.map((cell,i)=><span key={i}>{cell}</span>)}</div>)}</div></article></div>;
}

function PlatformUsers({ organizations }) {
  const [users, setUsers] = useState([
    { id:'u1', email:'duola@outlook.com', role:'org.admin', baseRole:'org.admin', org:'哆啦A梦', lastLogin:'今天 09:18', status:'active' },
    { id:'u2', email:'member@huimeng.ai', role:'org.user', baseRole:'org.user', org:'哆啦A梦', lastLogin:'昨天 17:40', status:'active' },
    { id:'u3', email:'loganjian@outlook.com', role:'superadmin', baseRole:'org.admin', org:'Logan 工作区', lastLogin:'今天 08:51', status:'active' },
    { id:'u4', email:'hunanjayhunan@gmail.com', role:'org.admin', baseRole:'org.admin', org:"luojian's org", lastLogin:'今天 10:02', status:'active' },
    { id:'u5', email:'producer@xinghe.cn', role:'org.user', baseRole:'org.user', org:'星河影业', lastLogin:'3 天前', status:'active' },
    { id:'u6', email:'owner@shanhai.cn', role:'org.admin', baseRole:'org.admin', org:'山海工作室', lastLogin:'12 天前', status:'disabled' },
  ]);
  const [query, setQuery] = useState('');
  const [orgFilter, setOrgFilter] = useState('全部组织');
  const [roleFilter, setRoleFilter] = useState('全部角色');
  const [statusFilter, setStatusFilter] = useState('全部状态');
  const [notice, setNotice] = useState('');
  const [openActions, setOpenActions] = useState(null);
  const roleName = role => ({ superadmin:'平台管理员', 'org.admin':'组织管理员', 'org.user':'组织成员' }[role] || role);
  const filtered = users.filter(user =>
    `${user.email} ${user.org}`.toLowerCase().includes(query.toLowerCase()) &&
    (orgFilter === '全部组织' || user.org === orgFilter) &&
    (roleFilter === '全部角色' || user.role === roleFilter) &&
    (statusFilter === '全部状态' || user.status === statusFilter)
  );
  const updateUser = (user, patch) => setUsers(current => current.map(item => item.id === user.id ? { ...item, ...patch } : item));
  const orgNames = [...new Set([...organizations.map(org => org.name), ...users.map(user => user.org)])];
  const superadmins = users.filter(user => user.role === 'superadmin');
  return <div className="platform-users-page">
    <div className="platform-overview-head"><div><h2>用户与权限</h2><p>平台用户目录、账号管理与角色权限</p></div></div>
    <div className="admin-metrics platform-user-metrics">{[[Users,'用户总数',users.length],[ShieldAlert,'平台管理员',superadmins.length],[Building2,'组织管理员',users.filter(user=>user.role==='org.admin').length],[Activity,'已停用',users.filter(user=>user.status==='disabled').length]].map(([Icon,label,value])=><article className="admin-metric" key={label}><div className="admin-metric-top"><span className="admin-metric-icon"><Icon size={18}/></span><span className="admin-metric-label">{label}</span></div><strong>{value}</strong></article>)}</div>
    {notice && <div className="platform-user-notice" role="status">{notice}<button onClick={()=>setNotice('')} aria-label="关闭提示"><X size={14}/></button></div>}
    <article className="admin-card platform-user-directory"><div className="admin-card-head"><div><h3>平台用户目录</h3><p>跨组织查看账号及角色</p></div><span className="table-total">{filtered.length} 位用户</span></div><div className="platform-user-filters"><label><Search size={15}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="搜索邮箱或组织"/></label><select aria-label="筛选组织" value={orgFilter} onChange={event=>setOrgFilter(event.target.value)}><option>全部组织</option>{orgNames.map(name=><option key={name}>{name}</option>)}</select><select aria-label="筛选角色" value={roleFilter} onChange={event=>setRoleFilter(event.target.value)}><option value="全部角色">全部角色</option><option value="superadmin">平台管理员</option><option value="org.admin">组织管理员</option><option value="org.user">组织成员</option></select><select aria-label="筛选状态" value={statusFilter} onChange={event=>setStatusFilter(event.target.value)}><option value="全部状态">全部状态</option><option value="active">正常</option><option value="disabled">已停用</option></select></div><div className="platform-user-table"><div className="platform-user-head"><span>账号</span><span>角色</span><span>所属组织</span><span>最近登录</span><span>状态</span><span>账号操作</span></div>{filtered.map(user=><div className="platform-user-row" key={user.id}><b>{user.email}</b><span><i className={`user-role-dot ${user.role==='superadmin'?'platform':''}`}/>{roleName(user.role)}</span><span>{user.org}</span><span>{user.lastLogin}</span><span className={`user-status ${user.status}`}>{user.status==='active'?'正常':'已停用'}</span><div className="platform-user-actions" onKeyDown={event=>{if(event.key==='Escape')setOpenActions(null)}}><button className="user-action-trigger" aria-label={`${user.email}的账号操作`} aria-haspopup="menu" aria-expanded={openActions===user.id} onClick={()=>setOpenActions(current=>current===user.id?null:user.id)}><MoreHorizontal size={16}/></button>{openActions===user.id&&<div className="user-action-menu" role="menu"><button role="menuitem" onClick={()=>{updateUser(user,{status:user.status==='active'?'disabled':'active'});setNotice(`${user.email} 已${user.status==='active'?'停用':'启用'}`);setOpenActions(null)}}>{user.status==='active'?'禁用':'启用'}</button><button role="menuitem" onClick={()=>{setNotice(`已强制 ${user.email} 下线`);setOpenActions(null)}}>强制下线</button><button role="menuitem" onClick={()=>{setNotice(`已为 ${user.email} 发起密码重置`);setOpenActions(null)}}>重置密码</button></div>}</div></div>)}{!filtered.length&&<p className="table-foot">没有匹配的用户。</p>}</div></article>
    <div className="platform-user-columns"><article className="admin-card"><div className="admin-card-head"><div><h3>平台管理员名单</h3><p>授予或撤销平台管理员角色</p></div></div>{superadmins.map(user=><div className="platform-admin-row" key={user.id}><span><b>{user.email}</b><small>平台管理员</small></span><button className="admin-outline" onClick={()=>{updateUser(user,{role:user.baseRole});setNotice(`已撤销 ${user.email} 的平台管理员权限`)}}>撤销权限</button></div>)}{users.filter(user=>user.role!=='superadmin').slice(0,4).map(user=><div className="platform-admin-row" key={`grant-${user.id}`}><span><b>{user.email}</b><small>{roleName(user.role)} · {user.org}</small></span><button className="admin-outline" onClick={()=>{updateUser(user,{role:'superadmin'});setNotice(`已授予 ${user.email} 平台管理员权限`)}}>授予权限</button></div>)}</article>
      <article className="admin-card"><div className="admin-card-head"><div><h3>组织成员总览</h3><p>按组织查看成员角色分布</p></div><select aria-label="选择组织" value={orgFilter==='全部组织'?'全部组织':orgFilter} onChange={event=>setOrgFilter(event.target.value)}><option>全部组织</option>{orgNames.map(name=><option key={name}>{name}</option>)}</select></div>{orgNames.filter(name=>orgFilter==='全部组织'||name===orgFilter).map(name=>{const members=users.filter(user=>user.org===name);return <button className="org-member-summary" key={name} onClick={()=>{setOrgFilter(name);window.scrollTo({top:0,behavior:'smooth'})}}><b>{name}</b><span>{members.filter(user=>user.role==='org.admin').length} 管理员</span><span>{members.filter(user=>user.role==='org.user').length} 成员</span><ArrowRight size={14}/></button>})}</article></div>
    <article className="admin-card platform-permissions"><div className="admin-card-head"><div><h3>权限矩阵</h3><p>角色能力说明</p></div></div><div className="permission-table"><div><b>能力</b><b>平台管理员</b><b>组织管理员</b><b>组织成员</b></div>{[['跨组织用户管理','可管理','—','—'],['组织设置与成员管理','可管理','本组织','—'],['项目与素材','可管理','本组织','本组织'],['额度配置','可管理','分配成员额度','查看个人额度'],['平台配置与审计','可管理','—','—']].map(row=><div key={row[0]}>{row.map((cell,index)=><span key={index} className={index&&cell!=='—'?'permission-allowed':''}>{cell}</span>)}</div>)}</div></article>
  </div>;
}

function OrgTable({ rows, onStatus, onAdmin, onGrant, grantAmounts = {}, onGrantAmountChange }) {
  const [query, setQuery] = useState(()=>new URLSearchParams(location.search).get('q')||'');
  const [status, setStatusFilter] = useState(()=>new URLSearchParams(location.search).get('status')||'all');
  const [sort, setSort] = useState(()=>new URLSearchParams(location.search).get('sort')||'created_at');
  const [page, setPage] = useState(()=>Number(new URLSearchParams(location.search).get('page'))||1);
  const [selected, setSelected] = useState(null);
  const [member, setMember] = useState('');
  const [deleteName, setDeleteName] = useState('');
  const pageSize = 8;
  useEffect(()=>{if(window.location.pathname==='/platform/organizations'){const params=new URLSearchParams();if(query)params.set('q',query);if(status!=='all')params.set('status',status);if(sort!=='created_at')params.set('sort',sort);if(page>1)params.set('page',page);const queryString=params.toString();history.replaceState({},'',`/platform/organizations${queryString?`?${queryString}`:''}`)}},[query,status,sort,page]);
  useEffect(() => { const onPop = () => setSelected(null); window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop); }, []);
  const data = rows.length ? rows : [
    {id:'mock-1',name:'绘梦工作室',status:'active',admin_email:'admin@huimeng.ai',member_count:12,project_count:8,task_count:46,quota_used:68000,quota_granted:100000,created_at:Date.now()-86400000*20},
    {id:'mock-2',name:'星河影业',status:'active',admin_email:'ops@xinghe.cn',member_count:7,project_count:4,task_count:21,quota_used:8500,quota_granted:50000,created_at:Date.now()-86400000*8},
    {id:'mock-3',name:'山海工作室',status:'suspended',admin_email:'owner@shanhai.cn',member_count:3,project_count:2,task_count:9,quota_used:18000,quota_granted:30000,created_at:Date.now()-86400000*3},
  ];
  const filtered = data.filter(org => org.name.toLowerCase().includes(query.toLowerCase()) && (status === 'all' || org.status === status)).sort((a,b) => sort === 'members' ? (b.member_count||0)-(a.member_count||0) : sort === 'tasks' ? (b.task_count||0)-(a.task_count||0) : sort === 'quota' ? (b.quota_granted||0)-(a.quota_granted||0) : (b.created_at||0)-(a.created_at||0));
  const pages = Math.max(1,Math.ceil(filtered.length/pageSize));
  const visible = filtered.slice((page-1)*pageSize,page*pageSize);
  const detailId = window.location.pathname.startsWith('/platform/organizations/') ? decodeURIComponent(window.location.pathname.split('/').pop()) : '';
  const detailOrg = data.find(org => org.id === (selected?.id || detailId)) || selected;
  if (detailId && !detailOrg) return <section className="org-detail-empty"><h2>找不到这个组织</h2><button className="admin-outline" onClick={()=>{history.pushState({},'', '/platform/organizations'+window.location.search);setSelected(null)}}>返回组织列表</button></section>;
  if (detailOrg) return <OrganizationDetail org={detailOrg} onBack={()=>{history.pushState({},'', '/platform/organizations'+window.location.search);setSelected(null)}} onStatus={onStatus} onGrant={onGrant}/>;
  const openOrg = org => { history.pushState({},'',`/platform/organizations/${encodeURIComponent(org.id)}${window.location.search}`); setSelected(org); };
  return <><div className="org-toolbar"><label><Search size={15}/><input value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}} placeholder="搜索组织"/></label><select value={status} onChange={e=>{setStatusFilter(e.target.value);setPage(1)}}><option value="all">所有状态</option><option value="active">正常</option><option value="suspended">已停用</option></select><select value={sort} onChange={e=>setSort(e.target.value)}><option value="created_at">按创建时间</option><option value="members">按成员数</option><option value="tasks">按任务数</option><option value="quota">按额度</option></select><span>{filtered.length} 个组织</span></div><article className="admin-card platform-org-card"><div className="platform-org-table"><div className="platform-org-head"><span>组织</span><span>管理员</span><span>成员</span><span>项目 / 任务</span><span>额度已用 / 总额</span><span>消耗金额</span><span>状态</span></div>{visible.map(org=><div className="platform-org-row org-click-row" key={org.id} onClick={()=>openOrg(org)}><span className="platform-org-name"><i><Building2 size={16}/></i><b>{org.name}</b></span><span title={org.admin_email||org.adminEmail||'待邀请接受'}>{org.admin_email||org.adminEmail||'待邀请接受'}</span><span title={String(org.member_count??org.memberCount??0)}>{count(org.member_count??org.memberCount)}</span><span title={`${count(org.project_count)} 项目 / ${count(org.task_count)} 任务`}>{count(org.project_count)} / {count(org.task_count)}</span><span title={`${count(org.quota_used)} / ${count(org.quota_granted)} 点`}>{count(org.quota_used)} / {count(org.quota_granted)} 点</span><span title="消耗金额（Mock 估算）">¥{Number(org.consumption_amount ?? ((org.task_count||0)*12.8)).toFixed(2)}</span><span title={org.status==='suspended'?'已停用':'正常'}>{org.status==='suspended'?'已停用':'正常'}</span></div>)}{!visible.length&&<p className="table-foot">没有匹配的组织。</p>}</div><footer className="org-pagination"><span>第 {page} / {pages} 页</span><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>上一页</button><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>下一页</button></footer></article></>;
}

function OrganizationDetail({org,onBack,onStatus,onGrant}) {
 const [tab,setTab]=useState('概览'); const [amount,setAmount]=useState(''); const [quotaOpen,setQuotaOpen]=useState(false); const [granting,setGranting]=useState(false);
 const remaining=org.quota_remaining??Math.max(0,(org.quota_granted||0)-(org.quota_used||0)-(org.quota_reserved||0));
 const submitGrant=async event=>{event.preventDefault();const value=Number(amount);if(!Number.isSafeInteger(value)||value<=0)return;setGranting(true);const saved=await onGrant(org,value);setGranting(false);if(saved){setQuotaOpen(false);setAmount('')}};
 return <div className="org-detail-page"><div className="org-detail-actions"><button className="admin-link" onClick={onBack}>← 组织</button><button className="admin-primary" onClick={()=>setQuotaOpen(true)}>划拨额度</button><button className="admin-outline" onClick={()=>onStatus(org,org.status==='suspended'?'active':'suspended')}>{org.status==='suspended'?'启用':'停用'}</button></div><div className="org-detail-heading"><div><h1>{org.name}</h1><p><span className={`org-status ${org.status==='suspended'?'off':''}`}>{org.status==='suspended'?'已停用':'正常'}</span><span>ID {org.id}</span></p></div></div>{org.status==='suspended'&&<div className="org-suspended-banner">该组织已暂停，成员无法访问</div>}<div className="org-detail-metrics">{[['成员',org.member_count],['项目',org.project_count],['任务',org.task_count],['本月 Tokens',org.month_tokens],['额度剩余',remaining]].map(([label,value])=><article className="admin-metric" key={label}><span>{label}</span><b>{count(value)}</b></article>)}</div><nav className="org-detail-tabs">{['概览','成员','邀请','审计'].map(item=><button className={tab===item?'selected':''} key={item} onClick={()=>setTab(item)}>{item}</button>)}</nav><div className="org-detail-content">{tab==='概览'?<OrganizationOverview org={org}/>:<article className="admin-card org-tab-card">{tab==='成员'?<><h3>组织成员</h3><p>{org.admin_email||org.adminEmail||'admin@example.com'}　管理员　<button onClick={()=>window.alert('成员管理')}>管理</button></p><p>member@example.com　成员</p></>:tab==='邀请'?<><h3>待接受邀请</h3><p>invite@example.com　组织成员　6 天后过期　<button>复制链接</button><button>重发</button><button>撤回</button></p><h3>已过期邀请</h3><p>暂无</p></>:<><h3>组织审计</h3>{[['组织创建','平台管理员','今天 09:32'],['额度划拨','平台管理员','昨天 16:08'],['邀请成员','组织管理员','昨天 14:21']].map(row=><div className="org-audit-item" key={row[0]}><span className="org-audit-mark"/><div><b>{row[0]}</b><small>{row[1]} · {row[2]}</small></div></div>)}</>}</article>}</div>{quotaOpen&&<div className="admin-modal-backdrop"><form className="admin-modal" onSubmit={submitGrant}><h2>划拨额度</h2><p>为「{org.name}」增加可用额度。</p><label>额度点数<input autoFocus type="number" min="1" max="1000000000" step="1" required value={amount} onChange={e=>setAmount(e.target.value)} placeholder="输入额度点数"/></label><div className="modal-actions"><button type="button" className="admin-outline" disabled={granting} onClick={()=>setQuotaOpen(false)}>取消</button><button className="admin-primary" type="submit" disabled={granting}>{granting?'正在划拨…':'确认划拨'}</button></div></form></div>}</div>;
}

function OrganizationOverview({ org }) {
  const total = Number(org.quota_granted) || 0;
  const used = Number(org.quota_used) || 0;
  const reserved = Number(org.quota_reserved) || 0;
  const remaining = Math.max(0,total-used-reserved);
  const percent = total ? Math.min(100,Math.round((used+reserved)/total*100)) : 0;
  return <div className="org-overview-grid"><article className="admin-card org-info-card"><h3>基本信息</h3><dl><div><dt>创建时间</dt><dd>{new Date(org.created_at||Date.now()).toLocaleDateString('zh-CN')}</dd></div><div><dt>组织管理员</dt><dd>{org.admin_email||org.adminEmail||'待指派'}</dd></div><div><dt>组织 ID</dt><dd>{org.id}</dd></div><div><dt>成员数</dt><dd>{count(org.member_count??org.memberCount)}</dd></div></dl></article><article className="admin-card org-quota-card"><div className="org-card-heading"><div><h3>额度使用情况</h3><p>本月额度统计</p></div><span>{percent}% 已使用</span></div><div className="org-quota-chart-wrap"><div className="org-quota-chart" style={{'--quota-used':`${total?Math.round(used/total*100):0}%`,'--quota-reserved':`${total?Math.round(reserved/total*100):0}%`}} role="img" aria-label={`额度已使用 ${count(used)}，预占 ${count(reserved)}，剩余 ${count(remaining)}`}><div><b>{percent}%</b><small>使用率</small></div></div><div className="org-quota-legend"><span><i/>已使用 <b>{count(used)}</b></span><span><i/>预占 <b>{count(reserved)}</b></span><span><i/>剩余 <b>{count(remaining)}</b></span><strong>总额度 {count(total)}</strong></div></div></article></div>;
}
