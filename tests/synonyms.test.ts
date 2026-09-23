import { rmSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { buildIndex, buildKeywords, hashSynonyms } from "../src/indexer/buildIndex.js";
import { loadSynonyms, parseSynonyms } from "../src/synonyms/loadSynonyms.js";
import bundled from "../src/synonyms/synonyms.json" with { type: "json" };
import { LUCIDE_FILES, makePackageDir } from "./helpers/fixtures.js";

const packageDir = makePackageDir(LUCIDE_FILES);
afterAll(() => rmSync(packageDir, { recursive: true, force: true }));

describe("bundled synonyms.json", () => {
  it("maps lowercase terms to non-empty arrays of lowercase strings", () => {
    const entries = Object.entries(bundled as Record<string, unknown>);
    expect(entries.length).toBeGreaterThanOrEqual(40);
    for (const [term, alternates] of entries) {
      expect(term).toBe(term.toLowerCase());
      expect(Array.isArray(alternates)).toBe(true);
      expect((alternates as unknown[]).length).toBeGreaterThan(0);
      for (const alt of alternates as unknown[]) {
        expect(typeof alt).toBe("string");
        expect(alt).toBe((alt as string).toLowerCase());
      }
    }
  });

  it("covers common icon vocabulary", () => {
    const synonyms = loadSynonyms();
    expect(synonyms.trash).toEqual(expect.arrayContaining(["delete", "remove", "bin"]));
    expect(synonyms.logout).toContain("sign-out");
    expect(synonyms.settings).toEqual(expect.arrayContaining(["gear", "cog"]));
  });
});

describe("loadSynonyms", () => {
  it("returns the bundled synonyms with a stable hash", () => {
    const synonyms = loadSynonyms();
    expect(synonyms).toEqual(bundled);
    expect(hashSynonyms(loadSynonyms())).toBe(hashSynonyms(synonyms));
    const reversed = Object.fromEntries(Object.entries(synonyms).reverse());
    expect(hashSynonyms(reversed)).toBe(hashSynonyms(synonyms));
  });

  it("feeds keyword expansion at index time", async () => {
    const synonyms = loadSynonyms();
    expect(buildKeywords("trash-2", [], synonyms)).toEqual(expect.arrayContaining(["trash", "delete", "bin"]));
    const { records, meta } = await buildIndex({ providerId: "lucide", packageDir, version: "0.460.0", synonyms });
    expect(records.find((r) => r.name === "trash-2")!.keywords).toEqual(
      expect.arrayContaining(["delete", "remove", "bin"]),
    );
    expect(meta.synonymsHash).toBe(hashSynonyms(synonyms));
  });
});

describe("parseSynonyms", () => {
  it("lowercases terms and alternates", () => {
    expect(parseSynonyms({ Trash: ["Delete", "BIN"] })).toEqual({ trash: ["delete", "bin"] });
  });

  it("rejects malformed input", () => {
    expect(() => parseSynonyms(null)).toThrow(/object/);
    expect(() => parseSynonyms([["a", "b"]])).toThrow(/object/);
    expect(() => parseSynonyms({ trash: "delete" })).toThrow(/"trash"/);
    expect(() => parseSynonyms({ trash: ["delete", 1] })).toThrow(/"trash"/);
  });
});
