import { getMainLoopModelOverride } from '../../../bootstrap/state.js'
import { getCatalog, getCatalogProvider } from '../../../utils/model/catalog.js'
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

/**
 * The models.dev id to look metadata up under.
 *
 * finWorker's built-in short ids (`dashscope`) do not always match the catalog's
 * (`alibaba-cn`), and users configure the short ones.
 */
export function getCatalogIdFor(providerId: string): string {
  return getProviderProfile(providerId)?.catalogId ?? providerId
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

// Reading the catalog parses a multi-megabyte file, and this is consulted from
// getAPIProvider() on hot paths. Memoized per id; a model string with no slash never
// reaches here at all, so the Anthropic default never pays for it.
const knownProviderIds = new Map<string, boolean>()

function isKnownProviderId(id: string): boolean {
  const cached = knownProviderIds.get(id)
  if (cached !== undefined) return cached
  const known =
    Boolean(getProviderProfile(id)) ||
    Boolean(settings().providers?.[id]) ||
    // Any models.dev provider counts, so `alibaba-cn/deepseek-v4-pro` resolves without
    // finWorker having to hardcode every provider that exists.
    Boolean(getCatalogProvider(id))
  knownProviderIds.set(id, known)
  return known
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

  // The /model picker writes "provider/model" into the session override, so a mid-session
  // switch has to be visible here — not just whatever was configured at startup.
  let override: string | undefined
  try {
    const value = getMainLoopModelOverride()
    if (typeof value === 'string') override = value
  } catch {
    // Session state not initialized yet.
  }

  const model = override || process.env.FINWORKER_MODEL?.trim() || settings().model
  if (model) {
    const { provider } = splitProviderModel(model)
    if (provider) return provider
  }

  return settings().provider?.trim() || undefined
}

// getAPIProvider() calls in here, and resolving an id reads settings — which can itself
// run during startup. The guard keeps that from recursing.
let resolvingProviderId = false

/** True when requests should go to a non-Anthropic provider. */
export function isCustomProviderActive(): boolean {
  if (process.env.FINWORKER_PROVIDER?.trim()) return true
  if (resolvingProviderId) return false
  resolvingProviderId = true
  try {
    return getConfiguredProviderId() !== undefined
  } catch {
    return false
  } finally {
    resolvingProviderId = false
  }
}

/** Per-model limits declared in settings, for the model as it appears on the wire. */
export function getConfiguredModelLimits(
  model: string,
): { contextWindow?: number; maxOutputTokens?: number } | undefined {
  const split = splitProviderModel(model)
  const id = split.provider ?? getConfiguredProviderId()
  if (!id) return undefined

  // Explicit settings win; the catalog fills the gap so a model need not be hand-measured
  // to be metered correctly.
  const configured = settings().providers?.[id]?.models?.[split.model]
  if (configured?.contextWindow || configured?.maxOutputTokens) return configured

  const limit = getCatalogProvider(getCatalogIdFor(id))?.models[split.model]?.limit
  if (!limit) return undefined
  return { contextWindow: limit.context, maxOutputTokens: limit.output }
}

/**
 * Providers the user can actually reach: configured explicitly, or holding a credential in
 * the environment.
 *
 * This gate is what keeps the model picker from listing all several hundred providers
 * models.dev knows about.
 */
export function listAvailableProviders(): ProviderProfile[] {
  const active = getConfiguredProviderId()
  const configured = settings().providers ?? {}
  const seen = new Map<string, ProviderProfile>()

  // Built-in profiles overlap the catalog — `dashscope` and `alibaba-cn` are the same
  // endpoint — so dedupe by URL and keep the first (built-in) entry.
  const seenURLs = new Set<string>()

  const consider = (
    id: string,
    name: string | undefined,
    baseURL: string | undefined,
    env: string[] | undefined,
    keyOptional: boolean,
  ): void => {
    if (seen.has(id) || !baseURL) return
    const normalizedURL = baseURL.replace(/\/+$/, '')
    if (seenURLs.has(normalizedURL)) return
    const hasKey = keyOptional || (env ?? []).some(v => process.env[v]?.trim())
    if (id !== active && !configured[id] && !hasKey) return
    seenURLs.add(normalizedURL)
    seen.set(id, {
      id,
      name: configured[id]?.name ?? name ?? id,
      protocol: 'openai-chat',
      baseURL,
      apiKeyEnv: env,
      apiKeyOptional: keyOptional,
      catalogId: getProviderProfile(id)?.catalogId ?? (getCatalogProvider(id) ? id : undefined),
    })
  }

  for (const p of listProviderProfiles()) {
    consider(
      p.id,
      p.name,
      configured[p.id]?.baseURL ?? p.baseURL,
      p.apiKeyEnv,
      p.apiKeyOptional === true,
    )
  }
  for (const [id, entry] of Object.entries(configured)) {
    const cat = getCatalogProvider(id)
    consider(
      id,
      entry.name ?? cat?.name,
      entry.baseURL ?? cat?.api,
      entry.apiKeyEnv ? [entry.apiKeyEnv] : cat?.env,
      Boolean(entry.apiKey),
    )
  }
  for (const [id, entry] of Object.entries(getCatalog())) {
    consider(id, entry.name, entry.api, entry.env, false)
  }

  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
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
  const catalog = getCatalogProvider(getCatalogIdFor(id))
  if (!builtin && !config && !catalog) {
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
    name: config?.name ?? builtin?.name ?? catalog?.name ?? id,
    protocol: builtin?.protocol ?? 'openai-chat',
    baseURL: config?.baseURL ?? builtin?.baseURL ?? catalog?.api,
    apiKeyEnv: builtin?.apiKeyEnv ?? catalog?.env,
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
