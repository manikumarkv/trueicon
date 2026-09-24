/** One icon in a per-version index (index.json). */
export interface IconRecord {
  /** "<package>@<major.minor>:<name>", e.g. "lucide-react@0.460:trash-2". */
  id: string;
  name: string;
  importName: string;
  importPath: string;
  /** Provider id from the registry, e.g. "lucide". */
  provider: string;
  package: string;
  /** Exact package version, e.g. "0.460.0". */
  version: string;
  style?: string;
  set?: string;
  categories: string[];
  tags: string[];
  /** Deduped search terms: name parts, tags, then synonym expansions. */
  keywords: string[];
  /**
   * Normalized embedding of the name + keywords, present only when the index was
   * built with semantic search enabled. Used for cosine-similarity ranking.
   */
  vector?: number[];
  /** Inner SVG markup. */
  svg: string;
}

/** Describes how an index was built (meta.json). */
export interface IndexMeta {
  provider: string;
  package: string;
  /** Exact package version. */
  version: string;
  indexVersion: 1;
  /** sha256 (hex) of the canonicalized synonyms object used for keyword expansion. */
  synonymsHash: string;
  /**
   * Embedding model id the vectors were built with, or undefined for a
   * keyword-only index. Toggling semantic search changes this and triggers a rebuild.
   */
  embeddingModel?: string;
  /** ISO timestamp. */
  builtAt: string;
}

/** Maps a term to extra search terms, e.g. { trash: ["delete", "bin"] }. */
export type Synonyms = Record<string, string[]>;
