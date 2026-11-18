import { useEffect, useState } from 'react';
import { ChartNoAxesColumn, ChevronRight, Download, Info, RefreshCw, Video } from 'lucide-react';
import './DataPage.css';
import { api } from '../api.js';

const RANGES = [
  ['今天', 'today'],
  ['本周', 'week'],
  ['上周', 'lastWeek'],
  ['本月', 'month'],
  ['近 30 天', 'last30'],
  ['自定义', 'custom'],
];

const pad = value => `${value}`.padStart(2, '0');
const fmt = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const startOfWeek = date => {
  const result = new Date(date);
  const offset = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - offset);
  return result;
};

function rangeOf(key, custom) {
  const today = new Date();
  const start = new Date(today);
  if (key === 'today') return [start, today, '今天'];
  if (key === 'week') return [startOfWeek(today), today, '本周'];
  if (key === 'lastWeek') {
    const from = startOfWeek(today);
    from.setDate(from.getDate() - 7);
    const to = new Date(from);
    to.setDate(to.getDate() + 6);
    return [from, to, '上周'];
  }
  if (key === 'month') {
    start.setDate(1);
    return [start, today, '本月'];
  }
  if (key === 'last30') {
    start.setDate(today.getDate() - 29);
    return [start, today, '近 30 天'];
  }
  const from = custom.from ? new Date(`${custom.from}T00:00:00`) : start;
  const to = custom.to ? new Date(`${custom.to}T00:00:00`) : today;
  return [from, to, '所选区间'];
}

const daysBetween = (from, to) => Math.round((to - from) / 86400000) + 1;

function CloudGlyph() {
  return <svg className="data-cloud" viewBox="0 0 120 54" width="112" height="50" fill="none" aria-hidden="true">
    <path d="M62 40c-10 0-17-7-17-15 0-7 5-12 12-13 2-7 8-11 15-11 9 0 16 7 17 15 6 1 10 6 10 12 0 7-6 12-13 12H62z" stroke="#d5a842" strokeWidth="2" strokeLinejoin="round" fill="rgba(248,237,206,0.35)" />
    <path d="M46 40c-5 0-9-3-10-8-1-4 1-8 4-10-1-2 0-4 1-5 3-4 8-5 11-2" stroke="#d5a842" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M74 46c14 0 26 3 34 8" stroke="#d5a842" strokeWidth="1.8" strokeLinecap="round" />
  </svg>;
}

export default function DataPage() {
  const [view, setView] = useState('report');
  const [rangeKey, setRangeKey] = useState('last30');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [pendingCustom, setPendingCustom] = useState({ from: '', to: '' });
  const [helpOpen, setHelpOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [from, to, label] = rangeOf(rangeKey, custom);
  const days = Math.max(1, daysBetween(from, to));

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  // 每天统计：后端按天聚合，前端按所选区间裁剪
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.report(Math.min(90, Math.max(1, days)))
      .then(data => { if (!cancelled) { setReport(data); setError(''); } })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days, rangeKey, custom.from, custom.to]);

  const series = (report?.series || []).filter(day => day.date >= fmt(from) && day.date <= fmt(to));
  const sum = key => series.reduce((total, day) => total + (day[key] || 0), 0);
  const inRange = { tasks: sum('tasks'), done: sum('done'), failed: sum('failed'), scripts: sum('scripts') };
  const hasData = inRange.tasks + inRange.scripts > 0;

  const applyCustom = () => {
    if (!pendingCustom.from || !pendingCustom.to) { setToast('请把起止日期都选上'); return; }
    if (pendingCustom.from > pendingCustom.to) { setToast('开始日期不能晚于结束日期'); return; }
    setCustom(pendingCustom);
    setToast('已应用自定义区间');
  };

  const exportCsv = () => {
    const header = '日期,任务数,成片数,失败数,剧本数\n';
    const rows = series.map(day => [day.date, day.tasks, day.done, day.failed, day.scripts].join(',')).join('\n');
    const blob = new Blob([`\uFEFF${header}${rows}\n`], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `生产报表_${fmt(from)}_${fmt(to)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    setToast('已导出 CSV');
  };

  return <main className="data-page">
    <div className="data-bar">
      <span className="data-bar-title">数据</span>
      <span className="data-bar-sep" />
      <button type="button" className={view === 'report' ? 'current' : ''} onClick={() => setView('report')}>
        <ChartNoAxesColumn size={17} />生产报表
      </button>
      <button type="button" className={view === 'douyin' ? 'current' : ''} onClick={() => setView('douyin')}>
        <Video size={17} />抖音账号
      </button>
    </div>

    {view === 'report' ? <>
      <div className="data-head">
        <div>
          <h1>生产报表
            <button type="button" className="data-info" onClick={() => setHelpOpen(open => !open)}><Info size={14} />说明</button>
          </h1>
          <p>按天、按人看出片量、成功率与耗时，可以一路点到具体任务。</p>
        </div>
        <div className="data-actions">
          <button type="button" onClick={exportCsv}><Download size={16} />导出 CSV</button>
          <button type="button" onClick={() => setToast('已刷新数据')}><RefreshCw size={16} />刷新</button>
        </div>
      </div>

      {helpOpen && <div className="data-help">
        <strong>指标说明</strong>
        <ul>
          <li>任务数：区间内提交的出片任务总数，失败的也算已结束。</li>
          <li>成功率：一次出片成功（无需重试）的任务占比。</li>
          <li>平均耗时：从提交到产出成片的平均时长，含排队时间。</li>
          <li>点击任意一天可以下钻到当天任务列表。</li>
        </ul>
      </div>}

      <div className="data-ranges">
        {RANGES.map(([text, key]) => <button type="button" key={key}
          className={rangeKey === key ? 'current' : ''}
          onClick={() => setRangeKey(key)}>{text}</button>)}
      </div>

      {rangeKey === 'custom' && <div className="data-custom">
        <input type="date" value={pendingCustom.from} onChange={event => setPendingCustom(current => ({ ...current, from: event.target.value }))} aria-label="开始日期" />
        <span>至</span>
        <input type="date" value={pendingCustom.to} onChange={event => setPendingCustom(current => ({ ...current, to: event.target.value }))} aria-label="结束日期" />
        <button type="button" onClick={applyCustom}>应用</button>
      </div>}

      <div className="data-range-line">
        <span>{fmt(from)} ~ {fmt(to)} 共 {days} 天</span>
        <span>数据范围：仅本人</span>
      </div>

      {error && <div className="data-banner">{error}</div>}

      {loading ? <div className="data-loading">正在读取生产数据…</div>
        : hasData ? <>
          <div className="data-stats">
            {[['任务', inRange.tasks], ['成功', inRange.done], ['失败', inRange.failed], ['剧本', inRange.scripts], ['拆解', report?.totals?.breakdowns || 0]].map(([name, value]) => <div className="data-stat" key={name}>
              <span>{name}</span><b>{value}</b>
            </div>)}
          </div>
          <div className="data-days">
            {series.filter(day => day.tasks || day.scripts).map(day => <div className="data-day" key={day.date}>
              <span className="day-date">{day.date}</span>
              <span className="day-bar"><i style={{ width: `${Math.min(100, (day.tasks / Math.max(1, sum('tasks'))) * 100 * 2)}%` }} /></span>
              <span className="day-text">任务 {day.tasks} · 成功 {day.done} · 失败 {day.failed} · 剧本 {day.scripts}</span>
            </div>)}
          </div>
        </> : <section className="data-empty">
          <CloudGlyph />
          <strong>{label}还没有结束的任务</strong>
          <p>有了数据之后，会按天统计出来。</p>
          <button type="button" className="data-primary" onClick={() => setToast('去「创作」提交出片任务（演示）')}>去分镜出片</button>
        </section>}
    </> : <>
      <div className="data-head">
        <div>
          <h1>抖音账号</h1>
          <p>绑定后可以同步作品播放量、完播率与涨粉数据。</p>
        </div>
        <div className="data-actions">
          <button type="button" onClick={() => setToast('已刷新账号状态')}><RefreshCw size={16} />刷新</button>
        </div>
      </div>

      <section className="data-account">
        <div className="account-avatar"><Video size={26} /></div>
        <div className="account-text">
          <strong>还没有绑定抖音账号</strong>
          <p>绑定后，账号下的作品数据会按天同步到生产报表里。</p>
        </div>
        <button type="button" className="data-primary" onClick={() => setToast('抖音授权为演示功能')}>绑定抖音账号<ChevronRight size={15} /></button>
      </section>

      <div className="account-tips">
        <h3>绑定后可以做什么</h3>
        <ul>
          <li>同步作品的播放、点赞与完播数据，和出片任务对齐。</li>
          <li>按剧集看涨粉和转化，找到真正的爆款片段。</li>
          <li>把表现好的分镜回流到资产库，复用镜头语言。</li>
        </ul>
      </div>
    </>}

    {toast && <div className="data-toast">{toast}</div>}
  </main>;
}
