import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Fuse, { type IFuseOptions } from "fuse.js";
import { hashSynonyms, INDEX_FILE, INDEX_VERSION, META_FILE } from "../indexer/buildIndex.js";
import type { IconRecord, IndexMeta, Synonyms } from "../indexer/types.js";
import { cosineSimilarity, reciprocalRankFusion } from "../semantic/fusion.js";

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
   * 0 is a perfect match, 1 is no match. For keyword search this is the best
   * per-token Fuse.js score (see {@link searchIcons}); for hybrid search it is
   * 1/(1+rrf), derived from reciprocal rank fusion over the Fuse and semantic
   * rankings. Both scales sort ascending and are roughly comparable.
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

/** True when an index was built with different synonyms, a different embedding model, or an older index format. */
export function indexNeedsRebuild(
  meta: IndexMeta,
  synonyms: Synonyms,
  embeddingModel: string | null = null,
): boolean {
  return (
    meta.indexVersion !== INDEX_VERSION ||
    meta.synonymsHash !== hashSynonyms(synonyms) ||
    (meta.embeddingModel ?? null) !== embeddingModel
  );
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
 * Full Fuse ranking over pre-filtered records (no limit applied). Shared by
 * {@link searchIcons} and {@link searchIconsHybrid}.
 */
function rankWithFuse(
  filtered: IconRecord[],
  tokens: string[],
): ({ record: IconRecord; score: number } & { matched: number; mean: number })[] {
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
  return [...stats]
    .map(([record, st]) => ({ record, score: st.best, matched: st.matched, mean: st.total / st.matched }))
    .sort((a, b) => a.score - b.score || b.matched - a.matched || a.mean - b.mean);
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
  const ranked = rankWithFuse(filtered, tokens).map(
    ({ record, score }): SearchResult => ({ record, score }),
  );
  return limit === undefined ? ranked : ranked.slice(0, Math.max(0, limit));
}

/** Per-side candidate pool for hybrid search: 3x the requested limit, bounded. */
const HYBRID_FETCH_MULTIPLIER = 3;
const HYBRID_FETCH_MAX = 100;

/**
 * Hybrid search: union of the Fuse keyword ranking and a cosine-similarity ranking
 * over the records' embedding vectors, merged with reciprocal rank fusion.
 *
 * Each side contributes its top candidates; RRF then scores every candidate by
 * 1/(k + rank) per side, so an icon both sides agree on outranks one only a single
 * side surfaced. Exact-name queries still win because Fuse gives them near-perfect
 * ranks, while conceptual queries Fuse can't see ("remove background" -> eraser)
 * surface through the semantic side. Records without vectors only rank via Fuse.
 *
 * @param queryVector the query embedded with the same model as the record vectors.
 */
export function searchIconsHybrid(
  records: readonly IconRecord[],
  query: string,
  queryVector: readonly number[],
  options: SearchOptions = {},
): SearchResult[] {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const { provider, style, set, limit } = options;
  const filtered = records.filter(
    (r) => matches(r.provider, provider) && matches(r.style, style) && matches(r.set, set),
  );
  const fetchLimit = Math.min(HYBRID_FETCH_MAX, Math.max(30, HYBRID_FETCH_MULTIPLIER * (limit ?? 10)));

  const fuseIds = rankWithFuse(filtered, tokens)
    .slice(0, fetchLimit)
    .map((r) => r.record.id);
  const semanticIds = filtered
    .filter((r) => r.vector && r.vector.length === queryVector.length)
    .map((r) => ({ id: r.id, similarity: cosineSimilarity(queryVector, r.vector!) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, fetchLimit)
    .map((r) => r.id);

  const fused = reciprocalRankFusion([fuseIds, semanticIds]);
  const byId = new Map(filtered.map((r) => [r.id, r]));
  const ranked = [...fused.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, rrf]): SearchResult => ({ record: byId.get(id)!, score: 1 / (1 + rrf) }));
  return limit === undefined ? ranked : ranked.slice(0, Math.max(0, limit));
}
