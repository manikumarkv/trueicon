import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildIndex } from "../../src/indexer/buildIndex.js";
import { parseIcons } from "../../src/providers/adapters/tabler.js";
import { expectRecordShape } from "../helpers/records.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "tabler");

describe("tabler adapter", () => {
  const icons = parseIcons(FIXTURE);
  const byName = new Map(icons.map((icon) => [icon.name, icon]));

  it("parses one icon per Icon*.mjs module, skipping the barrel file", () => {
    expect(icons.map((icon) => icon.name).sort()).toEqual(["number-123", "trash", "trash-filled"]);
  });

  it("maps createReactComponent names, styles, file names and import path", () => {
    expect(byName.get("trash")).toEqual({
      name: "trash",
      importName: "IconTrash",
      importPath: "@tabler/icons-react",
      style: "outline",
      set: "tabler",
      categories: [],
      tags: [],
      svg: '<path d="M4 7l16 0"/><path d="M10 11l0 6"/>',
    });
    expect(byName.get("trash-filled")).toMatchObject({
      importName: "IconTrashFilled",
      style: "filled",
      svg: '<path d="M20 6a1 1 0 0 1 .117 1.993"/>',
    });
  });

  it("adds barrel alias names to the target icon's tags", () => {
    expect(byName.get("number-123")?.tags).toEqual(["123"]);
  });

  it("drops React-only key props from the SVG", () => {
    for (const icon of icons) expect(icon.svg).not.toContain("key=");
  });

  it("builds records with <package>@<major.minor>:<name> ids", async () => {
    const { records } = await buildIndex({ providerId: "tabler", packageDir: FIXTURE, version: "3.48.0" });
    for (const record of records) expectRecordShape(record, "@tabler/icons-react@3.48");
    expect(records.find((r) => r.name === "number-123")).toMatchObject({
      id: "@tabler/icons-react@3.48:number-123",
      provider: "tabler",
      package: "@tabler/icons-react",
      importName: "IconNumber123",
      importPath: "@tabler/icons-react",
      keywords: ["number", "123"],
    });
  });
});
