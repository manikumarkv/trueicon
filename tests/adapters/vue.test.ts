import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildIndex } from "../../src/indexer/buildIndex.js";
import { parseHeroiconsVue, parseVueIconFile } from "../../src/providers/adapters/heroicons.js";
import { lucideModules } from "../../src/providers/adapters/lucide.js";
import { parsePhosphorVue, parseWeights } from "../../src/providers/adapters/phosphor-vue.js";
import { parseIconFile, parseTablerVue } from "../../src/providers/adapters/tabler.js";
import { expectRecordShape } from "../helpers/records.js";

const fixture = (name: string) => join(import.meta.dirname, "..", "fixtures", name);

describe("lucide Vue packages", () => {
  it("reuse the lucide-react parser with their own import path", () => {
    const icons = lucideModules("@lucide/vue")(fixture("lucide-v1"));
    expect(icons.find((i) => i.name === "trash")).toMatchObject({
      importName: "Trash",
      importPath: "@lucide/vue",
      tags: ["trash-2"],
    });
    expect(lucideModules("lucide-vue-next")(fixture("lucide-iconnode"))[0]?.importPath).toBe("lucide-vue-next");
  });
});

describe("heroicons Vue adapter", () => {
  const icons = parseHeroiconsVue(fixture("heroicons-vue"));

  it("indexes each size/style from the compiled render functions", () => {
    expect(icons.map((i) => [i.name, i.importPath])).toEqual([
      ["trash-20-solid", "@heroicons/vue/20/solid"],
      ["trash-24-outline", "@heroicons/vue/24/outline"],
    ]);
    expect(icons[1]).toMatchObject({ importName: "TrashIcon", style: "outline", set: "heroicons" });
    expect(icons[1]!.svg).toMatch(/^<path stroke-linecap="round" stroke-linejoin="round" d="m14\.74 9/);
  });

  it("reads nested elements and fails without an svg block", () => {
    const src = `return (_openBlock(), _createElementBlock("svg", { viewBox: "0 0 20 20" }, [
      _createElementVNode("g", null, [ _createElementVNode("path", { d: "M1 1Z" }) ])
    ]))`;
    expect(parseVueIconFile(src)).toEqual([
      { tag: "g", attr: {}, child: [{ tag: "path", attr: { d: "M1 1Z" }, child: [] }] },
    ]);
    expect(() => parseVueIconFile("export default {}")).toThrow(/createElementBlock/);
  });
});

describe("tabler Vue adapter", () => {
  const icons = parseTablerVue(fixture("tabler-vue"));

  it("reads the style and name from createVueComponent and old names from the barrel", () => {
    expect(icons.map((i) => [i.name, i.importName, i.style, i.tags])).toEqual([
      ["number-123", "IconNumber123", "outline", ["123"]],
      ["trash", "IconTrash", "outline", []],
      ["trash-filled", "IconTrashFilled", "filled", []],
    ]);
    expect(icons[1]!.importPath).toBe("@tabler/icons-vue");
  });

  it("reads 2.x calls, which leave out the style", () => {
    const src = `var IconTrashFilled = createVueComponent("trash-filled", "IconTrashFilled", [["path", { d: "M1 1Z", key: "svg-0" }]]);`;
    expect(parseIconFile(src)).toEqual({
      name: "trash-filled",
      style: "filled",
      nodes: [{ tag: "path", attr: { d: "M1 1Z", key: "svg-0" }, child: [] }],
    });
  });
});

describe("phosphor Vue adapter", () => {
  const icons = parsePhosphorVue(fixture("phosphor-vue"));

  it("indexes every weight, the default weight without a suffix", () => {
    expect(icons.filter((i) => i.importName === "PhTrash").map((i) => [i.name, i.style]).sort()).toEqual([
      ["trash", "regular"],
      ["trash-bold", "bold"],
      ["trash-duotone", "duotone"],
      ["trash-fill", "fill"],
      ["trash-light", "light"],
      ["trash-thin", "thin"],
    ]);
  });

  it("resolves the hoisted vnodes of each weight", () => {
    const duotone = icons.find((i) => i.name === "trash-duotone")!;
    expect(duotone.svg).toMatch(/^<path d="M200,56V208[^"]*" opacity="0\.2"\/><path d="M216,48H176/);
    expect(duotone.importPath).toBe("@phosphor-icons/vue");
  });

  it("adds old export names from the barrel as tags", () => {
    expect(icons.find((i) => i.name === "folder")?.tags).toEqual(["folder-notch"]);
  });

  it("fails on a module without weight branches", () => {
    expect(() => parseWeights("const x = 1;")).toThrow(/no weight branches/);
  });
});

describe("Vue provider records", () => {
  it.each([
    ["heroicons-vue", "heroicons-vue", "@heroicons/vue@2.2"],
    ["tabler-vue", "tabler-vue", "@tabler/icons-vue@3.48"],
    ["phosphor-vue", "phosphor-vue", "@phosphor-icons/vue@2.2"],
    ["lucide-vue", "lucide-v1", "@lucide/vue@1.49"],
    ["lucide-vue-next", "lucide-iconnode", "lucide-vue-next@1.0"],
  ])("%s builds records with <package>@<major.minor>:<name> ids", async (providerId, dir, prefix) => {
    const version = `${prefix.split("@").pop()}.0`;
    const { records } = await buildIndex({ providerId, packageDir: fixture(dir), version });
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) expectRecordShape(record, prefix);
  });
});
