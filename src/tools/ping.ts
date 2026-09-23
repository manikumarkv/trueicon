import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Health-check tool.
export function registerPingTool(server: McpServer): void {
  server.registerTool(
    "ping",
    { description: "Health check" },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({ status: "ok", server: "trueicon" }),
        },
      ],
    }),
  );
}
