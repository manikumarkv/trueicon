import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildIndex, buildIndexFromPackage, INDEX_VERSION } from "../src/indexer/buildIndex.js";
import type { IconRecord, IndexMeta } from "../src/indexer/types.js";
import { indexNeedsRebuild, loadIndex, searchIcons } from "../src/search/search.js";
import { loadSynonyms } from "../src/synonyms/loadSynonyms.js";
import { HEROICONS_FILES, LUCIDE_FILES, makePackageDir, REACT_ICONS_FILES } from "./helpers/fixtures.js";

const synonyms = loadSynonyms();
const dirs = {
  lucide: makePackageDir(LUCIDE_FILES),
  heroicons: makePackageDir(HEROICONS_FILES),
  "react-icons": makePackageDir(REACT_ICONS_FILES),
};
const cacheRoot = mkdtempSync(join(tmpdir(), "trueicon-search-"));
afterAll(() => {
  for (const dir of [...Object.values(dirs), cacheRoot]) rmSync(dir, { recursive: true, force: true });
});

const VERSIONS = { lucide: "0.460.0", heroicons: "2.1.5", "react-icons": "5.4.0" };

// All fixture icons from the three providers, indexed with the bundled synonyms.
const records: IconRecord[] = (
  await Promise.all(
    (Object.keys(dirs) as (keyof typeof dirs)[]).map((providerId) =>
      buildIndex({ providerId, packageDir: dirs[providerId], version: VERSIONS[providerId], synonyms }),
    ),
  )
).flatMap((built) => built.records);

// A hand-made record for icons the fixtures lack.
function record(name: string, importName: string, extra: Partial<IconRecord> = {}): IconRecord {
  return {
    id: `test@1.0:${name}`,
    name,
    importName,
    importPath: "test",
    provider: "test",
    package: "test",
    version: "1.0.0",
    categories: [],
    tags: [],
    keywords: name.split("-"),
    svg: "",
    ...extra,
  };
}

const names = (results: ReturnType<typeof searchIcons>) => results.map((r) => `${r.record.provider}:${r.record.name}`);

describe("searchIcons", () => {
  it("ranks lucide Trash2 in the top 3 for 'trash'", () => {
    const top = searchIcons(records, "trash", { limit: 3 }).map((r) => r.record.importName);
    expect(top).toContain("Trash2");
  });

  it("finds trash icons through synonyms expanded at index time", () => {
    const results = searchIcons(records, "delete", { provider: "lucide" });
    expect(results[0]?.record.importName).toBe("Trash2");
  });

  it("tolerates typos", () => {
    const withDelete = [...records, record("delete", "Delete"), record("bell-ring", "BellRing")];
    expect(names(searchIcons(withDelete, "detele")).slice(0, 3)).toContain("test:delete");
    // Via synonym-expanded keywords too.
    expect(searchIcons(records, "detele", { provider: "lucide" })[0]?.record.importName).toBe("Trash2");
  });

  it("returns scores in ascending order", () => {
    const scores = searchIcons(records, "trash").map((r) => r.score);
    expect(scores.length).toBeGreaterThan(1);
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
  });

  it("filters exactly by provider, style and set, case-insensitively", () => {
    const lucide = searchIcons(records, "trash", { provider: "LUCIDE" });
    expect(lucide.length).toBeGreaterThan(0);
    expect(lucide.every((r) => r.record.provider === "lucide")).toBe(true);

    const heroSolid = searchIcons(records, "trash", { provider: "heroicons", style: "Solid" });
    expect(heroSolid.length).toBeGreaterThan(0);
    expect(heroSolid.every((r) => r.record.provider === "heroicons" && r.record.style === "solid")).toBe(true);

    const fa6 = searchIcons(records, "bell", { set: "fa6" });
    expect(fa6.map((r) => r.record.importName)).toEqual(["FaBell"]);
    expect(fa6[0]!.record.set).toBe("fa6");

    expect(searchIcons(records, "trash", { provider: "nope" })).toEqual([]);
    // Records without a style never match a style filter.
    expect(searchIcons([record("trash", "Trash")], "trash", { style: "outline" })).toEqual([]);
  });

  it("returns nothing for an empty or blank query", () => {
    expect(searchIcons(records, "")).toEqual([]);
    expect(searchIcons(records, "   ")).toEqual([]);
  });

  it("respects the limit after ranking", () => {
    const all = searchIcons(records, "trash");
    expect(all.length).toBeGreaterThan(2);
    expect(searchIcons(records, "trash", { limit: 2 })).toEqual(all.slice(0, 2));
    expect(searchIcons(records, "trash", { limit: 0 })).toEqual([]);
  });

  it("returns nothing for unrelated queries", () => {
    expect(searchIcons(records, "zzzzqqq")).toEqual([]);
  });
});

describe("buildIndexFromPackage + loadIndex", () => {
  it("writes the index under <package>@<major.minor> and reads it back", async () => {
    const built = await buildIndexFromPackage(dirs.lucide, "lucide", "0.460.0", cacheRoot, synonyms);
    expect(built.dir).toBe(join(cacheRoot, "lucide-react@0.460"));
    const loaded = await loadIndex(built.dir);
    expect(loaded.records).toEqual(built.records);
    expect(loaded.meta).toEqual(built.meta);
    expect(indexNeedsRebuild(loaded.meta, synonyms)).toBe(false);
    expect(searchIcons(loaded.records, "bin")[0]?.record.importName).toBe("Trash2");
  });

  it("rejects when the index is missing", async () => {
    await expect(loadIndex(join(cacheRoot, "missing"))).rejects.toThrow();
  });
});

describe("indexNeedsRebuild", () => {
  const baseMeta = async (): Promise<IndexMeta> =>
    (await buildIndex({ providerId: "lucide", packageDir: dirs.lucide, version: "0.460.0", synonyms })).meta;

  it("is false when the synonyms hash and index version match", async () => {
    const meta = await baseMeta();
    expect(indexNeedsRebuild(meta, synonyms)).toBe(false);
    expect(indexNeedsRebuild(meta, Object.fromEntries(Object.entries(synonyms).reverse()))).toBe(false);
  });

  it("is true when synonyms changed", async () => {
    const meta = await baseMeta();
    expect(indexNeedsRebuild(meta, { ...synonyms, trash: ["garbage"] })).toBe(true);
    expect(indexNeedsRebuild(meta, {})).toBe(true);
  });

  it("is true when the index version differs", async () => {
    const meta = await baseMeta();
    expect(indexNeedsRebuild({ ...meta, indexVersion: (INDEX_VERSION + 1) as 1 }, synonyms)).toBe(true);
  });
});
