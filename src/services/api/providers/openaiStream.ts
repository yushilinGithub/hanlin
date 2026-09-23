import { randomUUID } from 'crypto'

type AnyRecord = Record<string, any>

/** Anthropic `BetaUsage`, built from OpenAI's `usage` object. */
function toAnthropicUsage(usage: AnyRecord | undefined | null): AnyRecord {
  const prompt = usage?.prompt_tokens ?? 0
  // OpenAI reports `prompt_tokens` inclusive of cache hits; Anthropic reports the
  // non-overlapping breakdown. Subtract so the two never double-count.
  const cachedRead = usage?.prompt_tokens_details?.cached_tokens ?? 0
  return {
    input_tokens: Math.max(0, prompt - cachedRead),
    output_tokens: usage?.completion_tokens ?? 0,
    cache_read_input_tokens: cachedRead,
    // No OpenAI-compatible provider reports cache writes separately.
    cache_creation_input_tokens: 0,
    server_tool_use: null,
    service_tier: null,
  }
}

function toStopReason(finishReason: string | null | undefined): string {
  switch (finishReason) {
    case 'length':
      return 'max_tokens'
    case 'tool_calls':
    case 'function_call':
      return 'tool_use'
    case 'content_filter':
      return 'refusal'
    default:
      return 'end_turn'
  }
}

function sse(event: string, data: AnyRecord): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

/**
 * Translates a stream of OpenAI chat-completion chunks into Anthropic stream events.
 *
 * The consumer in `claude.ts` requires a strict grammar: every `content_block_delta` must
 * follow a `content_block_start` at the same index (it throws `RangeError` otherwise), and
 * every block must be closed. OpenAI guarantees none of that, so this state machine
 * synthesizes the missing structure.
 */
export class AnthropicEventBuilder {
  private readonly messageId = `msg_${randomUUID().replace(/-/g, '')}`
  private nextIndex = 0
  private textIndex: number | null = null
  private reasoningIndex: number | null = null
  private readonly toolBlocks = new Map<number, number>()
  private started = false
  private finishReason: string | null = null
  private usage: AnyRecord | null = null

  constructor(private readonly model: string) {}

  /** The `message_start` event, emitted lazily so it can carry the real model id. */
  private start(out: string[]): void {
    if (this.started) return
    this.started = true
    out.push(
      sse('message_start', {
        type: 'message_start',
        message: {
          id: this.messageId,
          type: 'message',
          role: 'assistant',
          model: this.model,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: toAnthropicUsage(null),
        },
      }),
    )
  }

  private closeBlock(index: number | null, out: string[]): void {
    if (index === null) return
    out.push(sse('content_block_stop', { type: 'content_block_stop', index }))
  }

  private openText(out: string[]): number {
    if (this.textIndex !== null) return this.textIndex
    // Anthropic never interleaves reasoning with speech; close it first so the transcript
    // reads in the same order the model produced it.
    if (this.reasoningIndex !== null) {
      this.closeBlock(this.reasoningIndex, out)
      this.reasoningIndex = null
    }
    this.textIndex = this.nextIndex++
    out.push(
      sse('content_block_start', {
        type: 'content_block_start',
        index: this.textIndex,
        content_block: { type: 'text', text: '' },
      }),
    )
    return this.textIndex
  }

  private openReasoning(out: string[]): number {
    if (this.reasoningIndex !== null) return this.reasoningIndex
    this.reasoningIndex = this.nextIndex++
    out.push(
      sse('content_block_start', {
        type: 'content_block_start',
        index: this.reasoningIndex,
        // No signature: open models do not issue one, and Hanlin initializes the field
        // to '' at content_block_start anyway.
        content_block: { type: 'thinking', thinking: '', signature: '' },
      }),
    )
    return this.reasoningIndex
  }

  /** Translate one OpenAI chunk. Returns the SSE text to forward. */
  push(chunk: AnyRecord): string {
    const out: string[] = []
    this.start(out)

    if (chunk.usage) this.usage = chunk.usage

    const choice = chunk.choices?.[0]
    if (!choice) return out.join('')

    const delta = choice.delta ?? {}

    // Reasoning models expose their scratchpad under several names depending on vendor.
    const reasoning = delta.reasoning_content ?? delta.reasoning
    if (typeof reasoning === 'string' && reasoning.length > 0) {
      const index = this.openReasoning(out)
      out.push(
        sse('content_block_delta', {
          type: 'content_block_delta',
          index,
          delta: { type: 'thinking_delta', thinking: reasoning },
        }),
      )
    }

    if (typeof delta.content === 'string' && delta.content.length > 0) {
      const index = this.openText(out)
      out.push(
        sse('content_block_delta', {
          type: 'content_block_delta',
          index,
          delta: { type: 'text_delta', text: delta.content },
        }),
      )
    }

    for (const call of (delta.tool_calls ?? []) as AnyRecord[]) {
      // OpenAI keys tool calls by position and sends id/name only on the first delta.
      const key = typeof call.index === 'number' ? call.index : 0
      let index = this.toolBlocks.get(key)
      if (index === undefined) {
        if (this.textIndex !== null) {
          this.closeBlock(this.textIndex, out)
          this.textIndex = null
        }
        if (this.reasoningIndex !== null) {
          this.closeBlock(this.reasoningIndex, out)
          this.reasoningIndex = null
        }
        index = this.nextIndex++
        this.toolBlocks.set(key, index)
        out.push(
          sse('content_block_start', {
            type: 'content_block_start',
            index,
            content_block: {
              type: 'tool_use',
              // Some providers omit the id; the tool_result must still be able to name it.
              id: call.id || `toolu_${randomUUID().replace(/-/g, '')}`,
              name: call.function?.name ?? 'unknown',
              input: {},
            },
          }),
        )
      }
      const args = call.function?.arguments
      if (typeof args === 'string' && args.length > 0) {
        out.push(
          sse('content_block_delta', {
            type: 'content_block_delta',
            index,
            delta: { type: 'input_json_delta', partial_json: args },
          }),
        )
      }
    }

    if (choice.finish_reason) this.finishReason = choice.finish_reason

    return out.join('')
  }

  /** Close every open block and emit the terminal events. */
  finish(): string {
    const out: string[] = []
    this.start(out)

    this.closeBlock(this.textIndex, out)
    this.textIndex = null
    this.closeBlock(this.reasoningIndex, out)
    this.reasoningIndex = null
    const hadToolCalls = this.toolBlocks.size > 0
    for (const index of this.toolBlocks.values()) this.closeBlock(index, out)
    this.toolBlocks.clear()

    // A turn that emitted tool_use blocks stopped for a tool call, whatever the provider
    // called it — several report `stop` alongside tool calls, which would otherwise
    // produce a message whose stop_reason contradicts its own content.
    const stopReason = hadToolCalls ? 'tool_use' : toStopReason(this.finishReason)
    out.push(
      sse('message_delta', {
        type: 'message_delta',
        delta: { stop_reason: stopReason, stop_sequence: null },
        usage: toAnthropicUsage(this.usage),
      }),
    )
    out.push(sse('message_stop', { type: 'message_stop' }))
    return out.join('')
  }
}

/** Convert a non-streaming OpenAI completion into an Anthropic `BetaMessage`. */
export function toAnthropicMessage(completion: AnyRecord, model: string): AnyRecord {
  const choice = completion.choices?.[0]
  const message = choice?.message ?? {}
  const content: AnyRecord[] = []

  const reasoning = message.reasoning_content ?? message.reasoning
  if (typeof reasoning === 'string' && reasoning) {
    content.push({ type: 'thinking', thinking: reasoning, signature: '' })
  }
  if (typeof message.content === 'string' && message.content) {
    content.push({ type: 'text', text: message.content, citations: null })
  }
  for (const call of (message.tool_calls ?? []) as AnyRecord[]) {
    let input: AnyRecord = {}
    try {
      input = call.function?.arguments ? JSON.parse(call.function.arguments) : {}
    } catch {
      // A malformed tool call must still reach the loop: the model can correct itself from
      // the resulting tool error, whereas a thrown parse error ends the turn.
      input = {}
    }
    content.push({
      type: 'tool_use',
      id: call.id || `toolu_${randomUUID().replace(/-/g, '')}`,
      name: call.function?.name ?? 'unknown',
      input,
    })
  }

  const hadToolCalls = content.some(block => block.type === 'tool_use')
  return {
    id: completion.id ?? `msg_${randomUUID().replace(/-/g, '')}`,
    type: 'message',
    role: 'assistant',
    model: completion.model ?? model,
    content,
    stop_reason: hadToolCalls ? 'tool_use' : toStopReason(choice?.finish_reason),
    stop_sequence: null,
    usage: toAnthropicUsage(completion.usage),
  }
}
