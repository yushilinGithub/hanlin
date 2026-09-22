#!/usr/bin/env bun
/**
 * Logging passthrough proxy for the Anthropic API.
 *
 * Forwards every request to the real API unchanged and tees both directions to disk, so
 * the raw SSE — including server_tool_use and web_search_tool_result blocks that tools
 * consume internally and never surface — can be inspected.
 *
 *   bun scripts/proxy-log.ts &
 *   ANTHROPIC_BASE_URL=http://localhost:8919 FINWORKER_MODEL=sonnet \
 *     bun scripts/test-websearch.ts "your query"
 *
 * Writes /tmp/anthropic-{N}-request.json and /tmp/anthropic-{N}-response.sse.
 */
const PORT = Number(process.env.PROXY_PORT ?? 8919)
const UPSTREAM = process.env.PROXY_UPSTREAM ?? 'https://api.anthropic.com'
const OUT = process.env.PROXY_OUT ?? '/tmp'
let n = 0

Bun.serve({
  port: PORT,
  idleTimeout: 240,
  async fetch(req) {
    const url = new URL(req.url)
    const target = UPSTREAM + url.pathname + url.search
    const body = await req.text()
    const seq = ++n

    await Bun.write(`${OUT}/anthropic-${seq}-request.json`, body || '{}')

    // Hop-by-hop headers must not be forwarded; everything else (auth, betas) must.
    const headers = new Headers(req.headers)
    for (const h of ['host', 'content-length', 'connection', 'accept-encoding']) {
      headers.delete(h)
    }

    const upstream = await fetch(target, { method: req.method, headers, body: body || undefined })
    console.error(`[proxy] #${seq} ${req.method} ${url.pathname} -> ${upstream.status}`)

    // fetch already decompressed the body, so passing the upstream content-encoding
    // through would make the client try to inflate plain bytes. Same for content-length,
    // which no longer matches.
    const outHeaders = new Headers(upstream.headers)
    outHeaders.delete('content-encoding')
    outHeaders.delete('content-length')

    if (!upstream.body) {
      const text = await upstream.text()
      await Bun.write(`${OUT}/anthropic-${seq}-response.sse`, text)
      return new Response(text, { status: upstream.status, headers: outHeaders })
    }

    // Tee: one branch back to the client, one to disk, so logging never delays the stream.
    const [toClient, toDisk] = upstream.body.tee()
    void (async () => {
      const chunks: Uint8Array[] = []
      for await (const c of toDisk as any) chunks.push(c)
      await Bun.write(`${OUT}/anthropic-${seq}-response.sse`, new Blob(chunks))
      console.error(`[proxy] #${seq} logged response`)
    })()

    return new Response(toClient, { status: upstream.status, headers: outHeaders })
  },
})
console.error(`[proxy] :${PORT} -> ${UPSTREAM}, logging to ${OUT}`)
