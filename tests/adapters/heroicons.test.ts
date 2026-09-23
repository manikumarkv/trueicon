import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildIndex } from "../../src/indexer/buildIndex.js";
import { parseIcons } from "../../src/providers/adapters/heroicons.js";
import { expectRecordShape } from "../helpers/records.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "heroicons");

describe("heroicons adapter", () => {
  const icons = parseIcons(FIXTURE);
  const byName = new Map(icons.map((icon) => [icon.name, icon]));

  it("parses every <size>/<style> variant and skips v1 stubs and non-icon files", () => {
    expect(icons.map((icon) => icon.name).sort()).toEqual([
      "arrow-left-circle-20-solid",
      "trash-24-outline",
      "trash-24-solid",
    ]);
  });

  it("maps variants to import paths and styles", () => {
    expect(byName.get("trash-24-outline")).toEqual({
      name: "trash-24-outline",
      importName: "TrashIcon",
      importPath: "@heroicons/react/24/outline",
      style: "outline",
      set: "heroicons",
      categories: [],
      tags: [],
      svg: '<path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9"/>',
    });
    expect(byName.get("trash-24-solid")).toMatchObject({
      importName: "TrashIcon",
      importPath: "@heroicons/react/24/solid",
      style: "solid",
      svg: '<path fill-rule="evenodd" d="M16.5 4.478v.227" clip-rule="evenodd"/>',
    });
  });

  it("reconstructs nested elements and keeps case-sensitive tag names", () => {
    expect(byName.get("arrow-left-circle-20-solid")).toMatchObject({
      importName: "ArrowLeftCircleIcon",
      importPath: "@heroicons/react/20/solid",
      svg:
        '<g clip-path="url(#a)"><path fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16"/></g>' +
        '<defs><clipPath id="a"><path d="M0 0h20v20H0z"/></clipPath></defs>',
    });
  });

  it("builds records with <package>@<major.minor>:<name> ids", async () => {
    const { records } = await buildIndex({ providerId: "heroicons", packageDir: FIXTURE, version: "2.1.1" });
    for (const record of records) expectRecordShape(record, "@heroicons/react@2.1");
    expect(records.find((r) => r.name === "trash-24-outline")).toMatchObject({
      id: "@heroicons/react@2.1:trash-24-outline",
      provider: "heroicons",
      package: "@heroicons/react",
      importPath: "@heroicons/react/24/outline",
    });
  });
});
