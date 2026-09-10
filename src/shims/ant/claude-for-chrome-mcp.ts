/**
 * Local shim for the unpublished `@ant/claude-for-chrome-mcp` package.
 *
 * The real package drives the Claude-in-Chrome browser extension over a
 * unix socket. It is not published, so this shim provides the shapes the
 * CLI imports and reports the feature as unavailable if anything tries to
 * actually start the server.
 *
 * The tool list mirrors `ChromeToolName` in
 * src/utils/claudeInChrome/toolRendering.tsx — keep the two in sync.
 */

export type PermissionMode = 'default' | 'skip_all_permission_checks'

export type Logger = {
  debug(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}

export type ClaudeForChromeContext = {
  getSocketPaths: () => string[]
  permissionMode?: PermissionMode
  logger?: Logger
}

export type BrowserTool = { name: string }

export const BROWSER_TOOLS: readonly BrowserTool[] = [
  { name: 'javascript_tool' },
  { name: 'read_page' },
  { name: 'find' },
  { name: 'form_input' },
  { name: 'computer' },
  { name: 'navigate' },
  { name: 'resize_window' },
  { name: 'gif_creator' },
  { name: 'upload_image' },
  { name: 'get_page_text' },
  { name: 'tabs_context_mcp' },
  { name: 'tabs_create_mcp' },
  { name: 'update_plan' },
  { name: 'read_console_messages' },
  { name: 'read_network_requests' },
  { name: 'shortcuts_list' },
  { name: 'shortcuts_execute' },
]

export function createClaudeForChromeMcpServer(
  _context: ClaudeForChromeContext,
): never {
  throw new Error(
    'Claude in Chrome is unavailable: the @ant/claude-for-chrome-mcp package is not published and is not bundled with this build.',
  )
}
