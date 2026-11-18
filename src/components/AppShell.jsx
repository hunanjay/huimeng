import { Bell, ChartNoAxesColumn, FileText, Home, Image, LayoutGrid, MessagesSquare, PanelLeft, Pencil, Plus, Scissors, Sparkles, UserRound, Video, Wallet, Share2, Activity } from 'lucide-react';

const navigation = [[Home, '首页'], [PanelLeft, '项目'], [Pencil, '创作'], [FileText, '剧本'], [LayoutGrid, '画布'], [Scissors, '拆解'], [Image, '资产'], [Video, '成片'], [MessagesSquare, '智能体'], [Share2, '分发'], [ChartNoAxesColumn, '数据'], [Activity, '追踪']];

export default function AppShell({ activePage, project, onNavigate, children }) {
  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark">AI</div><strong>AI绘梦</strong><span className="brand-sub">漫剧 · 短剧创作平台</span>{project && <button className="pill" onClick={() => onNavigate('项目')} title="回到项目">项目：{project.name}</button>}</div>
      <div className="top-actions">
        <button className="pill" onClick={() => onNavigate('成片')}><Video size={17}/>成片</button>
        <button className="pill" onClick={() => onNavigate('创作')}><Plus size={18}/>新建画布</button>
        <button className="round" aria-label="灵感"><Sparkles size={17}/></button><button className="credit"><Wallet size={17}/><b>0</b></button><button className="round" aria-label="通知"><Bell size={18}/></button>
        <div className="profile"><div className="avatar"><UserRound size={19}/></div><div><b>罗剑</b><small>制作成员</small></div></div>
      </div>
    </header>
    <aside className="sidebar">{navigation.map(([Icon, label]) => <button key={label} onClick={() => onNavigate(label)} className={`nav-item ${activePage === label ? 'active' : ''}`}><Icon size={23}/><span>{label}</span></button>)}</aside>
    {children}
    <div className="theme-dots" aria-hidden="true"><i/><i/><i className="chosen"/><i/></div>
  </div>;
}
