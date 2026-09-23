import * as React from 'react'
import { Box, Text } from '../../ink.js'
import { truncate } from '../../utils/format.js'
import type { LogOption } from '../../types/logs.js'

/**
 * Hanlin start screen: a block-letter wordmark over the session context.
 *
 * The wordmark renders at one of three sizes, picked from the terminal width:
 *
 *   >= FULL_MIN_COLS     the full ANSI-shadow wordmark (6 rows, 47 columns)
 *   >= COMPACT_MIN_COLS  a half-height wordmark (3 rows, ~32 columns)
 *   below that           the plain name
 *
 * Each tier's columns already include the paddingX the wrapper adds on both
 * sides, so the art never wraps. The Chinese name sits above the art, where a
 * terminal that cannot render the block glyphs still shows it.
 */

/** The product name as shown wherever the art does not fit. */
export const HANLIN_NAME = '翰林 Hanlin'

/** Full-size wordmark: ANSI-shadow caps spelling HANLIN, 6 rows of 47 columns. */
const FULL_ROWS: readonly string[] = [
  '██╗  ██╗ █████╗ ███╗   ██╗██╗     ██╗███╗   ██╗',
  '██║  ██║██╔══██╗████╗  ██║██║     ██║████╗  ██║',
  '███████║███████║██╔██╗ ██║██║     ██║██╔██╗ ██║',
  '██╔══██║██╔══██║██║╚██╗██║██║     ██║██║╚██╗██║',
  '██║  ██║██║  ██║██║ ╚████║███████╗██║██║ ╚████║',
  '╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚═╝╚═╝  ╚═══╝',
]

/** Half-height glyphs, joined with a two-space gap, for narrower terminals. */
const COMPACT_GLYPHS: Record<string, [string, string, string]> = {
  H: ['█ █', '█▀█', '▀ ▀'],
  A: ['▄▀▄', '█▀█', '▀ ▀'],
  N: ['█▄ █', '█ ▀█', '█  █'],
  L: ['█  ', '█  ', '▀▀▀'],
  I: ['█', '█', '█'],
}

const WORD = 'HANLIN'
const GLYPH_GAP = '  '

const COMPACT_ROWS: string[] = [0, 1, 2].map(row =>
  WORD.split('')
    .map(ch => COMPACT_GLYPHS[ch]![row]!)
    .join(GLYPH_GAP),
)

/** Widest row of each tier, plus the paddingX the wrapper adds on both sides. */
const PADDING_COLS = 6
const FULL_MIN_COLS = Math.max(...FULL_ROWS.map(r => r.length)) + PADDING_COLS
const COMPACT_MIN_COLS =
  Math.max(...COMPACT_ROWS.map(r => r.length)) + PADDING_COLS

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

export function HanlinWordmark({
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

  const wordmarkRows =
    columns >= FULL_MIN_COLS
      ? FULL_ROWS
      : columns >= COMPACT_MIN_COLS
        ? COMPACT_ROWS
        : null

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      {wordmarkRows ? (
        <>
          <Text bold={true} color="claude">
            翰林
          </Text>
          {wordmarkRows.map((row, i) => (
            <Text key={i} bold={true} color="claude">
              {row}
            </Text>
          ))}
        </>
      ) : (
        <Text bold={true} color="claude">
          {HANLIN_NAME}
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
