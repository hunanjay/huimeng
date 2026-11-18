import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, FileText, Film, Inbox, LayoutGrid, Loader2, Plus, RotateCcw, Scissors, Upload, X, Zap } from 'lucide-react';
import './DecomposePage.css';
import { api } from '../api.js';

const TIERS = ['换皮改编（同戏剧骨架与爽点，换新故事设定）', '同题材复刻（保留题材与人物关系）', '只提结构（仅取叙事骨架与节奏）'];
const RATIOS = ['跟随原片画幅', '9:16 竖屏', '16:9 横屏', '1:1 方形', '4:3 复古'];

const PIPELINE = [
  '像素突变切镜与关键帧提取',
  '多模态逐帧拉片与字幕识别',
  '叙事张力曲线与角色 / 场景锚点',
  '黄金前 3 秒钩子与爆款公式',
  '原片逐镜剧本还原',
  '生成复刻新剧本',
];

const initialForm = {
  name: '',
  tier: TIERS[0],
  ratio: RATIOS[0],
  duration: '0',
  style: '',
  note: '',
};

function miniTime(timestamp) {
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  return `${Math.round(minutes / 60)} 小时前`;
}

export default function DecomposePage({ projectId }) {
  const [records, setRecords] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [file, setFile] = useState(null);
  const [toast, setToast] = useState('');
  const fileRef = useRef(null);

  const active = records.find(record => record.id === activeId) || null;
  const running = records.some(record => record.status === 'running');

  // 首次加载：后端拆解记录；超过 12 秒还在「解析中」的视为已完成（服务重启后兜底）
  useEffect(() => {
    let cancelled = false;
    api.list('breakdowns', 100, projectId)
      .then(data => {
        if (cancelled) return;
        setRecords(data.items.map(item => {
          const stale = item.status === 'running' && Date.now() - (item.updatedAt || 0) > 12000;
          return {
            id: item.id,
            name: item.name,
            fileName: item.fileName,
            tier: item.tier,
            ratio: item.ratio,
            duration: item.duration,
            style: item.style,
            note: item.note,
            status: item.status === 'done' || stale ? 'done' : 'running',
            progress: item.status === 'done' || stale ? 100 : (item.progress || 0),
            shots: item.shots || 0,
            insights: item.insights || null,
            createdAt: item.createdAt,
            updated: item.updatedAt,
          };
        }));
      })
      .catch(() => { /* 后端没起来时保持空列表 */ });
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  // 进度推进（演示）；完成时把结果写回后端
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setRecords(list => list.map(record => {
        if (record.status !== 'running') return record;
        const progress = Math.min(100, record.progress + 7 + Math.round(Math.random() * 6));
        if (progress >= 100) {
          const done = { ...record, progress: 100, status: 'done', updated: Date.now(), shots: 38 + Math.round(Math.random() * 26) };
          api.patch('breakdowns', record.id, { status: 'done', progress: 100, shots: done.shots }).catch(() => {});
          // 配了豆包就让模型写拆解要点，失败就保留静态文案
          api.analyzeBreakdown(record.id)
            .then(doc => setRecords(list => list.map(item => (item.id === doc.id ? { ...item, insights: doc.insights } : item))))
            .catch(() => {});
          return done;
        }
        return { ...record, progress, updated: Date.now() };
      }));
    }, 650);
    return () => clearInterval(timer);
  }, [running]);

  const update = (key, value) => setForm(current => ({ ...current, [key]: value }));

  const submit = async () => {
    const name = form.name.trim() || file?.name?.replace(/\.[^.]+$/, '') || '';
    if (!name) {
      setToast('先上传对标视频，或填一个项目名称');
      return;
    }
    const payload = {
      projectId,
      name,
      fileName: file?.name || '未上传视频（演示）',
      tier: form.tier,
      ratio: form.ratio,
      duration: form.duration || '0',
      style: form.style.trim(),
      note: form.note.trim(),
      status: 'running',
      progress: 4,
      shots: 0,
    };
    try {
      const doc = await api.create('breakdowns', payload);
      const record = { ...payload, id: doc.id, createdAt: doc.createdAt, updated: doc.updatedAt };
      setRecords(list => [record, ...list]);
      setActiveId(record.id);
      setToast('已提交拆解任务，正在解析对标视频');
    } catch (error) {
      setToast(error.message);
    }
  };

  const resetForm = () => {
    setActiveId(null);
    setForm(initialForm);
    setFile(null);
    setToast('');
  };

  return <main className="decompose-page">
    <aside className="decompose-side">
      <header>
        <h2><Scissors size={18} />漫剧拆解</h2>
        <button type="button" className="side-new" onClick={resetForm}><Plus size={15} />新建拆解</button>
      </header>
      <p className="side-desc">上传对标爆款视频，自动切镜拉片、提炼钩子公式、还原分镜并改编成新剧本与画布。</p>
      {records.length === 0 ? <div className="side-empty">
        <Inbox size={42} />
        <span>暂无拆解记录</span>
      </div> : <div className="record-list">
        {records.map(record => <button type="button" key={record.id}
          className={`record-item ${record.id === activeId ? 'current' : ''}`}
          onClick={() => setActiveId(record.id)}>
          <span className="record-row">
            <strong>{record.name}</strong>
            <small className={record.status}>{record.status === 'done' ? '已完成' : `解析中 ${record.progress}%`}</small>
          </span>
          <span className="record-meta">{record.status === 'done' ? `${record.shots} 个分镜 · ${miniTime(record.updated)}` : '正在逐帧拉片…'}</span>
          {record.status === 'running' && <span className="record-progress"><i style={{ width: `${record.progress}%` }} /></span>}
        </button>)}
      </div>}
    </aside>

    {active ? <section className="decompose-main">
      <div className="record-head">
        <h1>{active.name}</h1>
        <span className={`record-status ${active.status}`}>{active.status === 'done' ? '拆解完成' : '正在拆解'}</span>
        <button type="button" className="link-btn" onClick={resetForm}><ArrowLeft size={14} />新建拆解</button>
      </div>
      <p className="lead">{active.fileName} · {active.tier} · {active.ratio}{Number(active.duration) > 0 ? ` · 目标 ${active.duration} 秒` : ' · 时长跟随原片'}</p>

      {active.status === 'running' ? <>
        <div className="progress-line"><i style={{ width: `${active.progress}%` }} /></div>
        <div className="step-list">
          {PIPELINE.map((step, index) => {
            const state = active.progress >= ((index + 1) / PIPELINE.length) * 100 ? 'done'
              : active.progress >= (index / PIPELINE.length) * 100 ? 'current' : 'pending';
            return <div key={step} className={`step ${state}`}>
              <span className="step-dot">{state === 'done' ? <Check size={11} /> : state === 'current' ? <Loader2 size={11} className="spin" /> : index + 1}</span>
              {step}
            </div>;
          })}
        </div>
        <p className="record-note">解析完成后会自动生成复刻剧本，并同步到剧本库与无限画布。</p>
      </> : <>
        <div className="result-grid">
          {[['分镜数', `${active.shots} 个`], ['原片时长', '2 分 46 秒'], ['复刻剧本', '已生成'], ['爆款公式', active.insights?.formula ? '已分析' : '强冲突开场']].map(([label, value]) => <div className="result-cell" key={label}><span>{label}</span><b>{value}</b></div>)}
        </div>
        <div className="result-section">
          <h3><Film size={15} />拆解要点</h3>
          {active.insights?.points?.length ? <>
            {active.insights.formula && <p className="insight-formula">爆款公式：{active.insights.formula}</p>}
            <ol>
              {active.insights.points.map((point, index) => <li key={index}>{point}</li>)}
            </ol>
            {active.insights.suggestion && <p className="insight-tip">{active.insights.suggestion}</p>}
          </> : <ol>
            <li>前 3 秒用「撕破体面」的动作冲突抓人，第 6 秒给出反转钩子。</li>
            <li>单集 3 次情绪抬升，平均 18 秒一个爽点，结尾留悬念指向下一集。</li>
            <li>主角台词密度高、反派台词短，靠镜头正反打强化压迫感。</li>
            <li>已按「{active.tier.split('（')[0]}」改写为 {active.shots} 个分镜的新剧本{active.note ? `，备注：${active.note}` : ''}。</li>
          </ol>}
        </div>
        <div className="record-actions">
          <button type="button" className="start-btn" onClick={() => setToast('复刻剧本已放入剧本库（演示）')}><FileText size={16} />查看复刻剧本</button>
          <button type="button" className="ghost-btn" onClick={() => setToast('已在无限画布中打开复刻分镜（演示）')}><LayoutGrid size={16} />打开无限画布</button>
          <button type="button" className="ghost-btn" onClick={() => setToast('已用同参数重新提交拆解（演示）')}><RotateCcw size={16} />重新拆解</button>
        </div>
      </>}
    </section> : <section className="decompose-main">
      <h1>新建对标漫剧拆解</h1>
      <p className="lead">系统会自动完成：像素突变切镜与关键帧提取 → 多模态逐帧拉片与字幕识别 → 叙事张力曲线与角色场景空间锚点 → 黄金前 3 秒钩子与爆款公式 → 原片逐镜剧本还原 → 一键生成复刻新剧本并转入剧本库 / 无限画布。</p>

      <div className="dc-field">
        <label className="dc-label">1. 上传对标视频（建议 3 分钟以内短剧 / 漫剧片段）</label>
        <button type="button" className="upload-btn" onClick={() => fileRef.current?.click()}><Upload size={16} />选择对标视频上传</button>
        {file && <div className="file-chip"><FileText size={14} /><span>{file.name}</span><button type="button" aria-label="移除文件" onClick={() => setFile(null)}><X size={13} /></button></div>}
        <input ref={fileRef} type="file" accept="video/*" hidden onChange={event => { setFile(event.target.files?.[0] || null); event.target.value = ''; }} />
      </div>

      <div className="dc-field">
        <label className="dc-label" htmlFor="project-name">2. 项目名称</label>
        <input id="project-name" className="dc-input" value={form.name} onChange={event => update('name', event.target.value)} placeholder="例如：都市逆袭爆款第1集拆解" />
      </div>

      <div className="dc-field">
        <label className="dc-label" htmlFor="tier">3. 改编复刻档位</label>
        <div className="dc-select">
          <select id="tier" className="dc-input" value={form.tier} onChange={event => update('tier', event.target.value)}>
            {TIERS.map(tier => <option key={tier} value={tier}>{tier}</option>)}
          </select>
          <ChevronDown size={16} />
        </div>
      </div>

      <div className="dc-row">
        <div className="dc-field">
          <label className="dc-label" htmlFor="target-ratio">目标画幅（留空跟随原片）</label>
          <div className="dc-select">
            <select id="target-ratio" className="dc-input" value={form.ratio} onChange={event => update('ratio', event.target.value)}>
              {RATIOS.map(ratio => <option key={ratio} value={ratio}>{ratio}</option>)}
            </select>
            <ChevronDown size={16} />
          </div>
        </div>
        <div className="dc-field">
          <label className="dc-label" htmlFor="target-duration">目标总时长（0=跟随原片）</label>
          <div className="dc-duration">
            <input id="target-duration" className="dc-input" type="number" min="0" value={form.duration} onChange={event => update('duration', event.target.value)} />
            <span>秒</span>
          </div>
        </div>
        <div className="dc-field">
          <label className="dc-label" htmlFor="target-style">目标画风（可选）</label>
          <input id="target-style" className="dc-input" value={form.style} onChange={event => update('style', event.target.value)} placeholder="如：国风玄幻3D / 赛博韩漫" />
        </div>
      </div>

      <div className="dc-field">
        <label className="dc-label" htmlFor="note">改编方向备注（可选）</label>
        <textarea id="note" className="dc-input dc-textarea" value={form.note} onChange={event => update('note', event.target.value)} placeholder="例如：把现代豪门背景改成修仙宗门大比，主角改成女剑修，保留前3秒打脸悬念" />
      </div>

      <button type="button" className="start-btn" onClick={submit}><Zap size={16} />开始拆解</button>
    </section>}

    {toast && <div className="decompose-toast">{toast}</div>}
  </main>;
}
