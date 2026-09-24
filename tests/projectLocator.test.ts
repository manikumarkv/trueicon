import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ListRootsRequestSchema, type Root } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "../src/server.js";
import type { ProjectLocation } from "../src/tools/context.js";
import { createProjectLocator, type RootsClient } from "../src/tools/projectLocator.js";

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function makeDir(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "trueicon-locator-"));
  tempDirs.push(dir);
  for (const [name, contents] of Object.entries(files)) writeFileSync(join(dir, name), contents);
  return dir;
}

const root = (dir: string): Root => ({ uri: pathToFileURL(dir).href });

// A fake of the SDK Server's roots API.
function fakeClient(opts: { supportsRoots: boolean; roots?: Root[]; fail?: boolean }) {
  let onRootsChanged: (() => void) | undefined;
  let calls = 0;
  const client = {
    getClientCapabilities: () => (opts.supportsRoots ? { roots: { listChanged: true } } : {}),
    listRoots: () => {
      calls++;
      return opts.fail ? Promise.reject(new Error("boom")) : Promise.resolve({ roots: opts.roots ?? [] });
    },
    setNotificationHandler: (_schema: unknown, handler: () => void) => {
      onRootsChanged = handler;
    },
  };
  return {
    client: client as unknown as RootsClient,
    calls: () => calls,
    setRoots: (roots: Root[]) => (opts.roots = roots),
    notifyRootsChanged: () => onRootsChanged?.(),
  };
}

const cwdFallback =
  (dir: string): (() => ProjectLocation) =>
  () => ({ dir, source: "cwd" });

describe("createProjectLocator", () => {
  it("always uses TRUEICON_PROJECT_DIR when it is set", async () => {
    const fake = fakeClient({ supportsRoots: true, roots: [root(makeDir({ "package.json": "{}" }))] });
    const locate = createProjectLocator(fake.client, () => ({ dir: "/env/dir", source: "TRUEICON_PROJECT_DIR" }));
    expect(await locate()).toEqual({ dir: "/env/dir", source: "TRUEICON_PROJECT_DIR" });
    expect(fake.calls()).toBe(0);
  });

  it("uses the first root that contains a project", async () => {
    const empty = makeDir();
    const project = makeDir({ "package.json": "{}" });
    const other = makeDir({ ".iconmcp.json": "{}" });
    const fake = fakeClient({ supportsRoots: true, roots: [root(empty), root(project), root(other)] });
    const locate = createProjectLocator(fake.client, cwdFallback(makeDir()));
    expect(await locate()).toEqual({ dir: project, source: "roots" });
  });

  it("prefers a working directory with a project over roots without one", async () => {
    const cwd = makeDir({ "package.json": "{}" });
    const fake = fakeClient({ supportsRoots: true, roots: [root(makeDir())] });
    const locate = createProjectLocator(fake.client, cwdFallback(cwd));
    expect(await locate()).toEqual({ dir: cwd, source: "cwd" });
  });

  it("falls back to the first root when neither roots nor cwd have a project", async () => {
    const first = makeDir();
    const fake = fakeClient({ supportsRoots: true, roots: [root(first), root(makeDir())] });
    const locate = createProjectLocator(fake.client, cwdFallback(makeDir()));
    expect(await locate()).toEqual({ dir: first, source: "roots" });
  });

  it("ignores non-file roots and uses cwd when the client does not support roots", async () => {
    const cwd = makeDir();
    const httpOnly = fakeClient({ supportsRoots: true, roots: [{ uri: "https://example.com/repo" }] });
    expect(await createProjectLocator(httpOnly.client, cwdFallback(cwd))()).toEqual({ dir: cwd, source: "cwd" });

    const noRoots = fakeClient({ supportsRoots: false, roots: [root(makeDir({ "package.json": "{}" }))] });
    expect(await createProjectLocator(noRoots.client, cwdFallback(cwd))()).toEqual({ dir: cwd, source: "cwd" });
    expect(noRoots.calls()).toBe(0);
  });

  it("caches roots until the client reports a change", async () => {
    const a = makeDir({ "package.json": "{}" });
    const b = makeDir({ "package.json": "{}" });
    const fake = fakeClient({ supportsRoots: true, roots: [root(a)] });
    const locate = createProjectLocator(fake.client, cwdFallback(makeDir()));

    expect((await locate()).dir).toBe(a);
    fake.setRoots([root(b)]);
    expect((await locate()).dir).toBe(a);
    expect(fake.calls()).toBe(1);

    fake.notifyRootsChanged();
    expect((await locate()).dir).toBe(b);
    expect(fake.calls()).toBe(2);
  });

  it("falls back to cwd when listing roots fails, and retries on the next call", async () => {
    const cwd = makeDir();
    const fake = fakeClient({ supportsRoots: true, fail: true });
    const locate = createProjectLocator(fake.client, cwdFallback(cwd));
    expect(await locate()).toEqual({ dir: cwd, source: "cwd" });
    expect(await locate()).toEqual({ dir: cwd, source: "cwd" });
    expect(fake.calls()).toBe(2);
  });
});

describe("roots through a real MCP client", () => {
  const savedEnv = process.env.TRUEICON_PROJECT_DIR;
  let client: Client;
  let roots: Root[];

  beforeEach(async () => {
    delete process.env.TRUEICON_PROJECT_DIR;
    client = new Client({ name: "roots-test", version: "0" }, { capabilities: { roots: { listChanged: true } } });
    client.setRequestHandler(ListRootsRequestSchema, () => ({ roots }));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([createServer().connect(serverTransport), client.connect(clientTransport)]);
  });

  afterEach(async () => {
    await client.close();
    if (savedEnv === undefined) delete process.env.TRUEICON_PROJECT_DIR;
    else process.env.TRUEICON_PROJECT_DIR = savedEnv;
  });

  async function listProviders(): Promise<{ project: ProjectLocation; configured: { package: string }[] }> {
    const result = await client.callTool({ name: "list_providers", arguments: {} });
    const [content] = result.content as { type: string; text: string }[];
    return JSON.parse(content!.text) as { project: ProjectLocation; configured: { package: string }[] };
  }

  it("reads the project from the client's roots and follows root changes", async () => {
    const lucideApp = makeDir({ "package.json": JSON.stringify({ dependencies: { "lucide-react": "^1.47.0" } }) });
    const tablerApp = makeDir({ "package.json": JSON.stringify({ dependencies: { "@tabler/icons-react": "^3.48.0" } }) });

    roots = [root(lucideApp)];
    expect(await listProviders()).toMatchObject({
      project: { dir: lucideApp, source: "roots" },
      configured: [{ package: "lucide-react" }],
    });

    roots = [root(tablerApp)];
    await client.sendRootsListChanged();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await listProviders()).toMatchObject({
      project: { dir: tablerApp, source: "roots" },
      configured: [{ package: "@tabler/icons-react" }],
    });
  });
});
