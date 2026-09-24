import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Smoke test against the COMPILED server: requires `npm run build` (tsc) to have run first
// so that dist/index.js exists and reflects the current sources.
const serverPath = fileURLToPath(new URL("../dist/index.js", import.meta.url));

describe("trueicon MCP server (stdio)", () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ name: "trueicon-smoke-test", version: "0.0.0" });
    await client.connect(
      new StdioClientTransport({ command: process.execPath, args: [serverPath], stderr: "ignore" }),
    );
  });

  afterAll(async () => {
    await client?.close();
  });

  it("reports its name and version", () => {
    expect(client.getServerVersion()).toMatchObject({ name: "trueicon", version: "0.2.0" });
  });

  it("lists the ping tool", async () => {
    const { tools } = await client.listTools();
    const ping = tools.find((tool) => tool.name === "ping");
    expect(ping).toBeDefined();
    expect(ping?.description).toBe("Health check");
  });

  it("returns the expected payload from ping", async () => {
    const result = await client.callTool({ name: "ping", arguments: {} });
    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content).toHaveLength(1);
    expect(content[0].type).toBe("text");
    expect(JSON.parse(content[0].text)).toEqual({ status: "ok", server: "trueicon" });
  });
});
