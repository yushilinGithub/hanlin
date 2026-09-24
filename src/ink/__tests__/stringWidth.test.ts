import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { stringWidthJavaScript } from '../stringWidth.js'

/**
 * The JS implementation runs whenever Bun.stringWidth is absent — notably when
 * the built bundle is started with `node dist/cli.mjs`. It used to give emoji
 * width (2) to every code point emoji-regex matches, including text-presentation
 * symbols like ✔ that terminals draw in one column. A cell reserved as wide but
 * drawn narrow desyncs the cursor by one for the rest of the row, so later
 * partial repaints land a column early and leave characters behind mid-word
 * ("Custom model" rendered as "Cputom model").
 */
describe('stringWidthJavaScript — emoji presentation', () => {
  const cases: [string, number][] = [
    ['✔', 1], // U+2714, text presentation by default
    ['⚠', 1],
    ['✂', 1],
    ['❤', 1],
    ['☠︎', 1], // VS15 forces text presentation
    ['✔️', 2], // VS16 forces emoji presentation
    ['❤️', 2],
    ['✅', 2], // U+2705, emoji presentation by default
    ['🎉', 2],
    ['🇯🇵', 2], // regional indicator pair
    ['中', 2],
    ['a', 1],
    ['·', 1],
    ['❯', 1],
  ]

  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} → ${expected}`, () => {
      assert.equal(stringWidthJavaScript(input), expected)
    })
  }

  it('measures a whole line the same way a terminal advances it', () => {
    assert.equal(stringWidthJavaScript('alibaba-cn/kimi-k3 ✔'), 20)
  })

  // Both implementations must agree, or the same desync returns whenever the
  // bundle runs under node instead of bun.
  it('agrees with Bun.stringWidth where available', () => {
    const bun = (globalThis as { Bun?: { stringWidth?: (s: string, o?: unknown) => number } }).Bun
    if (!bun?.stringWidth) return
    for (const [input] of cases) {
      assert.equal(
        stringWidthJavaScript(input),
        bun.stringWidth(input, { ambiguousIsNarrow: true }),
        `disagreement for ${JSON.stringify(input)}`,
      )
    }
  })
})
