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
   * 0 is a perfect match, 1 is no match. For keyword search it folds in the name-match
   * ranking and the best per-token Fuse.js score (see rankWithFuse); for hybrid search it is
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

// Style words react-icons folds into its names ("ai-outline-delete", "bs-fill-trash-fill"); its
// records carry no style of their own to strip.
const REACT_ICONS_STYLE_WORDS = new Set(["fill", "outline", "twotone", "solid", "reg", "regular", "line", "sharp", "round", "rounded"]);

export interface BaseName {
  /** Name parts describing the icon itself, never empty. */
  parts: string[];
  /** Whether a style was stripped to get there, i.e. this is not the icon's default variant. */
  styled: boolean;
}

/**
 * A record's name without its style suffix, and for react-icons its set prefix: "delete-bin-line"
 * -> [delete, bin], "trash-24-outline" -> [trash, 24], "ai-outline-delete" -> [delete].
 */
export function baseName(record: Pick<IconRecord, "name" | "style" | "set" | "provider">): BaseName {
  let name = record.name;
  let styled = false;
  if (record.style && name.endsWith(`-${record.style}`)) {
    name = name.slice(0, -record.style.length - 1);
    styled = true;
  }
  let parts = name.split("-");
  if (record.provider === "react-icons" && record.set && parts.length > 1 && parts[0] === record.set) {
    parts = parts.slice(1);
    const before = parts.length;
    while (parts.length > 1 && REACT_ICONS_STYLE_WORDS.has(parts[0]!)) parts = parts.slice(1);
    while (parts.length > 1 && REACT_ICONS_STYLE_WORDS.has(parts.at(-1)!)) parts = parts.slice(0, -1);
    styled ||= parts.length < before;
  }
  return { parts, styled };
}

const isNumeric = (part: string) => /^\d+$/.test(part);

function startsWithParts(parts: readonly string[], prefix: readonly string[]): boolean {
  return prefix.length <= parts.length && prefix.every((p, i) => parts[i] === p);
}

function containsRun(parts: readonly string[], run: readonly string[]): boolean {
  for (let i = 0; i + run.length <= parts.length; i++) {
    if (run.every((p, j) => parts[i + j] === p)) return true;
  }
  return false;
}

/** The weakest name tier: Fuse matched the record, but not through its name. */
const FUZZY_TIER = 4;

/**
 * How directly a record's name answers the query, from 0 (best) to 4:
 *
 *   0  the base name is the query ("delete" -> delete, delete-outlined), or the import name is
 *   1  the base name starts with the query ("delete" -> delete-bin-line)
 *   2  a multi-word query appears as a phrase in the base name ("arrow right" -> circle-arrow-right)
 *   3  every query word is a base-name part, a keyword (synonym or tag), or starts a base-name
 *      part of 4+ letters ("trash" -> restore-from-trash, and delete via the trash synonym)
 *   4  anything else Fuse matched (typos, partial matches)
 *
 * Numeric parts are ignored when comparing, so size and variant numbers (trash-24, trash-2,
 * home-2) rank with the plain name unless the query includes the number.
 */
function nameTier(record: IconRecord, base: readonly string[], words: readonly string[], compact: string): number {
  if (record.importName.toLowerCase() === compact) return 0;
  const core = base.filter((p) => !isNumeric(p));
  const candidates = core.length > 0 && core.length < base.length ? [base, core] : [base];
  if (candidates.some((parts) => parts.length === words.length && startsWithParts(parts, words))) return 0;
  if (candidates.some((parts) => startsWithParts(parts, words))) return 1;
  if (words.length > 1 && containsRun(base, words)) return 2;
  const keywords = new Set(record.keywords);
  const hit = (word: string) =>
    base.includes(word) || keywords.has(word) || (word.length >= 4 && base.some((p) => p.startsWith(word)));
  return words.every(hit) ? 3 : FUZZY_TIER;
}

// Base-name lengths past this share a score bucket (they are still sorted by length).
const MAX_SCORED_LENGTH = 10;

interface Ranked {
  record: IconRecord;
  fuse: number;
  matched: number;
  mean: number;
  tier: number;
  base: BaseName;
  /** Groups the style variants of one icon: set plus base name. */
  group: string;
  /** Best Fuse score in the record's group. */
  groupFuse: number;
}

/**
 * Orders name matches (tiers 0-3) by tier, then fewer base-name parts (the generic icon before
 * composites: "delete" before "restore-from-trash"), then keeps each icon's style variants
 * together, ordered as a group by their best Fuse score, with the default variant first
 * ("delete" before "delete-sharp"). Fuzzy matches (tier 4) keep Fuse's order.
 */
function compareRanked(a: Ranked, b: Ranked): number {
  if (a.tier !== b.tier) return a.tier - b.tier;
  if (a.tier < FUZZY_TIER) {
    const order =
      a.base.parts.length - b.base.parts.length ||
      a.groupFuse - b.groupFuse ||
      (a.group < b.group ? -1 : a.group > b.group ? 1 : 0) ||
      Number(a.base.styled) - Number(b.base.styled);
    if (order) return order;
  }
  return a.fuse - b.fuse || b.matched - a.matched || a.mean - b.mean;
}

/**
 * Full Fuse ranking over pre-filtered records (no limit applied). Shared by
 * {@link searchIcons} and {@link searchIconsHybrid}.
 *
 * The returned score folds the ranking into 0 (best) to 1, so sorting by score alone
 * reproduces it, including when search_icons merges several providers' results. Name matches
 * score tier/5 plus 0.02 per extra base-name part, spread over 0.019 by position within that
 * bucket; fuzzy matches score 0.8 plus Fuse's score scaled into the last fifth.
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
  const words = tokens.flatMap((t) => t.toLowerCase().split(/[-_]+/)).filter(Boolean);
  const compact = words.join("");
  const ranked: Ranked[] = [...stats].map(([record, st]) => {
    const base = baseName(record);
    return {
      record,
      fuse: Math.min(Math.max(st.best, 0), 1),
      matched: st.matched,
      mean: st.total / st.matched,
      tier: nameTier(record, base.parts, words, compact),
      base,
      group: `${record.set ?? ""}:${base.parts.join("-")}`,
      groupFuse: 0,
    };
  });
  const groupFuse = new Map<string, number>();
  for (const r of ranked) groupFuse.set(r.group, Math.min(groupFuse.get(r.group) ?? 1, r.fuse));
  for (const r of ranked) r.groupFuse = groupFuse.get(r.group)!;
  // Sort is stable, so full ties keep token order: matches for earlier query
  // tokens were inserted first and stay ahead.
  ranked.sort(compareRanked);

  const bucketOf = (r: Ranked) => `${r.tier}:${Math.min(r.base.parts.length, MAX_SCORED_LENGTH)}`;
  const bucketSizes = new Map<string, number>();
  for (const r of ranked) bucketSizes.set(bucketOf(r), (bucketSizes.get(bucketOf(r)) ?? 0) + 1);
  const seen = new Map<string, number>();
  return ranked.map((r) => {
    let score: number;
    if (r.tier >= FUZZY_TIER) {
      score = 0.8 + r.fuse * 0.2;
    } else {
      const bucket = bucketOf(r);
      const index = seen.get(bucket) ?? 0;
      seen.set(bucket, index + 1);
      const length = Math.min(r.base.parts.length, MAX_SCORED_LENGTH) - 1;
      score = r.tier * 0.2 + length * 0.02 + (index / bucketSizes.get(bucket)!) * 0.019;
    }
    return { record: r.record, score, matched: r.matched, mean: r.mean };
  });
}

/**
 * Filters records by provider/style/set exactly, then ranks them against the query with Fuse.js.
 *
 * Multi-word queries are searched token by token. A record is a candidate when it matches
 * at least one token. Candidates are ranked by how directly their name answers the query
 * (see nameTier and compareRanked), then by the best per-token Fuse score, then by how many tokens
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
