import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildIndex } from "../../src/indexer/buildIndex.js";
import { parseBundle, parseIcons } from "../../src/providers/adapters/radix.js";
import { expectRecordShape } from "../helpers/records.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "radix");

describe("radix adapter", () => {
  const icons = parseIcons(FIXTURE);
  const byName = new Map(icons.map((icon) => [icon.name, icon]));

  it("parses every exported icon, naming it from manifest.json", () => {
    expect(icons.map((icon) => [icon.name, icon.importName])).toEqual([
      ["github-logo", "GitHubLogoIcon"],
      ["trash", "TrashIcon"],
    ]);
  });

  it("reads the root svg children and resolves the color prop to currentColor", () => {
    expect(byName.get("trash")).toEqual({
      name: "trash",
      importName: "TrashIcon",
      importPath: "@radix-ui/react-icons",
      set: "radix",
      categories: [],
      tags: [],
      svg:
        '<path d="M5.5 1H9.5V2H5.5Z" fill="currentColor"/>' +
        '<rect x="3" y="3" width="9" height="1" rx="0.5" fill="currentColor"/>',
    });
  });

  it("parses the plain function components of releases before 1.1", () => {
    const src = `var TrashIcon = function TrashIcon(_ref) {
  var _ref$color = _ref.color,
      color = _ref$color === void 0 ? 'currentColor' : _ref$color,
      props = _objectWithoutPropertiesLoose(_ref, ["color"]);

  return createElement("svg", Object.assign({
    width: "15",
    viewBox: "0 0 15 15"
  }, props), createElement("path", {
    d: "M5.5 1Z",
    fill: color
  }));
};

export { TrashIcon };`;
    expect(parseBundle(src)).toEqual([
      { importName: "TrashIcon", nodes: [{ tag: "path", attr: { d: "M5.5 1Z", fill: "currentColor" }, child: [] }] },
    ]);
  });

  it("fails on attribute values it cannot resolve", () => {
    const src = `var XIcon = function XIcon(_ref) {
  return createElement("svg", Object.assign({}, props), createElement("path", { d: other }));
};
export { XIcon };`;
    expect(() => parseBundle(src)).toThrow(/unsupported value "other"/);
  });

  it("builds records with <package>@<major.minor>:<name> ids", async () => {
    const { records } = await buildIndex({ providerId: "radix", packageDir: FIXTURE, version: "1.3.2" });
    for (const record of records) expectRecordShape(record, "@radix-ui/react-icons@1.3");
    expect(records.find((r) => r.name === "trash")).toMatchObject({
      id: "@radix-ui/react-icons@1.3:trash",
      provider: "radix",
      importName: "TrashIcon",
      importPath: "@radix-ui/react-icons",
    });
  });
});
