import * as React from 'react'
import { Box, Text } from '../../ink.js'
import { truncate } from '../../utils/format.js'
import type { LogOption } from '../../types/logs.js'

/**
 * FinClaw start screen: a block-letter wordmark over the session context.
 *
 * Each glyph is three rows tall and the rows are joined with a two-space
 * gap, so the whole wordmark is a fixed 34 columns. Below WORDMARK_MIN_COLS
 * there isn't room for it, and we fall back to the plain name.
 */

const GLYPHS: Record<string, [string, string, string]> = {
  F: ['█▀▀', '█▀ ', '█  '],
  I: ['█', '█', '█'],
  N: ['█▄ █', '█ ▀█', '█  █'],
  C: ['▄▀▀', '█  ', '▀▄▄'],
  L: ['█  ', '█  ', '▀▀▀'],
  A: ['▄▀▄', '█▀█', '▀ ▀'],
  W: ['█   █', '█ ▄ █', '▀▄▀▄▀'],
}

const WORD = 'FINCLAW'
const GLYPH_GAP = '  '

const WORDMARK_ROWS: string[] = [0, 1, 2].map(row =>
  WORD.split('')
    .map(ch => GLYPHS[ch]![row]!)
    .join(GLYPH_GAP),
)

/** Widest wordmark row, plus the padding the caller adds on both sides. */
const WORDMARK_MIN_COLS =
  Math.max(...WORDMARK_ROWS.map(r => r.length)) + 6

type Props = {
  welcomeMessage: string
  version: string
  modelDisplayName: string
  billingType: string
  organizationName?: string | null
  cwdLine: string
  columns: number
  activities: LogOption[]
}

export function FinClawWordmark({
  welcomeMessage,
  version,
  modelDisplayName,
  billingType,
  organizationName,
  cwdLine,
  columns,
  activities,
}: Props): React.ReactNode {
  const inner = Math.max(columns - 4, 20)

  const metaParts = [`v${version}`, modelDisplayName, billingType]
  if (organizationName) metaParts.push(organizationName)
  const metaLine = truncate(metaParts.join(' · '), inner)

  const recent = activities[0]

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      {columns >= WORDMARK_MIN_COLS ? (
        WORDMARK_ROWS.map((row, i) => (
          <Text key={i} color="claude">
            {row}
          </Text>
        ))
      ) : (
        <Text bold={true} color="claude">
          FinClaw
        </Text>
      )}

      <Box marginTop={1} flexDirection="column">
        <Text bold={true}>{truncate(welcomeMessage, inner)}</Text>
        <Text dimColor={true}>{metaLine}</Text>
        <Text dimColor={true}>{truncate(cwdLine, inner)}</Text>
      </Box>

      {recent ? (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor={true}>
            Last session{'  '}
            {truncate(recent.firstPrompt, Math.max(inner - 14, 12))}
          </Text>
        </Box>
      ) : null}

      <Box marginTop={1}>
        <Text dimColor={true}>
          <Text color="claude">/init</Text>
          {'  scaffold a CLAUDE.md      '}
          <Text color="claude">/help</Text>
          {'  all commands'}
        </Text>
      </Box>
    </Box>
  )
}
