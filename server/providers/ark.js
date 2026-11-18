import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import { arkFetch } from '../ark-client.js';

const extFromUrl = url => {
  const match = /\.([a-z0-9]{3,4})(?:$|\?)/i.exec(url || '');
  return match ? match[1].toLowerCase() : '';
};

const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

/**
 * 画布里的上游图片是本地相对路径（/api/files/xxx.png），公网不可达。
 * 这里读本地文件转成 data URL 再喂给 Seedance，避免依赖公网地址。
 */
function localImageToDataUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('/api/files/')) return null;
  const name = decodeURIComponent(url.replace('/api/files/', ''));
  const file = join(config.uploadDir, name);
  if (!existsSync(file)) return null;
  const ext = extFromUrl(name) || 'jpeg';
  const base64 = readFileSync(file).toString('base64');
  return `data:${MIME[ext] || 'image/jpeg'};base64,${base64}`;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// 下载重试放在 provider 内部：产物已经生成（已经计费），不能再让 poller 重新发起生成
async function download(url, filename, attempts = 3) {
  let lastError;
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
      if (!response.ok) throw new Error(`下载产物失败 HTTP ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      writeFileSync(join(config.uploadDir, filename), buffer);
      return filename;
    } catch (error) {
      lastError = error;
      if (index < attempts - 1) await sleep(800 * (index + 1));
    }
  }
  throw lastError;
}

/** 定妆照参考图：支持多张，本地文件转 data URL，公网地址直接传 */
function imageReferences(params) {
  const raw = Array.isArray(params?.image_refs)
    ? params.image_refs
    : params?.image_refs || params?.image_ref
      ? [params.image_refs || params.image_ref]
      : [];
  return raw
    .filter(item => typeof item === 'string' && item)
    .map(item => (item.startsWith('http') ? item : localImageToDataUrl(item)))
    .filter(Boolean)
    .slice(0, 2);
}

const imageSize = params => {
  if (params?.size) return params.size;
  const width = Number(params?.width);
  const height = Number(params?.height);
  // Seedream 对像素总量有下限，小图直接走 2K 档位
  if (width >= 1280 && height >= 720) return `${width}x${height}`;
  return '2K';
};

/**
 * 方舟 Seedream：同步接口，一次请求直接出图。
 * 文档：https://docs.volcengine.com/docs/ark/image-generation-api
 */
async function generateImage(task) {
  const data = await arkFetch('/images/generations', {
    body: {
      model: config.ark.imageModel,
      prompt: task.prompt,
      size: imageSize(task.params),
      response_format: 'url',
      watermark: false,
      // 定妆照作为参考图：单角色用 image，多角色用 images
      ...(imageReferences(task.params).length === 1
        ? { image: imageReferences(task.params)[0] }
        : imageReferences(task.params).length > 1
          ? { images: imageReferences(task.params) }
          : {}),
    },
    timeoutMs: 120000,
  });

  const item = data?.data?.[0];
  if (!item) throw new Error('Seedream 没有返回图片');
  if (item.url) {
    try {
      const name = await download(item.url, `${task.id}.${extFromUrl(item.url) || 'png'}`);
      return { status: 'done', progress: 100, remoteId: `img_${task.id}`, localPath: name, resultUrl: `/api/files/${name}` };
    } catch (error) {
      // 图已经生成过了（已计费），转存失败只能判失败，绝不能自动重试再生成一次
      return {
        status: 'failed',
        progress: 100,
        noRetry: true,
        error: `图片已生成但转存失败：${error.message}（已阻止自动重试，避免重复计费）`,
      };
    }
  }
  if (item.b64_json) {
    const name = `${task.id}.png`;
    writeFileSync(join(config.uploadDir, name), Buffer.from(item.b64_json, 'base64'));
    return { status: 'done', progress: 100, remoteId: `img_${task.id}`, localPath: name, resultUrl: `/api/files/${name}` };
  }
  throw new Error('Seedream 返回里既没有 url 也没有 b64_json');
}

/**
 * 视频尺寸：Seedance 只认宽高比。优先用前端传的 ratio，
 * 其次由 width/height 换算，最后按分辨率档位取默认值。
 */
const videoRatio = params => {
  if (params?.ratio) return params.ratio;
  const width = Number(params?.width);
  const height = Number(params?.height);
  if (!width || !height) return undefined;
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const divisor = gcd(width, height) || 1;
  return `${width / divisor}:${height / divisor}`;
};

/** 方舟 Seedance：异步任务，提交后轮询。文档见 create-video-generation-task-api */
async function submitVideo(task) {
  const params = task.params || {};
  const content = [{ type: 'text', text: task.prompt }];

  // 画布上游图片（图生视频）：本地产物转 data URL，公网图片直接用
  const upstream = Array.isArray(params.image_urls) ? params.image_urls.slice(0, 2) : [];
  for (const url of upstream) {
    const resolved = typeof url === 'string' && url.startsWith('http') ? url : localImageToDataUrl(url);
    if (resolved) content.push({ type: 'image_url', image_url: { url: resolved } });
  }

  const body = { model: config.ark.videoModel, content };
  if (params.duration) body.duration = Number(params.duration);
  // 传了首帧图时，输出比例必须跟随图片，不能再指定 ratio（方舟会直接 400）
  const ratio = content.length > 1 ? undefined : videoRatio(params);
  if (ratio) body.ratio = ratio;
  if (params.resolution) body.resolution = params.resolution;

  let data;
  try {
    data = await arkFetch('/contents/generations/tasks', { body, timeoutMs: 120000 });
  } catch (error) {
    // 首帧被判定为「可能含真人」（常见于写实人像/儿童图）时，方舟会直接拒绝。
    // 这里自动降级成文生视频重提一次，不让整条流水线因为一张图卡死。
    const hasImage = content.some(item => item.type === 'image_url');
    if (hasImage && /real person/i.test(error.message || '')) {
      console.warn(`[ark] 首帧被判含真人，降级文生视频重提：${task.id}`);
      const fallbackBody = {
        ...body,
        content: content.filter(item => item.type !== 'image_url'),
      };
      const fallbackRatio = videoRatio(params);
      if (fallbackRatio) fallbackBody.ratio = fallbackRatio;
      data = await arkFetch('/contents/generations/tasks', { body: fallbackBody, timeoutMs: 120000 });
    } else {
      throw error;
    }
  }

  const id = data?.id || data?.task?.id;
  if (!id) throw new Error('Seedance 没有返回任务 id');
  return id;
}

async function pollVideo(task) {
  const data = await arkFetch(`/contents/generations/tasks/${task.remote_task_id}`, { method: 'GET' });
  const status = String(data?.status || '').toLowerCase();

  if (status === 'queued') return { status: 'running', progress: 15 };
  if (status === 'running') return { status: 'running', progress: 55 };
  if (status === 'failed' || status === 'cancelled' || status === 'expired') {
    return { status: 'failed', progress: 100, error: data?.error?.message || `Seedance 任务状态：${status}` };
  }
  if (status !== 'succeeded' && status !== 'success') {
    return { status: 'running', progress: 40 };
  }

  const url = data?.content?.video_url || data?.video_url || data?.content?.url;
  if (!url) return { status: 'failed', progress: 100, error: 'Seedance 成功但没有返回视频地址' };
  let name;
  try {
    name = await download(url, `${task.id}.${extFromUrl(url) || 'mp4'}`);
  } catch (error) {
    // 视频上游已经生成并计费，转存失败不再让 poller 重新提交
    return {
      status: 'failed',
      progress: 100,
      noRetry: true,
      error: `视频已生成但转存失败：${error.message}（已阻止自动重试，避免重复计费）`,
      usage: data.usage || null,
    };
  }
  return {
    status: 'done',
    progress: 100,
    localPath: name,
    resultUrl: `/api/files/${name}`,
    // 视频按 token 计费，上游会返回 usage，带回去记账
    usage: data.usage || null,
  };
}

export const arkProvider = {
  name: 'ark',
  reqKeys: () => ({ image: config.ark.imageModel, video: config.ark.videoModel }),

  async poll(task) {
    if (task.type === 'image') return generateImage(task);
    if (!task.remote_task_id) {
      const remoteId = await submitVideo(task);
      return { status: 'running', progress: 8, remoteId };
    }
    return pollVideo(task);
  },
};
