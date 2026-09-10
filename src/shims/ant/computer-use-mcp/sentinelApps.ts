/**
 * Sentinel-app classification from the unpublished `@ant/computer-use-mcp`
 * package. The real implementation flags applications that warrant an extra
 * confirmation prompt (password managers, banking apps, and so on).
 *
 * With the native package absent, nothing is classified as sentinel.
 */

export type SentinelCategory =
  | 'credentials'
  | 'financial'
  | 'communication'
  | 'system'
  | null

export function getSentinelCategory(_bundleId: string): SentinelCategory {
  return null
}
