#!/usr/bin/env bun
/**
 * Dump the exact request finWorker builds — the object returned by
 * `paramsFromContext` in src/services/api/claude.ts.
 *
 * That function is a closure inside `queryModel` and cannot be imported, but its
 * return value is passed straight to `anthropic.beta.messages.create()`. Standing in
 * for the API and capturing the POST body therefore yields the identical object.
 *
 *   bun scripts/dump-request.ts "your prompt"
 *   bun scripts/dump-request.ts --provider "your prompt"   # after adapter lowering
 *
 * Writes each captured request to /tmp/finworker-request-N.json and prints a summary.
 */
import { spawn } from 'child_process'
import { join } from 'path'

const args = process.argv.slice(2)
const lowered = args.includes('--provider')
const prompt = args.filter(a => a !== '--provider').join(' ') || 'hi'
const PORT = 8917
const CLI = join(import.meta.dir, '..', 'dist', 'cli.mjs')

let captured = 0

function anthropicSSE(model: string): Response {
  const ev = (t: string, d: unknown) => `event: ${t}\ndata: ${JSON.stringify(d)}\n\n`
  const frames = [
    ev('message_start', { type: 'message_start', message: { id: 'msg_dump', type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } }),
    ev('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
    ev('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '(captured)' } }),
    ev('content_block_stop', { type: 'content_block_stop', index: 0 }),
    ev('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } }),
    ev('message_stop', { type: 'message_stop' }),
  ]
  return sse(frames)
}

function openaiSSE(model: string): Response {
  const chunk = (c: object) => `data: ${JSON.stringify({ id: 'x', object: 'chat.completion.chunk', model, ...c })}\n\n`
  return sse([
    chunk({ choices: [{ index: 0, delta: { role: 'assistant', content: '(captured)' } }] }),
    chunk({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }),
    chunk({ choices: [], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
    'data: [DONE]\n\n',
  ])
}

function sse(frames: string[]): Response {
  return new Response(
    new ReadableStream({
      start(c) {
        const enc = new TextEncoder()
        for (const f of frames) c.enqueue(enc.encode(f))
        c.close()
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  )
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const path = new URL(req.url).pathname
    // Token counting is not the request under inspection.
    if (path.endsWith('/count_tokens')) return Response.json({ input_tokens: 1 })
    if (!path.endsWith('/messages') && !path.endsWith('/chat/completions')) {
      return new Response('{}', { status: 200 })
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    captured++
    const file = `/tmp/finworker-request-${captured}.json`
    await Bun.write(file, JSON.stringify(body, null, 2))
    summarize(file, body)
    return lowered ? openaiSSE(String(body.model)) : anthropicSSE(String(body.model))
  },
})

function bytes(v: unknown): number {
  return v === undefined ? 0 : JSON.stringify(v).length
}

function summarize(file: string, body: Record<string, unknown>): void {
  const tools = bytes(body.tools)
  const system = bytes(body.system)
  const messages = bytes(body.messages)
  const total = tools + system + messages
  console.log(`\n${'='.repeat(70)}\n${file}\n${'='.repeat(70)}`)
  console.log('top-level keys:', Object.keys(body).join(', '))
  console.log(`model: ${String(body.model)}`)
  for (const [label, n] of [['tools', tools], ['system', system], ['messages', messages]] as const) {
    if (n === 0) continue
    console.log(`  ${label.padEnd(9)} ${n.toLocaleString().padStart(9)} B  ${((100 * n) / total).toFixed(1).padStart(5)}%  ~${Math.round(n / 4).toLocaleString()} tok`)
  }
  if (Array.isArray(body.system)) {
    console.log('\nsystem blocks:')
    for (const [i, b] of (body.system as { text?: string; cache_control?: unknown }[]).entries()) {
      console.log(`  [${i}] ${String(b.text?.length ?? 0).padStart(6)}c  cache_control=${JSON.stringify(b.cache_control ?? null)}  ${JSON.stringify(b.text?.slice(0, 55) ?? '')}`)
    }
  }
  if (Array.isArray(body.tools)) {
    console.log(`\ntools (${(body.tools as unknown[]).length}):`)
    for (const t of body.tools as Record<string, any>[]) {
      const fn = t.function ?? t
      console.log(`  ${String(fn.name).padEnd(24)} ${String((fn.description ?? '').length).padStart(6)}c`)
    }
  }
  if (Array.isArray(body.messages)) {
    console.log('\nmessages:')
    for (const [i, m] of (body.messages as Record<string, any>[]).entries()) {
      const c = m.content
      if (typeof c === 'string') {
        console.log(`  [${i}] ${String(m.role).padEnd(9)} str ${String(c.length).padStart(6)}c  ${JSON.stringify(c.slice(0, 50))}`)
      } else {
        for (const b of c ?? []) {
          const text = b.text ?? ''
          console.log(`  [${i}] ${String(m.role).padEnd(9)} ${String(b.type).padEnd(5)} ${String(text.length).padStart(6)}c${b.cache_control ? ' cached' : ''}  ${JSON.stringify(text.slice(0, 50))}`)
        }
      }
    }
  }
}

const env: Record<string, string> = { ...process.env as Record<string, string> }
if (lowered) {
  env.FINWORKER_PROVIDER = 'openai-compatible'
  env.FINWORKER_BASE_URL = `http://localhost:${PORT}/v1`
  env.FINWORKER_API_KEY = 'dump'
} else {
  // Force the plain Anthropic path so the captured body is pre-lowering.
  delete env.FINWORKER_PROVIDER
  env.ANTHROPIC_BASE_URL = `http://localhost:${PORT}`
  env.ANTHROPIC_API_KEY = 'sk-dump'
  env.FINWORKER_MODEL = 'sonnet'
}

const extra = process.env.DUMP_EXTRA_ARGS ? process.env.DUMP_EXTRA_ARGS.split(' ') : []
const child = spawn('node', [CLI, '-p', prompt, ...extra], {
  env,
  stdio: ['ignore', 'ignore', 'inherit'],
})
child.on('exit', code => {
  console.log(`\ncaptured ${captured} request(s); CLI exited ${code}`)
  server.stop(true)
  process.exit(0)
})
