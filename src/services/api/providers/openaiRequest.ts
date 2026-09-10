import { projectToolSchema } from './toolSchema.js'
import type { ResolvedProvider } from './types.js'

type AnyRecord = Record<string, any>

/** OpenAI chat-completions message shapes we emit. */
type OpenAIMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | AnyRecord[] | null
  tool_calls?: AnyRecord[]
  tool_call_id?: string
}

function systemToText(system: unknown): string | undefined {
  if (!system) return undefined
  if (typeof system === 'string') return system
  if (!Array.isArray(system)) return undefined
  const text = system
    .map(block => (typeof block === 'string' ? block : ((block as AnyRecord)?.text ?? '')))
    .filter(Boolean)
    .join('\n\n')
  return text || undefined
}

function imagePart(source: AnyRecord | undefined): AnyRecord | undefined {
  if (!source) return undefined
  if (source.type === 'url' && typeof source.url === 'string') {
    return { type: 'image_url', image_url: { url: source.url } }
  }
  if (source.type === 'base64' && source.data) {
    const mediaType = source.media_type ?? 'image/png'
    return { type: 'image_url', image_url: { url: `data:${mediaType};base64,${source.data}` } }
  }
  return undefined
}

/**
 * Flatten a tool_result's content to text.
 *
 * OpenAI `tool` messages take a string only, so image results are announced rather than
 * carried — dropping them silently would leave the model reasoning about a screenshot it
 * was never shown.
 */
function toolResultToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    const b = block as AnyRecord
    if (typeof b === 'string') parts.push(b)
    else if (b?.type === 'text') parts.push(b.text ?? '')
    else if (b?.type === 'image') parts.push('[image omitted: provider does not accept images in tool results]')
  }
  return parts.join('\n')
}

function contentBlocks(content: unknown): AnyRecord[] {
  if (typeof content === 'string') return content ? [{ type: 'text', text: content }] : []
  return Array.isArray(content) ? (content as AnyRecord[]) : []
}

function convertAssistant(blocks: AnyRecord[], out: OpenAIMessage[]): void {
  const textParts: string[] = []
  const toolCalls: AnyRecord[] = []

  for (const block of blocks) {
    switch (block.type) {
      case 'text':
        if (block.text) textParts.push(block.text)
        break
      case 'tool_use':
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
        })
        break
      // Thinking blocks carry an Anthropic-issued signature and cannot be replayed to
      // another provider. They are dropped rather than sent as text: presenting prior
      // reasoning as assistant speech changes what the model thinks it committed to.
      case 'thinking':
      case 'redacted_thinking':
        break
      default:
        break
    }
  }

  const message: OpenAIMessage = { role: 'assistant' }
  message.content = textParts.length > 0 ? textParts.join('\n') : null
  if (toolCalls.length > 0) message.tool_calls = toolCalls
  // An assistant turn with neither text nor tool calls is not meaningful to OpenAI.
  if (message.content === null && toolCalls.length === 0) return
  out.push(message)
}

function convertUser(blocks: AnyRecord[], out: OpenAIMessage[]): void {
  // Anthropic nests tool results inside the following user turn; OpenAI needs them as
  // standalone `tool` messages directly after the assistant turn that called them. Emit
  // those first, then whatever the user actually said.
  const rest: AnyRecord[] = []
  for (const block of blocks) {
    if (block.type === 'tool_result') {
      out.push({
        role: 'tool',
        tool_call_id: block.tool_use_id,
        content: toolResultToText(block.content),
      })
    } else {
      rest.push(block)
    }
  }
  if (rest.length === 0) return

  const parts: AnyRecord[] = []
  for (const block of rest) {
    if (block.type === 'text' && block.text) parts.push({ type: 'text', text: block.text })
    else if (block.type === 'image') {
      const part = imagePart(block.source)
      if (part) parts.push(part)
    } else if (block.type === 'document') {
      parts.push({ type: 'text', text: '[document omitted: unsupported by provider]' })
    }
  }
  if (parts.length === 0) return

  // Collapse the common all-text case: some providers are stricter about part arrays.
  const allText = parts.every(p => p.type === 'text')
  out.push({
    role: 'user',
    content: allText ? parts.map(p => p.text).join('\n') : parts,
  })
}

function convertTools(tools: unknown, provider: ResolvedProvider): AnyRecord[] | undefined {
  if (!Array.isArray(tools) || tools.length === 0) return undefined
  const dialect = provider.profile.toolSchema ?? 'openai'
  const converted: AnyRecord[] = []
  for (const tool of tools as AnyRecord[]) {
    // Server-side tools (advisor, web_search, …) are Anthropic-executed and have no
    // equivalent here; the model must not be told they exist.
    if (tool.type && !tool.input_schema) continue
    if (!tool.name) continue
    converted.push({
      type: 'function',
      function: {
        name: tool.name,
        ...(tool.description ? { description: tool.description } : {}),
        parameters: projectToolSchema(tool.input_schema ?? { type: 'object' }, dialect),
      },
    })
  }
  return converted.length > 0 ? converted : undefined
}

function convertToolChoice(choice: AnyRecord | undefined): unknown {
  if (!choice) return undefined
  switch (choice.type) {
    case 'auto':
      return 'auto'
    case 'any':
      return 'required'
    case 'none':
      return 'none'
    case 'tool':
      return { type: 'function', function: { name: choice.name } }
    default:
      return undefined
  }
}

/**
 * Lower an Anthropic Messages request to an OpenAI chat-completions request.
 *
 * Anthropic-only parameters (`thinking`, `output_config`, `speed`, `context_management`,
 * `betas`, `metadata`, `cache_control`) are dropped rather than approximated.
 */
export function toOpenAIRequest(body: AnyRecord, provider: ResolvedProvider): AnyRecord {
  const messages: OpenAIMessage[] = []

  const system = systemToText(body.system)
  if (system) messages.push({ role: 'system', content: system })

  for (const message of (body.messages ?? []) as AnyRecord[]) {
    const blocks = contentBlocks(message.content)
    if (message.role === 'assistant') convertAssistant(blocks, messages)
    else convertUser(blocks, messages)
  }

  const tools = convertTools(body.tools, provider)
  const toolChoice = convertToolChoice(body.tool_choice)

  return {
    model: body.model,
    messages,
    ...(tools ? { tools } : {}),
    // `tool_choice` without tools is rejected by several providers.
    ...(tools && toolChoice !== undefined ? { tool_choice: toolChoice } : {}),
    ...(typeof body.max_tokens === 'number' ? { max_tokens: body.max_tokens } : {}),
    ...(typeof body.temperature === 'number' ? { temperature: body.temperature } : {}),
    ...(typeof body.top_p === 'number' ? { top_p: body.top_p } : {}),
    ...(Array.isArray(body.stop_sequences) && body.stop_sequences.length > 0
      ? { stop: body.stop_sequences }
      : {}),
    ...(body.stream
      ? { stream: true, stream_options: { include_usage: true } }
      : {}),
  }
}
