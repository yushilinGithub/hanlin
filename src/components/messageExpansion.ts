/**
 * Which transcript rows reveal more when expanded.
 *
 * Kept out of Messages.tsx so the predicates can be unit-tested without pulling
 * in the Ink render tree. Consumed by `isItemClickable` there, which decides
 * whether a row is a click target in the virtualized list.
 */
import { type AdvisorBlock, isAdvisorBlock } from '../utils/advisor.js'

type AssistantLike = { message: { content: unknown[] } }

/** An advisor tool result — its row expands to the full advisory text. */
export function isAdvisorResultMessage(msg: AssistantLike): boolean {
  const block = msg.message.content[0] as AdvisorBlock | undefined
  return (
    block != null &&
    isAdvisorBlock(block) &&
    block.type === 'advisor_tool_result' &&
    block.content.type === 'advisor_result'
  )
}

/**
 * Thinking rows collapse to a single "∴ Thinking" line, and expanding reveals the
 * reasoning text. `redacted_thinking` carries no text, so it is not clickable —
 * Message.tsx also keeps those hidden outside transcript mode.
 */
export function hasExpandableThinking(msg: AssistantLike): boolean {
  return msg.message.content.some(
    block =>
      typeof block === 'object' &&
      block !== null &&
      (block as { type?: string }).type === 'thinking' &&
      !!(block as { thinking?: string }).thinking,
  )
}
