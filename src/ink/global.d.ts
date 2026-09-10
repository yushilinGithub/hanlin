/**
 * Ambient JSX declarations for the vendored Ink renderer.
 *
 * The reconciler in this directory renders to its own host elements
 * (see `ElementNames` in ./dom.ts) rather than to the DOM, so those element
 * names have to be declared as JSX intrinsics. Components that use them
 * import this file for its side effect.
 */

import type { ReactNode, Ref } from 'react'
import type { Styles } from './styles.js'
import type { DOMElement } from './dom.js'

type InkPointerEvent = {
  x: number
  y: number
}

type InkCommonProps = {
  children?: ReactNode
  style?: Styles
  ref?: Ref<DOMElement>
  tabIndex?: number
  autoFocus?: boolean
  onClick?: (event: InkPointerEvent) => void
  onFocus?: () => void
  onFocusCapture?: () => void
  onBlur?: () => void
  onBlurCapture?: () => void
  onMouseEnter?: (event: InkPointerEvent) => void
  onMouseLeave?: (event: InkPointerEvent) => void
  onKeyDown?: (event: unknown) => void
  onKeyDownCapture?: (event: unknown) => void
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'ink-root': InkCommonProps
      'ink-box': InkCommonProps
      'ink-text': InkCommonProps & { textStyles?: unknown }
      'ink-virtual-text': InkCommonProps & { textStyles?: unknown }
      'ink-link': InkCommonProps & { url?: string }
      'ink-progress': InkCommonProps & { value?: number }
      'ink-raw-ansi': InkCommonProps & { content?: string }
    }
  }
}

export {}
