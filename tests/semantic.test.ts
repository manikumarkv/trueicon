import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadProjectConfig } from "../src/config/loadConfig.js";
import { resolveIndexAction } from "../src/config/versions.js";
import { buildIndex, hashSynonyms } from "../src/indexer/buildIndex.js";
import type { IconRecord } from "../src/indexer/types.js";
import { indexNeedsRebuild, searchIcons, searchIconsHybrid } from "../src/search/search.js";
import { EMBEDDING_MODEL, semanticText, type SemanticEmbedder } from "../src/semantic/embeddings.js";
import { cosineSimilarity, reciprocalRankFusion } from "../src/semantic/fusion.js";
import { resolveSemanticSearch } from "../src/tools/context.js";
import { LUCIDE_FILES, makePackageDir } from "./helpers/fixtures.js";

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

/** Hand-made records with 2D vectors so hybrid behavior is fully deterministic. */
function record(name: string, vector: number[] | undefined, keywords: string[] = []): IconRecord {
  return {
    id: `lucide-react@0.460:${name}`,
    name,
    importName: name,
    importPath: "lucide-react",
    provider: "lucide",
    package: "lucide-react",
    version: "0.460.0",
    categories: [],
    tags: [],
    keywords: [name, ...keywords],
    ...(vector === undefined ? {} : { vector }),
    svg: "<path/>",
  };
}

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 1], [-1, -1])).toBeCloseTo(-1);
  });

  it("returns 0 when a vector is all zeros", () => {
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
  });

  it("throws on length mismatch", () => {
    expect(() => cosineSimilarity([1], [1, 2])).toThrow(/length mismatch/);
  });
});

describe("reciprocalRankFusion", () => {
  it("ranks an id present in both lists above single-list ids", () => {
    const scores = reciprocalRankFusion([
      ["a", "b"],
      ["b", "c"],
    ]);
    expect(scores.get("b")).toBeGreaterThan(scores.get("a")!);
    expect(scores.get("b")).toBeGreaterThan(scores.get("c")!);
  });

  it("prefers the earlier rank within one list", () => {
    const scores = reciprocalRankFusion([["a", "b"]]);
    expect(scores.get("a")).toBeGreaterThan(scores.get("b")!);
  });

  it("uses 1/(k + rank) with 1-based ranks", () => {
    const scores = reciprocalRankFusion([["a"]], 60);
    expect(scores.get("a")).toBeCloseTo(1 / 61);
  });
});

describe("searchIconsHybrid", () => {
  // Query vector points at the eraser; nothing in the keywords matches "remove background".
  const eraser = record("eraser", [1, 0.05], ["eraser", "rubber"]);
  const trash = record("trash-2", [0, 1], ["trash", "delete", "bin"]);
  const records = [eraser, trash];

  it("surfaces a conceptual match Fuse alone would miss", () => {
    const hybrid = searchIconsHybrid(records, "remove background", [1, 0], { limit: 2 });
    expect(hybrid[0]!.record.name).toBe("eraser");
    // Fuse-only finds nothing relevant for this query.
    expect(searchIcons(records, "remove background", { limit: 2 }).map((r) => r.record.name)).not.toContain(
      "eraser",
    );
  });

  it("keeps exact keyword matches on top", () => {
    const hybrid = searchIconsHybrid(records, "trash", [0, 1], { limit: 2 });
    expect(hybrid[0]!.record.name).toBe("trash-2");
  });

  it("falls back to Fuse order when no record has a vector", () => {
    const noVectors = records.map((r) => ({ ...r, vector: undefined }));
    const hybrid = searchIconsHybrid(noVectors, "trash", [0, 1], { limit: 2 });
    const keyword = searchIcons(noVectors, "trash", { limit: 2 });
    expect(hybrid.map((r) => r.record.name)).toEqual(keyword.map((r) => r.record.name));
  });

  it("returns [] for a blank query without embedding anything", () => {
    expect(searchIconsHybrid(records, "   ", [1, 0])).toEqual([]);
  });

  it("respects provider filters and limit", () => {
    const hybrid = searchIconsHybrid(records, "remove background", [1, 0], { provider: "nope" });
    expect(hybrid).toEqual([]);
    expect(searchIconsHybrid(records, "remove background", [1, 0], { limit: 1 })).toHaveLength(1);
  });
});

describe("semanticText", () => {
  it("joins the name and keyword expansions", () => {
    expect(semanticText({ name: "trash-2", keywords: ["trash", "2", "delete"] })).toBe("trash-2 trash 2 delete");
  });
});

describe("buildIndex with an embedder", () => {
  const fakeEmbedder: SemanticEmbedder = {
    embed: async (texts) => texts.map((t) => [t.length, 0]),
  };

  it("attaches vectors and records the embedding model", async () => {
    const packageDir = makePackageDir(LUCIDE_FILES);
    tempDirs.push(packageDir);
    const { records, meta } = await buildIndex({
      providerId: "lucide",
      packageDir,
      version: "0.460.0",
      synonyms: {},
      embedder: fakeEmbedder,
    });
    expect(records.length).toBeGreaterThan(0);
    for (const r of records) expect(r.vector).toHaveLength(2);
    expect(meta.embeddingModel).toBe(EMBEDDING_MODEL);
  });

  it("builds a keyword-only index without an embedder", async () => {
    const packageDir = makePackageDir(LUCIDE_FILES);
    tempDirs.push(packageDir);
    const { records, meta } = await buildIndex({ providerId: "lucide", packageDir, version: "0.460.0", synonyms: {} });
    for (const r of records) expect(r.vector).toBeUndefined();
    expect(meta.embeddingModel).toBeUndefined();
  });
});

describe("embedding model rebuild triggers", () => {
  const synonyms = {};
  const synonymsHash = hashSynonyms(synonyms);
  const meta = {
    provider: "lucide",
    package: "lucide-react",
    version: "0.460.0",
    indexVersion: 1 as const,
    synonymsHash,
    builtAt: "2026-01-01T00:00:00.000Z",
  };

  it("indexNeedsRebuild fires when the embedding model changes", () => {
    expect(indexNeedsRebuild({ ...meta, embeddingModel: EMBEDDING_MODEL }, synonyms, EMBEDDING_MODEL)).toBe(false);
    expect(indexNeedsRebuild({ ...meta, embeddingModel: EMBEDDING_MODEL }, synonyms, null)).toBe(true);
    expect(indexNeedsRebuild(meta, synonyms, EMBEDDING_MODEL)).toBe(true);
    // Legacy keyword-only index with semantic off: no rebuild.
    expect(indexNeedsRebuild(meta, synonyms, null)).toBe(false);
  });

  it("resolveIndexAction fires when the embedding model changes", () => {
    expect(
      resolveIndexAction("0.460.0", { ...meta, embeddingModel: EMBEDDING_MODEL }, synonymsHash, EMBEDDING_MODEL),
    ).toBe("use");
    expect(resolveIndexAction("0.460.0", { ...meta, embeddingModel: EMBEDDING_MODEL }, synonymsHash, null)).toBe(
      "rebuild",
    );
    expect(resolveIndexAction("0.460.0", meta, synonymsHash, EMBEDDING_MODEL)).toBe("rebuild");
  });
});

describe("semantic config", () => {
  function makeProjectDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "trueicon-semantic-"));
    tempDirs.push(dir);
    return dir;
  }

  it("parses the semantic flag from .iconmcp.json", () => {
    const dir = makeProjectDir();
    writeFileSync(join(dir, ".iconmcp.json"), JSON.stringify({ providers: [], semantic: true }));
    expect(loadProjectConfig(dir).semantic).toBe(true);
  });

  it("defaults semantic to undefined when absent", () => {
    const dir = makeProjectDir();
    writeFileSync(join(dir, ".iconmcp.json"), JSON.stringify({ providers: [] }));
    expect(loadProjectConfig(dir).semantic).toBeUndefined();
  });

  it("rejects a non-boolean semantic flag", () => {
    const dir = makeProjectDir();
    writeFileSync(join(dir, ".iconmcp.json"), JSON.stringify({ providers: [], semantic: "yes" }));
    expect(() => loadProjectConfig(dir)).toThrow(/"semantic" must be a boolean/);
  });

  it("resolveSemanticSearch: env overrides config, default off", () => {
    const prev = process.env.TRUEICON_SEMANTIC;
    try {
      delete process.env.TRUEICON_SEMANTIC;
      expect(resolveSemanticSearch({ providers: [] })).toBe(false);
      expect(resolveSemanticSearch({ providers: [], semantic: true })).toBe(true);
      process.env.TRUEICON_SEMANTIC = "0";
      expect(resolveSemanticSearch({ providers: [], semantic: true })).toBe(false);
      process.env.TRUEICON_SEMANTIC = "1";
      expect(resolveSemanticSearch({ providers: [] })).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.TRUEICON_SEMANTIC;
      else process.env.TRUEICON_SEMANTIC = prev;
    }
  });
});
