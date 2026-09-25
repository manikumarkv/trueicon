import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildIndex } from "../../src/indexer/buildIndex.js";
import { parseIcons, parseModule } from "../../src/providers/adapters/mui.js";
import { expectRecordShape } from "../helpers/records.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "mui");

describe("mui adapter", () => {
  const icons = parseIcons(FIXTURE);
  const byName = new Map(icons.map((icon) => [icon.name, icon]));

  it("parses one icon per CommonJS module and skips index.js, utils/ and .mjs twins", () => {
    expect(icons.map((icon) => icon.name)).toEqual(["battery-20-sharp", "delete", "delete-two-tone"]);
  });

  it("gives base icons the filled style and themed icons their suffix", () => {
    expect(byName.get("delete")).toEqual({
      name: "delete",
      importName: "Delete",
      importPath: "@mui/icons-material",
      style: "filled",
      set: "mui",
      categories: [],
      tags: [],
      svg: '<path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z"/>',
    });
    expect(byName.get("delete-two-tone")).toMatchObject({
      importName: "DeleteTwoTone",
      style: "two-tone",
      svg: '<path d="M8 9h8v10H8z" opacity=".3"/><path d="m15.5 4-1-1h-5l-1 1H5v2h14V4z"/>',
    });
  });

  it("flattens fragments and keeps nested elements", () => {
    expect(byName.get("battery-20-sharp")).toMatchObject({
      importName: "Battery20Sharp",
      style: "sharp",
      svg:
        '<path d="M7 17v5h10v-5H7z"/><g fill-rule="evenodd"><circle cx="17" cy="15.5" r="1.12"/>' +
        '<path fill-opacity=".3" d="M17 4h-3V2h-4v2H7v13h10V4z"/></g>',
    });
  });

  it("returns undefined for modules without createSvgIcon", () => {
    expect(parseModule('module.exports = require("./utils/createSvgIcon");')).toBeUndefined();
  });

  it("builds records with <package>@<major.minor>:<name> ids", async () => {
    const { records } = await buildIndex({ providerId: "mui", packageDir: FIXTURE, version: "9.4.0" });
    for (const record of records) expectRecordShape(record, "@mui/icons-material@9.4");
    expect(records.find((r) => r.name === "delete")).toMatchObject({
      id: "@mui/icons-material@9.4:delete",
      provider: "mui",
      package: "@mui/icons-material",
      importName: "Delete",
      importPath: "@mui/icons-material",
    });
  });
});
