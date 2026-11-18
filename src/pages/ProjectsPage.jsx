import { useEffect, useState } from 'react';
import { Calendar, Check, ChevronDown, Plus, RefreshCw, X } from 'lucide-react';
import './ProjectsPage.css';
import { api } from '../api.js';

const TYPES = ['短剧漫剧', '品牌广告', '动画短片', '宣传片', '其他'];
const DURATIONS = ['30 秒以内', '30 秒 - 1 分钟', '1 - 3 分钟', '3 分钟以上'];
const CHANNELS = ['绘梦中台', '导演工作台', '外部协作'];
const STAGES = [
  ['剧本', '确定集数、分镜与台词，产出可拍脚本'],
  ['资产库', '锁定人物、场景、道具参考，保持一致'],
  ['成片', '逐镜出片、粗剪拼接，完成交付版本'],
];

const todayText = () => {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};

const leadTime = duration => ({
  '30 秒以内': '约 2 天',
  '30 秒 - 1 分钟': '约 4 天',
  '1 - 3 分钟': '约 7 天',
  '3 分钟以上': '约 12 天',
}[duration] || '');

const emptyForm = () => ({
  name: '',
  date: todayText(),
  type: '',
  duration: '',
  count: '1',
  channel: CHANNELS[0],
});

function CloudGlyph() {
  return <svg className="project-cloud" viewBox="0 0 120 54" width="108" height="48" fill="none" aria-hidden="true">
    <path d="M62 40c-10 0-17-7-17-15 0-7 5-12 12-13 2-7 8-11 15-11 9 0 16 7 17 15 6 1 10 6 10 12 0 7-6 12-13 12H62z" stroke="#d5a842" strokeWidth="2" strokeLinejoin="round" fill="rgba(248,237,206,0.35)" />
    <path d="M46 40c-5 0-9-3-10-8-1-4 1-8 4-10-1-2 0-4 1-5 3-4 8-5 11-2" stroke="#d5a842" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M74 46c14 0 26 3 34 8" stroke="#d5a842" strokeWidth="1.8" strokeLinecap="round" />
  </svg>;
}

function NewProjectDialog({ onClose, onCreate }) {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }));

  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = () => {
    if (!form.name.trim()) { setError('请填写项目名称'); return; }
    if (!form.type) { setError('请选择类型'); return; }
    if (!form.duration) { setError('请选择视频时长'); return; }
    onCreate({ ...form, name: form.name.trim(), count: Number(form.count) || 1 });
  };

  return <div className="project-mask" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="project-dialog" role="dialog" aria-modal="true" aria-label="新建项目">
      <header>
        <h2>新建项目</h2>
        <button type="button" className="dialog-close" aria-label="关闭" onClick={onClose}><X size={18} /></button>
      </header>

      <div className="dialog-field full">
        <label htmlFor="project-name">项目名称</label>
        <input id="project-name" value={form.name} onChange={event => update('name', event.target.value)} placeholder="例如：归途·第 2 集" autoFocus />
      </div>

      <div className="dialog-row">
        <div className="dialog-field">
          <label htmlFor="project-date">制作日期 <small>默认今天，暂不可改</small></label>
          <div className="date-wrap">
            <input id="project-date" value={form.date} readOnly />
            <Calendar size={16} />
          </div>
        </div>
        <div className="dialog-field">
          <label htmlFor="project-type">类型</label>
          <div className="dialog-select">
            <select id="project-type" value={form.type} onChange={event => update('type', event.target.value)}>
              <option value="">请选择类型</option>
              {TYPES.map(type => <option key={type} value={type}>{type}</option>)}
            </select>
            <ChevronDown size={16} />
          </div>
        </div>
      </div>

      <div className="dialog-row">
        <div className="dialog-field">
          <label htmlFor="project-duration">视频时长</label>
          <div className="dialog-select">
            <select id="project-duration" value={form.duration} onChange={event => update('duration', event.target.value)}>
              <option value="">请选择视频时长</option>
              {DURATIONS.map(duration => <option key={duration} value={duration}>{duration}</option>)}
            </select>
            <ChevronDown size={16} />
          </div>
        </div>
        <div className="dialog-field">
          <label htmlFor="project-count">视频条数</label>
          <input id="project-count" type="number" min="1" value={form.count} onChange={event => update('count', event.target.value)} />
        </div>
      </div>

      <div className="dialog-row">
        <div className="dialog-field">
          <label htmlFor="project-channel">制作渠道</label>
          <div className="dialog-select">
            <select id="project-channel" value={form.channel} onChange={event => update('channel', event.target.value)}>
              {CHANNELS.map(channel => <option key={channel} value={channel}>{channel}</option>)}
            </select>
            <ChevronDown size={16} />
          </div>
        </div>
        <div className="dialog-field">
          <label htmlFor="project-lead">工期</label>
          <input id="project-lead" className="lead-input" value={leadTime(form.duration) || '选择视频时长后自动计算'} readOnly />
        </div>
      </div>

      {error && <p className="dialog-error">{error}</p>}

      <footer>
        <button type="button" className="dialog-ghost" onClick={onClose}>取消</button>
        <button type="button" className="dialog-primary" onClick={submit}>新建</button>
      </footer>
    </div>
  </div>;
}

export default function ProjectsPage({ onOpenProject }) {
  const [projects, setProjects] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.list('projects')
      .then(data => {
        if (cancelled) return;
        setProjects(data.items.map(item => ({
          id: item.id,
          name: item.name,
          date: item.date,
          type: item.type,
          duration: item.duration,
          count: item.count,
          channel: item.channel,
          stages: Array.isArray(item.stages) ? item.stages : STAGES.map(() => false),
          status: item.status || 'active',
          createdAt: item.createdAt,
        })));
      })
      .catch(() => { /* 后端未启动时保持空列表 */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  const createProject = async form => {
    const payload = { ...form, stages: STAGES.map(() => false), status: 'active' };
    try {
      const doc = await api.create('projects', payload);
      setProjects(list => [{ ...payload, id: doc.id, createdAt: doc.createdAt }, ...list]);
      setExpandedId(doc.id);
      setDialogOpen(false);
      setToast(`已创建项目「${payload.name}」`);
    } catch (error) {
      setToast(error.message);
    }
  };

  const toggleStage = (projectId, index) => {
    setProjects(list => list.map(project => {
      if (project.id !== projectId) return project;
      const stages = project.stages.map((done, i) => (i === index ? !done : done));
      api.patch('projects', projectId, { stages }).catch(() => {});
      return { ...project, stages };
    }));
  };

  const submitReview = project => {
    setProjects(list => list.map(item => item.id === project.id ? { ...item, status: 'review' } : item));
    api.patch('projects', project.id, { status: 'review' }).catch(() => {});
    setToast('已提交组长审核');
  };

  const doneCount = project => project.stages.filter(Boolean).length;

  return <main className="projects-page">
    <div className="projects-head">
      <div>
        <h1>我的项目</h1>
        <p>展开一个项目，在当前环节写内容、传附件，做完交给组长审。</p>
      </div>
      <button type="button" className="projects-refresh" onClick={() => setToast('已刷新项目列表')}><RefreshCw size={16} />刷新</button>
    </div>

    {projects.length === 0 ? <section className="projects-empty">
      <CloudGlyph />
      <strong>还没有项目</strong>
      <p>新建一个项目，按剧本、资产库、成片三步做，每一步做完交给组长审。</p>
      <button type="button" className="projects-primary" onClick={() => setDialogOpen(true)}><Plus size={17} />新建项目</button>
    </section> : <div className="project-grid">
      {projects.map(project => {
        const open = expandedId === project.id;
        return <article className="project-card" key={project.id}>
          <button type="button" className="project-head" onClick={() => setExpandedId(open ? null : project.id)} aria-expanded={open}>
            <div className="project-title">
              <h3>{project.name}</h3>
              <p>{project.date} · {project.type} · {project.duration} · {project.count} 条 · {project.channel}</p>
            </div>
            <span className={`project-status ${project.status}`}>{project.status === 'review' ? '已交审' : `进行中 ${doneCount(project)}/3`}</span>
            <span className="project-lead">{leadTime(project.duration) || '—'}</span>
            <ChevronDown size={17} className={`project-chevron ${open ? 'open' : ''}`} />
          </button>
          {open && <div className="project-body">
            <div className="project-progress"><i style={{ width: `${(doneCount(project) / 3) * 100}%` }} /></div>
            <div className="stage-list">
              {STAGES.map(([name, desc], index) => <div key={name} className={`stage ${project.stages[index] ? 'done' : ''}`}>
                <span className="stage-index">{project.stages[index] ? <Check size={12} /> : index + 1}</span>
                <div className="stage-text"><strong>{name}</strong><p>{desc}</p></div>
                <button type="button" className="stage-btn" disabled={project.status === 'review'}
                  onClick={() => toggleStage(project.id, index)}>
                  {project.stages[index] ? '撤回' : '标记完成'}
                </button>
              </div>)}
            </div>
            <div className="project-actions">
              <button type="button" className="projects-ghost" onClick={() => onOpenProject?.('剧本', project)}>剧本 / 分镜</button>
              <button type="button" className="projects-ghost" onClick={() => onOpenProject?.('资产', project)}>资产库</button>
              <button type="button" className="projects-ghost" onClick={() => onOpenProject?.('画布', project)}>创作画布</button>
              <button type="button" className="projects-ghost" onClick={() => onOpenProject?.('成片', project)}>生成任务 / 成片</button>
              <button type="button" className="projects-primary" disabled={project.status === 'review' || doneCount(project) < 3}
                onClick={() => submitReview(project)}>提交组长审核</button>
              <button type="button" className="projects-ghost" onClick={() => setToast('附件上传为演示功能')}>上传附件</button>
              <span className="project-hint">{project.status === 'review' ? '已提交，等待组长审核' : doneCount(project) < 3 ? '三步都完成后才能交审' : '可以提交审核了'}</span>
            </div>
          </div>}
        </article>;
      })}
    </div>}

    {projects.length > 0 && <button type="button" className="projects-fab" onClick={() => setDialogOpen(true)}><Plus size={18} />新建项目</button>}

    {dialogOpen && <NewProjectDialog onClose={() => setDialogOpen(false)} onCreate={createProject} />}
    {toast && <div className="projects-toast">{toast}</div>}
  </main>;
}
