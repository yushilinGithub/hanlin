/**
 * Types for the unpublished `@ant/computer-use-mcp` package.
 * Split out because the CLI imports `@ant/computer-use-mcp/types` directly.
 */

export type CoordinateMode = 'chicago' | 'api'

export type CuSubGates = {
  screenshot?: boolean
  input?: boolean
  clipboard?: boolean
  applications?: boolean
}

export type Capabilities = {
  screenshotFiltering: 'native' | 'none'
  platform: NodeJS.Platform
  hostBundleId?: string | null
  teachMode?: boolean
}

export type DisplayGeometry = {
  width: number
  height: number
  scale: number
}

export type ScreenshotResult = {
  data: string
  width: number
  height: number
}

export type FrontmostApp = { bundleId: string | null; name: string | null }
export type InstalledApp = { bundleId: string; name: string; path?: string }
export type RunningApp = { bundleId: string; name: string; pid?: number }

export type ResolvePrepareCaptureResult = {
  geometry: DisplayGeometry
  filter?: unknown
}

export type ComputerExecutor = {
  capabilities: Capabilities
  [key: string]: unknown
}

export type GrantFlags = {
  screenshot: boolean
  input: boolean
  clipboard: boolean
  applications: boolean
}

export type ScreenshotDims = { width: number; height: number }

export type CuCallToolResult = {
  content: Array<{ type: string; [key: string]: unknown }>
  isError?: boolean
}

export type CuPermissionRequest = {
  toolName: string
  input: Record<string, unknown>
}

export type CuPermissionResponse = {
  behavior: 'allow' | 'deny'
  message?: string
}

export type ComputerUseSessionContext = {
  getGrantFlags: () => GrantFlags
  [key: string]: unknown
}

/** Default (fully un-granted) computer-use permission flags. */
export const DEFAULT_GRANT_FLAGS: GrantFlags = {
  screenshot: false,
  input: false,
  clipboard: false,
  applications: false,
}
