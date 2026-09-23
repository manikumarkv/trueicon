import { rmSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { buildIndex } from "../src/indexer/buildIndex.js";
import type { IconRecord } from "../src/indexer/types.js";
import { toKebabCase, type RawIcon } from "../src/providers/adapter.js";
import { parseIcons as parseHeroicons } from "../src/providers/adapters/heroicons.js";
import { ADAPTERS } from "../src/providers/adapters/index.js";
import { parseIcons as parseLucide } from "../src/providers/adapters/lucide.js";
import { parseIcons as parseReactIcons } from "../src/providers/adapters/react-icons.js";
import { PROVIDERS } from "../src/providers/registry.js";
import { HEROICONS_FILES, LUCIDE_FILES, makePackageDir, REACT_ICONS_FILES } from "./helpers/fixtures.js";

const dirs: string[] = [];
function fixture(files: Record<string, string>): string {
  const dir = makePackageDir(files);
  dirs.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function byName(icons: RawIcon[]): Record<string, RawIcon> {
  return Object.fromEntries(icons.map((icon) => [icon.name, icon]));
}

// Every record must carry the full IconRecord shape with the right id prefix.
function expectRecordShape(record: IconRecord, idPrefix: string): void {
  expect(record.id).toBe(`${idPrefix}:${record.name}`);
  expect(record.id).toMatch(/^[@\w/-]+@\d+\.\d+:[\w-]+$/);
  expect(record.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  expect(typeof record.importName).toBe("string");
  expect(typeof record.importPath).toBe("string");
  expect(Array.isArray(record.categories)).toBe(true);
  expect(Array.isArray(record.tags)).toBe(true);
  expect(record.keywords.length).toBeGreaterThan(0);
  expect(record.svg).toMatch(/^<\w+/);
}

describe("toKebabCase", () => {
  it("splits case and digit boundaries", () => {
    expect(toKebabCase("ArrowDown01")).toBe("arrow-down-01");
    expect(toKebabCase("Trash2")).toBe("trash-2");
    expect(toKebabCase("HTMLTag")).toBe("html-tag");
    expect(toKebabCase("Grid2x2")).toBe("grid-2x2");
    expect(toKebabCase("Fa500Px")).toBe("fa-500-px");
    expect(toKebabCase("Html5")).toBe("html-5");
  });
});

describe("ADAPTERS", () => {
  it("has an adapter for every registered provider", () => {
    for (const provider of PROVIDERS) expect(ADAPTERS[provider.id]).toBeTypeOf("function");
  });
});

describe("lucide adapter", () => {
  const dir = fixture(LUCIDE_FILES);

  it("parses one icon per module and skips alias modules", () => {
    const icons = parseLucide(dir);
    expect(icons.map((i) => i.name).sort()).toEqual(["arrow-down", "trash-2"]);
  });

  it("maps names, import names and import paths", () => {
    const icons = byName(parseLucide(dir));
    expect(icons["trash-2"]).toMatchObject({
      name: "trash-2",
      importName: "Trash2",
      importPath: "lucide-react",
      style: "outline",
      set: "lucide",
      categories: [],
    });
    expect(icons["arrow-down"]!.importName).toBe("ArrowDown");
  });

  it("adds deprecated alias names to the target icon's tags", () => {
    const icons = byName(parseLucide(dir));
    expect(icons["trash-2"]!.tags).toEqual(["trash-can"]);
    expect(icons["arrow-down"]!.tags).toEqual([]);
  });

  it("renders inner SVG without React-only props", () => {
    const icons = byName(parseLucide(dir));
    expect(icons["trash-2"]!.svg).toBe('<path d="M3 6h18"/><line x1="10" x2="10" y1="11" y2="17"/>');
  });

  it("builds records with <package>@<major.minor>:<name> ids", async () => {
    const { records } = await buildIndex({ providerId: "lucide", packageDir: dir, version: "0.460.0" });
    for (const record of records) expectRecordShape(record, "lucide-react@0.460");
    const trash = records.find((r) => r.name === "trash-2")!;
    expect(trash).toMatchObject({
      id: "lucide-react@0.460:trash-2",
      provider: "lucide",
      package: "lucide-react",
      version: "0.460.0",
      importName: "Trash2",
      importPath: "lucide-react",
      tags: ["trash-can"],
    });
    expect(trash.keywords).toEqual(["trash", "2", "trash-can"]);
  });
});

describe("heroicons adapter", () => {
  const dir = fixture(HEROICONS_FILES);

  it("parses every size/style variant and skips v1 stub dirs", () => {
    const icons = parseHeroicons(dir);
    expect(icons.map((i) => i.name).sort()).toEqual([
      "arrow-down-24-outline",
      "trash-20-solid",
      "trash-24-outline",
    ]);
  });

  it("maps names, import names and per-variant import paths", () => {
    const icons = byName(parseHeroicons(dir));
    expect(icons["trash-24-outline"]).toMatchObject({
      importName: "TrashIcon",
      importPath: "@heroicons/react/24/outline",
      style: "outline",
      set: "heroicons",
      categories: [],
      tags: [],
    });
    expect(icons["trash-20-solid"]).toMatchObject({
      importName: "TrashIcon",
      importPath: "@heroicons/react/20/solid",
      style: "solid",
    });
    expect(icons["arrow-down-24-outline"]!.importName).toBe("ArrowDownIcon");
  });

  it("renders children after <title>, including nested groups", () => {
    const icons = byName(parseHeroicons(dir));
    expect(icons["trash-24-outline"]!.svg).toBe(
      '<path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9"/>',
    );
    expect(icons["trash-20-solid"]!.svg).toBe(
      '<g clip-path="url(#a)"><path stroke-linecap="round" stroke-linejoin="round" d="M8.75 1A2.75"/></g>',
    );
  });

  it("builds records with <package>@<major.minor>:<name> ids", async () => {
    const { records } = await buildIndex({ providerId: "heroicons", packageDir: dir, version: "2.1.5" });
    for (const record of records) expectRecordShape(record, "@heroicons/react@2.1");
    expect(records.find((r) => r.name === "trash-24-outline")).toMatchObject({
      id: "@heroicons/react@2.1:trash-24-outline",
      provider: "heroicons",
      package: "@heroicons/react",
      importPath: "@heroicons/react/24/outline",
    });
  });
});

describe("react-icons adapter", () => {
  const dir = fixture(REACT_ICONS_FILES);

  it("parses every set and skips lib/", () => {
    const icons = parseReactIcons(dir);
    expect(icons.map((i) => i.name).sort()).toEqual(["fa-beer", "fa-bell", "fa6-bell", "hi2-outline-trash"]);
  });

  it("keeps names unique across sets and maps import paths per set", () => {
    const icons = byName(parseReactIcons(dir));
    expect(icons["fa-bell"]).toMatchObject({ importName: "FaBell", importPath: "react-icons/fa", set: "fa" });
    expect(icons["fa6-bell"]).toMatchObject({ importName: "FaBell", importPath: "react-icons/fa6", set: "fa6" });
    expect(icons["hi2-outline-trash"]).toMatchObject({
      importName: "HiOutlineTrash",
      importPath: "react-icons/hi2",
      set: "hi2",
      categories: [],
      tags: [],
    });
  });

  it("renders the root svg's children as inner SVG", () => {
    const icons = byName(parseReactIcons(dir));
    expect(icons["fa-beer"]!.svg).toBe('<path d="M368 96h-48"/>');
    expect(icons["hi2-outline-trash"]!.svg).toBe('<path stroke-linecap="round" d="m14.74 9"/>');
  });

  it("builds records with <package>@<major.minor>:<name> ids", async () => {
    const { records } = await buildIndex({ providerId: "react-icons", packageDir: dir, version: "5.4.0" });
    for (const record of records) expectRecordShape(record, "react-icons@5.4");
    expect(records.map((r) => r.id)).toEqual([
      "react-icons@5.4:fa-beer",
      "react-icons@5.4:fa-bell",
      "react-icons@5.4:fa6-bell",
      "react-icons@5.4:hi2-outline-trash",
    ]);
  });
});
