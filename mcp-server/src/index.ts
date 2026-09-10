#!/usr/bin/env node
/**
 * STDIO entrypoint — for local use with FinWorker, Claude Desktop, etc.
 *
 * Usage:
 *   node dist/index.js
 *   FINWORKER_SRC_ROOT=/path/to/src node dist/index.js
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer, validateSrcRoot, SRC_ROOT } from "./server.js";

async function main() {
  await validateSrcRoot();
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`FinWorker Explorer MCP (stdio) started — src: ${SRC_ROOT}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
