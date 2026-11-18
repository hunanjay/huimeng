import { useState } from 'react';
import { ArrowRight, Clapperboard, LockKeyhole, Mail, Sparkles } from 'lucide-react';
import { api, setToken } from '../api.js';
import './AuthPage.css';

export default function AuthPage({ onAuthenticated }) {
  const inviteToken = new URLSearchParams(window.location.search).get('token');
  const [registering, setRegistering] = useState(Boolean(inviteToken));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = inviteToken
        ? await api.acceptInvite(inviteToken, email, password)
        : registering ? await api.register(email, password, orgName) : await api.login(email, password);
      setToken(result.token);
      onAuthenticated({ ...result, role: result.role || result.org?.role || 'org.user' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return <main className="auth-page">
    <div className="auth-art" aria-hidden="true">
      <div className="auth-orbit orbit-one" /><div className="auth-orbit orbit-two" /><div className="auth-art-glow" />
      <div className="auth-film-card"><Clapperboard size={28} /><span>STORY</span><i /><i /><i /></div>
    </div>
    <section className="auth-card">
      <div className="auth-brand"><span><Sparkles size={18} /></span><div><b>AI绘梦</b><small>短剧 · 漫剧创作平台</small></div></div>
      <p className="auth-eyebrow">你的团队创作空间</p>
      <h1>{inviteToken ? '加入组织' : registering ? '创建你的工作空间' : '欢迎回来'}</h1>
      <p className="auth-intro">{inviteToken ? '设置账号密码，接受组织邀请。' : registering ? '注册账号并创建第一个组织，邀请团队一起创作。' : '登录后继续你的短剧创作。'}</p>
      {!inviteToken && <div className="auth-tabs" role="tablist" aria-label="账号操作">
        <button type="button" role="tab" aria-selected={!registering} className={!registering ? 'active' : ''} onClick={() => { setRegistering(false); setError(''); }}>登录</button>
        <button type="button" role="tab" aria-selected={registering} className={registering ? 'active' : ''} onClick={() => { setRegistering(true); setError(''); }}>注册</button>
      </div>}
      <form onSubmit={submit}>
        {registering && !inviteToken && <label className="auth-field"><span>组织名称</span><input value={orgName} onChange={event => setOrgName(event.target.value)} placeholder="例如：星河短剧工作室" maxLength={80} required /><small>你将自动成为该组织的管理员</small></label>}
        <label className="auth-field"><span>邮箱</span><div className="auth-input"><Mail size={17} /><input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="name@company.com" required /></div></label>
        <label className="auth-field"><span>密码</span><div className="auth-input"><LockKeyhole size={17} /><input type="password" autoComplete={registering ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} placeholder={registering ? '至少 10 位' : '输入密码'} minLength={registering ? 10 : undefined} maxLength={128} required /></div></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="auth-submit" type="submit" disabled={busy}>{busy ? '请稍候…' : inviteToken ? '接受邀请并加入' : registering ? '创建组织并继续' : '登录工作台'}<ArrowRight size={17} /></button>
      </form>
      <p className="auth-footnote">{inviteToken ? '邀请链接仅限指定邮箱使用，有效期 7 天。' : registering ? '一个账号先加入一个组织。' : '首次使用？切换到注册，创建你的组织。'}</p>
    </section>
    <div className="auth-caption"><span>AI SHORT DRAMA STUDIO</span><i />从故事到成片，让每个环节都在同一个工作空间里。</div>
  </main>;
}
