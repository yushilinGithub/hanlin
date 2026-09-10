import type { ProviderProfile } from './types.js'

/**
 * Known provider deployments.
 *
 * Adding a provider that already speaks OpenAI chat completions is one entry here — the
 * protocol implementation is shared. Only genuinely new wire formats need code.
 */
const PROFILES: ProviderProfile[] = [
  {
    id: 'openai-compatible',
    name: 'OpenAI-compatible',
    protocol: 'openai-chat',
    // No canonical URL: vLLM, SGLang, LM Studio and friends must be pointed somewhere.
    apiKeyEnv: ['OPENAI_API_KEY'],
    apiKeyOptional: true,
  },
  {
    id: 'ollama',
    name: 'Ollama',
    protocol: 'openai-chat',
    baseURL: 'http://localhost:11434/v1',
    apiKeyOptional: true,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    protocol: 'openai-chat',
    baseURL: 'https://openrouter.ai/api/v1',
    apiKeyEnv: ['OPENROUTER_API_KEY'],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    protocol: 'openai-chat',
    baseURL: 'https://api.deepseek.com/v1',
    apiKeyEnv: ['DEEPSEEK_API_KEY'],
  },
  {
    id: 'moonshot',
    name: 'Moonshot (Kimi)',
    protocol: 'openai-chat',
    baseURL: 'https://api.moonshot.cn/v1',
    apiKeyEnv: ['MOONSHOT_API_KEY'],
    // Kimi rejects `prefixItems` and tuple-form `items`.
    toolSchema: 'restricted',
  },
  {
    id: 'together',
    name: 'Together AI',
    protocol: 'openai-chat',
    baseURL: 'https://api.together.xyz/v1',
    apiKeyEnv: ['TOGETHER_API_KEY'],
  },
  {
    id: 'groq',
    name: 'Groq',
    protocol: 'openai-chat',
    baseURL: 'https://api.groq.com/openai/v1',
    apiKeyEnv: ['GROQ_API_KEY'],
  },
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    protocol: 'openai-chat',
    baseURL: 'https://api.fireworks.ai/inference/v1',
    apiKeyEnv: ['FIREWORKS_API_KEY'],
  },
  {
    id: 'dashscope',
    name: 'Alibaba DashScope (Qwen)',
    protocol: 'openai-chat',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKeyEnv: ['DASHSCOPE_API_KEY'],
  },
  {
    id: 'zhipu',
    name: 'Zhipu (GLM)',
    protocol: 'openai-chat',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    apiKeyEnv: ['ZHIPU_API_KEY', 'GLM_API_KEY'],
  },
]

const BY_ID = new Map(PROFILES.map(p => [p.id, p]))

export function getProviderProfile(id: string): ProviderProfile | undefined {
  return BY_ID.get(id)
}

export function listProviderProfiles(): readonly ProviderProfile[] {
  return PROFILES
}
