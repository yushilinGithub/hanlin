/**
 * Local shim for the unpublished `@ant/computer-use-mcp` package.
 *
 * The real package bridges to native macOS capture and input (via
 * `@ant/computer-use-swift` and `@ant/computer-use-input`). Neither is
 * published, so the tool builders here return an empty tool set and the
 * server factory reports the feature as unavailable.
 */

export * from './types.js'

import type { ComputerUseSessionContext, CoordinateMode } from './types.js'

/** Resize parameters the API applies to screenshots before upload. */
export const API_RESIZE_PARAMS = {
  maxWidth: 1568,
  maxHeight: 1568,
} as const

/** Scales (w, h) down to fit within `params`, preserving aspect ratio. */
export function targetImageSize(
  width: number,
  height: number,
  params: { maxWidth: number; maxHeight: number } = API_RESIZE_PARAMS,
): { width: number; height: number } {
  const scale = Math.min(
    1,
    params.maxWidth / width,
    params.maxHeight / height,
  )
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  }
}

export type ComputerUseTool = { name: string }

export function buildComputerUseTools(
  _capabilities: unknown,
  _coordinateMode: CoordinateMode,
): ComputerUseTool[] {
  // Without the native package there are no computer-use tools to expose.
  return []
}

export function bindSessionContext(
  _hostAdapter: unknown,
  _coordinateMode: CoordinateMode,
  _context: ComputerUseSessionContext,
): () => never {
  return () => {
    throw new Error(
      'Computer use is unavailable: the @ant/computer-use-mcp package is not published and is not bundled with this build.',
    )
  }
}

export function createComputerUseMcpServer(..._args: unknown[]): never {
  throw new Error(
    'Computer use is unavailable: the @ant/computer-use-mcp package is not published and is not bundled with this build.',
  )
}
