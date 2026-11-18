import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Clipboard, FileText, LayoutGrid, Loader2, PlaySquare, Trash2, Upload, Video, X } from 'lucide-react';
import { api } from '../api.js';
import './CreateWorkbench.css';

const MODES = [['剧本成片', Video], ['分镜出片', PlaySquare], ['无限画布', LayoutGrid]];

function relative(timestamp) {
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} 小时前`;
  return `${Math.round(minutes / 1440)} 天前`;
}

const formatChars = count => (count > 9999 ? `${(count / 10000).toFixed(1)} 万字` : `${count} 字`);

export default function CreateWorkbench({ mode, onModeChange, onOpenScripts, projectId, projectName }) {
  const [scripts, setScripts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [toast, setToast] = useState('');
  const fileRef = useRef(null);
  const toastTimer = useRef(null);

  const notify = message => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2400);
  };

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const load = async () => {
    try {
      const data = await api.listScripts(projectId);
      setScripts(data.items);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setLoading(true); load(); }, [projectId]);

  const save = async ({ name, content, fileName }) => {
    setBusy(true);
    try {
      const script = await api.createScript({ title: name, text: content, fileName, projectId });
      setScripts(current => [script, ...current]);
      notify(`《${script.title}》已保存，切出 ${script.scenes} 个分镜`);
      setPasteOpen(false);
      setTitle('');
      setText('');
      // 有正文就让豆包重新拆分镜（没配模型时接口 503，忽略即可）
      if (script.content) {
        api.splitScript(script.id)
          .then(updated => setScripts(current => current.map(item => (item.id === updated.id ? updated : item))))
          .catch(() => {});
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const uploadFile = async file => {
    if (!file) return;
    if (!/\.(docx|txt|md|csv)$/i.test(file.name)) {
      notify('只支持 .docx / .txt / .md / .csv');
      return;
    }
    const isText = /\.(txt|md|csv)$/i.test(file.name);
    const content = isText ? await file.text() : '';
    await save({
      name: title.trim() || file.name.replace(/\.[^.]+$/, ''),
      content,
      fileName: file.name,
    });
    if (!isText) notify('已上传，.docx 正文解析待接入（先记文件名与字数）');
  };

  const remove = async item => {
    try {
      await api.remove('scripts', item.id);
      setScripts(current => current.filter(script => script.id !== item.id));
      notify(`已删除《${item.title}》`);
    } catch (err) {
      notify(err.message);
    }
  };

  return <main className="main-content">
    <div className="mode-switch">
      {MODES.map(([label, Icon]) => <button key={label} className={mode === label ? 'selected' : ''}
        onClick={() => onModeChange(label)}><Icon size={18} />{label}</button>)}
    </div>

    <h1>{projectName ? `${projectName} · 创作工作台` : '剧本入，成片出，整部剧一条线做完'}</h1>

    <section className={`upload-card ${dragging ? 'is-dragging' : ''}`}
      onDragOver={event => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={event => { event.preventDefault(); setDragging(false); uploadFile(event.dataTransfer.files?.[0]); }}>
      <div className="doc-icon"><FileText size={25} /></div>
      <h2>把剧本拖到这里</h2>
      <p>自动切分镜，拆出人物 / 场景 / 道具，铺好提示词卡片，你逐张确认出片</p>
      <div className="upload-actions">
        <button type="button" className="primary" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? <Loader2 size={17} className="spin" /> : <Upload size={17} />}{busy ? '上传中…' : '上传剧本'}
        </button>
        <button type="button" className="secondary" onClick={() => { setPasteOpen(true); setError(''); }}>
          <Clipboard size={17} />粘贴文本
        </button>
      </div>
      <div className="formats">支持 .docx / .txt / .md / .csv，单本不超过 20 万字 · 存到后端剧本库</div>
      <input ref={fileRef} type="file" accept=".docx,.txt,.md,.csv" hidden
        onChange={event => { uploadFile(event.target.files?.[0]); event.target.value = ''; }} />
    </section>

    <section className="scripts">
      <div className="section-heading">
        <h2>我的剧本 <span className="cw-count">{scripts.length}</span></h2>
        <button type="button" onClick={onOpenScripts}>全部剧本 <ChevronRight size={16} /></button>
      </div>

      {error && <div className="cw-error">{error}</div>}

      {loading ? <div className="cw-loading"><Loader2 size={18} className="spin" />正在读取剧本库…</div>
        : scripts.length === 0 ? <div className="empty-state">
          <div className="cloud-mark">⌁</div>
          <strong>还没有剧本</strong>
          <p>在上面拖入、上传或粘贴一本，系统会自动切出分镜。</p>
        </div> : <div className="cw-list">
          {scripts.slice(0, 5).map(script => <article className="cw-row" key={script.id}>
            <span className="cw-icon"><FileText size={18} /></span>
            <div className="cw-main">
              <strong>{script.title}</strong>
              <p>{script.excerpt || '文件已上传，等待解析正文'}</p>
              <small>{script.fileName ? `${script.fileName} · ` : ''}{formatChars(script.chars)} · {relative(script.createdAt)}</small>
            </div>
            <span className="cw-badge">{script.scenes ? `${script.scenes} 个分镜` : '切分镜中'}</span>
            <button type="button" className="cw-del" aria-label={`删除${script.title}`} onClick={() => remove(script)}><Trash2 size={15} /></button>
          </article>)}
        </div>}
    </section>

    {pasteOpen && <div className="cw-mask" onMouseDown={event => { if (event.target === event.currentTarget) setPasteOpen(false); }}>
      <div className="cw-modal" role="dialog" aria-modal="true" aria-label="粘贴剧本">
        <header>
          <h2>粘贴剧本</h2>
          <button type="button" className="cw-close" aria-label="关闭" onClick={() => setPasteOpen(false)}><X size={18} /></button>
        </header>
        <input className="cw-input" value={title} onChange={event => setTitle(event.target.value)} placeholder="剧本标题（可选，默认未命名剧本）" maxLength={80} />
        <textarea className="cw-textarea" value={text} onChange={event => setText(event.target.value)} maxLength={200000}
          placeholder={'第一幕：后山洞口\n李守真发现洞口，听见里面有人说话……'} />
        <footer>
          <span className="cw-counter">{text.length} / 200000</span>
          <button type="button" className="cw-ghost" onClick={() => setPasteOpen(false)}>取消</button>
          <button type="button" className="cw-primary" disabled={busy || !text.trim()}
            onClick={() => save({ name: title.trim() || '未命名剧本', content: text, fileName: '' })}>
            {busy ? '保存中…' : '保存并拆分镜'}
          </button>
        </footer>
      </div>
    </div>}

    {toast && <div className="cw-toast">{toast}</div>}
  </main>;
}
