import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, Loader2, Plus, RefreshCw, Share2, Sparkles, Trash2, Upload, Video, X } from 'lucide-react';
import { api } from '../api.js';
import './DistributePage.css';

const TABS = [['pending', '待发布'], ['published', '已发布']];

const timeText = timestamp => (timestamp
  ? new Date(timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '');

const formatSize = bytes => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`);

const noteText = draft => {
  const tags = (draft.tags || []).map(tag => `#${tag}`).join(' ');
  return [draft.title, '', draft.body, '', tags].filter(part => part !== undefined).join('\n').trim();
};

export default function DistributePage() {
  const [drafts, setDrafts] = useState([]);
  const [tab, setTab] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceTitle, setSourceTitle] = useState('');
  const [file, setFile] = useState(null);
  const [creating, setCreating] = useState(false);
  const [rewritingId, setRewritingId] = useState('');
  const [busyId, setBusyId] = useState('');

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
      const data = await api.distributeList();
      setDrafts(data.items);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const visible = drafts.filter(draft => (draft.status || 'pending') === tab);
  const counts = {
    pending: drafts.filter(draft => (draft.status || 'pending') === 'pending').length,
    published: drafts.filter(draft => draft.status === 'published').length,
  };

  const createDraft = async () => {
    if (!file && !sourceUrl.trim()) {
      notify('先上传视频，或粘贴一个抖音链接');
      return;
    }
    setCreating(true);
    try {
      let videoUrl = '';
      let videoName = '';
      if (file) {
        const uploaded = await api.distributeUpload(file);
        videoUrl = uploaded.videoUrl;
        videoName = uploaded.videoName;
      }
      const draft = await api.distributeCreate({
        sourceUrl: sourceUrl.trim(),
        sourceTitle: sourceTitle.trim() || (file ? file.name.replace(/\.[^.]+$/, '') : ''),
        videoUrl,
        videoName,
      });
      setDrafts(current => [draft, ...current]);
      setFile(null);
      setSourceUrl('');
      setSourceTitle('');
      setTab('pending');
      notify('草稿已创建，正在生成小红书文案…');

      setRewritingId(draft.id);
      try {
        const rewritten = await api.distributeRewrite(draft.id);
        setDrafts(current => current.map(item => (item.id === rewritten.id ? rewritten : item)));
        notify('文案已生成，确认后去小红书发布');
      } catch (err) {
        notify(`文案生成失败：${err.message}`);
      } finally {
        setRewritingId('');
      }
    } catch (err) {
      notify(err.message);
    } finally {
      setCreating(false);
    }
  };

  const rewrite = async draft => {
    setRewritingId(draft.id);
    try {
      const next = await api.distributeRewrite(draft.id);
      setDrafts(current => current.map(item => (item.id === next.id ? next : item)));
      notify('已重新生成文案');
    } catch (err) {
      notify(err.message);
    } finally {
      setRewritingId('');
    }
  };

  const patchLocal = (id, patch) => setDrafts(current => current.map(item => (item.id === id ? { ...item, ...patch } : item)));

  const saveDraft = async draft => {
    setBusyId(draft.id);
    try {
      const next = await api.distributePatch(draft.id, {
        title: draft.title,
        body: draft.body,
        tags: draft.tags,
      });
      setDrafts(current => current.map(item => (item.id === next.id ? next : item)));
    } catch (err) {
      notify(err.message);
    } finally {
      setBusyId('');
    }
  };

  const togglePublished = async draft => {
    setBusyId(draft.id);
    try {
      const next = await api.distributePatch(draft.id, { status: draft.status === 'published' ? 'pending' : 'published' });
      setDrafts(current => current.map(item => (item.id === next.id ? next : item)));
      notify(next.status === 'published' ? '已标记为已发布' : '已撤回为待发布');
    } catch (err) {
      notify(err.message);
    } finally {
      setBusyId('');
    }
  };

  const copyNote = async draft => {
    try {
      await navigator.clipboard.writeText(noteText(draft));
      notify('文案已复制，去小红书粘贴即可');
    } catch {
      notify('复制失败，请手动选中');
    }
  };

  const downloadVideo = draft => {
    if (!draft.videoUrl) return;
    const link = document.createElement('a');
    link.href = draft.videoUrl;
    link.download = draft.videoName || 'video.mp4';
    link.click();
  };

  const removeDraft = async draft => {
    setBusyId(draft.id);
    try {
      await api.distributeRemove(draft.id);
      setDrafts(current => current.filter(item => item.id !== draft.id));
      notify('草稿已删除');
    } catch (err) {
      notify(err.message);
    } finally {
      setBusyId('');
    }
  };

  return <main className="dist-page">
    <div className="dist-head">
      <div>
        <h1>分发</h1>
        <p>把抖音视频整理成小红书笔记：系统准备素材和文案，你确认后手动发布，避免账号风险。</p>
      </div>
      <button type="button" className="dist-refresh" onClick={load}><RefreshCw size={15} />刷新</button>
    </div>

    {error && <div className="dist-error">{error}</div>}

    <section className="dist-compose">
      <div className="compose-row">
        <label className="compose-field grow">
          <span>抖音链接（可选，只做备注）</span>
          <input value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} placeholder="https://v.douyin.com/xxxxxxx/" />
        </label>
        <label className="compose-field">
          <span>原始标题（可选）</span>
          <input value={sourceTitle} onChange={event => setSourceTitle(event.target.value)} placeholder="例如：雨夜巷口回头" />
        </label>
      </div>

      <div className="compose-actions">
        <button type="button" className="upload-video" onClick={() => fileRef.current?.click()}>
          <Upload size={16} />{file ? '重新选择视频' : '上传视频'}
        </button>
        <input ref={fileRef} type="file" accept="video/*" hidden
          onChange={event => { setFile(event.target.files?.[0] || null); event.target.value = ''; }} />

        {file && <span className="file-chip">
          <Video size={14} />{file.name} · {formatSize(file.size)}
          <button type="button" aria-label="移除视频" onClick={() => setFile(null)}><X size={12} /></button>
        </span>}

        <button type="button" className="compose-submit" disabled={creating} onClick={createDraft}>
          {creating ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
          {creating ? '处理中…' : '生成小红书草稿'}
        </button>
        <span className="compose-hint">视频只存在本地后端，不会自动发到任何平台</span>
      </div>
    </section>

    <div className="dist-tabs">
      {TABS.map(([value, label]) => <button key={value} type="button"
        className={tab === value ? 'current' : ''} onClick={() => setTab(value)}>
        {label}<span className="dist-count">{counts[value]}</span>
      </button>)}
    </div>

    {loading ? <div className="dist-loading"><Loader2 size={18} className="spin" />正在读取草稿…</div>
      : visible.length === 0 ? <section className="dist-empty">
        <Share2 size={30} />
        <strong>{tab === 'pending' ? '还没有待发布的草稿' : '还没有已发布的笔记'}</strong>
        <p>{tab === 'pending' ? '粘贴抖音链接或上传视频，系统会生成标题、正文和话题标签。' : '在待发布里确认后点「标记已发布」，这里会留下记录。'}</p>
      </section>
        : <div className="dist-grid">
          {visible.map(draft => {
            const rewriting = rewritingId === draft.id;
            const busy = busyId === draft.id;
            const tagsText = (draft.tags || []).join('，');
            return <article className={`dist-card ${draft.status}`} key={draft.id}>
              {draft.videoUrl && <div className="dist-media">
                <video src={draft.videoUrl} controls playsInline preload="metadata" />
                <span className={`dist-status ${draft.status}`}>{draft.status === 'published' ? '已发布' : '待发布'}</span>
              </div>}

              <div className="dist-body">
                {!draft.videoUrl && <span className={`dist-status inline ${draft.status}`}>{draft.status === 'published' ? '已发布' : '待发布'}</span>}
                <label className="dist-field">
                  <span>标题 <small>{(draft.title || '').length}/20</small></span>
                  <input value={draft.title || ''} maxLength={30}
                    onChange={event => patchLocal(draft.id, { title: event.target.value })}
                    onBlur={() => saveDraft(draft)} placeholder="小红书标题" />
                </label>

                <label className="dist-field">
                  <span>正文 <small>{(draft.body || '').length}/500</small></span>
                  <textarea rows={5} value={draft.body || ''} maxLength={1200}
                    onChange={event => patchLocal(draft.id, { body: event.target.value })}
                    onBlur={() => saveDraft(draft)}
                    placeholder={rewriting ? '豆包正在写文案…' : '小红书正文，300-500 字比较合适'} />
                </label>

                <label className="dist-field">
                  <span>话题标签 <small>用逗号分隔</small></span>
                  <input value={tagsText} placeholder="视频创作，日常记录"
                    onChange={event => patchLocal(draft.id, { tags: event.target.value.split(/[,，\s]+/).filter(Boolean) })}
                    onBlur={() => saveDraft(draft)} />
                </label>

                <div className="dist-meta">
                  {draft.sourceUrl && <a href={draft.sourceUrl} target="_blank" rel="noreferrer">来源链接</a>}
                  {draft.sourceTitle && <span>原标题：{draft.sourceTitle}</span>}
                  <span>{draft.status === 'published' ? `发布于 ${timeText(draft.publishedAt)}` : `创建于 ${timeText(draft.createdAt)}`}</span>
                </div>

                <div className="dist-actions">
                  <button type="button" className="dist-primary" onClick={() => rewrite(draft)} disabled={rewriting}>
                    {rewriting ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}{rewriting ? '生成中…' : '重新生成文案'}
                  </button>
                  <button type="button" onClick={() => copyNote(draft)}><Copy size={15} />复制文案</button>
                  <button type="button" onClick={() => downloadVideo(draft)} disabled={!draft.videoUrl}><Download size={15} />下载视频</button>
                  <button type="button" onClick={() => togglePublished(draft)} disabled={busy}>
                    {draft.status === 'published' ? <><RefreshCw size={15} />撤回</> : <><Check size={15} />标记已发布</>}
                  </button>
                  <button type="button" className="danger" onClick={() => removeDraft(draft)} disabled={busy}><Trash2 size={15} />删除</button>
                </div>
              </div>
            </article>;
          })}
        </div>}

    {toast && <div className="dist-toast"><Check size={15} />{toast}</div>}
  </main>;
}
