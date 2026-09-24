import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PROVIDERS } from "../src/providers/registry.js";
import { resolveContext, type ToolContext } from "../src/tools/context.js";
import { getIconTool } from "../src/tools/getIcon.js";
import { listProvidersTool } from "../src/tools/listProviders.js";
import { searchIconsTool } from "../src/tools/searchIcons.js";
import { setUpToolEnv, type ToolEnv } from "./helpers/toolEnv.js";

let env: ToolEnv;
let ctx: ToolContext;
beforeAll(async () => {
  env = await setUpToolEnv();
  ctx = resolveContext();
});
afterAll(() => env?.restore());

// A context pointing at a scratch project dir (same cache), for config edge cases.
function scratchContext(files: Record<string, string>): ToolContext & { cleanup(): void } {
  const projectDir = mkdtempSync(join(tmpdir(), "trueicon-tools-scratch-"));
  for (const [name, contents] of Object.entries(files)) writeFileSync(join(projectDir, name), contents);
  return { ...ctx, projectDir, cleanup: () => rmSync(projectDir, { recursive: true, force: true }) };
}

describe("resolveContext", () => {
  it("reads the project dir and cache root from the environment", () => {
    expect(ctx.projectDir).toBe(env.projectDir);
    expect(ctx.cacheRoot).toBe(env.cacheRoot);
    expect(Object.keys(ctx.synonyms).length).toBeGreaterThan(0);
  });
});

describe("searchIconsTool", () => {
  it("finds the Trash2 family across configured providers with usage snippets", async () => {
    const { results, warnings } = await searchIconsTool({ query: "trash" }, ctx);
    expect(warnings).toBeUndefined();
    const trash2 = results.find((r) => r.importName === "Trash2");
    expect(trash2).toMatchObject({
      name: "trash-2",
      importPath: "lucide-react",
      package: "lucide-react",
      version: "0.460.0",
      usage: "import { Trash2 } from 'lucide-react';",
    });
    expect(results.every((r) => r.usage.startsWith("import {"))).toBe(true);
    expect(new Set(results.map((r) => r.package))).toEqual(new Set(["lucide-react", "@heroicons/react"]));
    const scores = results.map((r) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
  });

  it("filters by provider id or package name", async () => {
    for (const provider of ["heroicons", "@heroicons/react"]) {
      const { results } = await searchIconsTool({ query: "trash", provider }, ctx);
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.package === "@heroicons/react")).toBe(true);
    }
    const solid = await searchIconsTool({ query: "trash", provider: "heroicons", style: "solid" }, ctx);
    expect(solid.results.map((r) => r.style)).toEqual(["solid"]);
  });

  it("clamps the limit to 1..50", async () => {
    expect((await searchIconsTool({ query: "trash", limit: 1 }, ctx)).results).toHaveLength(1);
    expect((await searchIconsTool({ query: "trash", limit: 0 }, ctx)).results).toHaveLength(1);
    const all = await searchIconsTool({ query: "trash", limit: 500 }, ctx);
    expect(all.results.length).toBeGreaterThan(1);
  });

  it("rejects empty queries and unknown providers", async () => {
    await expect(searchIconsTool({ query: "  " }, ctx)).rejects.toThrow(/non-empty/);
    await expect(searchIconsTool({ query: "trash", provider: "nope" }, ctx)).rejects.toThrow(/Unknown provider "nope"/);
  });

  it("explains how to configure providers when none are configured", async () => {
    const scratch = scratchContext({});
    try {
      await expect(searchIconsTool({ query: "trash" }, scratch)).rejects.toThrow(/\.iconmcp\.json/);
    } finally {
      scratch.cleanup();
    }
  });

  it("skips providers whose version cannot be determined, with a warning", async () => {
    const scratch = scratchContext({
      ".iconmcp.json": JSON.stringify({ providers: [{ package: "lucide-react", version: "0.460.0" }, { package: "react-icons" }] }),
    });
    try {
      const { results, warnings } = await searchIconsTool({ query: "trash" }, scratch);
      expect(results[0]?.importName).toBe("Trash2");
      expect(warnings).toHaveLength(1);
      expect(warnings![0]).toMatch(/react-icons/);
    } finally {
      scratch.cleanup();
    }
  });
});

describe("getIconTool", () => {
  it("returns the full record by import name, name, or case-insensitive name", async () => {
    const icon = await getIconTool({ name: "Trash2", provider: "lucide" }, ctx);
    expect(icon).toMatchObject({
      id: "lucide-react@0.460:trash-2",
      name: "trash-2",
      importName: "Trash2",
      provider: "lucide",
      version: "0.460.0",
      usage: "import { Trash2 } from 'lucide-react';",
    });
    expect(icon.svg).toContain("<path");
    expect((await getIconTool({ name: "trash-2", provider: "lucide-react" }, ctx)).importName).toBe("Trash2");
    expect((await getIconTool({ name: "trash2", provider: "lucide" }, ctx)).importName).toBe("Trash2");
    // Deprecated alias names resolve to the current icon.
    expect((await getIconTool({ name: "TrashCan", provider: "lucide" }, ctx)).importName).toBe("Trash2");
    expect((await getIconTool({ name: "trash-can", provider: "lucide" }, ctx)).importName).toBe("Trash2");
  });

  it("throws for unknown icons, naming the icon, provider and version", async () => {
    await expect(getIconTool({ name: "Nope", provider: "lucide" }, ctx)).rejects.toThrow(
      /"Nope".*lucide.*0\.460\.0/,
    );
  });

  it("throws for unknown providers and undeterminable versions", async () => {
    await expect(getIconTool({ name: "Trash2", provider: "nope" }, ctx)).rejects.toThrow(/Unknown provider/);
    await expect(getIconTool({ name: "FaBell", provider: "react-icons" }, ctx)).rejects.toThrow(
      /Could not determine the react-icons version/,
    );
  });
});

describe("listProvidersTool", () => {
  it("lists configured providers with their pinned versions and the full registry", () => {
    const { configured, registry } = listProvidersTool(ctx);
    expect(configured).toEqual([
      { id: "lucide", package: "lucide-react", version: "0.460.0", source: "iconmcp.json" },
      { id: "heroicons", package: "@heroicons/react", version: "2.1.5", source: "iconmcp.json" },
    ]);
    expect(registry).toHaveLength(9);
    expect(registry.map((p) => p.id).sort()).toEqual(PROVIDERS.map((p) => p.id).sort());
    expect(registry.every((p) => p.package && p.description)).toBe(true);
  });

  it("falls back to package.json and reports null when the version is unknown", () => {
    const scratch = scratchContext({
      ".iconmcp.json": JSON.stringify({ providers: [{ package: "lucide-react" }, { package: "react-icons" }] }),
      "package.json": JSON.stringify({ dependencies: { "lucide-react": "^0.460.0" } }),
    });
    try {
      expect(listProvidersTool(scratch).configured).toEqual([
        { id: "lucide", package: "lucide-react", version: "^0.460.0", source: "package.json" },
        { id: "react-icons", package: "react-icons", version: null, source: null },
      ]);
    } finally {
      scratch.cleanup();
    }
  });
});
