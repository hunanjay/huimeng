import { useEffect, useState } from 'react';
import { Activity, Building2, CircleHelp, Cpu, Gauge, Plus, ShieldAlert, Users } from 'lucide-react';
import { api } from '../api.js';
import TracingPage from './TracingPage.jsx';
import './SuperadminPage.css';

const tabs = ['平台概览', '组织管理', '平台用量', '调用追踪', '操作审计'];
const count = value => Number(value || 0).toLocaleString('zh-CN');

export default function SuperadminPage() {
  const [tab, setTab] = useState('平台概览');
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [invitePath, setInvitePath] = useState('');
  const [grantAmounts, setGrantAmounts] = useState({});

  const refresh = async () => {
    try { setOverview(await api.platformOverview()); setError(''); }
    catch (err) { setError(err.message); }
  };
  useEffect(() => { refresh(); }, []);

  const createOrg = async event => {
    event.preventDefault();
    try {
      const result = await api.createPlatformOrg(name, adminEmail);
      setInvitePath(`${window.location.origin}${result.invitePath}`);
      setCreateOpen(false);
      setName(''); setAdminEmail('');
      await refresh();
    } catch (err) { setError(err.message); }
  };
  const setStatus = async (org, status) => {
    try { await api.setPlatformOrgStatus(org.id, status); await refresh(); }
    catch (err) { setError(err.message); }
  };
  const setAdmin = async org => {
    const email = window.prompt('输入组织成员邮箱，将其设为组织管理员：', org.admin_email || '');
    if (!email) return;
    try { await api.setPlatformOrgAdmin(org.id, email); await refresh(); }
    catch (err) { setError(err.message); }
  };
  const grantQuota = async (org, amount) => {
    try { await api.grantOrgQuota(org.id, amount); setGrantAmounts(current => ({ ...current, [org.id]: '' })); await refresh(); }
    catch (err) { setError(err.message); }
  };

  const totals = overview?.totals || {};
  const organizations = overview?.organizations || [];
  return <main className="main-content admin-page superadmin-page">
    <div className="admin-heading"><div><div className="admin-eyebrow"><ShieldAlert size={15}/> SaaS Provider</div><h1>平台管理</h1><p>管理平台组织、运行状态和全局资源</p></div><span className="platform-badge"><span/>平台管理员</span></div>
    <div className="admin-layout">
      <nav className="admin-tabs" aria-label="平台管理导航">{tabs.map((label, i) => { const Icon = [Activity, Building2, Gauge, Cpu, ShieldAlert][i]; return <button key={label} className={tab === label ? 'selected' : ''} onClick={() => setTab(label)}><Icon size={18}/>{label}</button>; })}</nav>
      <section className="admin-body">
        {error && <div className="platform-prototype" role="alert">{error}</div>}
        {invitePath && <div className="platform-prototype">新组织管理员邀请链接：<a href={invitePath}>{invitePath}</a><button onClick={() => navigator.clipboard.writeText(invitePath)}>复制</button><button onClick={() => setInvitePath('')}>关闭</button></div>}
        {tab === '平台概览' && <><div className="admin-section-title"><div><h2>平台概览</h2><p>平台组织与资源统计</p></div></div><div className="admin-metrics">{[[Building2, '组织总数', count(totals.organizations)], [Users, '平台成员', count(totals.users)], [Cpu, '本月 Tokens', count(totals.month_tokens)], [Activity, '额度已分配', `${count(totals.quota_granted)} 点`]].map(([Icon, label, value]) => <article className="admin-metric" key={label}><div className="admin-metric-top"><span className="admin-metric-icon"><Icon size={18}/></span><span className="admin-metric-label">{label}</span><CircleHelp size={15}/></div><strong>{value}</strong><div className="admin-metric-note">来自当前平台数据库</div></article>)}</div><OrgTable rows={organizations}/></>}
        {tab === '组织管理' && <><div className="admin-section-title"><div><h2>组织管理</h2><p>创建组织、分配管理员、额度及暂停组织访问</p></div><button className="admin-primary" onClick={() => setCreateOpen(true)}><Plus size={16}/>创建组织</button></div><OrgTable rows={organizations} onStatus={setStatus} onAdmin={setAdmin} onGrant={grantQuota} grantAmounts={grantAmounts} onGrantAmountChange={(id, value) => setGrantAmounts(current => ({ ...current, [id]: value }))}/></>}
        {tab === '平台用量' && <div className="admin-metrics">{[['项目', totals.projects], ['生成任务', totals.tasks], ['失败任务', totals.failed_tasks], ['本月 Tokens', totals.month_tokens]].map(([label, value]) => <article className="admin-metric" key={label}><span className="admin-metric-label">{label}</span><strong>{count(value)}</strong></article>)}</div>}
        {tab === '调用追踪' && <TracingPage platformAdmin/>}
        {tab === '操作审计' && <div className="admin-card member-table-card">{(overview?.auditLogs || []).map(item => <div className="table-row audit-row" key={item.id}><div><b>{item.action}</b><small>{item.actor_email || '系统'} · {item.target || ''}</small></div><span>{new Date(item.created_at).toLocaleString()}</span></div>)}</div>}
      </section>
    </div>
    {createOpen && <div className="admin-modal-backdrop"><form className="admin-modal" onSubmit={createOrg}><h2>创建组织</h2><p>为组织管理员生成一条 7 天有效的邀请链接。</p><label>组织名称<input value={name} onChange={e => setName(e.target.value)} maxLength={80} required/></label><label>管理员邮箱<input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} required/></label><div className="modal-actions"><button type="button" className="admin-outline" onClick={() => setCreateOpen(false)}>取消</button><button className="admin-primary" type="submit">创建并生成邀请</button></div></form></div>}
  </main>;
}

function OrgTable({ rows, onStatus, onAdmin, onGrant, grantAmounts = {}, onGrantAmountChange }) {
  return <article className="admin-card platform-org-card"><div className="platform-org-table"><div className="platform-org-head"><span>组织</span><span>管理员</span><span>成员</span><span>项目 / 任务</span><span>额度已用 / 总额</span><span>状态 / 操作</span></div>{rows.map(org => <div className="platform-org-row" key={org.id}><span className="platform-org-name"><i><Building2 size={16}/></i><b>{org.name}</b></span><span>{org.admin_email || org.adminEmail || '待邀请接受'}</span><span>{count(org.member_count ?? org.memberCount)}</span><span>{count(org.project_count)} / {count(org.task_count)}</span><span>{count(org.quota_used)} / {count(org.quota_granted)} 点</span><span className="platform-org-actions">{onStatus ? <><select aria-label={`${org.name}状态`} value={org.status || 'active'} onChange={event => onStatus(org, event.target.value)}><option value="active">正常</option><option value="suspended">已停用</option></select><button type="button" onClick={() => onAdmin(org)}>设置管理员</button>{onGrant && <span className="quota-grant"><input aria-label={`给${org.name}分配额度`} type="number" min="1" step="1" value={grantAmounts[org.id] ?? ''} onChange={event => onGrantAmountChange(org.id, event.target.value)} placeholder="额度点数"/><button type="button" disabled={!Number(grantAmounts[org.id])} onClick={() => onGrant(org, Number(grantAmounts[org.id]))}>划拨</button></span>}</> : (org.status || 'active') === 'suspended' ? '已停用' : '正常'}</span></div>)}</div></article>;
}
