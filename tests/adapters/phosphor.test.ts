import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildIndex } from "../../src/indexer/buildIndex.js";
import { parseIcons } from "../../src/providers/adapters/phosphor.js";
import { expectRecordShape } from "../helpers/records.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "phosphor");

describe("phosphor adapter", () => {
  const icons = parseIcons(FIXTURE);
  const byName = new Map(icons.map((icon) => [icon.name, icon]));

  it("parses one icon per weight, keeping the plain name for the regular weight", () => {
    expect(icons.map((icon) => icon.name).sort()).toEqual([
      "folder",
      "folder-fill",
      "trash",
      "trash-bold",
      "trash-duotone",
    ]);
  });

  it("maps weights to styles and every weight to the same <Name>Icon component", () => {
    expect(byName.get("trash")).toEqual({
      name: "trash",
      importName: "TrashIcon",
      importPath: "@phosphor-icons/react",
      style: "regular",
      set: "phosphor",
      categories: [],
      tags: [],
      svg: '<path d="M216,48H176V40"/>',
    });
    expect(byName.get("trash-bold")).toMatchObject({
      importName: "TrashIcon",
      style: "bold",
      svg: '<path d="M216,44H180V36"/>',
    });
  });

  it("extracts multi-element and nested weights", () => {
    expect(byName.get("trash-duotone")?.svg).toBe(
      '<path d="M200,56V208H56V56Z" opacity="0.2"/><path d="M216,48H176V40"/>',
    );
    expect(byName.get("folder")?.svg).toBe('<g><path d="M216,72H131.31" stroke-linecap="round"/></g>');
  });

  it("adds alias component names to the tags of every weight", () => {
    expect(byName.get("folder")?.tags).toEqual(["folder-notch"]);
    expect(byName.get("folder-fill")?.tags).toEqual(["folder-notch"]);
  });

  it("builds records with <package>@<major.minor>:<name> ids", async () => {
    const { records } = await buildIndex({ providerId: "phosphor", packageDir: FIXTURE, version: "2.1.10" });
    for (const record of records) expectRecordShape(record, "@phosphor-icons/react@2.1");
    expect(records[0]).toMatchObject({
      id: "@phosphor-icons/react@2.1:folder",
      provider: "phosphor",
      package: "@phosphor-icons/react",
      importName: "FolderIcon",
      importPath: "@phosphor-icons/react",
      style: "regular",
    });
    expect(records.find((r) => r.name === "trash-bold")?.keywords).toEqual(["trash", "bold"]);
  });
});
