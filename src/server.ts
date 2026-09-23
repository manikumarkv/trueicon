import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPingTool } from "./tools/ping.js";

export const SERVER_NAME = "trueicon";
export const SERVER_VERSION = "0.1.0";

// Builds the MCP server with all tools registered. Transport wiring lives in index.ts.
export function createServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  registerPingTool(server);

  return server;
}
