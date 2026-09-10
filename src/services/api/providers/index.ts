import { getInitialSettings } from '../../../utils/settings/settings.js'
import { getProviderProfile, listProviderProfiles } from './profiles.js'
import type { ProviderProfile, ResolvedProvider } from './types.js'

export { createProviderFetch } from './openaiFetch.js'
export { getProviderProfile, listProviderProfiles }
export type { ProviderProfile, ResolvedProvider } from './types.js'

type ProviderSettings = {
  baseURL?: string
  apiKey?: string
  apiKeyEnv?: string
  headers?: Record<string, string>
  name?: string
  toolSchema?: 'openai' | 'restricted'
  models?: Record<string, { contextWindow?: number; maxOutputTokens?: number }>
}

/**
 * Settings are session-cached, but this runs on paths that may execute before settings are
 * loaded, so a failure means "nothing configured" rather than an error.
 */
function settings(): { provider?: string; model?: string; providers?: Record<string, ProviderSettings> } {
  try {
    return getInitialSettings() as never
  } catch {
    return {}
  }
}

/** Split `provider/model` when the prefix names a provider we know about. */
export function splitProviderModel(value: string): { provider?: string; model: string } {
  const slash = value.indexOf('/')
  if (slash <= 0) return { model: value }
  const prefix = value.slice(0, slash)
  const rest = value.slice(slash + 1)
  // Only a known id counts — model names contain slashes too
  // ("Qwen/Qwen2.5-Coder-32B-Instruct" must not be read as provider "Qwen").
  if (!rest || !isKnownProviderId(prefix)) return { model: value }
  return { provider: prefix, model: rest }
}

function isKnownProviderId(id: string): boolean {
  if (getProviderProfile(id)) return true
  return Boolean(settings().providers?.[id])
}

/**
 * Provider id for this session.
 *
 * Precedence: FINWORKER_PROVIDER, then a `provider/model` prefix on the configured model,
 * then `provider` in settings.json.
 */
export function getConfiguredProviderId(): string | undefined {
  const fromEnv = process.env.FINWORKER_PROVIDER?.trim()
  if (fromEnv) return fromEnv

  const model = process.env.FINWORKER_MODEL?.trim() || settings().model
  if (model) {
    const { provider } = splitProviderModel(model)
    if (provider) return provider
  }

  return settings().provider?.trim() || undefined
}

/** True when requests should go to a non-Anthropic provider. */
export function isCustomProviderActive(): boolean {
  return getConfiguredProviderId() !== undefined
}

/** Per-model limits declared in settings, for the model as it appears on the wire. */
export function getConfiguredModelLimits(
  model: string,
): { contextWindow?: number; maxOutputTokens?: number } | undefined {
  const id = getConfiguredProviderId()
  if (!id) return undefined
  const { model: bare } = splitProviderModel(model)
  return settings().providers?.[id]?.models?.[bare]
}

function resolveApiKey(profile: ProviderProfile, config: ProviderSettings | undefined): string | undefined {
  const explicit = process.env.FINWORKER_API_KEY?.trim()
  if (explicit) return explicit
  if (config?.apiKeyEnv) {
    const value = process.env[config.apiKeyEnv]?.trim()
    if (value) return value
  }
  if (config?.apiKey) return config.apiKey
  for (const name of profile.apiKeyEnv ?? []) {
    const value = process.env[name]?.trim()
    if (value) return value
  }
  return undefined
}

/**
 * Resolve the configured provider, or throw with an actionable message.
 *
 * Misconfiguration fails here, at client construction, rather than as an opaque error on
 * the first request.
 */
export function resolveProvider(): ResolvedProvider {
  const id = getConfiguredProviderId()
  if (!id) throw new Error('No provider configured (set FINWORKER_PROVIDER or `provider` in settings.json)')

  const config = settings().providers?.[id]
  const builtin = getProviderProfile(id)
  if (!builtin && !config) {
    const known = listProviderProfiles()
      .map(p => p.id)
      .join(', ')
    throw new Error(
      `Unknown provider '${id}'. Built-in providers: ${known}. To use another, add it under "providers" in settings.json.`,
    )
  }

  // Settings override the built-in profile field by field, so a user can point a known
  // provider at a mirror without restating the rest of it.
  const profile: ProviderProfile = {
    id,
    name: config?.name ?? builtin?.name ?? id,
    protocol: builtin?.protocol ?? 'openai-chat',
    baseURL: config?.baseURL ?? builtin?.baseURL,
    apiKeyEnv: builtin?.apiKeyEnv,
    apiKeyOptional: builtin?.apiKeyOptional,
    headers: { ...builtin?.headers, ...config?.headers },
    toolSchema: config?.toolSchema ?? builtin?.toolSchema,
  }

  const baseURL = (process.env.FINWORKER_BASE_URL?.trim() || profile.baseURL)?.replace(/\/+$/, '')
  if (!baseURL) {
    throw new Error(
      `Provider '${id}' has no base URL — set FINWORKER_BASE_URL, or "providers.${id}.baseURL" in settings.json`,
    )
  }

  const apiKey = resolveApiKey(profile, config)
  if (!apiKey && !profile.apiKeyOptional) {
    const names = [...(profile.apiKeyEnv ?? []), 'FINWORKER_API_KEY'].join(' or ')
    throw new Error(`Provider '${id}' requires an API key — set ${names}`)
  }

  return { profile, baseURL, apiKey, headers: { ...profile.headers } }
}
