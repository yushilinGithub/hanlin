/**
 * Shared types for the keybinding system.
 *
 * The context and action name unions are derived from the canonical lists in
 * `schema.ts`, so adding a context or action there flows through here.
 */

import type {
  KEYBINDING_ACTIONS,
  KEYBINDING_CONTEXTS,
} from './schema.js'

/** A UI context in which a binding applies (e.g. 'Global', 'HistorySearch'). */
export type KeybindingContextName = (typeof KEYBINDING_CONTEXTS)[number]

/** A built-in action identifier, or a `command:<name>` slash-command binding. */
export type KeybindingAction = (typeof KEYBINDING_ACTIONS)[number] | string

/** A single keystroke with its modifier state. */
export type ParsedKeystroke = {
  key: string
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
  super: boolean
}

/**
 * A sequence of keystrokes. Length 1 for a plain shortcut; longer for a
 * chord such as "ctrl+k ctrl+s".
 */
export type Chord = ParsedKeystroke[]

/** One `{ context, bindings }` block as it appears in keybindings.json. */
export type KeybindingBlock = {
  context: KeybindingContextName
  /** Keystroke pattern → action, `command:<name>`, or null to unbind. */
  bindings: Record<string, KeybindingAction | null>
}

/** A binding after parsing, ready for matching against input. */
export type ParsedBinding = {
  chord: Chord
  action: KeybindingAction
  context: KeybindingContextName
}
