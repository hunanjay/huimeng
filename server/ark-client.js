import { config } from './config.js';

const baseUrl = () => config.ark.baseUrl.replace(/\/$/, '');

/**
 * 方舟统一请求：Bearer API Key，OpenAI 风格。
 * 文档：https://docs.volcengine.com/docs/ark/text-generation
 */
export async function arkFetch(path, { method = 'POST', body, timeoutMs = config.ark.timeoutMs } = {}) {
  if (!config.ark.apiKey) throw new Error('未配置 ARK_API_KEY');

  const response = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.ark.apiKey}`,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`方舟返回非 JSON（HTTP ${response.status}）：${text.slice(0, 200)}`);
  }

  if (!response.ok) {
    const message = json?.error?.message || json?.message || text.slice(0, 200);
    throw new Error(`方舟 HTTP ${response.status}：${message}`);
  }
  return json;
}
