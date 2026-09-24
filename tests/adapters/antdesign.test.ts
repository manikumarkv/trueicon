import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildIndex } from "../../src/indexer/buildIndex.js";
import { parseIcons, previewSvg } from "../../src/providers/adapters/antdesign.js";
import { expectRecordShape } from "../helpers/records.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "antdesign");

describe("antdesign adapter", () => {
  const icons = parseIcons(FIXTURE);
  const byName = new Map(icons.map((icon) => [icon.name, icon]));

  it("parses one icon per theme module and skips the index barrel", () => {
    expect(icons.map((icon) => icon.name)).toEqual(["delete-filled", "delete-outlined", "delete-two-tone"]);
  });

  it("maps the theme to the style and decodes the SVG preview comment", () => {
    expect(byName.get("delete-outlined")).toEqual({
      name: "delete-outlined",
      importName: "DeleteOutlined",
      importPath: "@ant-design/icons",
      style: "outlined",
      set: "antdesign",
      categories: [],
      tags: [],
      svg: '<path d="M360 184h-8c4.4 0 8-3.6 8-8v8z" />',
    });
    expect(byName.get("delete-two-tone")).toMatchObject({
      importName: "DeleteTwoTone",
      style: "two-tone",
      svg: '<path d="M292.7 840h438.6z" fill="#e6f4ff" /><path d="M864 256H736v-80z" fill="#1677ff" />',
    });
  });

  it("fails when a module has no SVG preview comment", () => {
    expect(() => previewSvg("const RefIcon = React.forwardRef(DeleteOutlined);")).toThrow(/preview comment/);
  });

  it("builds records with <package>@<major.minor>:<name> ids", async () => {
    const { records } = await buildIndex({ providerId: "antdesign", packageDir: FIXTURE, version: "6.3.4" });
    for (const record of records) expectRecordShape(record, "@ant-design/icons@6.3");
    expect(records[0]).toMatchObject({
      id: "@ant-design/icons@6.3:delete-filled",
      provider: "antdesign",
      package: "@ant-design/icons",
      importName: "DeleteFilled",
      importPath: "@ant-design/icons",
      style: "filled",
    });
    expect(records.find((r) => r.name === "delete-two-tone")?.keywords).toEqual(["delete", "two", "tone"]);
  });
});
