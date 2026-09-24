import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildIndex } from "../../src/indexer/buildIndex.js";
import { parseIcons } from "../../src/providers/adapters/fluentui.js";
import { expectRecordShape } from "../helpers/records.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "fluentui");

describe("fluentui adapter", () => {
  const icons = parseIcons(FIXTURE);
  const byName = new Map(icons.map((icon) => [icon.name, icon]));

  it("parses every scalable icon export and skips sizedIcons", () => {
    expect(icons.map((icon) => icon.name)).toEqual(["backpack-filled", "backpack-regular", "calendar-color"]);
  });

  it("renders path data arrays and maps the name suffix to the style", () => {
    expect(byName.get("backpack-filled")).toEqual({
      name: "backpack-filled",
      importName: "BackpackFilled",
      importPath: "@fluentui/react-icons",
      style: "filled",
      set: "fluentui",
      categories: [],
      tags: [],
      svg: '<path d="M8 8.7c0-.39.31-.7.7-.7h2.6"/><path d="M7 14.5V13H4v2"/>',
    });
    expect(byName.get("backpack-regular")).toMatchObject({
      importName: "BackpackRegular",
      style: "regular",
      svg: '<path d="M8 8.5c0-.28.22-.5.5-.5h3"/>',
    });
  });

  it("renders the node trees of color icons", () => {
    expect(byName.get("calendar-color")).toMatchObject({
      importName: "CalendarColor",
      style: "color",
      svg:
        '<path fill="url(#ic_fluent_calendar_20_color__a)" d="M17 6H3v8.5z"/>' +
        '<g filter="url(#ic_fluent_calendar_20_color__c)"><path d="M8 10a1 1 0 1 1-2 0"/></g>' +
        '<defs><linearGradient id="ic_fluent_calendar_20_color__a" gradientUnits="userSpaceOnUse">' +
        '<stop stop-color="#0078d4"/><stop offset="1" stop-color="#0067bf"/></linearGradient></defs>',
    });
  });

  it("builds records with <package>@<major.minor>:<name> ids", async () => {
    const { records } = await buildIndex({ providerId: "fluentui", packageDir: FIXTURE, version: "2.0.341" });
    for (const record of records) expectRecordShape(record, "@fluentui/react-icons@2.0");
    expect(records[0]).toMatchObject({
      id: "@fluentui/react-icons@2.0:backpack-filled",
      provider: "fluentui",
      package: "@fluentui/react-icons",
      importName: "BackpackFilled",
      importPath: "@fluentui/react-icons",
      style: "filled",
    });
    expect(records.find((r) => r.name === "calendar-color")?.keywords).toEqual(["calendar", "color"]);
  });
});
