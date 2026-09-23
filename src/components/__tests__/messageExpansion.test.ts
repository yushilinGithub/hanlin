import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { hasExpandableThinking } from '../messageExpansion.js'

const msg = (...content: unknown[]) => ({ message: { content } })

describe('hasExpandableThinking', () => {
  it('is true for a thinking block with text', () => {
    assert.ok(hasExpandableThinking(msg({ type: 'thinking', thinking: 'weighing two options' })))
  })

  it('is true when thinking precedes a tool call (the common turn shape)', () => {
    assert.ok(
      hasExpandableThinking(
        msg({ type: 'thinking', thinking: 'need to read the file' }, { type: 'tool_use', id: 't1', name: 'Read' }),
      ),
    )
  })

  it('is false for redacted thinking — there is no text to reveal', () => {
    assert.equal(hasExpandableThinking(msg({ type: 'redacted_thinking', data: 'xyz' })), false)
  })

  it('is false for an empty thinking block', () => {
    assert.equal(hasExpandableThinking(msg({ type: 'thinking', thinking: '' })), false)
  })

  it('is false for ordinary text and tool-use rows', () => {
    assert.equal(hasExpandableThinking(msg({ type: 'text', text: 'done' })), false)
    assert.equal(hasExpandableThinking(msg({ type: 'tool_use', id: 't1', name: 'Bash' })), false)
    assert.equal(hasExpandableThinking(msg()), false)
  })
})
