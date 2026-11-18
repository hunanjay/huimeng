import { createHash, createHmac } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';

const { ak, sk, host, region, service, version } = config.jimeng;

const sha256Hex = data => createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();

const xDate = () => new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');

/**
 * 火山引擎视觉服务使用 AWS SigV4 签名（不是 Bearer）。
 * 文档：https://docs.volcengine.com/docs/jimeng-ai/quick-start-1
 */
function signHeaders(action, body) {
  const payload = JSON.stringify(body);
  const payloadHash = sha256Hex(payload);
  const date = xDate();
  const shortDate = date.slice(0, 8);
  const contentType = 'application/json';
  const query = `Action=${action}&Version=${version}`;
  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${host}\n` +
    `x-content-sha256:${payloadHash}\n` +
    `x-date:${date}\n`;
  const signedHeaders = 'content-type;host;x-content-sha256;x-date';
  const canonicalRequest = ['POST', '/', query, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${shortDate}/${region}/${service}/request`;
  const stringToSign = ['HMAC-SHA256', date, scope, sha256Hex(canonicalRequest)].join('\n');

  const kDate = hmac(sk, shortDate);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'request');
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  return {
    payload,
    headers: {
      'Content-Type': contentType,
      Host: host,
      'X-Date': date,
      'X-Content-Sha256': payloadHash,
      Authorization: `HMAC-SHA256 Credential=${ak}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

async function call(action, body) {
  if (!ak || !sk) {
    throw new Error('未配置 VOLC_ACCESS_KEY / VOLC_SECRET_KEY，无法调用即梦接口');
  }
  const { payload, headers } = signHeaders(action, body);
  const response = await fetch(`https://${host}/?Action=${action}&Version=${version}`, {
    method: 'POST',
    headers,
    body: payload,
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`即梦返回非 JSON（HTTP ${response.status}）：${text.slice(0, 200)}`);
  }
  const metaError = json?.ResponseMetadata?.Error;
  if (metaError) {
    throw new Error(`即梦 ${action} 失败：${metaError.Code || ''} ${metaError.Message || ''}`.trim());
  }
  if (!response.ok) {
    throw new Error(`即梦 ${action} HTTP ${response.status}：${text.slice(0, 200)}`);
  }
  return json;
}

const pick = (json, keys) => {
  for (const key of keys) {
    const value = key.split('.').reduce((acc, part) => (acc == null ? acc : acc[part]), json);
    if (value != null) return value;
  }
  return undefined;
};

async function saveRemote(task, result) {
  const base64 = pick(result, ['binary_data_base64', 'data.binary_data_base64']);
  if (Array.isArray(base64) && base64[0]) {
    const name = `${task.id}.${task.type === 'video' ? 'mp4' : 'png'}`;
    writeFileSync(join(config.uploadDir, name), Buffer.from(base64[0], 'base64'));
    return name;
  }
  const url = pick(result, ['image_urls.0', 'video_url', 'data.image_urls.0', 'data.video_url'])
    || (Array.isArray(result?.image_urls) ? result.image_urls[0] : undefined)
    || (Array.isArray(result?.data?.image_urls) ? result.data.image_urls[0] : undefined);
  if (!url) return null;
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`下载产物失败 HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const type = response.headers.get('content-type') || '';
  const ext = type.includes('mp4') ? 'mp4' : type.includes('jpeg') ? 'jpg' : task.type === 'video' ? 'mp4' : 'png';
  const name = `${task.id}.${ext}`;
  writeFileSync(join(config.uploadDir, name), buffer);
  return name;
}

/**
 * 即梦真接口 provider：提交异步任务 → 轮询 → 落盘产物。
 * 结果链接只有 24 小时有效，所以 done 时必须下载到本地。
 */
export const jimengProvider = {
  name: 'jimeng',

  async submit(task) {
    const body = {
      req_key: task.req_key,
      prompt: task.prompt,
      return_url: true,
      ...task.params,
    };
    const json = await call('CVSync2AsyncSubmitTask', body);
    const remoteId = pick(json, ['Result.task_id', 'data.task_id', 'task_id']);
    if (!remoteId) throw new Error('即梦未返回 task_id');
    return { remoteId };
  },

  async poll(task) {
    if (!task.remote_task_id) {
      const { remoteId } = await this.submit(task);
      return { status: 'running', progress: 8, remoteId };
    }
    const json = await call('CVSync2AsyncGetResult', {
      req_key: task.req_key,
      task_id: task.remote_task_id,
      req_json: JSON.stringify({ return_url: true }),
    });
    const result = json.Result || json.data || {};
    const status = String(result.status || json.status || '').toLowerCase();

    if (status === 'in_queue') return { status: 'running', progress: 12 };
    if (status === 'generating') return { status: 'running', progress: 55 };
    if (status === 'not_found' || status === 'expired') {
      return { status: 'failed', progress: 100, error: `即梦任务状态：${status}` };
    }
    if (status !== 'done') return { status: 'running', progress: 40 };

    const name = await saveRemote(task, result);
    if (!name) {
      return { status: 'failed', progress: 100, error: '即梦已完成但没有返回可用产物' };
    }
    return { status: 'done', progress: 100, localPath: name, resultUrl: `/api/files/${name}` };
  },
};
