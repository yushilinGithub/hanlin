import type { AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS } from '../../services/analytics/index.js'
import { isCustomProviderActive } from '../../services/api/providers/index.js'
import { isEnvTruthy } from '../envUtils.js'

/**
 * Providers that serve Claude models over an Anthropic-shaped API.
 *
 * These four share the Claude model table, the beta headers and the Anthropic request
 * shape; they differ only in transport and credentials.
 */
export type AnthropicAPIProvider = 'firstParty' | 'bedrock' | 'vertex' | 'foundry'

/**
 * Where model requests go.
 *
 * `custom` is any non-Anthropic provider configured through `src/services/api/providers`.
 * It serves no Claude models and accepts none of the Anthropic-only request shapes, so
 * every `=== 'firstParty'` gate in the codebase correctly excludes it.
 */
export type APIProvider = AnthropicAPIProvider | 'custom'

export function getAPIProvider(): APIProvider {
  // Checked first: a configured provider overrides the Anthropic transports, which are
  // only meaningful when Anthropic is serving the model. This must also see a mid-session
  // `/model` switch — otherwise every `=== 'firstParty'` gate (beta headers, prompt-cache
  // scope, eager tool streaming) would stay on for a provider that rejects them.
  if (isCustomProviderActive()) {
    return 'custom'
  }
  return isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK)
    ? 'bedrock'
    : isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX)
      ? 'vertex'
      : isEnvTruthy(process.env.CLAUDE_CODE_USE_FOUNDRY)
        ? 'foundry'
        : 'firstParty'
}

/**
 * The Anthropic transport in use, for the tables that are Claude-specific.
 *
 * A custom provider has no Claude model strings of its own; callers that need a column of
 * the Claude table fall back to the canonical first-party names.
 */
export function getAnthropicAPIProvider(): AnthropicAPIProvider {
  const provider = getAPIProvider()
  return provider === 'custom' ? 'firstParty' : provider
}

export function getAPIProviderForStatsig(): AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS {
  return getAPIProvider() as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
}

/**
 * Check if ANTHROPIC_BASE_URL is a first-party Anthropic API URL.
 * Returns true if not set (default API) or points to api.anthropic.com
 * (or api-staging.anthropic.com for ant users).
 */
export function isFirstPartyAnthropicBaseUrl(): boolean {
  const baseUrl = process.env.ANTHROPIC_BASE_URL
  if (!baseUrl) {
    return true
  }
  try {
    const host = new URL(baseUrl).host
    const allowedHosts = ['api.anthropic.com']
    if (process.env.USER_TYPE === 'ant') {
      allowedHosts.push('api-staging.anthropic.com')
    }
    return allowedHosts.includes(host)
  } catch {
    return false
  }
}
