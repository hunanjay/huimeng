import { useMemo, useState } from 'react';
import { ChevronDown, Grid2X2, List, Plus, RefreshCw, Search, Video } from 'lucide-react';
import './VideosPage.css';

const statuses = [['全部', 'all'], ['生成中', 'processing'], ['已生成', 'done'], ['失败', 'failed']];

export default function VideosPage({ onCreate }) {
  const [query, setQuery] = useState('');
  const [model, setModel] = useState('全部模型');
  const [status, setStatus] = useState('all');
  const [view, setView] = useState('grid');
  const [refresh, setRefresh] = useState(0);
  const visible = useMemo(() => [].filter(item => item.title.includes(query) && (status === 'all' || item.status === status)), [query, status, refresh]);
  return <main className="videos-page">
    <div className="page-heading"><div><h1>成片</h1><p>每一条出片的进度与结果都在这里。卡片上可以直接预览、下载、复制提示词。</p></div><div className="page-actions"><button onClick={() => setRefresh(refresh + 1)}><RefreshCw size={16}/>刷新</button><button onClick={onCreate}><Plus size={17}/>新建剧本任务</button></div></div>
    <section className="video-search"><label className="search-box"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索名称或分镜内容"/><Search size={19}/></label><label className="model-select"><select value={model} onChange={event => setModel(event.target.value)}><option>全部模型</option><option>Seedance</option><option>Kling</option><option>即梦</option></select><ChevronDown size={16}/></label></section>
    <div className="video-toolbar"><div className="status-tabs">{statuses.map(([label, value], index) => <button key={value} onClick={() => setStatus(value)} className={status === value ? 'current' : ''}>{index > 0 && <i className={`status-dot dot-${value}`}/ >}{label}</button>)}</div><div className="view-switch"><button aria-label="网格视图" onClick={() => setView('grid')} className={view === 'grid' ? 'current' : ''}><Grid2X2 size={17}/></button><button aria-label="列表视图" onClick={() => setView('list')} className={view === 'list' ? 'current' : ''}><List size={17}/></button></div></div>
    {visible.length ? <div className={`video-results ${view}`}>{visible.map(item => <article key={item.title}>{item.title}</article>)}</div> : <section className="video-empty"><div className="cloud-mark">⌁</div><strong>{query ? '没有找到匹配的成片' : '还没有成片'}</strong><p>{query ? '试试其他名称或分镜内容。' : '在分镜工作台或画布里提交出片后，进度和成片会出现在这里。'}</p>{!query && <button className="primary" onClick={onCreate}><Video size={17}/>去分镜出片</button>}</section>}
  </main>;
}
