import { getProviderProfile, listProviderProfiles } from './profiles.js'
import type { ResolvedProvider } from './types.js'

export { createProviderFetch } from './openaiFetch.js'
export { getProviderProfile, listProviderProfiles }
export type { ProviderProfile, ResolvedProvider } from './types.js'

/** Provider id selected for this session, if any. */
export function getConfiguredProviderId(): string | undefined {
  const id = process.env.FINWORKER_PROVIDER?.trim()
  return id || undefined
}

/** True when requests should go to a non-Anthropic provider. */
export function isCustomProviderActive(): boolean {
  return getConfiguredProviderId() !== undefined
}

function resolveApiKey(envNames: readonly string[] | undefined): string | undefined {
  const explicit = process.env.FINWORKER_API_KEY?.trim()
  if (explicit) return explicit
  for (const name of envNames ?? []) {
    const value = process.env[name]?.trim()
    if (value) return value
  }
  return undefined
}

/**
 * Resolve the configured provider, or throw with an actionable message.
 *
 * Misconfiguration fails here, at client construction, rather than as an opaque 404 on the
 * first request.
 */
export function resolveProvider(): ResolvedProvider {
  const id = getConfiguredProviderId()
  if (!id) throw new Error('No provider configured (set FINWORKER_PROVIDER)')

  const profile = getProviderProfile(id)
  if (!profile) {
    const known = listProviderProfiles()
      .map(p => p.id)
      .join(', ')
    throw new Error(`Unknown provider '${id}'. Known providers: ${known}`)
  }

  const baseURL = (process.env.FINWORKER_BASE_URL?.trim() || profile.baseURL)?.replace(/\/+$/, '')
  if (!baseURL) {
    throw new Error(
      `Provider '${id}' has no default base URL — set FINWORKER_BASE_URL to your endpoint`,
    )
  }

  const apiKey = resolveApiKey(profile.apiKeyEnv)
  if (!apiKey && !profile.apiKeyOptional) {
    const names = [...(profile.apiKeyEnv ?? []), 'FINWORKER_API_KEY'].join(' or ')
    throw new Error(`Provider '${id}' requires an API key — set ${names}`)
  }

  return {
    profile,
    baseURL,
    apiKey,
    headers: { ...profile.headers },
  }
}
