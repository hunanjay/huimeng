import { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowDownRight, ArrowUpRight, Building2, Check, ChevronDown, CircleHelp, Clock3, Download, HardDrive, Mail, MoreHorizontal, Plus, Search, Settings, ShieldCheck, Users, Video, Wallet, X } from 'lucide-react';
import { api } from '../api.js';
import './AdminPage.css';
import TracingPage from './TracingPage.jsx';

const avatarColors = ['teal', 'rose', 'blue', 'gold'];
const projects = [
  { name: '长安夜行', owner: '林小雨', progress: 72, status: '制作中', date: '今天 14:32' },
  { name: '山海来信', owner: '陈一鸣', progress: 46, status: '制作中', date: '昨天 18:06' },
  { name: '雨巷来客', owner: '罗剑', progress: 100, status: '已完成', date: '11月15日' },
];
const tabs = [['概览', Activity], ['成员管理', Users], ['额度分配', Wallet], ['项目管理', Video], ['用量与任务', HardDrive], ['调用追踪', Activity], ['审计记录', ShieldCheck], ['组织设置', Settings]];

function Metric({ icon: Icon, label, value, note, trend }) {
  return <article className="admin-metric"><div className="admin-metric-top"><span className="admin-metric-icon"><Icon size={18}/></span><span className="admin-metric-label">{label}</span><CircleHelp size={15} className="admin-help"/></div><strong>{value}</strong><div className="admin-metric-note">{trend && <span className={trend === 'up' ? 'trend-up' : 'trend-down'}>{trend === 'up' ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>} 12%</span>}{note}</div></article>;
}

export default function AdminPage({ org, user }) {
  const [tab, setTab] = useState('概览');
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('全部角色');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('org.user');
  const [inviteUrl, setInviteUrl] = useState('');
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [audit, setAudit] = useState([]);
  const [quota, setQuota] = useState(null);
  const [quotaEdits, setQuotaEdits] = useState({});
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const refreshMembers = async () => {
    setLoading(true);
    try { const [memberData, inviteData] = await Promise.all([api.orgMembers(), api.orgInvites()]); setMembers(memberData.items); setInvites(inviteData.items); }
    catch (error) { setToast(error.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (tab === '成员管理') refreshMembers(); }, [tab]);
  useEffect(() => { if (tab === '审计记录') api.orgAudit().then(data => setAudit(data.items)).catch(error => setToast(error.message)); }, [tab]);
  const refreshQuota = async () => { try { setQuota(await api.orgQuota()); } catch (error) { setToast(error.message); } };
  useEffect(() => { if (tab === '额度分配') refreshQuota(); }, [tab]);
  const saveMemberQuota = async member => {
    const amount = Number(quotaEdits[member.id] ?? member.allocation);
    try { setQuota(await api.setMemberQuota(member.id, amount)); setToast(`${member.email} 的额度已更新`); }
    catch (error) { setToast(error.message); }
  };
  const filtered = useMemo(() => members.filter(m => m.email.toLowerCase().includes(query.toLowerCase()) && (role === '全部角色' || m.role === (role === '组织管理员' ? 'org.admin' : 'org.user'))), [members, query, role]);
  const invite = async () => {
    try { const result = await api.inviteMember(email, inviteRole); setInviteUrl(`${window.location.origin}${result.invitePath}`); setEmail(''); await refreshMembers(); }
    catch (error) { setToast(error.message); }
  };
  const changeRole = async (member, nextRole) => { try { await api.setMemberRole(member.id, nextRole); await refreshMembers(); } catch (error) { setToast(error.message); await refreshMembers(); } };
  const removeMember = async member => { if (!window.confirm(`确定移除 ${member.email}？`)) return; try { await api.removeMember(member.id); await refreshMembers(); } catch (error) { setToast(error.message); } };
  const resendInvite = async inviteItem => { try { const result = await api.resendInvite(inviteItem.id); setInviteUrl(`${window.location.origin}${result.invitePath}`); setEmail(inviteItem.email); setInviteRole(inviteItem.role); setInviteOpen(true); } catch (error) { setToast(error.message); } };
  const revokeInvite = async inviteItem => { try { await api.revokeInvite(inviteItem.id); await refreshMembers(); } catch (error) { setToast(error.message); } };

  return <main className="main-content admin-page">
    <div className="admin-heading"><div><div className="admin-eyebrow"><Building2 size={15}/> 工作空间管理</div><h1>组织管理</h1><p>管理组织成员、项目和资源用量</p></div><div className="admin-org-switch"><span className="org-avatar">{org?.name?.[0] || '组'}</span><span><b>{org?.name || '组织'}</b><small>组织工作空间</small></span><ChevronDown size={16}/></div></div>
    <div className="admin-layout">
      <nav className="admin-tabs" aria-label="组织管理导航">{tabs.map(([label, Icon]) => <button key={label} className={tab === label ? 'selected' : ''} onClick={() => setTab(label)}><Icon size={18}/>{label}{label === '成员管理' && <span className="tab-count">{members.length + invites.length}</span>}</button>)}</nav>
      <section className="admin-body">
        {tab === '概览' && <>
          <div className="admin-section-title"><div><h2>组织概览</h2><p>查看组织近期协作与资源情况</p></div><span className="updated-label"><span/>数据更新于刚刚</span></div>
          <div className="admin-metrics"><Metric icon={Users} label="组织成员" value="4 人" note="包含 1 位管理员"/><Metric icon={Video} label="进行中项目" value="2 个" note="共创建 8 个项目" trend="up"/><Metric icon={HardDrive} label="本月 AI 用量" value="128.6 万" note="较上月" trend="up"/><Metric icon={Activity} label="生成任务" value="86 个" note="成功率 94.2%"/></div>
          <div className="admin-columns"><article className="admin-card"><div className="admin-card-head"><div><h3>最近项目</h3><p>组织内近期更新的项目</p></div><button className="admin-link" onClick={() => setTab('项目管理')}>查看全部 →</button></div>{projects.slice(0, 3).map(p => <div className="project-row" key={p.name}><div className="project-cover"><Video size={18}/></div><div className="project-info"><b>{p.name}</b><small>{p.owner} · 更新于 {p.date}</small></div><span className={`status-pill ${p.status === '已完成' ? 'done' : ''}`}>{p.status}</span></div>)}</article>
          <article className="admin-card"><div className="admin-card-head"><div><h3>成员动态</h3><p>组织成员</p></div><button className="admin-link" onClick={() => setTab('成员管理')}>管理成员 →</button></div>{members.slice(0, 3).map((m, index) => <div className="member-row compact" key={m.id}><span className={`member-avatar ${avatarColors[index % avatarColors.length]}`}>{m.email.slice(0, 1).toUpperCase()}</span><div className="member-info"><b>{m.email}</b><small>{new Date(m.createdAt).toLocaleDateString()}</small></div><span className="member-role">{m.role === 'org.admin' ? '组织管理员' : '组织成员'}</span></div>)}</article></div>
          <div className="admin-note"><ShieldCheck size={18}/><span><b>组织数据仅对本组织成员开放</b><small>项目、素材和生成记录归属于绘梦工作室。</small></span><button onClick={() => setTab('组织设置')}>组织设置 <ChevronDown size={15}/></button></div>
        </>}
        {tab === '成员管理' && <><div className="admin-section-title"><div><h2>成员管理</h2><p>邀请成员加入组织，并管理成员角色</p></div><button className="admin-primary" onClick={() => { setInviteUrl(''); setInviteOpen(true); }}><Plus size={17}/>邀请成员</button></div><div className="admin-card member-table-card"><div className="admin-toolbar"><label className="admin-search"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索邮箱"/></label><select value={role} onChange={e => setRole(e.target.value)} aria-label="筛选成员角色"><option>全部角色</option><option>组织管理员</option><option>组织成员</option></select><span className="table-total">{loading ? '正在加载…' : `共 ${filtered.length} 位成员 · ${invites.length} 个待处理邀请`}</span></div><div className="admin-table"><div className="table-head"><span>成员 / 邀请</span><span>角色</span><span>状态</span><span>操作</span></div>{filtered.map((m, index) => <div className="table-row" key={m.id}><div className="member-row"><span className={`member-avatar ${avatarColors[index % avatarColors.length]}`}>{m.email.slice(0, 1).toUpperCase()}</span><div className="member-info"><b>{m.email}</b><small>加入于 {new Date(m.createdAt).toLocaleDateString()}</small></div></div><select aria-label={`${m.email}的角色`} value={m.role} onChange={event => changeRole(m, event.target.value)}><option value="org.admin">组织管理员</option><option value="org.user">组织成员</option></select><span className="invite-status">已加入</span><button className="icon-action" aria-label={`移除 ${m.email}`} onClick={() => removeMember(m)}><X size={17}/></button></div>)}{invites.filter(item => item.email.toLowerCase().includes(query.toLowerCase()) && (role === '全部角色' || item.role === (role === '组织管理员' ? 'org.admin' : 'org.user'))).map(item => <div className="table-row" key={item.id}><div className="member-row"><span className="member-avatar gold">{item.email.slice(0, 1).toUpperCase()}</span><div className="member-info"><b>{item.email}</b><small>有效至 {new Date(item.expiresAt).toLocaleDateString()}</small></div></div><span className="member-role">{item.role === 'org.admin' ? '组织管理员' : '组织成员'}</span><span className="invite-status pending"><Mail size={13}/>邀请中</span><span className="invite-actions"><button type="button" onClick={() => resendInvite(item)}>重发</button><button type="button" onClick={() => revokeInvite(item)}>撤回</button></span></div>)}</div><div className="table-foot">邀请链接有效期为 7 天。移除后该成员的会话立即失效，项目和素材仍归组织所有。</div></div></>}
        {tab === '额度分配' && <><div className="admin-section-title"><div><h2>额度分配</h2><p>把 Org 本月额度分配给成员</p></div><span className="admin-count-label">{quota?.period || '读取中'}</span></div><div className="admin-metrics usage-metrics"><Metric icon={Wallet} label="Org 总额度" value={`${quota?.granted ?? '—'} 点`} note="平台本月划拨"/><Metric icon={Check} label="成功消耗" value={`${quota?.used ?? '—'} 点`} note="只结算成功任务"/><Metric icon={Activity} label="执行中预占" value={`${quota?.reserved ?? '—'} 点`} note="失败或取消会释放"/><Metric icon={Users} label="未分配成员" value={`${quota?.unallocated ?? '—'} 点`} note="留在 Org 额度池"/></div><article className="admin-card quota-allocation-card"><div className="quota-table-head"><span>成员</span><span>已分配</span><span>已用</span><span>预占</span><span>可用</span><span>设置额度</span></div>{(quota?.members || []).map(member => <div className="quota-member-row" key={member.id}><span className="member-info"><b>{member.email}</b><small>{member.role === 'org.admin' ? '组织管理员' : '组织成员'}</small></span><span>{member.allocation} 点</span><span>{member.used} 点</span><span>{member.reserved} 点</span><b>{member.available} 点</b><span className="quota-edit"><input type="number" min={member.used + member.reserved} step="1" value={quotaEdits[member.id] ?? member.allocation} onChange={e => setQuotaEdits(current => ({ ...current, [member.id]: e.target.value }))}/><button className="admin-primary" onClick={() => saveMemberQuota(member)}>保存</button></span></div>)}{!quota?.members?.length && <p className="table-foot">当前组织还没有成员。</p>}<div className="table-foot">图片任务预占 1 点，视频任务预占 8 点。额度按自然月重置。</div></article></>}
        {tab === '项目管理' && <><div className="admin-section-title"><div><h2>项目管理</h2><p>组织中的项目默认对全体成员可见</p></div><span className="admin-count-label">共 {projects.length} 个项目</span></div><div className="admin-card project-list">{projects.map(p => <div className="project-row project-large" key={p.name}><div className="project-cover"><Video size={20}/></div><div className="project-info"><b>{p.name}</b><small>负责人：{p.owner} · 最近更新 {p.date}</small></div><div className="project-progress"><div><span>制作进度</span><b>{p.progress}%</b></div><i><em style={{width: `${p.progress}%`}}/></i></div><span className={`status-pill ${p.status === '已完成' ? 'done' : ''}`}>{p.status}</span><button className="icon-action" aria-label={`打开${p.name}项目`}><MoreHorizontal size={19}/></button></div>)}</div></>}
        {tab === '用量与任务' && <><div className="admin-section-title"><div><h2>用量与任务</h2><p>组织 AI 用量汇总及生成任务状态</p></div><button className="admin-outline"><Download size={16}/>导出记录</button></div><div className="admin-metrics usage-metrics"><Metric icon={HardDrive} label="本月成功用量" value="128.6 万" note="按成功任务统计"/><Metric icon={Activity} label="预估执行中" value="3.2 万" note="4 个任务执行中"/><Metric icon={Check} label="成功任务" value="81 个" note="本月累计"/><Metric icon={X} label="失败 / 已取消" value="5 个" note="不计入最终用量"/></div><article className="admin-card usage-card"><div className="admin-card-head"><div><h3>最近任务</h3><p>失败或取消的任务不计入最终用量</p></div><span className="admin-count-label">近 30 天</span></div>{[['长安夜行 · 第 3 集', '林小雨', '已完成', '2.4 万', '今天 14:30'], ['山海来信 · 场景 8', '陈一鸣', '生成中', '预估 0.8 万', '今天 14:18'], ['雨巷来客 · 封面', '罗剑', '失败', '0', '今天 13:52']].map(row => <div className="usage-task-row" key={row[0]}><div><b>{row[0]}</b><small>{row[1]} · {row[4]}</small></div><span className={`task-state ${row[2] === '已完成' ? 'success' : row[2] === '失败' ? 'failed' : ''}`}>{row[2]}</span><b>{row[3]}</b>{row[2] === '失败' && <button className="admin-link">重试</button>}</div>)}</article></>}
        {tab === '调用追踪' && <TracingPage />}
        {tab === '审计记录' && <><div className="admin-section-title"><div><h2>管理操作审计</h2><p>记录邀请、角色调整和成员移除</p></div></div><div className="admin-card member-table-card">{audit.length ? audit.map(item => <div className="table-row audit-row" key={item.id}><div><b>{item.action}</b><small>{item.actorEmail || '系统'} · {item.target || ''}</small></div><span>{new Date(item.createdAt).toLocaleString()}</span><code>{item.details ? JSON.stringify(item.details) : ''}</code></div>) : <p className="table-foot">暂无管理操作记录。</p>}</div></>}
        {tab === '组织设置' && <><div className="admin-section-title"><div><h2>组织设置</h2><p>更新组织资料和管理员信息</p></div><button className="admin-primary" onClick={() => setToast('设置已保存')}><Check size={16}/>保存更改</button></div><article className="admin-card settings-card"><h3>基本信息</h3><label>组织名称<input defaultValue="绘梦工作室"/></label><label>组织 ID<div className="readonly-input">org_huimeng_studio <span>创建于 2026年10月12日</span></div></label><label>组织管理员<div className="setting-admin"><span className="member-avatar teal">罗</span><span><b>罗剑</b><small>logan@huimeng.ai</small></span><span className="role-tag">组织管理员</span></div></label></article><article className="admin-card retention-card"><div className="retention-icon"><Clock3 size={19}/></div><div><b>项目删除与恢复</b><p>删除的项目保留 30 天，可在恢复期内还原。</p></div><span>30 天</span></article></>}
      </section>
    </div>
    {inviteOpen && <div className="admin-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setInviteOpen(false); }}><div className="admin-modal" role="dialog" aria-modal="true" aria-label="邀请成员"><button className="modal-x" onClick={() => setInviteOpen(false)} aria-label="关闭"><X size={18}/></button><span className="modal-icon"><Mail size={20}/></span><h2>邀请成员</h2><p>生成有效期 7 天的邀请链接，复制后发送给对方。</p><label>邮箱地址<input autoFocus type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" onKeyDown={e => e.key === 'Enter' && invite()}/></label><label>加入后角色<select value={inviteRole} onChange={e => setInviteRole(e.target.value)}><option value="org.user">组织成员</option><option value="org.admin">组织管理员</option></select></label>{inviteUrl && <label>邀请链接<input readOnly value={inviteUrl} onFocus={event => event.target.select()} /></label>}<div className="modal-actions"><button className="admin-outline" onClick={() => setInviteOpen(false)}>关闭</button><button className="admin-primary" onClick={invite}><Mail size={16}/>{inviteUrl ? '重新生成链接' : '生成邀请链接'}</button></div></div></div>}
    {toast && <div className="admin-toast"><Check size={16}/>{toast}</div>}
  </main>;
}
