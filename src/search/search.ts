import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Fuse, { type IFuseOptions } from "fuse.js";
import { hashSynonyms, INDEX_FILE, INDEX_VERSION, META_FILE } from "../indexer/buildIndex.js";
import type { IconRecord, IndexMeta, Synonyms } from "../indexer/types.js";

export interface LoadedIndex {
  records: IconRecord[];
  meta: IndexMeta;
}

export interface SearchOptions {
  /** Exact (case-insensitive) provider id filter, e.g. "lucide". */
  provider?: string;
  /** Exact (case-insensitive) style filter, e.g. "outline". */
  style?: string;
  /** Exact (case-insensitive) set filter, e.g. "fa6". */
  set?: string;
  /** Maximum number of results, applied after ranking. */
  limit?: number;
}

export interface SearchResult {
  record: IconRecord;
  /** Fuse.js score: 0 is a perfect match, 1 is no match. */
  score: number;
}

/** Reads index.json and meta.json from an index directory written by writeIndex. */
export async function loadIndex(cacheDir: string): Promise<LoadedIndex> {
  const [index, meta] = await Promise.all([
    readFile(join(cacheDir, INDEX_FILE), "utf8"),
    readFile(join(cacheDir, META_FILE), "utf8"),
  ]);
  return { records: JSON.parse(index) as IconRecord[], meta: JSON.parse(meta) as IndexMeta };
}

/** True when an index was built with different synonyms or an older index format. */
export function indexNeedsRebuild(meta: IndexMeta, synonyms: Synonyms): boolean {
  return meta.indexVersion !== INDEX_VERSION || meta.synonymsHash !== hashSynonyms(synonyms);
}

const FUSE_OPTIONS: IFuseOptions<IconRecord> = {
  keys: [
    { name: "name", weight: 3 },
    { name: "importName", weight: 2 },
    { name: "keywords", weight: 2 },
    { name: "tags", weight: 1 },
  ],
  includeScore: true,
  // Match anywhere in the field; 0.4 tolerates a couple of typos in short words ("detele" -> "delete").
  ignoreLocation: true,
  threshold: 0.4,
  minMatchCharLength: 2,
};

function matches(value: string | undefined, filter: string | undefined): boolean {
  return filter === undefined || value?.toLowerCase() === filter.toLowerCase();
}

/**
 * Filters records by provider/style/set exactly, then ranks them against the query with Fuse.js.
 * Multi-word queries are searched token by token: only records matching every token are kept,
 * ranked by their mean per-token score.
 */
export function searchIcons(records: readonly IconRecord[], query: string, options: SearchOptions = {}): SearchResult[] {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const { provider, style, set, limit } = options;
  const filtered = records.filter(
    (r) => matches(r.provider, provider) && matches(r.style, style) && matches(r.set, set),
  );
  const fuse = new Fuse(filtered, FUSE_OPTIONS);
  const perToken = tokens.map(
    (token) => new Map(fuse.search(token).map((result) => [result.item, result.score ?? 0] as const)),
  );
  const [first, ...rest] = perToken;
  // Iterate in the first token's ranked order so ties keep Fuse's ordering (sort is stable).
  const results: SearchResult[] = [];
  for (const [record, score] of first!) {
    const others = rest.map((scores) => scores.get(record));
    if (others.some((s) => s === undefined)) continue;
    const total = others.reduce<number>((sum, s) => sum + s!, score);
    results.push({ record, score: total / tokens.length });
  }
  results.sort((a, b) => a.score - b.score);
  return limit === undefined ? results : results.slice(0, Math.max(0, limit));
}
