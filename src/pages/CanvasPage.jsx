import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Background,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ArrowLeft, ChevronRight, Download, Eye, FileText, Folder, GitBranch, Globe, Grid2X2, Image as ImageIcon, Layers, LayoutGrid, ListFilter, Loader2, Maximize2, Mic, Minus, Play, Plus, RotateCcw, Scissors, Settings2, ShieldCheck, Sparkles, Square, Trash2, Type, Upload, Video, X, Zap } from 'lucide-react';
import './CanvasPage.css';
import { api } from '../api.js';
import { instanceId, templateById, WORKFLOW_TEMPLATES } from './workflowTemplates.js';

const NODE_TYPES = {
  text: { label: '文本', icon: FileText, hint: '在这里写提示词、台词或设定' },
  image: { label: '图片', icon: ImageIcon, hint: '描述角色、场景或分镜图' },
  video: { label: '视频生成', icon: Video, hint: '写一句镜头：谁、在哪、做什么、怎么动' },
  audio: { label: '音频', icon: Mic, hint: '配音台词或音效描述' },
  // 模板里的流程节点：只承载参数和串流程，暂不调模型
  context: { label: '全局配置', icon: Settings2, hint: '' },
  llm_split: { label: '剧本拆解', icon: Layers, hint: '' },
  fanout: { label: '列表扇出', icon: GitBranch, hint: '' },
  anchor: { label: '定妆锚点', icon: ImageIcon, hint: '' },
  storyboard: { label: '分镜批量', icon: ListFilter, hint: '' },
  hitl: { label: '人审卡点', icon: ShieldCheck, hint: '' },
  concat: { label: '成片合成', icon: Video, hint: '' },
};

const GENERATABLE = ['image', 'video'];
// 模板流程节点：可以填参数，但「生成」按钮不发请求
const PLANNER_KINDS = ['context', 'llm_split', 'fanout', 'anchor', 'storyboard', 'hitl', 'concat'];
const isPlanner = kind => PLANNER_KINDS.includes(kind);

// 图片/视频节点的模型参数：和成片页（VideosPage）保持同一套比例与时长
const RATIOS = [['1:1', 1024, 1024], ['16:9', 1280, 720], ['9:16', 720, 1280], ['4:3', 1024, 768]];
const DURATIONS = [5, 10];
const DEFAULT_RATIO = '16:9';
const DEFAULT_DURATION = 5;
const PROGRESS_STEPS = [6, 16, 28, 42, 58, 72, 84, 93];

const railTools = [
  ['text', FileText, '文本节点'],
  ['image', ImageIcon, '图片节点'],
  ['video', Video, '视频节点'],
  ['audio', Mic, '音频节点'],
];

const railAfter = [
  [ImageIcon, '局部重绘'],
  [Play, '视频延长'],
  [Zap, '放大超清'],
  [Scissors, '裁切扩图'],
  [LayoutGrid, '多图拼接'],
  [Square, '框选区域'],
  [Grid2X2, '九宫格'],
];

// 节点按内容自动测高，这里只是首次渲染前的兜底高度：React Flow 用它算连线和小地图
const NODE_WIDTH = 248;
const NODE_HEIGHT = 232;
const CANVAS_VERSION = 3;
const EDGE_COLOR = '#b7ac8d';
const EDGE_COLOR_ACTIVE = '#245166';

function miniTime(timestamp) {
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  return `${Math.round(minutes / 60)} 小时前`;
}

const ratioOf = value => RATIOS.find(([label]) => label === value) || RATIOS.find(([label]) => label === DEFAULT_RATIO);
const isGeneratable = kind => GENERATABLE.includes(kind);
const textOf = node => node.data?.text || '';

/* ===== 上下游 =====
 * 边：上游 → 本节点。生成图片时把上游文本拼进提示词；生成视频时还需要上游出好的图当首帧。
 */
const upstreamOf = (nodeId, edges) => edges.filter(edge => edge.target === nodeId);
const downstreamOf = (nodeId, edges) => edges.filter(edge => edge.source === nodeId);

/**
 * 生成前检查一遍图，返回 { ok, reason?, prompt }
 * - 文本节点直接用它的文字
 * - 图片节点在有上游文本时拼起来；视频节点在有上游图片时把图片地址一起带上
 */
function prepare(node, nodes, edges) {
  const byId = new Map(nodes.map(item => [item.id, item]));
  const data = node.data || {};
  const text = textOf(node).trim();
  const upstream = upstreamOf(node.id, edges).map(edge => byId.get(edge.source)).filter(Boolean);
  const upstreamTexts = upstream.filter(item => item.data?.kind === 'text').map(textOf).filter(Boolean);

  if (data.kind === 'text') {
    if (!text) return { ok: false, reason: '文本节点还是空的：先写点内容，或者连一个上游文本进来' };
    return { ok: true, prompt: text };
  }
  if (data.kind === 'audio') {
    return { ok: false, reason: '音频节点还没接入模型，目前只能写台词草稿' };
  }

  const flags = upstream.map(item => collect(item, byId, edges, new Set([node.id])));
  if (flags.some(flag => flag.running)) return { ok: false, reason: '上游节点还在生成，等它出结果再跑这个节点' };
  if (flags.some(flag => flag.failed)) return { ok: false, reason: '上游节点生成失败，先重跑上游再继续' };

  const prompt = [text || data.lastPrompt || '', ...upstreamTexts].filter(Boolean).join('，');
  if (data.kind === 'image') {
    if (!prompt) return { ok: false, reason: '先在这个节点里写提示词，或连一个文本节点到它左边' };
    return { ok: true, prompt, images: [] };
  }
  // 视频：上游所有图片节点都要出图，没图就只走文生视频
  const upstreamImages = upstream.filter(item => item.data?.kind === 'image');
  const pending = upstreamImages.filter(item => !item.data?.resultUrl);
  if (pending.length) return { ok: false, reason: '上游图片还没有产物，先生成图片再跑视频（图生视频）' };
  if (!prompt && !upstreamImages.length) return { ok: false, reason: '先写一句镜头，或连一个图片节点做首帧' };
  // 画布产物的地址是本地 /api/files/xxx，后端会读文件转成 data URL 再喂给 Seedance，所以两种都放行
  const urls = upstreamImages
    .map(item => item.data.resultUrl)
    .filter(url => /^(https?:\/\/|\/api\/files\/)/i.test(url))
    .slice(0, 2);
  return { ok: true, prompt: prompt || '根据首帧自然延续镜头', images: urls };
}

/** 递归看一条支线上的状态，用来拦住「上游还没好就往下跑」 */
function collect(node, byId, edges, seen) {
  if (seen.has(node.id)) return { running: false, failed: false };
  seen.add(node.id);
  const data = node.data || {};
  const state = {
    running: data.status === 'queued' || data.status === 'running',
    failed: data.status === 'failed',
  };
  if (state.running || state.failed) return state;
  return edges
    .filter(edge => edge.target === node.id)
    .map(edge => byId.get(edge.source))
    .filter(Boolean)
    .reduce((acc, item) => {
      const result = collect(item, byId, edges, seen);
      return { running: acc.running || result.running, failed: acc.failed || result.failed };
    }, state);
}

/* ===== 数据格式：React Flow 的 { nodes, edges }；老画布只有 nodes 数组，这里补默认值 ===== */
// 模板实例化时整体平移一段，别和已有节点叠在一起
const TEMPLATE_OFFSET = { x: 120, y: 120 };

// 节点默认数据：生成节点有比例/时长，模板节点各自带业务字段
function defaultData(kind) {
  const base = { kind, status: 'idle', ratio: DEFAULT_RATIO, duration: DEFAULT_DURATION };
  switch (kind) {
    case 'context':
      return { ...base, title: '全局配置', rawScript: '', globalStyle: '', baseSeed: 0 };
    case 'llm_split':
      return { ...base, title: '剧本拆解', model: 'doubao-seed-2-1（方舟）', systemPrompt: '' };
    case 'fanout':
      return { ...base, title: '列表扇出（Map）' };
    case 'anchor':
      return { ...base, title: '定妆锚点', extraPrompt: 'character sheet, front view, neutral background', model: 'Seedream（方舟）', steps: 28, inputs: { characterPrompt: '' } };
    case 'storyboard':
      return { ...base, title: '分镜批量', consistency: 'flux_redux_plus_pulid', consistencyWeight: 0.85, model: 'Seedream（方舟）', count: 3, shots: [] };
    case 'hitl':
      return { ...base, title: '人审卡点', note: '', shots: [] };
    case 'concat':
      return { ...base, title: '成片合成', transition: 'crossfade 0.2s', format: 'mp4', crf: 18 };
    default:
      return base;
  }
}

const makeNode = (type, x, y, text) => {
  const meta = NODE_TYPES[type] || NODE_TYPES.video;
  return {
    id: `n${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    type: 'generation',
    position: { x, y },
    data: { ...defaultData(type), text: text || meta.hint },
  };
};

// 模板 → React Flow 节点：短 id 换成全局唯一 id，坐标整体平移
// 注意必须显式写 nodeType：不写的话 React Flow 会落到默认的 planner 渲染器上
// runKey 让同一个模板可以重复插入，否则节点 id 会撞车（React key 重复）
const templateNodes = (template, origin = TEMPLATE_OFFSET, runKey = '') => {
  const uid = nodeId => `${instanceId(template.id, nodeId)}${runKey ? `:${runKey}` : ''}`;
  const nodes = template.nodes.map(item => ({
    id: uid(item.id),
    type: isPlanner(item.kind) ? 'planner' : 'generation',
    position: { x: item.x + origin.x, y: item.y + origin.y },
    data: { ...defaultData(item.kind), ...item.data, kind: item.kind, template: template.id },
  }));
  const edges = template.edges.map(edge => ({
    id: `e-${uid(edge.source)}-${uid(edge.target)}`,
    source: uid(edge.source),
    target: uid(edge.target),
    sourceHandle: 'out',
    targetHandle: 'in',
  }));
  return { nodes, edges };
};

// 兼容被写坏的旧画布：type 被写成 video、data.kind 丢失时，从业务字段反推节点类型。
// 注意顺序：先看 data.kind → 再看业务字段 → 再看产物后缀 → 最后才信 raw.type
//（旧数据里 raw.type 全是 'video'，先信它就会全部退化成视频节点）
const inferKind = raw => {
  if (NODE_TYPES[raw?.data?.kind]) return raw.data.kind;
  const data = raw?.data && typeof raw.data === 'object' ? raw.data : {};
  if (data.rawScript !== undefined || data.globalStyle !== undefined) return 'context';
  if (data.systemPrompt !== undefined) return 'llm_split';
  if (data.transition !== undefined || data.format !== undefined) return 'concat';
  if (data.extraPrompt !== undefined || data.inputs !== undefined) return 'anchor';
  if (Array.isArray(data.shots)) return data.note !== undefined ? 'hitl' : 'storyboard';
  if (data.title !== undefined) return 'fanout';
  // 旧格式把 resultUrl / resultType 存在节点顶层，两种位置都要看
  const resultUrl = raw?.resultUrl || data.resultUrl || '';
  const resultType = raw?.resultType || data.resultType;
  if (resultType === 'image' || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(resultUrl)) return 'image';
  if (resultType === 'video' || /\.mp4(\?|$)/i.test(resultUrl)) return 'video';
  if (NODE_TYPES[raw?.type]) return raw.type;
  return 'video';
};

const normalizeNode = raw => {
  const kind = inferKind(raw);
  return {
    id: String(raw?.id ?? `n${Math.random().toString(36).slice(2, 8)}`),
    type: isPlanner(kind) ? 'planner' : 'generation',
    position: { x: Number(raw?.x) || 0, y: Number(raw?.y) || 0 },
    data: {
      ...defaultData(kind),
      kind,
      text: raw?.text || NODE_TYPES[kind].hint,
      ratio: raw?.ratio || DEFAULT_RATIO,
      duration: Number(raw?.duration) || DEFAULT_DURATION,
      status: raw?.status || 'idle',
      taskId: raw?.taskId || null,
      resultUrl: raw?.resultUrl || '',
      resultType: raw?.resultType || null,
      error: raw?.error || '',
      lastPrompt: raw?.lastPrompt || '',
      updatedAt: raw?.updatedAt || 0,
      // 模板流程节点的业务数据原样带回来
      ...(raw?.data && typeof raw.data === 'object' ? raw.data : {}),
    },
  };
};

const normalizeEdge = raw => {
  if (!raw?.source || !raw?.target) return null;
  return {
    id: String(raw.id || `e-${raw.source}-${raw.target}`),
    source: String(raw.source),
    target: String(raw.target),
    sourceHandle: raw.sourceHandle || 'out',
    targetHandle: raw.targetHandle || 'in',
  };
};

// 老画布被写坏时所有节点坐标都会变成 (0,0)，重开后全部叠在一起。
// 检测到重复坐标就按网格重排（保持连线不变），至少能看清流程。
const hasOverlap = nodes => {
  const seen = new Set();
  for (const node of nodes) {
    const key = `${Math.round(node.position?.x || 0)},${Math.round(node.position?.y || 0)}`;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
};

const gridLayout = nodes => nodes.map((node, index) => ({
  ...node,
  position: { x: 80 + (index % 4) * 380, y: 80 + Math.floor(index / 4) * 320 },
}));

const readGraph = stored => {
  const nodes = Array.isArray(stored?.nodes) ? stored.nodes.map(normalizeNode) : [];
  const ids = new Set(nodes.map(node => node.id));
  // 没存边但有多个节点时按顺序串起来，让老画布也能看出流程
  const rawEdges = Array.isArray(stored?.edges)
    ? stored.edges.map(normalizeEdge).filter(Boolean)
    : nodes.slice(1).map((node, index) => normalizeEdge({ source: nodes[index].id, target: node.id }));
  const edges = rawEdges.filter(edge => ids.has(edge.source) && ids.has(edge.target));
  return { nodes: hasOverlap(nodes) ? gridLayout(nodes) : nodes, edges };
};

// 只把需要持久化的字段写回后端，运行态（queued/running）落库时降级成 idle，免得刷新后卡住
const persistStatus = status => (status === 'queued' || status === 'running' ? 'idle' : status || 'idle');

// 模板流程节点要原样保存的业务字段（生成节点用不到，但混存没坏处）
const PLANNER_FIELDS = ['title', 'rawScript', 'globalStyle', 'baseSeed', 'model', 'systemPrompt', 'extraPrompt', 'steps', 'consistency', 'consistencyWeight', 'count', 'shots', 'note', 'transition', 'format', 'crf', 'speed', 'inputs', 'template', 'characters', 'portraits', 'segments', 'segmentCount', 'totalDuration'];

const writeGraph = graph => ({
  version: CANVAS_VERSION,
  nodes: graph.nodes.map(node => {
    const data = node.data || {};
    const planner = {};
    for (const key of PLANNER_FIELDS) {
      if (data[key] !== undefined) planner[key] = data[key];
    }
    return {
      id: node.id,
      type: data.kind || 'video',
      x: Math.round(node.position?.x || 0),
      y: Math.round(node.position?.y || 0),
      width: Math.round(node.measured?.width || NODE_WIDTH),
      height: Math.round(node.measured?.height || NODE_HEIGHT),
      text: data.text || '',
      ratio: data.ratio || DEFAULT_RATIO,
      duration: Number(data.duration) || DEFAULT_DURATION,
      status: persistStatus(data.status),
      taskId: data.taskId || null,
      resultUrl: data.resultUrl || '',
      resultType: data.resultType || null,
      error: data.error || '',
      lastPrompt: data.lastPrompt || '',
      updatedAt: data.updatedAt || 0,
      ...(Object.keys(planner).length ? { data: planner } : {}),
    };
  }),
  edges: graph.edges.map(edge => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle })),
});

// React Flow 会往节点数组里塞 measured / selected 等内部字段，回写和快照都要先剥干净
const plainNodes = nodes => nodes.map(({ id, type, position, data }) => ({ id, type, position, data }));
const plainEdges = edges => edges.map(({ id, source, target, sourceHandle, targetHandle }) => ({ id, source, target, sourceHandle, targetHandle }));

/* ===== 自定义节点：提示词输入框 + 模型参数 + 产物预览 ===== */
function GenerationNode({ id, data, selected }) {
  const meta = NODE_TYPES[data?.kind] || NODE_TYPES.video;
  const Icon = meta.icon;
  const status = data?.status || 'idle';
  const running = status === 'queued' || status === 'running';
  const ratio = ratioOf(data?.ratio);
  const previewClass = `node-preview ${data.kind} ratio-${String(ratio[0]).replace(':', '-')}`;
  return <article className={`canvas-node ${data.kind} ${selected ? 'selected' : ''}`}>
    <Handle type="target" position={Position.Left} id="in" className="node-port-handle in" />
    <header>
      <span className="node-glyph"><Icon size={14} /></span>
      <strong>{meta.label}</strong>
      <button type="button" className="node-remove nodrag" aria-label="删除节点"
        onClick={event => { event.stopPropagation(); data.onRemove?.(); }}><X size={13} /></button>
    </header>

    <textarea className="node-prompt nodrag nowheel" rows={data.kind === 'text' ? 4 : 3} value={data.text || ''}
      maxLength={800} placeholder={meta.hint} aria-label={`${meta.label}提示词`}
      onChange={event => data.onText?.(event.target.value)} />

    {isGeneratable(data.kind) && <div className="node-params nodrag">
      <select value={data.ratio || DEFAULT_RATIO} aria-label="画面比例" onChange={event => data.onRatio?.(event.target.value)}>
        {RATIOS.map(([label]) => <option key={label} value={label}>{label}</option>)}
      </select>
      {data.kind === 'video' && <select value={data.duration || DEFAULT_DURATION} aria-label="时长（秒）"
        onChange={event => data.onDuration?.(Number(event.target.value))}>
        {DURATIONS.map(value => <option key={value} value={value}>{value} 秒</option>)}
      </select>}
    </div>}

    {isGeneratable(data.kind) && (data.segments || []).length > 0 && <div className="segment-grid">
      {data.segments.map(segment => <figure key={segment.shotId}>
        <video src={segment.url} muted loop playsInline preload="metadata" />
        <figcaption>{segment.shotId}</figcaption>
      </figure>)}
    </div>}

    {isGeneratable(data.kind) && !(data.segments || []).length && <div className={previewClass}>
      {data.resultUrl
        ? (data.resultType === 'video'
          ? <video src={data.resultUrl} muted loop playsInline controls preload="metadata" />
          : <img src={data.resultUrl} alt={meta.label} loading="lazy" />)
        : <span className="node-preview-empty">
          {status === 'failed' ? <><b>生成失败</b><i>{data.error || '未知错误'}</i></> : running ? <><b>生成中 {data.progress || 0}%</b><i>{data.kind === 'video' ? '视频一般 30 秒到几分钟' : '图片一般十几秒'}</i></> : <><b>还没有产物</b><i>写好提示词后点右下角的生成</i></>}
        </span>}
      {(status === 'queued' || status === 'running') && <div className="node-progress"><i style={{ width: `${data.progress || 4}%` }} /></div>}
    </div>}

    <footer>
      {isGeneratable(data.kind) && (running
        ? <button type="button" className="node-run stop nodrag" onClick={() => data.onCancel?.()}><Loader2 size={13} className="spin" />取消</button>
        : <button type="button" className={`node-run nodrag ${status === 'failed' ? 'retry' : ''}`} onClick={() => data.onRun?.()}>
          {status === 'failed' ? <RotateCcw size={13} /> : <Sparkles size={13} />}{status === 'failed' ? '重新生成' : status === 'done' ? '再生成一次' : '生成'}
        </button>)}
      {!isGeneratable(data.kind) && <button type="button" className="node-run nodrag" onClick={() => data.onRun?.()}><Zap size={13} />运行</button>}
      {data.taskId && <span className="node-task" title={`任务 ${data.taskId}`}>{data.taskId.slice(0, 8)}</span>}
      <small className={`node-status ${status}`}>{status === 'done' ? '已完成' : status === 'failed' ? '失败' : running ? '生成中' : '草稿'}</small>
    </footer>
    <Handle type="source" position={Position.Right} id="out" className="node-port-handle out" />
  </article>;
}



/* ===== 模板流程节点：只承载参数与流程，不发模型请求 ===== */
function FieldToggle({ label, active, onChange }) {
  return <button type="button" className={`field-toggle nodrag ${active ? 'on' : ''}`}
    onClick={event => { event.stopPropagation(); onChange(!active); }}>{label}</button>;
}

function ContextForm({ data }) {
  return <>
    <textarea className="node-field nodrag nowheel" rows={4} value={data.rawScript || ''} aria-label="原始剧本"
      placeholder="原始剧本：直接贴一段剧情" onChange={event => data.onField?.('rawScript', event.target.value)} />
    <textarea className="node-field nodrag nowheel" rows={3} value={data.globalStyle || ''} aria-label="全局画风提示词"
      placeholder="全局画风提示词（英文更稳）" onChange={event => data.onField?.('globalStyle', event.target.value)} />
    <div className="node-params">
      <select value={data.ratio || DEFAULT_RATIO} aria-label="画面比例" onChange={event => data.onField?.('ratio', event.target.value)}>
        {RATIOS.map(([label]) => <option key={label} value={label}>{label}</option>)}
      </select>
      <input className="node-input" type="number" aria-label="基础随机种子" value={data.baseSeed ?? 0}
        onChange={event => data.onField?.('baseSeed', Number(event.target.value))} />
    </div>
  </>;
}

function LlmForm({ data }) {
  return <>
    <p className="node-meta"><span>模型</span><b>{data.model || '未指定'}</b></p>
    <textarea className="node-field nodrag nowheel" rows={4} value={data.systemPrompt || ''} aria-label="拆解指令"
      placeholder="拆解指令：输出 1 个角色描述词 + N 个分镜" onChange={event => data.onField?.('systemPrompt', event.target.value)} />
    <div className="node-out-list">
      <span>角色描述词</span>
      <span>分镜列表</span>
    </div>
  </>;
}

function FanoutForm({ data }) {
  const count = (data.inheritedCount ?? data.count ?? 0);
  return <>
    <p className="node-meta"><span>上游分镜数</span><b>{count} 个</b></p>
    <div className="node-out-list">
      <span>shot_id</span>
      <span>画面词</span>
      <span>运动词</span>
      <span>时长</span>
    </div>
    <p className="node-note">把分镜列表展开成四路批量信号，逐条喂给下游。</p>
  </>;
}

function AnchorForm({ data }) {
  const locked = Boolean(data.inputs?.characterPrompt);
  const chars = data.characters || [];
  const portraits = data.portraits || [];
  return <>
    <div className="node-params">
      <span className={`node-chip ${chars.length > 1 ? 'ok' : ''}`}>{chars.length} 个角色</span>
      <span className={`node-chip ${locked ? 'ok' : ''}`}>{locked ? `已锁定 · ${data.steps || 28} 步` : '待锁定角色'}</span>
    </div>
    <textarea className="node-field nodrag nowheel" rows={3} value={data.inputs?.characterPrompt || ''} aria-label="角色描述词"
      placeholder="主角描述词（运行剧本拆解会自动填入第一个角色）"
      onChange={event => data.onInput?.('characterPrompt', event.target.value)} />
    <textarea className="node-field nodrag nowheel" rows={2} value={data.extraPrompt || ''} aria-label="定妆附加词"
      placeholder="定妆附加词" onChange={event => data.onField?.('extraPrompt', event.target.value)} />
    <div className="node-params">
      <select value={data.ratio || '1:1'} aria-label="定妆图比例" onChange={event => data.onField?.('ratio', event.target.value)}>
        {RATIOS.map(([label]) => <option key={label} value={label}>{label}</option>)}
      </select>
    </div>
    {chars.length > 0 && <div className="portrait-list">
      {chars.map(item => <span key={item.id || item.name} className="portrait-chip">{item.name}</span>)}
    </div>}
    {portraits.length > 0 && <div className="portrait-grid">
      {portraits.map(item => <figure key={item.url}>
        <img src={item.url} alt={item.name} loading="lazy" />
        <figcaption>{item.name}</figcaption>
      </figure>)}
    </div>}
  </>;
}

function StoryboardForm({ data }) {
  const shots = data.shots || [];
  return <>
    <div className="node-params">
      <select value={data.ratio || DEFAULT_RATIO} aria-label="分镜比例" onChange={event => data.onField?.('ratio', event.target.value)}>
        {RATIOS.map(([label]) => <option key={label} value={label}>{label}</option>)}
      </select>
      <span className="node-chip">{shots.length} 镜 · 一致性 {data.consistencyWeight ?? 0.85}</span>
    </div>
    <div className="shot-grid">
      {shots.map(shot => <div key={shot.id} className="shot-cell editing">
        <b>{shot.id} <em className="shot-time">{shot.start ?? 0}s–{shot.end ?? ((shot.start ?? 0) + (shot.duration || 5))}s</em></b>
        <button type="button" className="shot-remove nodrag" aria-label={`删除 ${shot.id}`}
          onClick={event => { event.stopPropagation(); data.onShotRemove?.(shot.id); }}><X size={11} /></button>
        {shot.imageUrl
          ? <img className="shot-thumb" src={shot.imageUrl} alt={shot.id} loading="lazy" />
          : <span className="shot-thumb empty">待出图</span>}
        <textarea className="shot-input nodrag nowheel" rows={2} value={shot.visual || ''} aria-label={`${shot.id} 画面词`}
          placeholder="画面词" onChange={event => data.onShotChange?.(shot.id, 'visual', event.target.value)} />
        <input className="shot-input motion nodrag" value={shot.motion || ''} aria-label={`${shot.id} 运动词`}
          placeholder="运动词" onChange={event => data.onShotChange?.(shot.id, 'motion', event.target.value)} />
        <input className="shot-input line nodrag" value={shot.narration || ''} aria-label={`${shot.id} 旁白`}
          placeholder="旁白（可选）" onChange={event => data.onShotChange?.(shot.id, 'narration', event.target.value)} />
        <input className="shot-input line nodrag" value={shot.dialogue || ''} aria-label={`${shot.id} 对白`}
          placeholder="对白（可选）" onChange={event => data.onShotChange?.(shot.id, 'dialogue', event.target.value)} />
      </div>)}
    </div>
    <button type="button" className="shot-add nodrag" onClick={() => data.onShotAdd?.()}>＋ 加一镜</button>
    <p className="node-note">参考图批量生成是 Barrier 节点：等定妆锚点和扇出都就位才开始。</p>
  </>;
}

function HitlForm({ data }) {
  const shots = data.shots || [];
  const passed = shots.filter(shot => shot.ok).length;
  return <>
    <p className="node-note">{data.note || '逐镜审核：勾选才往下游走。'}</p>
    <div className="hitl-list">
      {shots.map(shot => <div key={shot.id} className={`hitl-row ${shot.ok ? 'on' : ''}`}>
        <span>{shot.id}</span>
        <i>{shot.id}</i>
        <FieldToggle label={shot.ok ? '通过' : '待审'} active={shot.ok} onChange={value => data.onShotToggle?.(shot.id, value)} />
      </div>)}
    </div>
    <p className="node-meta"><span>放行</span><b>{passed} / {shots.length}</b></p>
  </>;
}

function ConcatForm({ data }) {
  return <>
    <div className="node-params">
      <select value={data.transition || 'crossfade 0.2s'} aria-label="转场方式" onChange={event => data.onField?.('transition', event.target.value)}>
        <option value="crossfade 0.2s">crossfade 0.2s</option>
        <option value="cut">硬切</option>
        <option value="fade in">淡入</option>
        <option value="fade out">淡出</option>
      </select>
      <select value={data.format || 'mp4'} aria-label="输出格式" onChange={event => data.onField?.('format', event.target.value)}>
        <option value="mp4">mp4</option>
        <option value="mov">mov</option>
      </select>
    </div>
    <div className="node-params">
      <select value={data.speed || 1} aria-label="成片倍速" onChange={event => data.onField?.('speed', Number(event.target.value))}>
        <option value={1}>1x 原速</option>
        <option value={1.25}>1.25x</option>
        <option value={1.5}>1.5x</option>
        <option value={2}>2x</option>
      </select>
      <span className="node-chip">CRF {data.crf ?? 18}</span>
    </div>
    {data.resultUrl
      ? <div className="concat-result">
        <video src={data.resultUrl} controls preload="metadata" />
        <a href={data.resultUrl} target="_blank" rel="noreferrer">打开成片 · {data.segmentCount || 0} 段</a>
      </div>
      : <p className="node-note">汇合上游所有视频片段，用 ffmpeg 拼成一条成片。</p>}
  </>;
}

const PLANNER_FORMS = {
  context: ContextForm,
  llm_split: LlmForm,
  fanout: FanoutForm,
  anchor: AnchorForm,
  storyboard: StoryboardForm,
  hitl: HitlForm,
  concat: ConcatForm,
};

function PlannerNode({ id, data, selected }) {
  const meta = NODE_TYPES[data?.kind] || NODE_TYPES.llm_split;
  const Icon = meta.icon;
  const Form = PLANNER_FORMS[data.kind] || FanoutForm;
  const summary = data.text || '';
  return <article className={`canvas-node planner ${data.kind} ${selected ? 'selected' : ''}`}>
    <Handle type="target" position={Position.Left} id="in" className="node-port-handle in" />
    <header>
      <span className="node-glyph"><Icon size={14} /></span>
      <strong>{data.title || meta.label}</strong>
      <button type="button" className="node-remove nodrag" aria-label="删除节点"
        onClick={event => { event.stopPropagation(); data.onRemove?.(); }}><X size={13} /></button>
    </header>
    <p className="node-kicker">{meta.label} · class_type {id.split(':').pop()}</p>
    <Form data={data} />
    {summary && <p className="node-summary">{summary}</p>}
    <footer>
      <button type="button" className="node-run nodrag" onClick={event => { event.stopPropagation(); data.onRun?.(); }}>
        <Zap size={13} />{data.sim ? '再运行一次' : '运行'}
      </button>
      <span className={`node-chip ${data.sim ? 'ok' : ''}`}>
        {data.sim ? `已运行 · ${new Date(data.sim).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : '待运行'}
      </span>
      <small className={`node-status planner ${data.sim ? 'ok' : ''}`}>{data.sim ? '已标记' : '规划'}</small>
    </footer>
    <Handle type="source" position={Position.Right} id="out" className="node-port-handle out" />
  </article>;
}

const nodeTypes = { generation: GenerationNode, planner: PlannerNode };

const defaultEdgeOptions = {
  type: 'default',
  markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: EDGE_COLOR },
};

function CloudGlyph() {
  return <svg className="canvas-cloud" viewBox="0 0 120 54" width="120" height="54" fill="none" aria-hidden="true">
    <path d="M62 40c-10 0-17-7-17-15 0-7 5-12 12-13 2-7 8-11 15-11 9 0 16 7 17 15 6 1 10 6 10 12 0 7-6 12-13 12H62z" stroke="#d5a842" strokeWidth="2" strokeLinejoin="round" fill="rgba(248,237,206,0.35)" />
    <path d="M46 40c-5 0-9-3-10-8-1-4 1-8 4-10-1-2 0-4 1-5 3-4 8-5 11-2" stroke="#d5a842" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M74 46c14 0 26 3 34 8" stroke="#d5a842" strokeWidth="1.8" strokeLinecap="round" />
  </svg>;
}

function EmptyCanvas({ onAdd, onUpload, onCase }) {
  return <div className="canvas-empty">
    <CloudGlyph />
    <h2>从一句话，或一张图开始</h2>
    <p>写出提示词生成图片，再把图连进视频节点当首帧，一条流程往下跑</p>
    <button type="button" className="canvas-primary big" onClick={() => onAdd('image')}><Plus size={17} />新建图片生成节点</button>
    <div className="canvas-quick">
      {[['image', ImageIcon, '生成图片', '角色、场景、分镜图'], ['video', Video, '图生视频', '连一张图当首帧'], ['upload', Upload, '上传素材', '图片、视频、音频']].map(([type, Icon, title, desc]) => <button key={type} type="button" className="quick-card"
        onClick={() => (type === 'upload' ? onUpload() : onAdd(type))}>
        <Icon size={17} />
        <strong>{title}</strong>
        <span>{desc}</span>
      </button>)}
    </div>
    <button type="button" className="canvas-cases" onClick={onCase}>从案例开始 <ChevronRight size={14} /></button>
    <div className="canvas-hints">
      <span><b>双击空白</b>添加节点</span>
      <span><b>拖右侧圆点</b>连线</span>
      <span><b>右下角生成</b>调模型</span>
      <span><b>连接下游</b>自动排队</span>
    </div>
  </div>;
}

function TemplateGallery({ onPick, onClose }) {
  return <div className="template-mask" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="template-board" role="dialog" aria-modal="true" aria-label="画布模板">
      <header>
        <div>
          <h2>从模板开始</h2>
          <p>预连好的流水线，节点和连线直接落到画布上，再按你的剧本改参数</p>
        </div>
        <button type="button" className="template-close" aria-label="关闭" onClick={onClose}><X size={18} /></button>
      </header>
      <div className="template-list">
        {WORKFLOW_TEMPLATES.map(template => <button key={template.id} type="button" className="template-card" onClick={() => onPick(template.id)}>
          <div className="template-card-top">
            <strong>{template.name}</strong>
            {template.badge && <span className="template-badge">{template.badge}</span>}
          </div>
          <p>{template.summary}</p>
          <div className="template-figs">
            {template.nodes.map(node => <span key={node.id} className={`fig fig-${node.kind}`} title={NODE_TYPES[node.kind]?.label}>{NODE_TYPES[node.kind]?.label || node.kind}</span>)}
          </div>
          <footer>
            <span>{template.nodes.length} 个节点 · {template.edges.length} 条连线</span>
            <span className="template-go">使用 <ChevronRight size={13} /></span>
          </footer>
        </button>)}
      </div>
    </div>
  </div>;
}

function CanvasList({ canvases, loading, error, onCreate, onOpen, onDelete, onPickTemplate }) {
  return <main className="canvas-list-page">
    <div className="canvas-list-head">
      <h1>我的画布<span className="canvas-count">{canvases.length}</span></h1>
      <button type="button" className="canvas-templates-btn" onClick={onPickTemplate}><Layers size={16} />从模板开始</button>
    </div>
    {error && <div className="canvas-error">{error}</div>}
    {loading ? <div className="canvas-loading">正在读取画布…</div> : <div className="canvas-grid">
      <button type="button" className="canvas-new" onClick={onCreate}>
        <span className="new-plus"><Plus size={22} /></span>
        <strong>新建画布</strong>
        <p>写提示词生成图片，把图连进视频节点做首帧，像搭流程一样出片</p>
      </button>
      {canvases.map(canvas => <button type="button" key={canvas.id} className="canvas-card" onClick={() => onOpen(canvas.id)}>
        <span className="canvas-thumb">
          <span className="thumb-node" />
          <span className="thumb-count"><Grid2X2 size={12} />{canvas.nodes.length} 节点</span>
          <span className="thumb-delete" role="button" tabIndex={0} aria-label="删除画布"
            onClick={event => { event.stopPropagation(); onDelete(canvas.id); }}
            onKeyDown={event => { if (event.key === 'Enter') { event.stopPropagation(); onDelete(canvas.id); } }}><X size={13} /></span>
        </span>
        <strong>{canvas.name}</strong>
        <small>{miniTime(canvas.updated)}</small>
      </button>)}
    </div>}
  </main>;
}

function CanvasEditor({ canvas, onUpdateNodes, onExit }) {
  const flow = useReactFlow();
  const [nodes, setNodes] = useState(canvas.nodes);
  const [edges, setEdges] = useState(canvas.edges);
  const [zoom, setZoom] = useState(1);
  const [dots, setDots] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [toast, setToast] = useState('');
  const [command, setCommand] = useState('建 1 个场景生图连到 2 个分镜视频');
  const fileRef = useRef(null);
  const timers = useRef({});
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  const removeNode = useCallback(id => {
    clearInterval(timers.current[id]);
    delete timers.current[id];
    setNodes(list => list.filter(node => node.id !== id));
    setEdges(list => list.filter(edge => edge.source !== id && edge.target !== id));
  }, []);

  const patchNode = useCallback((id, patch) => {
    setNodes(list => list.map(node => (node.id === id ? { ...node, data: { ...node.data, ...patch } } : node)));
  }, []);

  /* ===== 提交生成：本地任务路由当前只接图片/视频；文字/音频节点仅作为提示词上游 ===== */
  const startGeneration = useCallback(async nodeId => {
    const byId = new Map(nodesRef.current.map(node => [node.id, node]));
    const node = byId.get(nodeId);
    if (!node) return;
    const plan = prepare(node, nodesRef.current, edgesRef.current);
    if (!plan.ok) { setToast(plan.reason); return; }

    const [ratioLabel, width, height] = ratioOf(node.data.ratio);
    const params = { width, height, ratio: ratioLabel };
    if (node.data.kind === 'video') {
      params.duration = Number(node.data.duration) || DEFAULT_DURATION;
      if (plan.images.length) params.image_urls = plan.images.slice(0, 2);
    } else {
      params.seed = -1;
    }

    patchNode(nodeId, { status: 'queued', progress: 3, error: '', lastPrompt: plan.prompt });

    let task;
    try {
      task = await api.createTask({
        type: node.data.kind,
        prompt: plan.prompt,
        params,
        runId: `canvas-${canvas.id}-${nodeId}-${Date.now()}`,
        projectId: canvas.projectId,
      });
      patchNode(nodeId, { taskId: task.id, status: task.status || 'queued', progress: task.progress || 3 });
    } catch (error) {
      patchNode(nodeId, { status: 'failed', error: error.message });
      setToast(`提交失败：${error.message}`);
      return;
    }

    // 轮询任务状态：后台 poller 负责真正调模型，这里只读进度
    clearInterval(timers.current[nodeId]);
    const tick = async () => {
      let current;
      try {
        current = await api.getTask(task.id);
      } catch {
        return;
      }
      const status = current.status;
      if (status === 'done') {
        clearInterval(timers.current[nodeId]);
        delete timers.current[nodeId];
        patchNode(nodeId, {
          status: 'done',
          progress: 100,
          resultUrl: current.resultUrl || '',
          resultType: current.type || node.data.kind,
          error: '',
          updatedAt: Date.now(),
        });
        setToast(`${NODE_TYPES[node.data.kind].label}已出片`);
      } else if (status === 'failed') {
        clearInterval(timers.current[nodeId]);
        delete timers.current[nodeId];
        patchNode(nodeId, { status: 'failed', progress: 100, error: current.error || '生成失败' });
      } else {
        patchNode(nodeId, { status, progress: current.progress || 0 });
      }
    };

    let index = 0;
    const pollEvery = 1600;
    const spin = () => {
      // 后台还没报进度时给一个爬升的乐观值，别让进度条一直停在 3%
      const node = nodesRef.current.find(item => item.id === nodeId);
      if (node && (node.data.status === 'queued' || node.data.status === 'running')) {
        const hint = PROGRESS_STEPS[Math.min(index, PROGRESS_STEPS.length - 1)];
        patchNode(nodeId, { progress: Math.max(node.data.progress || 0, hint) });
      }
      index += 1;
    };
    timers.current[nodeId] = setInterval(async () => {
      spin();
      await tick();
    }, pollEvery);
    await tick();
  }, [canvas.id, patchNode]);

  const cancelGeneration = useCallback(nodeId => {
    clearInterval(timers.current[nodeId]);
    delete timers.current[nodeId];
    patchNode(nodeId, { status: 'idle', progress: 0 });
    setToast('已停止观测这个节点（后台任务如已提交仍会跑完并计费）');
  }, [patchNode]);

  // 下游自动排队：某个节点出片后，下游「草稿」状态的节点自动开始
  const previousStatus = useRef(new Map(nodes.map(node => [node.id, node.data.status])));
  useEffect(() => {
    const fresh = [];
    for (const node of nodes) {
      const before = previousStatus.current.get(node.id);
      if (before === 'queued' || before === 'running') {
        if (node.data.status === 'done' && !fresh.includes(node.id)) fresh.push(node.id);
      }
    }
    previousStatus.current = new Map(nodes.map(node => [node.id, node.data.status]));
    if (!fresh.length) return;
    for (const id of fresh) {
      for (const edge of edgesRef.current.filter(item => item.source === id)) {
        const target = nodesRef.current.find(item => item.id === edge.target);
        if (target && isGeneratable(target.data.kind) && (!target.data.status || target.data.status === 'idle')) {
          startGeneration(target.id);
        }
      }
    }
  }, [nodes, startGeneration]);

  /* ===== 画布事件 ===== */
  const upstreamNodes = useCallback(nodeId => upstreamOf(nodeId, edgesRef.current)
    .map(edge => nodesRef.current.find(item => item.id === edge.source))
    .filter(Boolean), []);

  // 轮询一个后端任务直到出结果（画布内多个节点复用）
  const awaitTask = async (taskId, onTick) => {
    for (let index = 0; index < 400; index += 1) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      let current;
      try { current = await api.getTask(taskId); } catch { continue; }
      onTick?.(current);
      if (current.status === 'done') return current;
      if (current.status === 'failed') throw new Error(current.error || '生成失败');
    }
    throw new Error('等待任务超时');
  };

  // 沿连线做 BFS：模板里 拆解 → 扇出 → 分镜 是隔了一层的，直接下游找不到
  const branchNodes = useCallback((nodeId, direction) => {
    const result = [];
    const seen = new Set([nodeId]);
    const queue = [nodeId];
    while (queue.length) {
      const current = queue.shift();
      const nextEdges = edgesRef.current.filter(edge => (direction === 'down' ? edge.source : edge.target) === current);
      for (const edge of nextEdges) {
        const nextId = direction === 'down' ? edge.target : edge.source;
        if (seen.has(nextId)) continue;
        seen.add(nextId);
        const node = nodesRef.current.find(item => item.id === nextId);
        if (node) { result.push(node); queue.push(node.id); }
      }
    }
    return result;
  }, []);

  const styleOf = useCallback(nodeId => {
    const ctx = branchNodes(nodeId, 'up').find(item => item.data?.kind === 'context');
    return ctx?.data?.globalStyle || '';
  }, [branchNodes]);

  const scriptOf = useCallback(nodeId => {
    const ctx = branchNodes(nodeId, 'up').find(item => item.data?.kind === 'context');
    return ctx?.data?.rawScript || '';
  }, [branchNodes]);

  // 剧本拆解：调 LLM，拿回「角色 + 带时间戳的分镜」，并推给下游定妆/分镜节点
  const runSplit = useCallback(async nodeId => {
    const node = nodesRef.current.find(item => item.id === nodeId);
    if (!node) return;
    const data = node.data || {};
    const script = scriptOf(nodeId) || data.rawScript || '';
    if (!script.trim()) { setToast('上游「全局配置」里还没有剧本'); return; }

    patchNode(nodeId, { status: 'running', progress: 10, error: '' });
    try {
      const result = await api.pipelineSplit({
        script,
        style: styleOf(nodeId) || data.globalStyle || '',
        instruction: data.systemPrompt || '',
        ratio: data.ratio || DEFAULT_RATIO,
      });
      patchNode(nodeId, {
        status: 'done', progress: 100, sim: Date.now(), error: '',
        characters: result.characters,
        shots: result.shots,
        model: result.model,
        totalDuration: result.totalDuration,
      });
      for (const target of branchNodes(nodeId, 'down')) {
        if (target.data?.kind === 'anchor') {
          patchNode(target.id, {
            characters: result.characters,
            inputs: { ...(target.data.inputs || {}), characterPrompt: result.characters[0]?.prompt || '' },
          });
        }
        if (target.data?.kind === 'storyboard') {
          patchNode(target.id, { shots: result.shots });
        }
      }
      setToast(`拆解完成：${result.characters.length} 个角色 · ${result.shots.length} 个分镜 · 共 ${result.totalDuration}s（已同步到下游）`);
    } catch (error) {
      patchNode(nodeId, { status: 'failed', progress: 100, error: error.message });
      setToast(`拆解失败：${error.message}`);
    }
  }, [branchNodes, patchNode, scriptOf, styleOf]);

  // 定妆：每个角色一次 Seedream 调用（本场两位主角 = 两次）
  const runPortraits = useCallback(async nodeId => {
    const node = nodesRef.current.find(item => item.id === nodeId);
    if (!node) return;
    const data = node.data || {};
    let characters = Array.isArray(data.characters) && data.characters.length
      ? data.characters
      : [{ id: 'char-1', name: '主角', prompt: data.inputs?.characterPrompt || '' }];
    characters = characters.filter(item => String(item.prompt || '').trim()).slice(0, 4);
    if (!characters.length) { setToast('还没有角色描述：先运行剧本拆解，或手填角色描述词'); return; }

    const style = styleOf(nodeId);
    patchNode(nodeId, { status: 'running', progress: 4, portraits: [], error: '' });
    const portraits = [];
    try {
      for (const [index, character] of characters.entries()) {
        const prompt = [style, character.prompt, 'character sheet, front view, neutral background, clear facial features']
          .filter(Boolean).join('，');
        const task = await api.createTask({ type: 'image', prompt, params: { width: 1024, height: 1024, ratio: '1:1' }, projectId: canvas.projectId });
        const done = await awaitTask(task.id);
        portraits.push({ name: character.name, url: done.resultUrl, taskId: task.id });
        patchNode(nodeId, { portraits: [...portraits], progress: Math.round(((index + 1) / characters.length) * 100) });
      }
      patchNode(nodeId, { status: 'done', progress: 100, sim: Date.now(), portraits });
      setToast(`定妆完成：${portraits.length} 个角色，共 ${portraits.length} 次图片调用`);
    } catch (error) {
      patchNode(nodeId, { status: 'failed', progress: 100, error: error.message, portraits });
      setToast(`定妆失败：${error.message}`);
    }
  }, [awaitTask, patchNode, styleOf]);

  // 分镜参考图：每镜一次 Seedream 调用
  const runStoryboard = useCallback(async nodeId => {
    const node = nodesRef.current.find(item => item.id === nodeId);
    if (!node) return;
    let shots = Array.isArray(node.data?.shots) ? node.data.shots : [];
    if (!shots.length) { setToast('还没有分镜：先运行剧本拆解，拿到带时间戳的镜头'); return; }
    // 已经有图的再点一次＝带着定妆参考重画一遍
    if (shots.every(shot => shot.imageUrl)) shots = shots.map(shot => ({ ...shot, imageUrl: '' }));
    const style = styleOf(nodeId);
    // 上游定妆：既拿图（参考图）也拿文字描述，两个一起才能锁住角色
    const anchor = branchNodes(nodeId, 'up').find(item => item.data?.kind === 'anchor');
    const portraits = anchor?.data?.portraits || [];
    const cast = (anchor?.data?.characters || []).filter(item => item.prompt);
    const castText = cast.length
      ? `角色设定（必须严格照此绘制，保持同一张脸、同一套衣服）：${cast.map(item => `${item.name}——${item.prompt}`).join('；')}`
      : '';
    // 名字做二元组匹配：像「小男孩小军」也能被「男孩」这种画面描述命中
    const nameHit = (name, text) => {
      const chars = String(name || '');
      const grams = new Set();
      for (let i = 0; i < chars.length - 1; i += 1) grams.add(chars.slice(i, i + 2));
      return [...grams].some(gram => gram.length >= 2 && text.includes(gram));
    };
    patchNode(nodeId, { status: 'running', progress: 4, error: '' });
    try {
      for (const [index, shot] of shots.entries()) {
        if (shot.imageUrl) continue;
        const inShot = cast.filter(item => nameHit(item.name, shot.visual || ''));
        const shotCast = inShot.length ? inShot : cast;
        const shotCastText = shotCast.length
          ? `角色设定（必须严格照此绘制，保持同一张脸、同一套衣服）：${shotCast.map(item => `${item.name}——${item.prompt}`).join('；')}`
          : castText;
        const prompt = [style, shotCastText, shot.visual, '保持与参考图同一角色，长相、发型、服装一致', 'cinematic still, 16:9']
          .filter(Boolean).join('，');
        // 画面里点了名的角色优先，都没点名就把两张定妆照都带上（Seedream 最多 2 张参考图）
        const matchedPortraits = portraits.filter(item => shotCast.some(person => person.name === item.name));
        const refs = (matchedPortraits.length ? matchedPortraits : portraits).slice(0, 2);
        const params = { width: 1280, height: 720, ratio: '16:9' };
        if (refs.length) params.image_refs = refs.map(item => item.url);
        const task = await api.createTask({ type: 'image', prompt, params, projectId: canvas.projectId });
        const done = await awaitTask(task.id);
        shots = shots.map(item => (item.id === shot.id ? { ...item, imageUrl: done.resultUrl, taskId: task.id } : item));
        patchNode(nodeId, { shots, progress: Math.round(((index + 1) / shots.length) * 100) });
      }
      patchNode(nodeId, { status: 'done', progress: 100, sim: Date.now() });
      setToast(`分镜图完成：${shots.filter(item => item.imageUrl).length} 张`);
    } catch (error) {
      patchNode(nodeId, { status: 'failed', progress: 100, error: error.message });
      setToast(`分镜出图失败：${error.message}`);
    }
  }, [awaitTask, branchNodes, patchNode, styleOf]);

  // 多段视频：上游分镜每镜一段（Seedance 首帧图生视频）
  const runSegments = useCallback(async nodeId => {
    const storyboard = branchNodes(nodeId, 'up').find(item => item.data?.kind === 'storyboard');
    const shots = (storyboard?.data?.shots || []).filter(shot => shot.imageUrl);
    if (!shots.length) { setToast('上游分镜还没有出图：先运行「分镜批量」'); return; }

    patchNode(nodeId, { status: 'running', progress: 3, segments: [], error: '' });
    const segments = [];
    try {
      // 先把每镜的任务都提交出去（并行排队），再统一轮询，避免一段一段串行等
      const pendingTasks = [];
      for (const [index, shot] of shots.entries()) {
        const task = await api.createTask({
          type: 'video',
          projectId: canvas.projectId,
          prompt: `画面：${shot.visual || ''}；动作与镜头：${shot.motion || '自然延续'}；真实时间流速，人物动作自然，不要慢动作、不要慢放`,
          params: {
            duration: Math.min(10, Math.max(3, Number(shot.duration) || 5)),
            image_urls: [shot.imageUrl],
            ratio: '16:9',
          },
        });
        pendingTasks.push({ shot, taskId: task.id });
        patchNode(nodeId, { progress: 3 + Math.round(((index + 1) / shots.length) * 12) });
      }
      setToast(`已提交 ${pendingTasks.length} 段视频任务，等待出片…`);

      let queue = pendingTasks;
      for (let round = 0; round < 300 && queue.length; round += 1) {
        await new Promise(resolve => setTimeout(resolve, 4000));
        const rest = [];
        for (const item of queue) {
          let current = null;
          try { current = await api.getTask(item.taskId); } catch { rest.push(item); continue; }
          if (current.status === 'done') {
            segments.push({ shotId: item.shot.id, url: current.resultUrl, taskId: item.taskId });
            patchNode(nodeId, {
              segments: [...segments],
              progress: 15 + Math.round((segments.length / pendingTasks.length) * 85),
            });
          } else if (current.status === 'failed') {
            throw new Error(`${item.shot.id} 生成失败：${current.error || '未知错误'}`);
          } else {
            rest.push(item);
          }
        }
        queue = rest;
      }
      if (queue.length) throw new Error(`还有 ${queue.length} 段没有出结果，稍后重试`);
      patchNode(nodeId, { status: 'done', progress: 100, sim: Date.now(), segments });
      setToast(`已生成 ${segments.length} 段视频，去「成片合成」拼接`);
    } catch (error) {
      patchNode(nodeId, { status: 'failed', progress: 100, error: error.message, segments });
      setToast(`分段出片失败：${error.message}`);
    }
  }, [branchNodes, patchNode]);

  // 成片合成：ffmpeg 拼接上游所有片段
  const runConcat = useCallback(async nodeId => {
    const ups = branchNodes(nodeId, 'up');
    const videoNode = ups.find(item => item.data?.kind === 'video' && (item.data?.segments || []).length);
    const urls = videoNode
      ? [...videoNode.data.segments]
        .sort((a, b) => Number(String(a.shotId).replace(/\D/g, '')) - Number(String(b.shotId).replace(/\D/g, '')))
        .map(segment => segment.url)
      : ups.filter(item => item.data?.resultUrl && /\.mp4(\?|$)/i.test(item.data.resultUrl)).map(item => item.data.resultUrl);
    if (!urls.length) { setToast('上游还没有视频片段：先运行「视频生成」'); return; }

    patchNode(nodeId, { status: 'running', progress: 10, error: '' });
    try {
      const speed = Number(node.data?.speed) || 1;
      const result = await api.pipelineConcat({ videoUrls: urls, speed });
      patchNode(nodeId, { status: 'done', progress: 100, sim: Date.now(), resultUrl: result.resultUrl, segmentCount: result.count, speed: result.speed });
      setToast(`拼接完成：${result.count} 段 → 一条成片${result.speed && result.speed !== 1 ? `（${result.speed}x）` : ''}`);
    } catch (error) {
      patchNode(nodeId, { status: 'failed', progress: 100, error: error.message });
      setToast(`拼接失败：${error.message}`);
    }
  }, [branchNodes, patchNode]);

  // 统一「运行」：图片/视频走生成，流程节点各自跑真实能力
  const runNode = useCallback(nodeId => {
    const node = nodesRef.current.find(item => item.id === nodeId);
    if (!node) return;
    const data = node.data || {};
    const { kind } = data;

    if (kind === 'llm_split') { runSplit(nodeId); return; }
    if (kind === 'anchor') { runPortraits(nodeId); return; }
    if (kind === 'storyboard') { runStoryboard(nodeId); return; }
    if (kind === 'concat') { runConcat(nodeId); return; }
    if (kind === 'video') {
      const storyboard = branchNodes(nodeId, 'up').find(item => item.data?.kind === 'storyboard');
      if ((storyboard?.data?.shots || []).some(shot => shot.imageUrl)) { runSegments(nodeId); return; }
    }
    if (isGeneratable(kind)) { startGeneration(nodeId); return; }

    const problem = (() => {
      switch (kind) {
        case 'text': return textOf(node).trim() ? '' : '文本节点还是空的，先写点内容';
        case 'audio': return textOf(node).trim() ? '' : '音频节点先写台词或音效描述';
        case 'context': return data.rawScript?.trim() || data.globalStyle?.trim() ? '' : '全局配置至少要填剧本或画风';
        case 'hitl': return (data.shots || []).length ? '' : '还没有分镜可以审';
        default: return '';
      }
    })();
    if (problem) { setToast(problem); return; }

    patchNode(nodeId, { sim: Date.now(), status: 'done', error: '' });
    setToast(`「${data.title || NODE_TYPES[kind].label}」已运行（该节点只做校验/标记）`);
  }, [branchNodes, patchNode, runConcat, runPortraits, runSegments, runSplit, runStoryboard, startGeneration]);

  const nodeData = useMemo(() => ({
    onRemove: removeNode,
    onGenerate: startGeneration,
    onCancel: cancelGeneration,
    onRun: runNode,
    onText: (id, text) => patchNode(id, { text }),
    onRatio: (id, ratio) => patchNode(id, { ratio }),
    onDuration: (id, duration) => patchNode(id, { duration }),
    // 模板流程节点的字段编辑
    onField: (id, key, value) => patchNode(id, { [key]: value }),
    onInput: (id, key, value) => {
      const node = nodesRef.current.find(item => item.id === id);
      patchNode(id, { inputs: { ...(node?.data?.inputs || {}), [key]: value } });
    },
    onShotToggle: (id, shotId, ok) => {
      const node = nodesRef.current.find(item => item.id === id);
      const shots = (node?.data?.shots || []).map(shot => (shot.id === shotId ? { ...shot, ok } : shot));
      patchNode(id, { shots });
      setToast(ok ? `${shotId} 已放行，可往下游走` : `${shotId} 打回，下游暂不接收`);
    },
    // 分镜文案直接改：画面词 / 运动词，改完自动落库
    onShotChange: (id, shotId, key, value) => {
      const node = nodesRef.current.find(item => item.id === id);
      const shots = (node?.data?.shots || []).map(shot => (shot.id === shotId ? { ...shot, [key]: value } : shot));
      patchNode(id, { shots });
    },
    onShotAdd: id => {
      const node = nodesRef.current.find(item => item.id === id);
      const shots = node?.data?.shots || [];
      patchNode(id, { shots: [...shots, { id: `shot-${shots.length + 1}`, visual: '', motion: '', duration: 5 }] });
    },
    onShotRemove: (id, shotId) => {
      const node = nodesRef.current.find(item => item.id === id);
      patchNode(id, { shots: (node?.data?.shots || []).filter(shot => shot.id !== shotId) });
    },
  }), [removeNode, startGeneration, cancelGeneration, patchNode, runNode]);

  // 图形结构全部由 React Flow 驱动的 onNodesChange / onEdgesChange 更新
  const onNodesChange = useCallback(changes => setNodes(list => applyNodeChanges(changes, list)), []);
  const onEdgesChange = useCallback(changes => setEdges(list => applyEdgeChanges(changes, list)), []);
  const onConnect = useCallback(connection => setEdges(list => addEdge({
    ...connection,
    id: `e-${connection.source}-${connection.target}-${Date.now().toString(36)}`,
  }, list)), []);

  // 交给 ReactFlow 的节点数据要缓存：每次渲染都造新对象，会让它内部同步 props 的 effect 反复触发
  // 并把 nodeId 绑进回调：节点组件和表单只拿到 data，不知道自己的 id
  const renderNodes = useMemo(() => nodes.map(node => {
    const bind = fn => (...args) => fn?.(node.id, ...args);
    return {
      ...node,
      data: {
        ...node.data,
        ...nodeData,
        onRemove: () => nodeData.onRemove?.(node.id),
        onGenerate: bind(nodeData.onGenerate),
        onCancel: bind(nodeData.onCancel),
        onRun: bind(nodeData.onRun),
        onText: bind(nodeData.onText),
        onRatio: bind(nodeData.onRatio),
        onDuration: bind(nodeData.onDuration),
        onField: bind(nodeData.onField),
        onInput: bind(nodeData.onInput),
        onShotToggle: bind(nodeData.onShotToggle),
        onShotChange: bind(nodeData.onShotChange),
        onShotAdd: bind(nodeData.onShotAdd),
        onShotRemove: bind(nodeData.onShotRemove),
      },
    };
  }), [nodes, nodeData]);

  // 选中态由 React Flow 打到 DOM 的 .selected 上，这里只补箭头颜色
  const styledEdges = useMemo(() => edges.map(edge => ({
    ...edge,
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: EDGE_COLOR },
  })), [edges]);

  // 只有结构性变化 / 生成结果变化才回写；选中、拖框、测量尺寸等临时状态不写库
  const structure = useMemo(() => JSON.stringify({
    nodes: plainNodes(nodes).map(node => ({
      ...node,
      data: { ...node.data, status: persistStatus(node.data.status) },
    })),
    edges: plainEdges(edges),
  }), [nodes, edges]);
  const onUpdateRef = useRef(onUpdateNodes);
  onUpdateRef.current = onUpdateNodes;
  // 用 ref 记录上次落库的快照（赋值表达式有返回值，不能写成 effect 的清理函数）
  // 注意：这里比的是 React Flow 结构，落库格式由上层 persist 统一转换，避免二次序列化丢 kind
  const savedRef = useRef(JSON.stringify({
    nodes: plainNodes(canvas.nodes || []).map(node => ({
      ...node,
      data: { ...node.data, status: persistStatus(node.data?.status) },
    })),
    edges: plainEdges(canvas.edges || []),
  }));
  const saveTimer = useRef(null);

  useEffect(() => {
    if (savedRef.current === structure) return;
    savedRef.current = structure;
    // 拖动时结构每秒变几十次，攒 400ms 再交给上层落库
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      // 交给上层的是 React Flow 结构（含 data.kind），由上层统一转成落库格式。
      // 以前这里先 writeGraph 传下去，上层再 writeGraph 一次，第二次拿到的节点没有 data.kind，
      // 于是所有节点都被写成 type='video'，回来就全变成「视频生成」。
      onUpdateRef.current(JSON.parse(structure));
    }, 400);
  }, [structure]);

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const openPicker = useCallback(() => fileRef.current?.click(), []);

  const addNode = (type = 'image', point) => {
    const position = point || flow.screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    // 连续添加时按槽位错开，避免叠在一起
    const slots = [[0, 0], [285, 0], [-285, 0], [0, 250], [285, 250], [-285, 250]];
    const slot = point ? [0, 0] : slots[nodes.length % slots.length];
    const node = makeNode(type, position.x - NODE_WIDTH / 2 + slot[0], position.y - 80 + slot[1]);
    setNodes(list => [...list, node]);
    setMenuOpen(false);
    setContextMenu(null);
    return node.id;
  };

  // 案例：一个生图节点 + 两个分镜视频节点，连线后一键就能整条跑下来
  const addCase = () => {
    const base = flow.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const image = makeNode('image', base.x - 640, base.y - 60, '写实水墨风，青衫剑客与手持方天画戟的女战士在古寺山门前对峙，墨色远山与薄雾');
    const shot1 = makeNode('video', base.x - 300, base.y - 260, '分镜 1：剑客按剑逼近，女战士横戟，雾气在两人之间流动');
    const shot2 = makeNode('video', base.x - 300, base.y + 40, '分镜 2：剑戟相交，墨色飞白炸开，衣摆与发带翻飞');
    setNodes(list => [...list, image, shot1, shot2]);
    setEdges(list => [...list,
      { id: `e-${image.id}-${shot1.id}`, source: image.id, target: shot1.id },
      { id: `e-${image.id}-${shot2.id}`, source: image.id, target: shot2.id },
    ]);
    setToast('已按案例建好 1 个生图 + 2 个分镜，先去生图节点点「生成」');
    setTimeout(() => flow.fitView({ padding: 0.25, duration: 280, maxZoom: 1 }), 60);
  };

  /* ===== 模板：插入一整张预连好的流程图 ===== */
  const insertTemplate = templateId => {
    const template = templateById(templateId);
    if (!template) return;
    // 已有节点时往右侧错开，避免和现有图重叠
    const origin = nodes.length ? { x: (Math.max(...nodes.map(node => node.position.x)) || 0) + 420, y: TEMPLATE_OFFSET.y } : TEMPLATE_OFFSET;
    const graph = templateNodes(template, origin, Date.now().toString(36).slice(-4));
    setNodes(list => [...list, ...graph.nodes]);
    setEdges(list => [...list, ...graph.edges]);
    setShowTemplates(false);
    setToast(`已插入模板「${template.name}」：${template.nodes.length} 个节点、${template.edges.length} 条连线，先改左上角的剧本和画风`);
    setTimeout(() => flow.fitView({ padding: 0.18, duration: 300, maxZoom: 1 }), 80);
  };

  const tidy = () => {
    if (!nodes.length) { setToast('画布还是空的，先加个节点吧'); return; }
    setNodes(list => list.map((node, index) => ({ ...node, position: { x: 60 + (index % 3) * 330, y: 60 + Math.floor(index / 3) * 300 } })));
    setToast('已整理画布');
    setTimeout(() => flow.fitView({ padding: 0.2, duration: 260 }), 30);
  };

  const runCommand = () => {
    if (!command.trim()) return;
    addNode('image');
    setToast(`已按指令创建节点：${command.trim()}`);
  };

  const pickFile = event => {
    const file = event.target.files?.[0];
    if (!file) return;
    // 模型调用只接受图片/视频任务，其他文件当作素材笔记挂在图片节点里
    const id = addNode('image');
    patchNode(id, { text: textOf({ data: { text: `素材：${file.name}` } }), resultUrl: '', status: 'idle' });
    setToast(`已放入素材 ${file.name}（上传接口就绪前先记成文本）`);
    event.target.value = '';
  };

  const onStageContextMenu = event => {
    if (event.target.closest('.react-flow__node')) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    setMenuOpen(false);
    setContextMenu({
      x: Math.min(event.clientX - bounds.left, bounds.width - 190),
      y: Math.min(event.clientY - bounds.top, bounds.height - 390),
      position: flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
    });
  };

  const shots = nodes.filter(node => node.data?.status === 'done').length;
  const running = nodes.filter(node => node.data?.status === 'queued' || node.data?.status === 'running').length;

  return <div className="canvas-editor">
    <header className="canvas-topbar">
      <button type="button" className="canvas-back" onClick={onExit} aria-label="返回画布列表"><ArrowLeft size={19} /></button>
      <div className="canvas-title">
        <h1>{canvas.name}</h1>
        <i className="canvas-live" />
        <span>{nodes.length} 个节点 · {edges.length} 条连线 · {running ? `${running} 个生成中` : `${shots} 条产出`}</span>
      </div>
      <div className="canvas-top-actions">
        <button type="button" className="canvas-ghost" onClick={() => setShowTemplates(true)}><Layers size={16} />模板</button>
        <div className="menu-anchor">
          <button type="button" className="canvas-primary" onClick={() => setMenuOpen(open => !open)}><Plus size={17} />添加节点</button>
          {menuOpen && <div className="node-menu">
            {Object.entries(NODE_TYPES).map(([type, meta]) => {
              const Icon = meta.icon;
              return <button type="button" key={type} onClick={() => addNode(type)}><Icon size={15} />{meta.label}节点</button>;
            })}
          </div>}
        </div>
        <button type="button" className="canvas-ghost" onClick={() => setToast('已开始打包画布产物（演示）')}><Download size={16} />下载全部产物</button>
        <button type="button" className="canvas-ghost" onClick={() => flow.fitView({ padding: 0.2, duration: 260 })}><Maximize2 size={16} />适应视图</button>
      </div>
    </header>

    <div className="canvas-body">
      <nav className="canvas-rail" aria-label="画布工具">
        {railTools.map(([type, Icon, title]) => <button type="button" key={type} className="rail-btn" title={title} onClick={() => addNode(type)}><Icon size={18} /></button>)}
        <span className="rail-divider" />
        <button type="button" className="rail-btn" title="文件"><Folder size={18} /></button>
        <button type="button" className="rail-btn" title="上传素材" onClick={openPicker}><Upload size={18} /></button>
        <span className="rail-label">选中后</span>
        {railAfter.map(([Icon, title]) => <span key={title} className="rail-btn muted" title={`${title}（演示占位）`}><Icon size={18} /></span>)}
      </nav>

      <section className={`canvas-stage ${dots ? 'with-dots' : ''}`} onContextMenu={onStageContextMenu}>
        {contextMenu && <div className="node-menu canvas-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          {Object.entries(NODE_TYPES).map(([type, meta]) => {
            const Icon = meta.icon;
            return <button type="button" key={type} onClick={() => { addNode(type, contextMenu.position); setContextMenu(null); }}><Icon size={15} />{meta.label}节点</button>;
          })}
        </div>}
        <ReactFlow
          id="huimeng-canvas"
          nodes={renderNodes}
          edges={styledEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onPaneClick={() => setContextMenu(null)}
          selectionOnDrag
          selectionMode={SelectionMode.Partial}
          panOnDrag={[1]}
          onMove={(_, viewport) => setZoom(viewport.zoom)}
          defaultEdgeOptions={defaultEdgeOptions}
          connectionLineStyle={{ stroke: EDGE_COLOR_ACTIVE, strokeWidth: 1.8, strokeDasharray: '5 4' }}
          zoomOnDoubleClick={false}
          minZoom={0.3}
          maxZoom={2}
          fitView
          fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
        >
          {dots
            ? <Background variant="dots" gap={22} size={1.2} color="var(--rf-dot)" />
            : <Background variant="dots" gap={0} size={0} color="transparent" />}
          <MiniMap className="canvas-minimap" pannable zoomable nodeStrokeWidth={2}
            nodeColor={node => (node.data?.kind === 'video' ? '#2f6f66' : node.data?.kind === 'image' ? '#3f6f8f' : node.data?.kind === 'audio' ? '#6f5a8f' : '#8a6d3b')} />
          {!nodes.length && <EmptyCanvas onAdd={addNode} onUpload={openPicker} onCase={addCase} />}
        </ReactFlow>
      </section>
    </div>

    <div className="canvas-bottom">
      <div className="canvas-tools">
        <button type="button" className="tool-chip" onClick={tidy}><LayoutGrid size={16} />整理画布</button>
        <button type="button" className="tool-chip" onClick={() => setShowTemplates(true)}><Layers size={16} />模板</button>
        <span className="tool-sep" />
        <span className="tool-icon muted" title="语言（演示占位）"><Globe size={17} /></span>
        <span className="tool-icon muted" title="预览（演示占位）"><Eye size={17} /></span>
        <button type="button" className={`tool-icon ${dots ? 'on' : ''}`} title="切换网格" onClick={() => setDots(value => !value)}><Grid2X2 size={17} /></button>
        <button type="button" className="tool-icon" title="添加图片节点" onClick={() => addNode('image')}><Type size={17} /></button>
      </div>

      <div className="canvas-prompt">
        <div className="prompt-pill">
          <i className="prompt-dot" />
          <input value={command} onChange={event => setCommand(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') runCommand(); }}
            aria-label="对画布说话" placeholder="可以尝试对我说：「建 1 个场景生图连到 2 个分镜视频」" />
          <button type="button" className="prompt-clear" aria-label="清空" onClick={() => setCommand('')}><X size={14} /></button>
        </div>
        <button type="button" className="canvas-zap" aria-label="执行指令" onClick={runCommand}><Zap size={20} /></button>
      </div>

      <div className="canvas-zoom">
        <button type="button" aria-label="缩小" onClick={() => flow.zoomOut({ duration: 160 })}><Minus size={15} /></button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" aria-label="放大" onClick={() => flow.zoomIn({ duration: 160 })}><Plus size={15} /></button>
        <button type="button" className="zoom-help" aria-label="快捷键说明" title="双击空白添加节点 · 拖动空白平移 · 滚轮缩放 · 拖右侧圆点连线" onClick={() => setToast('双击空白添加节点 · 拖动空白平移 · 滚轮缩放 · Delete 删除选中节点/连线')}>?</button>
      </div>
    </div>

    <input ref={fileRef} type="file" accept="image/*,video/*,audio/*" hidden onChange={pickFile} />
    {showTemplates && <TemplateGallery onPick={insertTemplate} onClose={() => setShowTemplates(false)} />}
    {toast && <div className="canvas-toast">{toast}</div>}
  </div>;
}

export default function CanvasPage({ projectId }) {
  const [canvases, setCanvases] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [galleryOpen, setGalleryOpen] = useState(false);
  const timers = useRef({});
  const active = canvases.find(canvas => canvas.id === openId) || null;

  // 首次加载：后端画布列表
  useEffect(() => {
    let cancelled = false;
    api.list('canvases', 100, projectId)
      .then(data => {
        if (cancelled) return;
        const loaded = data.items.map(item => ({
          id: item.id,
          name: item.name || '未命名画布',
          projectId: item.projectId,
          ...readGraph(item),
          updated: item.updatedAt || Date.now(),
        }));
        setCanvases(loaded);

        // 旧数据里节点 type 被写成 video、kind 丢失，甚至坐标全变成 (0,0)：
        // 显示层已经能推断并重排，这里顺手把修正后的文档静默写回，避免下次又被旧格式覆盖
        for (const item of data.items) {
          const graph = readGraph(item);
          const stale = (item.nodes || []).some((raw, index) => raw?.type !== graph.nodes[index]?.data.kind);
          const overlapped = hasOverlap((item.nodes || []).map(normalizeNode));
          if (stale || overlapped) {
            api.patch('canvases', item.id, { name: item.name, ...writeGraph(graph) }).catch(() => {});
          }
        }
      })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
      Object.values(timers.current).forEach(clearTimeout);
    };
  }, [projectId]);

  // 节点变动后 500ms 落库，避免拖动时疯狂写库
  const persist = canvas => {
    clearTimeout(timers.current[canvas.id]);
    timers.current[canvas.id] = setTimeout(() => {
      api.patch('canvases', canvas.id, { name: canvas.name, ...writeGraph(canvas) }).catch(() => {});
    }, 500);
  };

  const updateNodes = useCallback((canvasId, graph) => setCanvases(list => list.map(canvas => {
    if (canvas.id !== canvasId) return canvas;
    const next = { ...canvas, ...graph, updated: Date.now() };
    persist(next);
    return next;
  })), []);

  const createCanvas = async () => {
    try {
      const doc = await api.create('canvases', { name: `未命名画布 ${canvases.length + 1}`, projectId, ...writeGraph({ nodes: [], edges: [] }) });
      setCanvases(list => [{ id: doc.id, name: doc.name, projectId, nodes: [], edges: [], updated: doc.updatedAt }, ...list]);
      setOpenId(doc.id);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteCanvas = async id => {
    try {
      await api.remove('canvases', id);
      setCanvases(list => list.filter(canvas => canvas.id !== id));
      if (openId === id) setOpenId(null);
    } catch (err) {
      setError(err.message);
    }
  };

  // 从模板新建：直接把整张流程图当成新画布落库，省得用户再手动插一次
  const createFromTemplate = async templateId => {
    const template = templateById(templateId);
    if (!template) return;
    setGalleryOpen(false);
    try {
      const graph = templateNodes(template, TEMPLATE_OFFSET);
      const doc = await api.create('canvases', {
        name: template.name,
        projectId,
        template: template.id,
        ...writeGraph({ nodes: graph.nodes, edges: graph.edges }),
      });
      setCanvases(list => [{
        id: doc.id,
        name: doc.name,
        projectId,
        ...readGraph(doc),
        updated: doc.updatedAt || Date.now(),
      }, ...list]);
      setOpenId(doc.id);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  return active
    ? <ReactFlowProvider key={active.id}>
      <CanvasEditor canvas={active} onUpdateNodes={graph => updateNodes(active.id, graph)} onExit={() => setOpenId(null)} />
    </ReactFlowProvider>
    : <>
      <CanvasList canvases={canvases} loading={loading} error={error} onCreate={createCanvas} onOpen={setOpenId}
        onDelete={deleteCanvas} onPickTemplate={() => setGalleryOpen(true)} />
      {galleryOpen && <TemplateGallery onPick={createFromTemplate} onClose={() => setGalleryOpen(false)} />}
    </>;
}
