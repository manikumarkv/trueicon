import { describe, expect, it } from "vitest";
import { buildKeywords } from "../src/indexer/buildIndex.js";
import type { IconRecord } from "../src/indexer/types.js";
import { baseName, searchIcons } from "../src/search/search.js";
import { loadSynonyms } from "../src/synonyms/loadSynonyms.js";

/*
 * Name-match ranking (issue #17). Each provider below is a slice of its real icon names, taken
 * from the queries that ranked badly before: a composite name containing the query outranked
 * the icon named after it.
 */

const synonyms = loadSynonyms();

function records(provider: string, icons: [name: string, style?: string, set?: string][]): IconRecord[] {
  return icons.map(([name, style, set]) => ({
    id: `${provider}@1.0:${name}`,
    name,
    importName: name.replace(/(^|-)(\w)/g, (_, _sep, c: string) => c.toUpperCase()),
    importPath: provider,
    provider,
    package: provider,
    version: "1.0.0",
    style,
    set: set ?? provider,
    categories: [],
    tags: [],
    keywords: buildKeywords(name, [], synonyms),
    svg: "<path/>",
  }));
}

const MUI = records("mui", [
  ["restore-from-trash", "filled"],
  ["restore-from-trash-outlined", "outlined"],
  ["restore-from-trash-sharp", "sharp"],
  ["delete-sharp", "sharp"],
  ["delete-outlined", "outlined"],
  ["delete", "filled"],
  ["auto-delete", "filled"],
  ["delete-forever", "filled"],
]);

const REMIX = records("remix", [
  ["chat-delete-fill", "fill"],
  ["chat-delete-line", "line"],
  ["delete-bin-fill", "fill"],
  ["delete-bin-line", "line"],
  ["delete-column"],
]);

const LUCIDE = records("lucide", [
  ["circle-arrow-out-down-right", "outline"],
  ["circle-arrow-right", "outline"],
  ["arrow-right", "outline"],
  ["arrow-right-left", "outline"],
  ["trash-2", "outline"],
  ["trash", "outline"],
]);

const FLUENT = records("fluentui", [
  ["building-home-filled", "filled"],
  ["building-home-regular", "regular"],
  ["home-add-regular", "regular"],
  ["home-regular", "regular"],
  ["home-filled", "filled"],
]);

const names = (recs: IconRecord[], query: string, limit = 3) =>
  searchIcons(recs, query, { limit }).map((r) => r.record.name);

describe("name-match ranking", () => {
  it("ranks the icon named after the query above composites that contain it", () => {
    expect(names(MUI, "delete")[0]).toBe("delete");
    expect(names(FLUENT, "home", 2).sort()).toEqual(["home-filled", "home-regular"]);
  });

  it("ranks names that start with the query next", () => {
    expect(names(REMIX, "delete", 4).slice(0, 2)).toEqual(["delete-bin-fill", "delete-bin-line"]);
    expect(names(REMIX, "delete", 5).indexOf("chat-delete-fill")).toBeGreaterThan(1);
  });

  it("puts a synonym's plain icon above composites that contain the query word", () => {
    // trash -> delete comes from synonyms.json; restore-from-trash only contains "trash".
    expect(names(MUI, "trash", 1)).toEqual(["delete"]);
  });

  it("matches a multi-word query as a phrase", () => {
    expect(names(LUCIDE, "arrow right", 3)).toEqual(["arrow-right", "arrow-right-left", "circle-arrow-right"]);
  });

  it("treats variant numbers as the plain name unless the query has the number", () => {
    expect(names(LUCIDE, "trash", 2)).toEqual(["trash", "trash-2"]);
    expect(names(LUCIDE, "trash 2", 1)).toEqual(["trash-2"]);
  });

  it("matches the import name exactly", () => {
    expect(names(LUCIDE, "Trash2", 1)).toEqual(["trash-2"]);
  });

  it("keeps each icon's style variants together, default style first", () => {
    const hits = names(MUI, "delete", 3);
    expect(hits[0]).toBe("delete");
    expect(hits.every((n) => n.startsWith("delete") && !n.includes("forever"))).toBe(true);
  });

  it("returns scores that reproduce the ranking, so merged providers keep it", () => {
    const merged = [...MUI, ...REMIX, ...LUCIDE, ...FLUENT];
    const results = searchIcons(merged, "delete");
    const scores = results.map((r) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
    // An exact name match in any provider beats a composite in another.
    const tiers = results.map((r) => r.record.name);
    expect(tiers.indexOf("delete")).toBeLessThan(tiers.indexOf("chat-delete-fill"));
    for (const r of results) expect(r.score).toBeGreaterThanOrEqual(0);
    for (const r of results) expect(r.score).toBeLessThanOrEqual(1);
  });

  it("still finds typos through Fuse", () => {
    expect(names(LUCIDE, "trsah", 2).sort()).toEqual(["trash", "trash-2"]);
  });
});

describe("baseName", () => {
  it("strips the style suffix and marks the variant as styled", () => {
    expect(baseName({ name: "delete-bin-line", style: "line", set: "remix", provider: "remix" })).toEqual({
      parts: ["delete", "bin"],
      styled: true,
    });
    expect(baseName({ name: "delete", style: "filled", set: "mui", provider: "mui" })).toEqual({ parts: ["delete"], styled: false });
    expect(baseName({ name: "trash-24-outline", style: "outline", set: "heroicons", provider: "heroicons" }).parts).toEqual(["trash", "24"]);
  });

  it("strips react-icons set prefixes and the style words inside its names", () => {
    expect(baseName({ name: "ai-outline-delete", set: "ai", provider: "react-icons" })).toEqual({ parts: ["delete"], styled: true });
    expect(baseName({ name: "bs-fill-trash-fill", set: "bs", provider: "react-icons" })).toEqual({ parts: ["trash"], styled: true });
    expect(baseName({ name: "bi-trash", set: "bi", provider: "react-icons" })).toEqual({ parts: ["trash"], styled: false });
  });

  it("keeps a set-named first part outside react-icons", () => {
    expect(baseName({ name: "carbon-accounting", set: "carbon", provider: "carbon" }).parts).toEqual(["carbon", "accounting"]);
  });

  it("never returns an empty name", () => {
    expect(baseName({ name: "fill", set: "remix", provider: "remix" }).parts).toEqual(["fill"]);
    expect(baseName({ name: "ai-outline", set: "ai", provider: "react-icons" }).parts).toEqual(["outline"]);
  });
});
