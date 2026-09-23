import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Placeholder health-check tool. Real icon tools will be added alongside it in later phases.
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
