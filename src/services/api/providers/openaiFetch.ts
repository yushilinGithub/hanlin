import { AnthropicEventBuilder, toAnthropicMessage } from './openaiStream.js'
import { toOpenAIRequest } from './openaiRequest.js'
import type { ResolvedProvider } from './types.js'

type AnyRecord = Record<string, any>
type FetchLike = (input: any, init?: any) => Promise<Response>

/** Iterate `data:` payloads out of an SSE body, ignoring comments and `[DONE]`. */
async function* iterSSEData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // Providers differ on \n vs \r\n; split on \n and trim the remainder.
      for (let newline = buffer.indexOf('\n'); newline !== -1; newline = buffer.indexOf('\n')) {
        const line = buffer.slice(0, newline).replace(/\r$/, '')
        buffer = buffer.slice(newline + 1)
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data === '[DONE]' || data === '') continue
        yield data
      }
    }
    const tail = buffer.trim()
    if (tail.startsWith('data:')) {
      const data = tail.slice(5).trim()
      if (data && data !== '[DONE]') yield data
    }
  } finally {
    reader.releaseLock()
  }
}

function anthropicError(status: number, message: string): Response {
  const type =
    status === 401 || status === 403
      ? 'authentication_error'
      : status === 429
        ? 'rate_limit_error'
        : status === 400
          ? 'invalid_request_error'
          : 'api_error'
  return new Response(JSON.stringify({ type: 'error', error: { type, message } }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** Rough local estimate. Kept deliberately crude — see `countTokens` below. */
function estimateTokens(body: AnyRecord): number {
  const json = JSON.stringify({ system: body.system, messages: body.messages, tools: body.tools })
  return Math.ceil(json.length / 4)
}

function buildHeaders(provider: ResolvedProvider): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...provider.headers,
  }
  if (provider.apiKey) headers.authorization = `Bearer ${provider.apiKey}`
  return headers
}

async function proxyMessages(
  provider: ResolvedProvider,
  init: AnyRecord,
  inner: FetchLike,
): Promise<Response> {
  const body: AnyRecord = JSON.parse(String(init?.body ?? '{}'))
  const openaiBody = toOpenAIRequest(body, provider)

  const upstream = await inner(`${provider.baseURL}/chat/completions`, {
    method: 'POST',
    headers: buildHeaders(provider),
    body: JSON.stringify(openaiBody),
    signal: init?.signal,
  })

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '')
    return anthropicError(upstream.status, text || upstream.statusText)
  }

  if (!body.stream) {
    const completion = (await upstream.json()) as AnyRecord
    return new Response(JSON.stringify(toAnthropicMessage(completion, body.model)), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  if (!upstream.body) return anthropicError(502, 'Provider returned an empty stream')

  const builder = new AnthropicEventBuilder(body.model)
  const encoder = new TextEncoder()
  const source = upstream.body

  const translated = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const data of iterSSEData(source)) {
          let chunk: AnyRecord
          try {
            chunk = JSON.parse(data)
          } catch {
            // A single unparseable frame should not abort a turn that is otherwise fine.
            continue
          }
          // Some providers report errors mid-stream rather than via HTTP status.
          if (chunk.error) {
            controller.enqueue(
              encoder.encode(
                `event: error\ndata: ${JSON.stringify({
                  type: 'error',
                  error: { type: 'api_error', message: chunk.error.message ?? 'Provider error' },
                })}\n\n`,
              ),
            )
            controller.close()
            return
          }
          const events = builder.push(chunk)
          if (events) controller.enqueue(encoder.encode(events))
        }
        controller.enqueue(encoder.encode(builder.finish()))
        controller.close()
      } catch (err) {
        controller.error(err)
      }
    },
  })

  return new Response(translated, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

/**
 * A `fetch` that speaks Anthropic's Messages API on the inside and the provider's format
 * on the wire.
 *
 * Installing the translation here rather than behind a hand-written client means the
 * Anthropic SDK still supplies `APIPromise`, `.withResponse()`, SSE decoding into
 * `BetaRawMessageStreamEvent`, retries, timeouts, abort handling and the `APIError`
 * hierarchy — none of which we have to reimplement or keep in sync.
 */
export function createProviderFetch(provider: ResolvedProvider, inner: FetchLike): FetchLike {
  return async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const path = (() => {
      try {
        return new URL(url).pathname
      } catch {
        return String(url)
      }
    })()

    if (path.endsWith('/messages')) return proxyMessages(provider, init ?? {}, inner)

    if (path.endsWith('/messages/count_tokens')) {
      // OpenAI-compatible endpoints expose no token counter. A local estimate keeps the
      // context meter roughly honest; exact accounting comes from `usage` on the response.
      const body: AnyRecord = JSON.parse(String(init?.body ?? '{}'))
      return new Response(JSON.stringify({ input_tokens: estimateTokens(body) }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }

    if (path.endsWith('/models')) {
      // Model discovery goes through the catalog, not this endpoint.
      return new Response(
        JSON.stringify({ data: [], has_more: false, first_id: null, last_id: null }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }

    return anthropicError(404, `Unsupported path for provider ${provider.profile.id}: ${path}`)
  }
}
