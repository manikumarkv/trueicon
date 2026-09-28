import { describe, expect, it } from "vitest";
import { buildKeywords } from "../src/indexer/buildIndex.js";
import type { IconRecord } from "../src/indexer/types.js";
import { searchIcons } from "../src/search/search.js";
import { loadSynonyms } from "../src/synonyms/loadSynonyms.js";

/*
 * Queries that missed the obvious icon because the library names it differently (issue #22).
 * Each provider is a slice of its real icon names, indexed with the bundled synonyms.
 */

const synonyms = loadSynonyms();

function records(provider: string, icons: [name: string, style?: string][]): IconRecord[] {
  return icons.map(([name, style]) => ({
    id: `${provider}@1.0:${name}`,
    name,
    importName: name,
    importPath: provider,
    provider,
    package: provider,
    version: "1.0.0",
    style,
    set: provider,
    categories: [],
    tags: [],
    keywords: buildKeywords(name, [], synonyms),
    svg: "<path/>",
  }));
}

const top = (recs: IconRecord[], query: string, n = 3) =>
  searchIcons(recs, query, { limit: n }).map((r) => r.record.name);

describe("synonym gaps", () => {
  it("finds Radix's cross icons for close", () => {
    const radix = records("radix", [
      ["cross-1"],
      ["cross-2"],
      ["cross-circled"],
      ["envelope-closed"],
      ["eye-closed"],
      ["lock-closed"],
      ["crosshair-1"],
    ]);
    expect(top(radix, "close").sort()).toEqual(["cross-1", "cross-2", "cross-circled"]);
  });

  it("finds Fluent UI's dismiss icons for close", () => {
    const fluent = records("fluentui", [
      ["closed-caption-filled", "filled"],
      ["lock-closed-filled", "filled"],
      ["dismiss-filled", "filled"],
      ["dismiss-regular", "regular"],
    ]);
    expect(top(fluent, "close", 2).sort()).toEqual(["dismiss-filled", "dismiss-regular"]);
  });

  it("finds hamburger icons named list or navigation for menu", () => {
    const phosphor = records("phosphor", [["folder-minus"], ["list"], ["list-bold", "bold"]]);
    expect(top(phosphor, "menu", 1)).toEqual(["list"]);
    const fluent = records("fluentui", [
      ["chat-multiple-minus-regular", "regular"],
      ["navigation-regular", "regular"],
      ["navigation-filled", "filled"],
    ]);
    expect(top(fluent, "menu", 2).sort()).toEqual(["navigation-filled", "navigation-regular"]);
  });

  it("keeps lucide's navigation arrow out of menu results", () => {
    const lucide = records("lucide", [["menu"], ["navigation"], ["square-menu"]]);
    expect(top(lucide, "menu")).not.toContain("navigation");
  });

  it("finds MUI brand icons whose names split into two words", () => {
    const mui = records("mui", [["git-hub"], ["linked-in"], ["you-tube"], ["whats-app"], ["linked-camera"]]);
    expect(top(mui, "github", 1)).toEqual(["git-hub"]);
    expect(top(mui, "linkedin", 1)).toEqual(["linked-in"]);
    expect(top(mui, "youtube", 1)).toEqual(["you-tube"]);
    expect(top(mui, "whatsapp", 1)).toEqual(["whats-app"]);
  });
});
