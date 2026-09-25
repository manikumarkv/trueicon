import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildIndex } from "../../src/indexer/buildIndex.js";
import { parseBundle, parseIcons } from "../../src/providers/adapters/remix.js";
import { expectRecordShape } from "../helpers/records.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "remix");

describe("remix adapter", () => {
  const icons = parseIcons(FIXTURE);
  const byName = new Map(icons.map((icon) => [icon.name, icon]));

  it("maps minified locals to their export names", () => {
    expect(icons.map((icon) => [icon.name, icon.importName])).toEqual([
      ["delete-bin-fill", "RiDeleteBinFill"],
      ["delete-bin-line", "RiDeleteBinLine"],
      ["bold", "RiBold"],
    ]);
  });

  it("drops the Ri prefix and takes the Line/Fill suffix as the style", () => {
    expect(byName.get("delete-bin-line")).toEqual({
      name: "delete-bin-line",
      importName: "RiDeleteBinLine",
      importPath: "@remixicon/react",
      style: "line",
      set: "remix",
      categories: [],
      tags: [],
      svg: '<path d="M17 6H22V8H20V21H4V8H2V6H7V3H17V6Z"/>',
    });
    expect(byName.get("bold")?.style).toBeUndefined();
  });

  it("reads the exports of the UMD bundle shipped before 4.1", () => {
    const src =
      '(function(s,l){})(this,function(s,l){"use strict";const c=({color:t="currentColor",size:e=24,className:C,...i})=>' +
      'l.createElement("svg",{viewBox:"0 0 24 24",fill:t,...i,className:"remixicon "+(C||"")},l.createElement("path",{d:"M1 1Z"}));' +
      's.RiZzzLine=c,Object.defineProperty(s,Symbol.toStringTag,{value:"Module"})});';
    expect(parseBundle(src)).toEqual([
      { importName: "RiZzzLine", nodes: [{ tag: "path", attr: { d: "M1 1Z" }, child: [] }] },
    ]);
  });

  it("builds records with <package>@<major.minor>:<name> ids", async () => {
    const { records } = await buildIndex({ providerId: "remix", packageDir: FIXTURE, version: "4.9.0" });
    for (const record of records) expectRecordShape(record, "@remixicon/react@4.9");
    expect(records.find((r) => r.name === "delete-bin-line")).toMatchObject({
      id: "@remixicon/react@4.9:delete-bin-line",
      provider: "remix",
      importName: "RiDeleteBinLine",
      style: "line",
    });
  });
});
