/**
 * Types for the unpublished `@ant/computer-use-swift` package (SCContentFilter
 * screenshots, NSWorkspace app list, TCC permission checks). Loaded at runtime
 * in src/utils/computerUse/swiftLoader.ts, so this shim only needs the types.
 */

import type {
  DisplayGeometry,
  FrontmostApp,
  InstalledApp,
  RunningApp,
  ScreenshotResult,
} from './computer-use-mcp/types.js'

export type ComputerUseAPI = {
  screenshot(): Promise<ScreenshotResult>
  displayGeometry(): DisplayGeometry
  frontmostApp(): FrontmostApp
  installedApps(): InstalledApp[]
  runningApps(): RunningApp[]
  hasScreenRecordingPermission(): boolean
  hasAccessibilityPermission(): boolean
}
