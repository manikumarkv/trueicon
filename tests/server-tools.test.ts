import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { setUpToolEnv, type ToolEnv } from "./helpers/toolEnv.js";

type TextContent = Array<{ type: string; text: string }>;

describe("trueicon MCP server tools (in-memory)", () => {
  let env: ToolEnv;
  let client: Client;

  beforeAll(async () => {
    env = await setUpToolEnv();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await createServer().connect(serverTransport);
    client = new Client({ name: "trueicon-tools-test", version: "0.0.0" });
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client?.close();
    env?.restore();
  });

  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    const content = result.content as TextContent;
    expect(content).toHaveLength(1);
    expect(content[0]!.type).toBe("text");
    return { isError: result.isError, body: JSON.parse(content[0]!.text) as Record<string, unknown> };
  };

  it("lists the icon tools", async () => {
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["ping", "search_icons", "list_providers", "get_icon"]));
  });

  it("searches icons end to end", async () => {
    const { isError, body } = await call("search_icons", { query: "trash", provider: "lucide" });
    expect(isError).toBeFalsy();
    const results = body.results as Array<Record<string, unknown>>;
    expect(results[0]).toMatchObject({ importName: "Trash2", usage: "import { Trash2 } from 'lucide-react';" });
  });

  it("gets an icon and lists providers", async () => {
    expect((await call("get_icon", { name: "TrashIcon", provider: "heroicons" })).body).toMatchObject({
      importName: "TrashIcon",
      package: "@heroicons/react",
    });
    const { body } = await call("list_providers", {});
    expect(body.configured).toHaveLength(2);
    expect(body.registry).toHaveLength(9);
  });

  it("returns tool errors as isError JSON", async () => {
    const { isError, body } = await call("get_icon", { name: "Nope", provider: "lucide" });
    expect(isError).toBe(true);
    expect(body.error).toMatch(/Nope/);
  });
});
