import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildIndex } from "../../src/indexer/buildIndex.js";
import { parseIcons } from "../../src/providers/adapters/iconoir.js";
import { expectRecordShape } from "../helpers/records.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "iconoir");

describe("iconoir adapter", () => {
  const icons = parseIcons(FIXTURE);
  const byName = new Map(icons.map((icon) => [icon.name, icon]));

  it("parses regular and solid icons, skipping the barrel files", () => {
    expect(icons.map((icon) => icon.name).sort()).toEqual(["airplane", "trash", "trash-solid"]);
  });

  it("maps variants to root export names and styles", () => {
    expect(byName.get("trash")).toEqual({
      name: "trash",
      importName: "Trash",
      importPath: "iconoir-react",
      style: "regular",
      set: "iconoir",
      categories: [],
      tags: [],
      svg: '<path d="M20 9L18 20.3H6L4 9" stroke="currentColor" stroke-linecap="round"/>',
    });
    expect(byName.get("trash-solid")).toMatchObject({
      importName: "TrashSolid",
      importPath: "iconoir-react",
      style: "solid",
      svg: '<path d="M20 9L18 20.3H6L4 9H20Z" fill="currentColor"/>',
    });
  });

  it("skips the root <svg> props and reconstructs nested elements", () => {
    expect(byName.get("airplane")?.svg).toBe(
      '<g clip-path="url(#a)"><path d="M4 12h16" stroke="currentColor"/></g>' +
        '<defs><clipPath id="a"><path fill="#fff" d="M0 0h24v24H0z"/></clipPath></defs>',
    );
  });

  it("builds records with <package>@<major.minor>:<name> ids", async () => {
    const { records } = await buildIndex({ providerId: "iconoir", packageDir: FIXTURE, version: "7.12.1" });
    for (const record of records) expectRecordShape(record, "iconoir-react@7.12");
    expect(records.find((r) => r.name === "trash-solid")).toMatchObject({
      id: "iconoir-react@7.12:trash-solid",
      provider: "iconoir",
      package: "iconoir-react",
      importName: "TrashSolid",
      importPath: "iconoir-react",
    });
  });
});
