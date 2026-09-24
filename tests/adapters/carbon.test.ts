import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildIndex } from "../../src/indexer/buildIndex.js";
import { parseIcons } from "../../src/providers/adapters/carbon.js";
import { expectRecordShape } from "../helpers/records.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "carbon");

describe("carbon adapter", () => {
  const icons = parseIcons(FIXTURE);
  const byName = new Map(icons.map((icon) => [icon.name, icon]));

  it("parses every icon in the generated buckets", () => {
    expect(icons.map((icon) => icon.name)).toEqual([
      "accessibility",
      "accessibility-filled",
      "microservices-1",
      "object",
    ]);
  });

  it("gives base icons no style and suffixed variants their suffix as style", () => {
    expect(byName.get("accessibility")).toEqual({
      name: "accessibility",
      importName: "Accessibility",
      importPath: "@carbon/icons-react",
      style: undefined,
      set: "carbon",
      categories: [],
      tags: [],
      svg: '<path d="M29.55,26.11,26.5,27.63Z"/><path d="M15.5,8A3.5,3.5,0,1,1,19,4.5Z"/>',
    });
    expect(byName.get("accessibility-filled")).toMatchObject({
      importName: "AccessibilityFilled",
      style: "filled",
      svg: '<path d="M16,2A14,14,0,1,0,30,16Z"/>',
    });
  });

  it("extracts nested jsx children once", () => {
    expect(byName.get("microservices-1")?.svg).toBe(
      '<switch><g><path d="m11 21-4-2.2v-4.5z"/><path fill="none" d="M0 0h32v32H0z"/></g></switch>',
    );
  });

  it("uses the exported name for renamed bindings and keeps number attributes", () => {
    expect(byName.get("object")).toMatchObject({
      importName: "Object",
      svg: '<path d="M6,3h4v2h-4v8Z" fill-rule="evenodd" opacity="0.5"/>',
    });
  });

  it("builds records with <package>@<major.minor>:<name> ids", async () => {
    const { records } = await buildIndex({ providerId: "carbon", packageDir: FIXTURE, version: "11.89.0" });
    for (const record of records) expectRecordShape(record, "@carbon/icons-react@11.89");
    expect(records[0]).toMatchObject({
      id: "@carbon/icons-react@11.89:accessibility",
      provider: "carbon",
      package: "@carbon/icons-react",
      importName: "Accessibility",
      importPath: "@carbon/icons-react",
    });
    expect(records.find((r) => r.name === "accessibility-filled")?.keywords).toEqual(["accessibility", "filled"]);
  });
});
