import { useMemo } from 'react'
import { stringWidth } from '../../ink/stringWidth.js'
import { type DOMElement, useAnimationFrame } from '../../ink.js'
import type { SpinnerMode } from './types.js'

export function useShimmerAnimation(
  mode: SpinnerMode,
  message: string,
  isStalled: boolean,
): [ref: (element: DOMElement | null) => void, glimmerIndex: number] {
  // The travelling highlight across the verb is off: it repainted the line 5-20
  // times a second, which some terminals redraw incompletely (leftover characters
  // mid-word). The animated glyph in front of the message carries the "working"
  // signal on its own. `null` below unsubscribes from the clock entirely, so no
  // timer runs and the message renders as one static Text node.
  const SHIMMER_ENABLED = false

  const glimmerSpeed = mode === 'requesting' ? 50 : 200
  // Pass null when stalled to unsubscribe from the clock — otherwise the
  // setInterval keeps firing at 20fps even when the shimmer isn't visible.
  // Notably, if the caller never attaches `ref` (e.g. conditional JSX),
  // useTerminalViewport stays at its initial isVisible:true and the
  // viewport-pause never kicks in, so this is the only stop mechanism.
  const [ref, time] = useAnimationFrame(
    isStalled || !SHIMMER_ENABLED ? null : glimmerSpeed,
  )
  const messageWidth = useMemo(() => stringWidth(message), [message])

  // -100 puts the highlight window far off the left edge, so GlimmerMessage takes
  // its single-Text branch.
  if (isStalled || !SHIMMER_ENABLED) {
    return [ref, -100]
  }

  const cyclePosition = Math.floor(time / glimmerSpeed)
  const cycleLength = messageWidth + 20

  if (mode === 'requesting') {
    return [ref, (cyclePosition % cycleLength) - 10]
  }
  return [ref, messageWidth + 10 - (cyclePosition % cycleLength)]
}

