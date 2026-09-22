/**
 * WebSearch for non-Anthropic providers. Anthropic runs `web_search` server-side; other
 * providers have no equivalent, so the light model is instead offered one function tool
 * per specialist source, and the calls it makes are executed here.
 */
import type {
  BetaContentBlock,
  BetaToolUnion,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { SOURCES } from './sources/index.js'
import { stringArg } from './sources/http.js'
import type { SearchHit, SearchSource } from './sources/types.js'
import type { Output, SearchResult } from './WebSearchTool.js'

const MAX_CALLS = 8 // matches max_uses on the Anthropic path
const MAX_HITS_PER_CALL = 8
const CALL_TIMEOUT_MS = 12_000

type DomainFilter = { allowed_domains?: string[]; blocked_domains?: string[] }

export type SourceCall = { id: string; name: string; args: Record<string, unknown> }

export type CallResult = { call: SourceCall; source: SearchSource; hits?: SearchHit[]; error?: string }

export function buildSearchRouterPrompt(today: string): string {
  return `You choose search tools for a query. You do not answer it.
Today is ${today}.

- Respond only with tool calls: 2 to 4 tools in one response.
- Choose tools whose description matches the query's topic.
- If a term could mean different things, call a tool for each meaning.
- Write each query in English unless the tool's description says otherwise; translate
  names and terms (宁德时代 → CATL, 阿尔茨海默病 → Alzheimer disease).
- Write each query in that tool's syntax. Keep names, tickers and codes exactly as given.
- If the query asks for recent or latest information, set days.`
}

// "latest", "最新" and the like: the query wants recent results. Models often note this
// and still omit `days`, so it is also applied here.
const RECENCY = /\b(latest|recent|recently|newest|this (week|month|year)|today|breaking)\b|最新|最近|近期|本周|本月|今天|今年/i

/** Adds the source's recentDays to calls without `days` when the query asks for recent results. */
export function applyRecencyDefault(query: string, calls: SourceCall[], sources: SearchSource[]): SourceCall[] {
  if (!RECENCY.test(query)) return calls
  const byName = new Map(sources.map(s => [s.name, s]))
  return calls.map(call => {
    const recentDays = byName.get(call.name)?.recentDays
    return recentDays && call.args.days === undefined ? { ...call, args: { ...call.args, days: recentDays } } : call
  })
}

function normalizeDomain(domain: string): string {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
}

function hostMatches(host: string, domains: string[]): boolean {
  const h = normalizeDomain(host)
  return domains.some(d => {
    const n = normalizeDomain(d)
    return h === n || h.endsWith(`.${n}`)
  })
}

function urlHost(url: string): string | undefined {
  try {
    return new URL(url).host
  } catch {
    return undefined
  }
}

/** Sources offered for this request: available, and not excluded by the domain filter. */
export function selectSources(filter: DomainFilter): SearchSource[] {
  const allowed = filter.allowed_domains?.filter(Boolean) ?? []
  const blocked = filter.blocked_domains?.filter(Boolean) ?? []
  return SOURCES.filter(source => {
    if (!source.isAvailable()) return false
    if (allowed.length > 0) return source.linksOut || source.hosts.some(h => hostMatches(h, allowed))
    if (blocked.length > 0) return !source.hosts.every(h => hostMatches(h, blocked))
    return true
  })
}

export function makeSourceToolSchemas(sources: SearchSource[]): BetaToolUnion[] {
  return sources.map(source => ({
    name: source.name,
    description: source.description,
    input_schema: source.parameters,
  })) as BetaToolUnion[]
}

/** The light model's tool calls, limited to offered sources, de-duplicated and capped. */
export function toolCallsFrom(blocks: BetaContentBlock[], sources: SearchSource[]): SourceCall[] {
  const names = new Set(sources.map(s => s.name))
  const seen = new Set<string>()
  const calls: SourceCall[] = []
  for (const block of blocks) {
    if (block.type !== 'tool_use' || !names.has(block.name)) continue
    const args = block.input && typeof block.input === 'object' ? (block.input as Record<string, unknown>) : {}
    const key = `${block.name}:${JSON.stringify(args)}`
    if (seen.has(key)) continue
    seen.add(key)
    calls.push({ id: block.id, name: block.name, args })
    if (calls.length >= MAX_CALLS) break
  }
  return calls
}

const BACKUP_SOURCE = 'web_search'

/**
 * The general web search to run when every call came back empty or failed, or undefined
 * when there is nothing to back up (some call found results, the web search was already
 * called, or it is not available).
 */
export function backupCall(query: string, results: CallResult[], sources: SearchSource[]): SourceCall | undefined {
  if (!sources.some(s => s.name === BACKUP_SOURCE)) return undefined
  if (results.some(r => r.call.name === BACKUP_SOURCE || (r.hits?.length ?? 0) > 0)) return undefined
  return { id: 'backup-web-search', name: BACKUP_SOURCE, args: { query } }
}

/** Used when the model made no usable tool call: search every offered source as given. */
export function fallbackCalls(query: string, sources: SearchSource[]): SourceCall[] {
  return sources.map((source, i) => ({ id: `fallback-${i}`, name: source.name, args: { query } }))
}

/** The call's arguments as a short label, e.g. "宁德时代 · annual" or "HBM4 · ieee". */
export function describeCall(call: SourceCall): string {
  const parts = Object.entries(call.args)
    .filter(([key]) => key !== 'days')
    .map(([, value]) => (Array.isArray(value) ? value.join(', ') : stringArg(value)))
  return parts.filter(Boolean).join(' · ') || '(no query)'
}

function passesDomainFilter(hit: SearchHit, filter: DomainFilter): boolean {
  const host = urlHost(hit.url)
  if (!host) return false
  if (filter.allowed_domains?.length) return hostMatches(host, filter.allowed_domains)
  if (filter.blocked_domains?.length) return !hostMatches(host, filter.blocked_domains)
  return true
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return `timed out after ${CALL_TIMEOUT_MS / 1000}s`
  }
  return error instanceof Error ? error.message : String(error)
}

/**
 * Runs calls in parallel across sources. Calls to a source with minIntervalMs run one
 * after another with that gap, to stay inside its rate limit.
 */
export async function runSourceCalls(
  calls: SourceCall[],
  sources: SearchSource[],
  filter: DomainFilter,
  signal: AbortSignal,
  hooks: { onStart?: (call: SourceCall, source: SearchSource) => void; onDone?: (r: CallResult) => void } = {},
): Promise<CallResult[]> {
  const byName = new Map(sources.map(s => [s.name, s]))
  const results = new Map<SourceCall, CallResult>()

  const runOne = async (call: SourceCall, source: SearchSource): Promise<void> => {
    hooks.onStart?.(call, source)
    let result: CallResult
    try {
      const hits = await source.search(call.args, AbortSignal.any([signal, AbortSignal.timeout(CALL_TIMEOUT_MS)]))
      result = { call, source, hits: hits.filter(h => passesDomainFilter(h, filter)).slice(0, MAX_HITS_PER_CALL) }
    } catch (error) {
      if (signal.aborted) throw error
      result = { call, source, error: errorMessage(error) }
    }
    results.set(call, result)
    hooks.onDone?.(result)
  }

  const groups = new Map<SearchSource, SourceCall[]>()
  for (const call of calls) {
    const source = byName.get(call.name)
    if (!source) continue
    groups.set(source, [...(groups.get(source) ?? []), call])
  }

  await Promise.all(
    [...groups].map(async ([source, group]) => {
      if (!source.minIntervalMs) {
        await Promise.all(group.map(call => runOne(call, source)))
        return
      }
      for (const [i, call] of group.entries()) {
        if (i > 0) await new Promise(resolve => setTimeout(resolve, source.minIntervalMs))
        await runOne(call, source)
      }
    }),
  )

  return calls.flatMap(call => results.get(call) ?? [])
}

function formatDate(published: string | undefined): string {
  if (!published) return 'undated'
  const time = Date.parse(published)
  return Number.isNaN(time) ? 'undated' : new Date(time).toISOString().slice(0, 10)
}

export function makeOutputFromLocalSearch(
  callResults: CallResult[],
  query: string,
  durationSeconds: number,
): Output {
  const results: (SearchResult | string)[] = []
  for (const { call, source, hits, error } of callResults) {
    const heading = `${source.label} — ${describeCall(call)}`
    if (error) {
      results.push(`${heading}: search failed (${error}).`)
      continue
    }
    const found = hits ?? []
    results.push({ tool_use_id: call.id, content: found.map(h => ({ title: h.title, url: h.url })) })
    if (found.length === 0) {
      results.push(`${heading}: no results.`)
      continue
    }
    const lines = found.map(h =>
      [`- [${formatDate(h.published)}] ${h.title}`, `  ${h.url}`, h.snippet ? `  ${h.snippet}` : undefined]
        .filter(Boolean)
        .join('\n'),
    )
    results.push(`${heading} (${found.length} results):\n${lines.join('\n')}`)
  }
  return { query, results, durationSeconds }
}
