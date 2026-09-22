#!/usr/bin/env bun
/**
 * Drive WebSearchTool.call() directly, bypassing the agent loop.
 *
 *   FINWORKER_MODEL=sonnet bun scripts/test-websearch.ts "your query"
 *
 * On an Anthropic provider (`FINWORKER_MODEL=sonnet`), call() issues a nested model request
 * with the server-side `web_search_20250305` tool. On any other provider (settings.model),
 * the small model picks specialist sources (Yahoo, arXiv, PubMed, …) as function tools and
 * call() runs them locally.
 *
 * Note call() is a plain async function returning `{ data }` — not an async generator.
 */
import { enableConfigs } from '../src/utils/config.js'

// Config reads are refused before this; the tool reads settings while building its request.
enableConfigs()

const { WebSearchTool } = await import('../src/tools/WebSearchTool/WebSearchTool.js')
const { getInitialSettings } = await import('../src/utils/settings/settings.js')
getInitialSettings()
// Provider API keys often live in settings.json `env`; normal startup applies it, this script must too.
const { applyConfigEnvironmentVariables } = await import('../src/utils/managedEnv.js')
applyConfigEnvironmentVariables()

const query = process.argv.slice(2).join(' ') || 'Bun runtime latest release'
const abortController = new AbortController()

// Capture the source-selection exchange on non-Anthropic providers. The provider client
// reads globalThis.fetch when it is built, so wrapping it here sees every
// /chat/completions request and its streamed reply; source API calls pass through.
type RouterExchange = { request: any; status?: number; body?: Promise<string> }
const exchanges: RouterExchange[] = []
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (!url.endsWith('/chat/completions')) return realFetch(input, init)
  const exchange: RouterExchange = { request: JSON.parse(String(init?.body ?? '{}')) }
  exchanges.push(exchange)
  const res = await realFetch(input, init)
  exchange.status = res.status
  exchange.body = res.clone().text()
  return res
}) as typeof fetch

function printExchange(exchange: RouterExchange, n: number): void {
  const { request } = exchange
  console.log(`\n========== model request #${n} ==========`)
  const { messages, tools, ...params } = request
  console.log(JSON.stringify(params))
  for (const m of messages ?? []) {
    console.log(`\n[${m.role}]\n${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
  }
  console.log(`\ntools: ${(tools ?? []).map((t: any) => t.function?.name).join(', ')}`)
}

async function printResponse(exchange: RouterExchange): Promise<void> {
  const raw = (await exchange.body) ?? ''
  console.log(`\n---------- model response (HTTP ${exchange.status}) ----------`)
  if (exchange.status !== 200) {
    console.log(raw.slice(0, 2000))
    return
  }
  let text = ''
  let reasoning = ''
  let finish: string | undefined
  let usage: unknown
  const calls = new Map<number, { name: string; args: string }>()
  for (const line of raw.split('\n')) {
    if (!line.startsWith('data:') || line.includes('[DONE]')) continue
    const event = JSON.parse(line.slice(5))
    usage = event.usage ?? usage
    for (const choice of event.choices ?? []) {
      const delta = choice.delta ?? {}
      text += delta.content ?? ''
      reasoning += delta.reasoning_content ?? ''
      for (const tc of delta.tool_calls ?? []) {
        const call = calls.get(tc.index) ?? { name: '', args: '' }
        call.name += tc.function?.name ?? ''
        call.args += tc.function?.arguments ?? ''
        calls.set(tc.index, call)
      }
      finish = choice.finish_reason ?? finish
    }
  }
  console.log(`finish_reason: ${finish}`)
  console.log(`usage: ${JSON.stringify(usage)}`)
  if (reasoning) console.log(`\nreasoning:\n${reasoning}`)
  if (text) console.log(`\ntext:\n${text}`)
  for (const [i, call] of calls) console.log(`\ntool_call[${i}]: ${call.name}(${call.args})`)
}

const permissionContext = {
  mode: 'default',
  additionalWorkingDirectories: new Map(),
  alwaysAllowRules: {},
  alwaysDenyRules: {},
  isBypassPermissionsModeAvailable: false,
}

// Minimal ToolUseContext — only the fields call() actually reads.
const context: any = {
  abortController,
  agentId: undefined,
  readFileState: {},
  getAppState: () => ({
    toolPermissionContext: permissionContext,
    effortValue: undefined,
    mainLoopModel: 'sonnet',
  }),
  setAppState: () => {},
  options: {
    mainLoopModel: 'sonnet',
    thinkingConfig: { type: 'disabled' as const },
    isNonInteractiveSession: true,
    appendSystemPrompt: undefined,
    agentDefinitions: { activeAgents: [], allowedAgentTypes: undefined },
    tools: [],
    mcpClients: [],
    getToolPermissionContext: async () => permissionContext,
  },
}

const progress: unknown[] = []
const started = Date.now()

const final: any = await (WebSearchTool as any).call(
  { query },
  context,
  undefined,
  undefined,
  (p: unknown) => progress.push(p),
)

for (const [i, exchange] of exchanges.entries()) {
  printExchange(exchange, i + 1)
  await printResponse(exchange)
}
if (exchanges.length > 0) console.log('\n==========================================\n')

const data = final?.data ?? final
console.log('query           :', query)
console.log('elapsed         :', ((Date.now() - started) / 1000).toFixed(1) + 's')
console.log('durationSeconds :', data?.durationSeconds)
console.log('progress events :', progress.length)
for (const p of progress) console.log('   ', JSON.stringify(p))

const results: unknown[] = data?.results ?? []
console.log(`\nresults (${results.length}):`)
for (const [i, r] of results.entries()) {
  console.log(`\n--- [${i}] ${typeof r === 'string' ? 'text' : 'links'} ---`)
  if (typeof r === 'string') {
    console.log(r)
    continue
  }
  const obj = r as { tool_use_id?: string; content?: { title?: string; url?: string }[] }
  console.log(`tool_use_id: ${obj.tool_use_id}`)
  for (const [j, c] of (obj.content ?? []).entries()) {
    console.log(`  ${j}. ${c.title}\n     ${c.url}`)
  }
}

// Everything, unabridged — the console view stays readable while the file keeps the
// exact object the tool returned.
const dump = process.env.WEBSEARCH_DUMP ?? '/tmp/websearch-output.json'
await Bun.write(dump, JSON.stringify(data, null, 2))
console.log(`\nfull output written to ${dump}`)
