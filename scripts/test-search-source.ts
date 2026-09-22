#!/usr/bin/env bun
/**
 * Call one WebSearch source directly — no model, no routing — and print its results.
 *
 *   bun scripts/test-search-source.ts                         # list sources and their parameters
 *   bun scripts/test-search-source.ts arxiv "mixture of experts"
 *   bun scripts/test-search-source.ts openalex '{"query": "HBM4", "publisher": "ieee", "days": 365}'
 *   bun scripts/test-search-source.ts yahoo '{"tickers": ["300750.SZ"]}' --json
 *
 * The source may be given by tool name (arxiv_search) or short name (arxiv). The second
 * argument is either plain query text or a JSON object of the tool's arguments, exactly as
 * the model would send them. --json prints the raw hit objects instead of the text view.
 */
import type { SearchSource } from '../src/tools/WebSearchTool/sources/types.js'
import { enableConfigs } from '../src/utils/config.js'

// Source API keys (TAVILY_API_KEY, NCBI_API_KEY, …) may live in settings.json `env`.
enableConfigs()
const { getInitialSettings } = await import('../src/utils/settings/settings.js')
getInitialSettings()
const { applyConfigEnvironmentVariables } = await import('../src/utils/managedEnv.js')
applyConfigEnvironmentVariables()
const { SOURCES } = await import('../src/tools/WebSearchTool/sources/index.js')

const args = process.argv.slice(2)
const asJson = args.includes('--json')
const [sourceArg, input] = args.filter(a => a !== '--json')

function describe(source: SearchSource): void {
  console.log(`\n${source.name}  (${source.label})${source.isAvailable() ? '' : '  [unavailable]'}`)
  console.log(`  ${source.description}`)
  for (const [name, schema] of Object.entries(source.parameters.properties)) {
    const s = schema as { type?: string; enum?: string[]; description?: string }
    const required = source.parameters.required?.includes(name) ? ', required' : ''
    const values = s.enum ? ` [${s.enum.join(' | ')}]` : ''
    console.log(`  - ${name} (${s.type}${required})${values}: ${s.description ?? ''}`)
  }
  if (source.recentDays) console.log(`  recentDays default: ${source.recentDays}`)
}

if (!sourceArg) {
  console.log('Sources:')
  for (const source of SOURCES) describe(source)
  console.log('\nUsage: bun scripts/test-search-source.ts <source> "<query>" | \'<json args>\' [--json]')
  process.exit(0)
}

const source = SOURCES.find(
  s => s.name === sourceArg || s.name.split('_')[0] === sourceArg || s.label.toLowerCase() === sourceArg.toLowerCase(),
)
if (!source) {
  console.error(`Unknown source "${sourceArg}". Known: ${SOURCES.map(s => s.name).join(', ')}`)
  process.exit(1)
}

let callArgs: Record<string, unknown>
try {
  callArgs = input?.trim().startsWith('{') ? JSON.parse(input) : { query: input ?? '' }
} catch (error) {
  console.error(`Arguments are not valid JSON: ${(error as Error).message}`)
  process.exit(1)
}

console.log(`source : ${source.name} (${source.label})`)
console.log(`args   : ${JSON.stringify(callArgs)}`)

const started = performance.now()
try {
  const hits = await source.search(callArgs, AbortSignal.timeout(30_000))
  const seconds = ((performance.now() - started) / 1000).toFixed(1)
  console.log(`time   : ${seconds}s`)
  console.log(`hits   : ${hits.length}`)
  if (asJson) {
    console.log(JSON.stringify(hits, null, 2))
  } else {
    for (const [i, hit] of hits.entries()) {
      console.log(`\n[${i + 1}] ${hit.published?.slice(0, 10) ?? 'undated'}  ${hit.title}`)
      console.log(`    ${hit.url}`)
      if (hit.snippet) console.log(`    ${hit.snippet}`)
    }
  }
} catch (error) {
  console.log(`time   : ${((performance.now() - started) / 1000).toFixed(1)}s`)
  console.log(`error  : ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`)
  process.exit(1)
}
