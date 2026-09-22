/**
 * A specialist search source used by WebSearch when the session runs on a non-Anthropic
 * provider. Each source is offered to the light model as one function tool; its
 * description is the only routing information the model gets, so it should say what the
 * source covers and then "Use for …".
 */
export type SearchHit = {
  title: string
  url: string
  /** ISO 8601 date or datetime; sources without a reliable date leave it unset. */
  published?: string
  snippet?: string
}

export type JSONSchemaObject = {
  type: 'object'
  properties: Record<string, unknown>
  required?: string[]
}

export interface SearchSource {
  /** Tool name the light model calls, e.g. 'pubmed_search'. */
  name: string
  /** Short label shown in results, e.g. 'PubMed'. */
  label: string
  description: string
  /** Hosts this source's results live on, matched against allowed/blocked domains. */
  hosts: string[]
  /** True when results link to arbitrary sites (e.g. Hacker News stories). */
  linksOut?: boolean
  parameters: JSONSchemaObject
  /** `days` applied when the query asks for recent results and the model set none. */
  recentDays?: number
  /** Calls to this source run one after another with this gap (API rate limits). */
  minIntervalMs?: number
  isAvailable(): boolean
  search(args: Record<string, unknown>, signal: AbortSignal): Promise<SearchHit[]>
}
