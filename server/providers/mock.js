import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';

const TOTAL_MS = { image: 4000, video: 9000 };

const escapeXml = text => text
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// 中文按字数折行，避免 SVG 里一行到底
function wrap(text, perLine = 16, maxLines = 4) {
  const lines = [];
  for (let i = 0; i < text.length && lines.length < maxLines; i += perLine) {
    lines.push(text.slice(i, i + perLine));
  }
  if (text.length > perLine * maxLines) {
    lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, perLine - 1)}…`;
  }
  return lines;
}

function placeholderSvg(task) {
  const width = Number(task.params.width) || (task.type === 'video' ? 1280 : 1024);
  const height = Number(task.params.height) || (task.type === 'video' ? 720 : 1024);
  const label = task.type === 'video' ? '视频生成 · 占位' : '图片生成 · 占位';
  const lines = wrap(task.prompt);
  const fontSize = Math.round(Math.min(width, height) / 22);
  const startY = height * 0.58;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#20465a"/>
      <stop offset="55%" stop-color="#2f6072"/>
      <stop offset="100%" stop-color="#142e3a"/>
    </linearGradient>
    <radialGradient id="glow" cx="72%" cy="18%" r="60%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="url(#glow)"/>
  <g fill="none" stroke="#d9b45c" stroke-width="${Math.max(2, fontSize / 8)}" stroke-linecap="round" opacity="0.85">
    <path d="M${width * 0.42} ${height * 0.3} q ${fontSize} ${-fontSize * 1.2} ${fontSize * 2.4} ${fontSize * 0.2} q ${fontSize * 1.6} ${-fontSize * 1.4} ${fontSize * 2.6} ${fontSize * 0.4} q ${fontSize * 1.8} ${-fontSize * 0.2} ${fontSize * 1.8} ${fontSize * 1.2}" />
    <path d="M${width * 0.36} ${height * 0.34} q ${fontSize * 2} ${fontSize * 0.6} ${fontSize * 3.4} ${-fontSize * 0.1}" />
  </g>
  <text x="${width * 0.5}" y="${height * 0.42}" text-anchor="middle" fill="#cfe0e8" font-size="${fontSize * 0.62}" font-family="'Noto Sans SC', sans-serif" opacity="0.85">${escapeXml(label)}</text>
  ${lines.map((line, index) => `<text x="${width * 0.5}" y="${startY + index * fontSize * 1.5}" text-anchor="middle" fill="#f4f7f8" font-size="${fontSize}" font-family="'Noto Sans SC', sans-serif">${escapeXml(line)}</text>`).join('\n  ')}
  <text x="${width * 0.5}" y="${height * 0.92}" text-anchor="middle" fill="#9fb6c1" font-size="${fontSize * 0.52}" font-family="'Noto Sans SC', sans-serif">mock provider · 接入即梦后替换为真实产物</text>
</svg>`;
}

/**
 * 本地占位 provider：无需任何凭证，用来把整个异步链路先跑通。
 * poll 按创建时间推进进度，完成时生成一张 SVG 产物并落盘。
 */
export const mockProvider = {
  name: 'mock',

  async submit(task) {
    return { remoteId: `mock_${task.id}` };
  },

  async poll(task) {
    const total = TOTAL_MS[task.type] || 5000;
    const elapsed = Date.now() - task.created_at;
    if (elapsed < total) {
      const progress = Math.min(96, Math.round((elapsed / total) * 100));
      return { status: 'running', progress, remoteId: task.remote_task_id || `mock_${task.id}` };
    }
    const name = `${task.id}.svg`;
    writeFileSync(join(config.uploadDir, name), placeholderSvg(task), 'utf8');
    return {
      status: 'done',
      progress: 100,
      remoteId: task.remote_task_id || `mock_${task.id}`,
      localPath: name,
      resultUrl: `/api/files/${name}`,
    };
  },
};
