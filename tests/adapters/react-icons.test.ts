import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildIndex } from "../../src/indexer/buildIndex.js";
import { parseIcons } from "../../src/providers/adapters/react-icons.js";
import { expectRecordShape } from "../helpers/records.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "react-icons");

describe("react-icons adapter", () => {
  const icons = parseIcons(FIXTURE);
  const byName = new Map(icons.map((icon) => [icon.name, icon]));

  it("parses every icon of every set dir and skips lib/", () => {
    expect(icons.map((icon) => icon.name).sort()).toEqual([
      "fa-500-px",
      "fa-beer",
      "fa6-beer",
      "hi2-outline-academic-cap",
    ]);
  });

  it("keeps same-named components from different sets distinct", () => {
    expect(byName.get("fa-beer")).toEqual({
      name: "fa-beer",
      importName: "FaBeer",
      importPath: "react-icons/fa",
      set: "fa",
      categories: [],
      tags: [],
      svg: '<path d="M368 96h-48V56"/>',
    });
    expect(byName.get("fa6-beer")).toMatchObject({
      importName: "FaBeer",
      importPath: "react-icons/fa6",
      set: "fa6",
      svg: '<path d="M32 64c0-17.7"/>',
    });
  });

  it("strips the set prefix from multi-letter and numbered sets", () => {
    expect(byName.get("hi2-outline-academic-cap")).toMatchObject({
      importName: "HiOutlineAcademicCap",
      importPath: "react-icons/hi2",
      svg: '<path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60.438"/>',
    });
  });

  it("reconstructs nested children with SVG attribute names", () => {
    expect(byName.get("fa-500-px")?.svg).toBe(
      '<g fill-rule="evenodd" stroke-width="2"><path d="M1 2"/><circle cx="5" cy="5" r="3"/></g>',
    );
  });

  it("builds records with <package>@<major.minor>:<name> ids", async () => {
    const { records } = await buildIndex({ providerId: "react-icons", packageDir: FIXTURE, version: "5.3.0" });
    for (const record of records) expectRecordShape(record, "react-icons@5.3");
    expect(records.map((r) => r.id).sort()).toEqual([
      "react-icons@5.3:fa-500-px",
      "react-icons@5.3:fa-beer",
      "react-icons@5.3:fa6-beer",
      "react-icons@5.3:hi2-outline-academic-cap",
    ]);
  });
});
