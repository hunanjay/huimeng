import { useRef, useState } from 'react';
import { Clipboard, FileText, LayoutGrid, PlaySquare, Upload, Video } from 'lucide-react';

export default function CreatePage() {
  const [mode, setMode] = useState('剧本成片');
  const fileRef = useRef(null);
  return <main className="main-content create-page">
    <div className="mode-switch">{[['剧本成片', Video], ['分镜出片', PlaySquare], ['无限画布', LayoutGrid]].map(([label, Icon]) => <button key={label} onClick={() => setMode(label)} className={mode === label ? 'selected' : ''}><Icon size={18}/>{label}</button>)}</div>
    <h1>剧本入，成片出，整部剧一条线做完</h1>
    <section className="upload-card"><div className="doc-icon"><FileText size={25}/></div><h2>把剧本拖到这里</h2><p>自动切分镜，拆出人物 / 场景 / 道具，铺好提示词卡片，你逐张确认出片</p>
      <div className="upload-actions"><button className="primary" onClick={() => fileRef.current?.click()}><Upload size={17}/>上传剧本</button><button className="secondary" onClick={() => window.prompt('粘贴剧本文本')}><Clipboard size={17}/>粘贴文本</button><input ref={fileRef} type="file" accept=".docx,.txt,.md,.csv" hidden /></div>
      <div className="formats">支持 .docx / .txt / .md / .csv，单本不超过 20 万字</div>
    </section>
    <section className="scripts"><div className="section-heading"><h2>我的剧本</h2><button>全部剧本 ›</button></div><div className="empty-state"><div className="cloud-mark">⌁</div><strong>还没有剧本</strong><p>在上面拖入、上传或粘贴一本，系统会自动切出分镜。</p></div></section>
  </main>;
}
