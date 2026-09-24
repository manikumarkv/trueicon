import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetIconTool } from "./tools/getIcon.js";
import { registerListProvidersTool } from "./tools/listProviders.js";
import { registerPingTool } from "./tools/ping.js";
import { createProjectLocator } from "./tools/projectLocator.js";
import { registerSearchIconsTool } from "./tools/searchIcons.js";

export const SERVER_NAME = "trueicon";
// Read from package.json (one level up from both src/ and dist/) so it can't drift from the release.
export const SERVER_VERSION = (
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }
).version;

// Builds the MCP server with all tools registered. Transport wiring lives in index.ts.
export function createServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  const locateProject = createProjectLocator(server.server);

  registerPingTool(server);
  registerSearchIconsTool(server, locateProject);
  registerListProvidersTool(server, locateProject);
  registerGetIconTool(server, locateProject);

  return server;
}
