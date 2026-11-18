import { config } from '../config.js';
import { arkProvider } from './ark.js';
import { jimengProvider } from './jimeng.js';
import { mockProvider } from './mock.js';
import { llm } from '../llm.js';

const registry = { mock: mockProvider, jimeng: jimengProvider, ark: arkProvider };

function pick() {
  const requested = registry[config.provider] ? config.provider : 'mock';
  if (requested === 'ark' && !config.ark.apiKey) {
    return { provider: mockProvider, fallback: 'MEDIA_PROVIDER=ark 但缺少 ARK_API_KEY，已回退 mock' };
  }
  if (requested === 'jimeng' && !(config.jimeng.ak && config.jimeng.sk)) {
    return { provider: mockProvider, fallback: 'MEDIA_PROVIDER=jimeng 但缺少 AK/SK，已回退 mock' };
  }
  return { provider: registry[requested] };
}

const active = pick();

export const provider = active.provider;
export const providerFallback = active.fallback || '';

export const providerInfo = () => ({
  name: provider.name,
  requested: config.provider,
  reqKeys: provider.reqKeys ? provider.reqKeys() : config.jimeng.reqKeys,
  llm: {
    provider: config.llmProvider,
    enabled: llm.isEnabled(),
    model: config.ark.model,
  },
});
