import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildIndex } from "../../src/indexer/buildIndex.js";
import { parseComponent as parseLucideComponent, parseLucideSvelte, parseLucideSvelteScoped } from "../../src/providers/adapters/lucide-svelte.js";
import { parsePhosphorSvelte, parseWeights } from "../../src/providers/adapters/phosphor-svelte.js";
import { svelteExports } from "../../src/providers/adapters/svelte.js";
import { parseComponent as parseTablerComponent, parseTablerSvelte } from "../../src/providers/adapters/tabler-svelte.js";
import { expectRecordShape } from "../helpers/records.js";

const fixture = (name: string) => join(import.meta.dirname, "..", "fixtures", name);

describe("svelteExports", () => {
  it("maps each .svelte file to its export name", () => {
    const src = `export { default as Trash } from './trash.svelte';\nexport { default as IconX } from './icons/x.svelte';`;
    expect([...svelteExports(src)]).toEqual([
      ["trash", "Trash"],
      ["x", "IconX"],
    ]);
  });
});

describe("lucide Svelte adapters", () => {
  it("reads iconNode components from lucide-svelte", () => {
    const icons = parseLucideSvelte(fixture("lucide-svelte"));
    expect(icons.map((i) => [i.name, i.importName, i.importPath])).toEqual([
      ["trash", "Trash", "lucide-svelte"],
      ["trash-2", "Trash2", "lucide-svelte"],
    ]);
    expect(icons[0]!.svg).toBe(
      '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    );
  });

  it("reads iconData components from @lucide/svelte, with aliases from iconData and stub modules", () => {
    const icons = parseLucideSvelteScoped(fixture("lucide-svelte5"));
    expect(icons.map((i) => [i.name, i.importName, i.tags])).toEqual([
      ["trash", "Trash", ["trash-2"]],
      ["trash-off", "TrashOff", []],
    ]);
    expect(icons[0]!.importPath).toBe("@lucide/svelte");
  });

  it("fails on a component without icon data", () => {
    expect(() => parseLucideComponent("<script></script>")).toThrow(/iconNode nor iconData/);
  });
});

describe("tabler Svelte adapter", () => {
  it("reads the style and name from the Icon props, and old names from aliases.js", () => {
    const icons = parseTablerSvelte(fixture("tabler-svelte"));
    expect(icons.map((i) => [i.name, i.importName, i.style, i.tags])).toEqual([
      ["number-123", "IconNumber123", "outline", ["123"]],
      ["trash", "IconTrash", "outline", []],
      ["trash-filled", "IconTrashFilled", "filled", []],
    ]);
    expect(icons[1]!.importPath).toBe("@tabler/icons-svelte");
  });

  it("reads 2.x components, whose Icon has no type prop", () => {
    const src = `<script>const iconNode = [["path", { "d": "M1 1Z" }]];</script>\n<Icon name="trash-filled" {...$$props} iconNode={iconNode}>`;
    expect(parseTablerComponent(src)).toEqual({
      name: "trash-filled",
      style: "filled",
      nodes: [{ tag: "path", attr: { d: "M1 1Z" }, child: [] }],
    });
  });
});

describe("phosphor Svelte adapter", () => {
  it("indexes the <Name>Icon components per weight, skipping deprecated duplicates and helpers", () => {
    const icons = parsePhosphorSvelte(fixture("phosphor-svelte"));
    expect(new Set(icons.map((i) => i.importName))).toEqual(new Set(["TrashIcon"]));
    expect(icons.map((i) => i.name).sort()).toEqual([
      "trash",
      "trash-bold",
      "trash-duotone",
      "trash-fill",
      "trash-light",
      "trash-thin",
    ]);
    expect(icons.find((i) => i.name === "trash-duotone")?.svg).toMatch(/^<path d="M200,56V208[^"]*" opacity="0\.2"\/><path /);
  });

  it("reads the 2.x folder-per-icon layout with plain names", () => {
    const icons = parsePhosphorSvelte(fixture("phosphor-svelte-v2"));
    expect(icons.find((i) => i.name === "trash")).toMatchObject({ importName: "Trash", importPath: "phosphor-svelte", style: "regular" });
  });

  it("fails on markup without weight blocks", () => {
    expect(() => parseWeights("<svg></svg>")).toThrow(/no weight blocks/);
  });
});

describe("Svelte provider records", () => {
  it.each([
    ["lucide-svelte", "lucide-svelte", "lucide-svelte@1.0"],
    ["lucide-svelte5", "lucide-svelte5", "@lucide/svelte@1.49"],
    ["tabler-svelte", "tabler-svelte", "@tabler/icons-svelte@3.48"],
    ["phosphor-svelte", "phosphor-svelte", "phosphor-svelte@3.1"],
  ])("%s builds records with <package>@<major.minor>:<name> ids", async (providerId, dir, prefix) => {
    const version = `${prefix.split("@").pop()}.0`;
    const { records } = await buildIndex({ providerId, packageDir: fixture(dir), version });
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) expectRecordShape(record, prefix);
  });
});
