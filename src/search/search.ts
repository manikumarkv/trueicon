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
  /**
   * Best per-token Fuse.js score: 0 is a perfect match, 1 is no match. For
   * multi-word queries this is the score of the closest-matching token; see
   * {@link searchIcons} for how coverage across tokens breaks ties.
   */
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
 *
 * Multi-word queries are searched token by token. A record is a candidate when it matches
 * at least one token; ranking is by the best per-token score first, then by how many tokens
 * matched, then by the mean matched score. Requiring every token to match (a hard AND) was
 * tried and rejected: on real indexes it excludes the right icons whenever one token is a
 * near-synonym absent from the index ("can" vs keywords trash/delete/bin), while unrelated
 * icons slip through on loose fuzzy matches of every token ("kanban" ~= "can").
 */
export function searchIcons(records: readonly IconRecord[], query: string, options: SearchOptions = {}): SearchResult[] {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const { provider, style, set, limit } = options;
  const filtered = records.filter(
    (r) => matches(r.provider, provider) && matches(r.style, style) && matches(r.set, set),
  );
  const fuse = new Fuse(filtered, FUSE_OPTIONS);
  const stats = new Map<IconRecord, { best: number; matched: number; total: number }>();
  for (const token of tokens) {
    for (const result of fuse.search(token)) {
      const score = result.score ?? 0;
      const st = stats.get(result.item);
      if (st) {
        st.matched += 1;
        st.total += score;
        if (score < st.best) st.best = score;
      } else {
        stats.set(result.item, { best: score, matched: 1, total: score });
      }
    }
  }
  // Sort is stable, so full ties keep token order: matches for earlier query
  // tokens were inserted first and stay ahead.
  const ranked = [...stats]
    .map(([record, st]): SearchResult & { matched: number; mean: number } => ({
      record,
      score: st.best,
      matched: st.matched,
      mean: st.total / st.matched,
    }))
    .sort((a, b) => a.score - b.score || b.matched - a.matched || a.mean - b.mean)
    .map(({ record, score }): SearchResult => ({ record, score }));
  return limit === undefined ? ranked : ranked.slice(0, Math.max(0, limit));
}
