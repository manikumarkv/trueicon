import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  buildIndex,
  buildKeywords,
  hashSynonyms,
  INDEX_FILE,
  INDEX_VERSION,
  META_FILE,
  writeIndex,
} from "../src/indexer/buildIndex.js";
import type { IconRecord, IndexMeta, Synonyms } from "../src/indexer/types.js";
import { LUCIDE_FILES, makePackageDir } from "./helpers/fixtures.js";

const SYNONYMS: Synonyms = {
  trash: ["Delete", "bin", "remove"],
  arrow: ["direction"],
  // Overlaps with a name part, so it must be deduped.
  down: ["down", "south"],
};

const packageDir = makePackageDir(LUCIDE_FILES);
const cacheRoot = mkdtempSync(join(tmpdir(), "trueicon-index-"));
afterAll(() => {
  rmSync(packageDir, { recursive: true, force: true });
  rmSync(cacheRoot, { recursive: true, force: true });
});

function build(synonyms?: Synonyms) {
  return buildIndex({ providerId: "lucide", packageDir, version: "0.460.0", synonyms });
}

describe("buildKeywords", () => {
  it("combines name parts, tags and synonym expansions, lowercased and deduped", () => {
    expect(buildKeywords("trash-2", ["Trash-Can", "trash"], SYNONYMS)).toEqual([
      "trash",
      "2",
      "trash-can",
      "delete",
      "bin",
      "remove",
    ]);
  });

  it("does not expand inherited object keys", () => {
    expect(buildKeywords("constructor", [], {})).toEqual(["constructor"]);
  });
});

describe("hashSynonyms", () => {
  it("is independent of key order", () => {
    expect(hashSynonyms({ a: ["x"], b: ["y"] })).toBe(hashSynonyms({ b: ["y"], a: ["x"] }));
  });

  it("changes when synonyms change", () => {
    expect(hashSynonyms({ a: ["x"] })).not.toBe(hashSynonyms({ a: ["x", "y"] }));
    expect(hashSynonyms({})).not.toBe(hashSynonyms({ a: [] }));
  });
});

describe("buildIndex", () => {
  it("expands keywords from name parts, tags and synonyms", async () => {
    const { records } = await build(SYNONYMS);
    const byName = Object.fromEntries(records.map((r) => [r.name, r]));
    expect(byName["trash-2"]!.keywords).toEqual(["trash", "2", "trash-can", "delete", "bin", "remove"]);
    expect(byName["arrow-down"]!.keywords).toEqual(["arrow", "down", "direction", "south"]);
    for (const record of records) {
      expect(new Set(record.keywords).size).toBe(record.keywords.length);
      for (const keyword of record.keywords) expect(keyword).toBe(keyword.toLowerCase());
    }
  });

  it("sorts records by name", async () => {
    const { records } = await build();
    expect(records.map((r) => r.name)).toEqual(["arrow-down", "trash-2"]);
  });

  it("records the synonyms hash in meta", async () => {
    const { meta } = await build(SYNONYMS);
    expect(meta).toMatchObject({
      provider: "lucide",
      package: "lucide-react",
      version: "0.460.0",
      indexVersion: INDEX_VERSION,
      synonymsHash: hashSynonyms(SYNONYMS),
    });
    expect(Number.isNaN(Date.parse(meta.builtAt))).toBe(false);
  });

  it("defaults to empty synonyms", async () => {
    const { meta, records } = await build();
    expect(meta.synonymsHash).toBe(hashSynonyms({}));
    expect(records.find((r) => r.name === "trash-2")!.keywords).toEqual(["trash", "2", "trash-can"]);
  });

  it("changes the synonyms hash when synonyms change (rebuild trigger)", async () => {
    const before = (await build(SYNONYMS)).meta.synonymsHash;
    const same = (await build({ down: ["down", "south"], arrow: ["direction"], trash: ["Delete", "bin", "remove"] }))
      .meta.synonymsHash;
    const after = (await build({ ...SYNONYMS, trash: [...SYNONYMS.trash!, "garbage"] })).meta.synonymsHash;
    expect(same).toBe(before);
    expect(after).not.toBe(before);
  });

  it("rejects unknown providers and inexact versions", async () => {
    await expect(buildIndex({ providerId: "nope", packageDir, version: "1.0.0" })).rejects.toThrow(/Unknown provider/);
    // Package names are not provider ids.
    await expect(buildIndex({ providerId: "lucide-react", packageDir, version: "1.0.0" })).rejects.toThrow(
      /Unknown provider/,
    );
    await expect(buildIndex({ providerId: "lucide", packageDir, version: "^0.460.0" })).rejects.toThrow(/exact semver/);
  });
});

describe("writeIndex", () => {
  it("writes index.json and meta.json with the synonyms hash", async () => {
    const { records, meta } = await build(SYNONYMS);
    const cacheDir = join(cacheRoot, "lucide-react@0.460");
    await writeIndex(cacheDir, records, meta);

    const written = JSON.parse(readFileSync(join(cacheDir, INDEX_FILE), "utf8")) as IconRecord[];
    expect(written).toEqual(records);
    const writtenMeta = JSON.parse(readFileSync(join(cacheDir, META_FILE), "utf8")) as IndexMeta;
    expect(writtenMeta).toEqual(meta);
    expect(writtenMeta.synonymsHash).toBe(hashSynonyms(SYNONYMS));
  });

  it("overwrites meta.json with a new hash when rebuilt with different synonyms", async () => {
    const cacheDir = join(cacheRoot, "rebuild");
    const first = await build(SYNONYMS);
    await writeIndex(cacheDir, first.records, first.meta);
    const changed: Synonyms = { trash: ["garbage"] };
    const second = await build(changed);
    await writeIndex(cacheDir, second.records, second.meta);

    const writtenMeta = JSON.parse(readFileSync(join(cacheDir, META_FILE), "utf8")) as IndexMeta;
    expect(writtenMeta.synonymsHash).toBe(hashSynonyms(changed));
    expect(writtenMeta.synonymsHash).not.toBe(first.meta.synonymsHash);
    const written = JSON.parse(readFileSync(join(cacheDir, INDEX_FILE), "utf8")) as IconRecord[];
    expect(written.find((r) => r.name === "trash-2")!.keywords).toContain("garbage");
  });
});
