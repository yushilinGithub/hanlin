/**
 * Types for the pluggable model-provider layer.
 *
 * finWorker's internal data model is the Anthropic wire format (see
 * `src/types/message.ts`), so a provider is not a parallel type universe — it is an
 * adapter that accepts an Anthropic request and produces an Anthropic-shaped response.
 * Only the bytes on the wire differ.
 */

/**
 * The wire protocol a provider speaks.
 *
 * Deliberately separate from the provider id: DeepSeek, Together, Groq, Fireworks and a
 * self-hosted vLLM all speak `openai-chat`, so they share one implementation and differ
 * only in endpoint, auth and quirks.
 */
export type ProviderProtocol = 'anthropic-messages' | 'openai-chat'

/** JSON Schema dialect a provider's tool definitions must be projected into. */
export type ToolSchemaDialect =
  /** Standard JSON Schema, `anyOf` flattened and `null` variants dropped. */
  | 'openai'
  /** Moonshot/Kimi: additionally strips `prefixItems` and tuple-form `items`. */
  | 'restricted'

/** A provider deployment finWorker knows how to talk to. */
export type ProviderProfile = {
  /** Stable id, used in settings and in `provider/model` strings. */
  id: string
  /** Display name for the model picker. */
  name: string
  protocol: ProviderProtocol
  /**
   * Canonical base URL, including any version prefix (e.g. `.../v1`).
   * Omitted for providers that have no canonical host and must be configured.
   */
  baseURL?: string
  /** Env vars consulted for the API key, in order. */
  apiKeyEnv?: string[]
  /** True when the deployment needs no credential (local Ollama, vLLM). */
  apiKeyOptional?: boolean
  /** Static headers merged into every request. */
  headers?: Record<string, string>
  /** Tool schema projection this provider requires. Defaults to `openai`. */
  toolSchema?: ToolSchemaDialect
  /**
   * The models.dev id for this same endpoint, when it differs from ours.
   *
   * finWorker's short ids predate the catalog and are what users have configured, so they
   * stay — but model metadata, pricing and limits are looked up under this id.
   */
  catalogId?: string
}

/** A profile with configuration applied — everything needed to issue a request. */
export type ResolvedProvider = {
  profile: ProviderProfile
  baseURL: string
  apiKey?: string
  headers: Record<string, string>
}
