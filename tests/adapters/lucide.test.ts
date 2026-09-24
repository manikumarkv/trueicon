import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildIndex } from "../../src/indexer/buildIndex.js";
import { parseIcons } from "../../src/providers/adapters/lucide.js";
import { expectRecordShape } from "../helpers/records.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "lucide");

describe("lucide adapter", () => {
  const icons = parseIcons(FIXTURE);
  const byName = new Map(icons.map((icon) => [icon.name, icon]));

  it("parses one icon per icon module, skipping aliases and the barrel file", () => {
    expect(icons.map((icon) => icon.name).sort()).toEqual(["circle-alert", "grid-2x2", "trash-2"]);
  });

  it("maps file names, component names and import path", () => {
    expect(byName.get("trash-2")).toEqual({
      name: "trash-2",
      importName: "Trash2",
      importPath: "lucide-react",
      style: "outline",
      set: "lucide",
      categories: [],
      tags: [],
      svg: '<path d="M3 6h18"/><line x1="10" x2="10" y1="11" y2="17"/>',
    });
    expect(byName.get("grid-2x2")?.importName).toBe("Grid2x2");
  });

  it("adds deprecated alias names to the target icon's tags", () => {
    expect(byName.get("circle-alert")?.tags).toEqual(["alert-circle"]);
  });

  it("drops React-only key props from the SVG", () => {
    for (const icon of icons) expect(icon.svg).not.toContain("key=");
  });

  it("builds records with <package>@<major.minor>:<name> ids and alias keywords", async () => {
    const { records } = await buildIndex({ providerId: "lucide", packageDir: FIXTURE, version: "0.460.0" });
    for (const record of records) expectRecordShape(record, "lucide-react@0.460");
    const alert = records.find((r) => r.name === "circle-alert")!;
    expect(alert).toMatchObject({
      id: "lucide-react@0.460:circle-alert",
      provider: "lucide",
      package: "lucide-react",
      version: "0.460.0",
      importName: "CircleAlert",
      importPath: "lucide-react",
      tags: ["alert-circle"],
    });
    expect(alert.keywords).toEqual(["circle", "alert", "alert-circle"]);
  });
});

describe("lucide adapter, __iconNode format (later 0.x to 1.46)", () => {
  const icons = parseIcons(join(import.meta.dirname, "..", "fixtures", "lucide-iconnode"));
  const byName = new Map(icons.map((icon) => [icon.name, icon]));

  it("parses icons, skipping alias modules and source maps", () => {
    expect(icons.map((icon) => icon.name).sort()).toEqual(["square-activity", "trash-2"]);
  });

  it("takes the import name from the binding, not the kebab-case string argument", () => {
    expect(byName.get("trash-2")).toMatchObject({
      importName: "Trash2",
      svg: '<path d="M3 6h18"/><path d="M10 11v6"/>',
    });
  });

  it("adds alias modules to the target icon's tags", () => {
    expect(byName.get("square-activity")?.tags).toEqual(["activity-square"]);
  });
});

describe("lucide adapter, __iconData format (1.47+)", () => {
  const icons = parseIcons(join(import.meta.dirname, "..", "fixtures", "lucide-v1"));
  const byName = new Map(icons.map((icon) => [icon.name, icon]));

  it("parses .mjs icon modules, skipping aliases, the barrel file and source maps", () => {
    expect(icons.map((icon) => icon.name).sort()).toEqual(["face-slightly-smiling", "trash"]);
  });

  it("reads the import name and SVG nodes from __iconData", () => {
    expect(byName.get("trash")).toMatchObject({
      importName: "Trash",
      importPath: "lucide-react",
      svg: '<path d="M3 6h18"/><path d="M10 11v6"/>',
    });
  });

  it("merges __iconData.aliases and alias modules into tags without duplicates", () => {
    expect(byName.get("trash")?.tags).toEqual(["trash-2"]);
    expect(byName.get("face-slightly-smiling")?.tags).toEqual(["smile"]);
  });
});
