import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Home,
  Pencil,
  Video,
  MessagesSquare,
  LayoutGrid,
  FileText,
  Scissors,
  Image as ImageIcon,
  PanelLeft,
  ChartNoAxesColumn,
  Bell,
  UserRound,
  Plus,
  Wallet,
  Upload,
  Clipboard,
  ChevronRight,
  PlaySquare,
  Sparkles,
  ArrowRight,
  Palette,
  Play,
  Film,
  Bot,
  Layers,
  FolderKanban,
  BarChart3
} from 'lucide-react';
import './style.css';

const navItems = [
  { icon: Home, label: '首页' },
  { icon: Pencil, label: '创作' },
  { icon: Video, label: '成片' },
  { icon: MessagesSquare, label: '智能体' },
  { icon: LayoutGrid, label: '画布' },
  { icon: FileText, label: '剧本' },
  { icon: Scissors, label: '拆解' },
  { icon: ImageIcon, label: '资产' },
  { icon: PanelLeft, label: '项目' },
  { icon: ChartNoAxesColumn, label: '数据' },
];

// 精致祥云 SVG 图标
function CloudEmblem() {
  return (
    <svg className="cloud-emblem-svg" viewBox="0 0 48 24" width="48" height="24" fill="none">
      <path
        d="M24 18c-4.5 0-7.5-3-7.5-6.5 0-2.8 2-5 4.8-5.5.8-2.6 3.1-4 6-4 3.7 0 6.7 2.6 7.2 6.2 2.2.6 3.8 2.5 3.8 4.8 0 2.8-2.3 5-5.3 5H24z"
        stroke="#d5a842"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="rgba(248, 237, 206, 0.4)"
      />
      <path
        d="M19 18c-1.8 0-3.5-1.2-4-3-.4-1.5.2-3 1.5-3.8-.2-.7-.1-1.5.3-2.1 1-1.4 2.8-1.9 4.2-1.1"
        stroke="#d5a842"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="27" cy="11" r="1.5" fill="#d5a842" />
    </svg>
  );
}

// 顶部背景科技金线与节点
function GoldenTechBackground() {
  return (
    <div className="golden-circuit-backdrop" aria-hidden="true">
      <svg className="circuit-lines" width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 1440 320">
        <defs>
          <linearGradient id="goldGlow" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#d4af37" stopOpacity="0.1" />
            <stop offset="30%" stopColor="#c59f42" stopOpacity="0.55" />
            <stop offset="70%" stopColor="#d8b458" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#d4af37" stopOpacity="0.1" />
          </linearGradient>
        </defs>
        {/* 左侧电路连接线 */}
        <path d="M 0 50 L 180 50 L 220 80 L 420 80 L 460 115 L 530 115" stroke="url(#goldGlow)" strokeWidth="1.2" fill="none" />
        <path d="M 60 20 L 240 20 L 290 65 L 390 65" stroke="url(#goldGlow)" strokeWidth="1.1" strokeDasharray="5,4" fill="none" />
        <path d="M 120 120 L 280 120 L 320 155 L 440 155" stroke="url(#goldGlow)" strokeWidth="1.2" fill="none" />
        <circle cx="180" cy="50" r="3" fill="#d5a842" />
        <circle cx="420" cy="80" r="3.5" fill="#d5a842" />
        <circle cx="530" cy="115" r="3" fill="#c59f42" />
        <circle cx="280" cy="120" r="2.5" fill="#d5a842" />

        {/* 右侧电路连接线 */}
        <path d="M 1440 60 L 1260 60 L 1210 95 L 1020 95 L 970 125 L 910 125" stroke="url(#goldGlow)" strokeWidth="1.2" fill="none" />
        <path d="M 1360 30 L 1190 30 L 1140 70 L 1050 70" stroke="url(#goldGlow)" strokeWidth="1.1" strokeDasharray="5,4" fill="none" />
        <path d="M 1300 135 L 1160 135 L 1110 165 L 990 165" stroke="url(#goldGlow)" strokeWidth="1.2" fill="none" />
        <circle cx="1260" cy="60" r="3" fill="#d5a842" />
        <circle cx="1020" cy="95" r="3.5" fill="#d5a842" />
        <circle cx="910" cy="125" r="3" fill="#c59f42" />
        <circle cx="1160" cy="135" r="2.5" fill="#d5a842" />
      </svg>
      {/* 飘逸柔和云朵 */}
      <div className="bg-floating-cloud cloud-left"></div>
      <div className="bg-floating-cloud cloud-right"></div>
    </div>
  );
}

// 模拟精选作品封面数据
const featuredWorks = [
  {
    id: 1,
    title: '雨巷迷踪',
    tag: '悬疑·民国',
    duration: '02:45',
    img: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 2,
    title: '雨夜老街对峙',
    tag: '古风·动作',
    duration: '01:50',
    img: 'https://images.unsplash.com/photo-1514565131-fce0801e5785?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 3,
    title: '天台晚霞誓约',
    tag: '都市·情感',
    duration: '03:12',
    img: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 4,
    title: '旧仓库回眸',
    tag: '悬疑·剧情',
    duration: '02:08',
    img: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 5,
    title: '少年刀客行',
    tag: '国风·动漫',
    duration: '01:34',
    img: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 6,
    title: '赛博深空漫游',
    tag: '科幻·概念',
    duration: '04:02',
    img: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 7,
    title: '幽林隐士录',
    tag: '奇幻·短剧',
    duration: '02:20',
    img: 'https://images.unsplash.com/photo-1511447333015-45b65e60f6d5?auto=format&fit=crop&w=400&q=80',
  },
];

function App() {
  const [activeTab, setActiveTab] = useState('首页');
  const [promptText, setPromptText] = useState('');
  const [creationMode, setCreationMode] = useState('剧本成片');

  const inspirationTags = ['悬疑 旧仓库回头', '古风 雨巷对峙', '都市 天台晚霞'];

  const handleStartCreation = (textToUse) => {
    const finalVal = typeof textToUse === 'string' ? textToUse : promptText;
    setActiveTab('创作');
    if (finalVal.trim()) {
      setCreationMode('分镜出片');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleStartCreation();
    }
  };

  return (
    <div className="app-shell">
      {/* 顶部全局导航 */}
      <header className="topbar">
        <div className="brand" onClick={() => setActiveTab('首页')} style={{ cursor: 'pointer' }}>
          <div className="brand-mark">AI</div>
          <strong>AI绘梦</strong>
          <span className="brand-sub">漫剧 · 短剧创作平台</span>
        </div>

        <div className="top-actions">
          <button className="pill" onClick={() => setActiveTab('成片')}>
            <Video size={17} /> 成片
          </button>
          <button className="round gold-badge" title="灵感特权">
            <span className="gold-flower">❀</span>
          </button>
          <button className="credit" title="可用算力 / 点数">
            <Wallet size={16} /> <b>0</b>
          </button>
          <button className="round" title="通知消息">
            <Bell size={18} />
          </button>
          <div className="profile">
            <div className="avatar">
              <UserRound size={19} />
            </div>
            <div>
              <b>罗剑</b>
              <small>制作成员</small>
            </div>
          </div>
        </div>
      </header>

      {/* 左侧垂直导航栏 */}
      <aside className="sidebar">
        {navItems.map(({ icon: Icon, label }) => {
          const isActive = activeTab === label;
          return (
            <button
              key={label}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setActiveTab(label)}
            >
              <Icon size={22} strokeWidth={isActive ? 2.2 : 1.8} />
              <span>{label}</span>
            </button>
          );
        })}
      </aside>

      {/* 视图分发：根据选中的 Tab 渲染 */}
      {activeTab === '首页' ? (
        <main className="main-content home-view">
          <GoldenTechBackground />

          {/* 标语 */}
          <h1 className="hero-title">全局闭环 化繁为简</h1>

          {/* 核心多功能输入卡片 */}
          <section className="prompt-card">
            <div className="prompt-input-wrapper">
              <textarea
                className="prompt-textarea"
                rows={2}
                placeholder="写一句分镜：谁、在哪里、做什么、镜头怎么动"
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
            <div className="prompt-card-footer">
              <div className="footer-left">
                <button
                  type="button"
                  className="tool-btn"
                  onClick={() => {
                    setActiveTab('创作');
                    setCreationMode('剧本成片');
                  }}
                >
                  <FileText size={15} /> 传剧本
                </button>
                <button
                  type="button"
                  className="tool-btn"
                  onClick={() => {
                    setActiveTab('画布');
                  }}
                >
                  <LayoutGrid size={15} /> 新建画布
                </button>
              </div>

              <div className="footer-right">
                <span className="shortcut-hint">回车带到创作页 · Shift + 回车换行</span>
                <button
                  type="button"
                  className="start-btn"
                  onClick={() => handleStartCreation()}
                >
                  开始创作 <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </section>

          {/* 引导副标题区 */}
          <section className="guide-section">
            <div className="cloud-icon-wrap">
              <CloudEmblem />
            </div>
            <h2 className="guide-title">从一句话开始，出第一条片</h2>
            <p className="guide-desc">在上面写一句分镜，回车带到创作页；提示词你确认之后才出片。</p>
            <div className="inspiration-tags">
              <span className="tags-label">没想好写什么？试试</span>
              {inspirationTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="tag-pill"
                  onClick={() => {
                    setPromptText(tag);
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
          </section>

          {/* 四大功能卡片网格 */}
          <section className="portal-grid">
            {/* 卡片 1: 开始创作 */}
            <div
              className="portal-card card-create"
              onClick={() => {
                setActiveTab('创作');
              }}
            >
              <div className="portal-info">
                <h3>开始创作</h3>
                <p>分镜出片，剧本成片</p>
              </div>
              <div className="portal-visual visual-create">
                <div className="sketch-frame">
                  <div className="frame-lines">
                    <span></span>
                    <span></span>
                  </div>
                </div>
                <div className="video-thumb-card">
                  <Play size={13} fill="currentColor" />
                </div>
              </div>
            </div>

            {/* 卡片 2: 无限画布 */}
            <div
              className="portal-card card-canvas"
              onClick={() => {
                setActiveTab('画布');
              }}
            >
              <div className="portal-info">
                <h3>无限画布</h3>
                <p>拖拽连线，原位生成</p>
              </div>
              <div className="portal-visual visual-canvas">
                <div className="node-box left-node">
                  <div className="node-bar"></div>
                  <div className="node-bar short"></div>
                </div>
                <svg className="node-connector" width="46" height="32" viewBox="0 0 46 32">
                  <path d="M 4 16 C 22 16, 24 16, 42 16" stroke="#c0b59b" strokeWidth="2" fill="none" />
                  <circle cx="23" cy="16" r="3" fill="#245166" />
                </svg>
                <div className="node-box right-node">
                  <Play size={10} fill="currentColor" />
                </div>
              </div>
            </div>

            {/* 卡片 3: 资产库 */}
            <div
              className="portal-card card-assets"
              onClick={() => {
                setActiveTab('资产');
              }}
            >
              <div className="portal-info">
                <h3>资产库</h3>
                <p>人物 / 场景 / 道具</p>
              </div>
              <div className="portal-visual visual-assets">
                <div className="avatar-preview-card">
                  <div className="preview-person-head"></div>
                  <div className="preview-person-body"></div>
                </div>
                <div className="scene-preview-card">
                  <div className="scene-sun"></div>
                  <div className="scene-mountains"></div>
                </div>
                <div className="prop-cube">
                  <div className="cube-top"></div>
                  <div className="cube-left"></div>
                  <div className="cube-right"></div>
                </div>
              </div>
            </div>

            {/* 卡片 4: 剧本库 */}
            <div
              className="portal-card card-scripts"
              onClick={() => {
                setActiveTab('剧本');
              }}
            >
              <div className="portal-info">
                <h3>剧本库</h3>
                <p>剧本切分镜、拆资产</p>
              </div>
              <div className="portal-visual visual-scripts">
                <div className="script-sheet">
                  <i className="sheet-corner"></i>
                  <span className="sheet-line"></span>
                  <span className="sheet-line"></span>
                  <span className="sheet-line"></span>
                  <span className="sheet-line short"></span>
                </div>
                <div className="cut-clips-badge">
                  <span className="cut-seg"></span>
                  <span className="cut-seg active"></span>
                  <span className="cut-seg"></span>
                </div>
              </div>
            </div>
          </section>

          {/* 精选作品横栏 */}
          <section className="featured-section">
            <div className="featured-header">
              <h3 className="featured-title">精选</h3>
              <button
                type="button"
                className="view-all-link"
                onClick={() => setActiveTab('成片')}
              >
                全部成片 <ChevronRight size={15} />
              </button>
            </div>

            <div className="featured-carousel-row">
              {featuredWorks.map((work) => (
                <div key={work.id} className="featured-work-card">
                  <div className="work-cover-wrap">
                    <img src={work.img} alt={work.title} className="work-cover-img" />
                    <div className="work-overlay">
                      <div className="play-circle">
                        <Play size={12} fill="white" />
                      </div>
                      <span className="duration-tag">{work.duration}</span>
                    </div>
                  </div>
                  <div className="work-meta">
                    <div className="work-name">{work.title}</div>
                    <div className="work-category">{work.tag}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </main>
      ) : activeTab === '创作' ? (
        /* 原有的创作及子页面 */
        <main className="main-content">
          <div className="mode-switch">
            <button
              className={creationMode === '剧本成片' ? 'selected' : ''}
              onClick={() => setCreationMode('剧本成片')}
            >
              <Video size={18} />
              剧本成片
            </button>
            <button
              className={creationMode === '分镜出片' ? 'selected' : ''}
              onClick={() => setCreationMode('分镜出片')}
            >
              <PlaySquare size={19} />
              分镜出片
            </button>
            <button
              className={creationMode === '无限画布' ? 'selected' : ''}
              onClick={() => setCreationMode('无限画布')}
            >
              <LayoutGrid size={19} />
              无限画布
            </button>
          </div>

          <h1>剧本入，成片出，整部剧一条线做完</h1>

          <section className="upload-card">
            <div className="doc-icon">
              <FileText size={25} />
            </div>
            <h2>把剧本拖到这里</h2>
            <p>自动切分镜，拆出人物 / 场景 / 道具，铺好提示词卡片，你逐张确认出片</p>
            <div className="upload-actions">
              <button className="primary">
                <Upload size={17} />
                上传剧本
              </button>
              <button className="secondary">
                <Clipboard size={17} />
                粘贴文本
              </button>
            </div>
            <div className="formats">支持 .docx / .txt / .md / .csv，单本不超过 20 万字</div>
          </section>

          <section className="scripts">
            <div className="section-heading">
              <h2>我的剧本</h2>
              <button>
                全部剧本 <ChevronRight size={16} />
              </button>
            </div>
            <div className="empty-state">
              <div className="cloud-mark">⌁</div>
              <strong>还没有剧本</strong>
              <p>在上面拖入、上传或粘贴一本，系统会自动切出分镜。</p>
            </div>
          </section>
        </main>
      ) : (
        /* 其他 Tab 的通用展示页，支持一键返回首页或创作 */
        <main className="main-content">
          <div className="tab-placeholder-page">
            <div className="placeholder-card">
              <div className="placeholder-icon-wrap">
                {activeTab === '成片' && <Video size={36} />}
                {activeTab === '智能体' && <Bot size={36} />}
                {activeTab === '画布' && <LayoutGrid size={36} />}
                {activeTab === '剧本' && <FileText size={36} />}
                {activeTab === '拆解' && <Scissors size={36} />}
                {activeTab === '资产' && <ImageIcon size={36} />}
                {activeTab === '项目' && <PanelLeft size={36} />}
                {activeTab === '数据' && <ChartNoAxesColumn size={36} />}
              </div>
              <h2>{activeTab}工作台</h2>
              <p className="placeholder-sub">正在为您加载{activeTab}模块相关数据与工具集...</p>
              <div className="placeholder-actions">
                <button className="primary" onClick={() => setActiveTab('首页')}>
                  返回首页
                </button>
                <button className="secondary" onClick={() => setActiveTab('创作')}>
                  进入创作
                </button>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* 左下角调色盘/主题选择器 */}
      <div className="theme-bar">
        <button className="palette-btn" title="配色主题">
          <Palette size={16} />
        </button>
        <div className="theme-dots">
          <i title="夜幕黑紫" />
          <i title="极光淡紫" />
          <i className="chosen" title="新国风雅金" />
          <i title="青绿山水" />
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
