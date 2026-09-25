import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildIndex } from "../../src/indexer/buildIndex.js";
import { parseBrands, parseModule, parseSolid, pathsSvg } from "../../src/providers/adapters/fontawesome.js";
import { expectRecordShape } from "../helpers/records.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "fontawesome");

describe("fontawesome adapter", () => {
  const icons = parseSolid(FIXTURE);
  const byName = new Map(icons.map((icon) => [icon.name, icon]));

  it("parses one icon per fa<Name>.js module, skipping alias modules and index.js", () => {
    expect(icons.map((icon) => [icon.name, icon.importName])).toEqual([
      ["trash", "faTrash"],
      ["trash-can", "faTrashCan"],
      ["xmark", "faXmark"],
    ]);
  });

  it("uses iconName as the name and the package as the import path", () => {
    expect(byName.get("trash")).toEqual({
      name: "trash",
      importName: "faTrash",
      importPath: "@fortawesome/free-solid-svg-icons",
      style: "solid",
      set: "fontawesome",
      categories: [],
      tags: [],
      svg: '<path d="M136.7 5.9L128 32 32 32z"/>',
    });
  });

  it("adds string aliases and alias modules to the target icon's tags", () => {
    expect(byName.get("trash-can")?.tags).toEqual(["trash-alt"]);
    expect(byName.get("xmark")?.tags).toEqual(["close", "multiply", "remove", "times"]);
  });

  it("uses the package and style of each Font Awesome provider", () => {
    expect(parseBrands(FIXTURE)[0]).toMatchObject({
      importPath: "@fortawesome/free-brands-svg-icons",
      style: "brands",
    });
  });

  it("renders duotone path pairs and reads version 5 modules without aliases", () => {
    expect(pathsSvg(["M1 1Z", "M2 2Z"])).toBe('<path d="M1 1Z"/><path d="M2 2Z"/>');
    const v5 = "var iconName = 'ad';\nvar ligatures = [];\nvar svgPathData = 'M0 0Z';\nexports.faAd = exports.definition;";
    expect(parseModule(v5)).toEqual({ importName: "faAd", name: "ad", aliases: [], svg: '<path d="M0 0Z"/>' });
  });

  it("fails on a module without an icon definition", () => {
    expect(() => parseModule("exports.faX = 1;")).toThrow(/exports\.definition not found/);
  });

  it("builds records with <package>@<major.minor>:<name> ids", async () => {
    const { records } = await buildIndex({ providerId: "fontawesome-solid", packageDir: FIXTURE, version: "7.3.1" });
    for (const record of records) expectRecordShape(record, "@fortawesome/free-solid-svg-icons@7.3");
    expect(records.find((r) => r.name === "trash-can")).toMatchObject({
      id: "@fortawesome/free-solid-svg-icons@7.3:trash-can",
      provider: "fontawesome-solid",
      importName: "faTrashCan",
      importPath: "@fortawesome/free-solid-svg-icons",
    });
    expect(records.find((r) => r.name === "xmark")?.keywords).toEqual(expect.arrayContaining(["close", "times"]));
  });
});
