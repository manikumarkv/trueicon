import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetIconTool } from "./tools/getIcon.js";
import { registerListProvidersTool } from "./tools/listProviders.js";
import { registerPingTool } from "./tools/ping.js";
import { registerSearchIconsTool } from "./tools/searchIcons.js";

export const SERVER_NAME = "trueicon";
export const SERVER_VERSION = "0.2.0";

// Builds the MCP server with all tools registered. Transport wiring lives in index.ts.
export function createServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  registerPingTool(server);
  registerSearchIconsTool(server);
  registerListProvidersTool(server);
  registerGetIconTool(server);

  return server;
}
