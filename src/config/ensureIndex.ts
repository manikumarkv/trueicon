import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { downloadPackage } from "../cache/downloader.js";
import { buildIndexFromPackage, hashSynonyms, META_FILE } from "../indexer/buildIndex.js";
import type { IndexMeta, Synonyms } from "../indexer/types.js";
import {
  EMBEDDING_MODEL,
  getEmbedder,
  isTransformersMissing,
  TRANSFORMERS_MISSING_WARNING,
  type SemanticEmbedder,
} from "../semantic/embeddings.js";
import { indexKey, parseVersion, resolveIndexAction, type IndexAction } from "./versions.js";

export interface EnsureIndexOptions {
  cacheRoot: string;
  providerId: string;
  packageName: string;
  /** Exact version or npm range, e.g. "^0.460.0". */
  version: string;
  synonyms: Synonyms;
  /** When true the index is built with embedding vectors (downloads the model on first use). */
  semantic: boolean;
}

export interface EnsureIndexResult {
  cacheDir: string;
  action: IndexAction;
  /**
   * Set when semantic was requested but @huggingface/transformers is not installed, so the
   * index was built (or reused) without vectors instead.
   */
  warning?: string;
}

// meta.json is written last by writeIndex, so its presence marks a complete index.
async function readMeta(cacheDir: string): Promise<IndexMeta | null> {
  try {
    return JSON.parse(await readFile(join(cacheDir, META_FILE), "utf8")) as IndexMeta;
  } catch {
    return null;
  }
}

// In-progress builds by index dir, so concurrent tool calls share one download instead of racing.
const inFlight = new Map<string, Promise<EnsureIndexResult>>();

/** Makes sure an up-to-date index for packageName@version exists under cacheRoot. */
export function ensureIndex(opts: EnsureIndexOptions): Promise<EnsureIndexResult> {
  const cacheDir = join(opts.cacheRoot, indexKey(opts.packageName, opts.version));
  const pending = inFlight.get(cacheDir);
  if (pending) return pending;
  const run = ensureIndexAt(cacheDir, opts).finally(() => inFlight.delete(cacheDir));
  inFlight.set(cacheDir, run);
  return run;
}

async function ensureIndexAt(cacheDir: string, opts: EnsureIndexOptions): Promise<EnsureIndexResult> {
  const { cacheRoot, providerId, packageName, version, synonyms, semantic } = opts;
  const meta = await readMeta(cacheDir);
  const synonymsHash = hashSynonyms(synonyms);
  let action = resolveIndexAction(version, meta, synonymsHash, semantic ? EMBEDDING_MODEL : null);
  if (action === "use") return { cacheDir, action };

  // Load the embedder before downloading so a missing optional peer dependency degrades to a
  // keyword-only index (reusing a cached one when it is otherwise current) instead of failing.
  let embedder: SemanticEmbedder | undefined;
  let warning: string | undefined;
  if (semantic) {
    try {
      embedder = await getEmbedder();
    } catch (error) {
      if (!isTransformersMissing(error)) throw error;
      warning = TRANSFORMERS_MISSING_WARNING;
      action = resolveIndexAction(version, meta, synonymsHash, null);
      if (action === "use") return { cacheDir, action, warning };
    }
  }

  // Download the range's base version exactly so the result lands under the same index key.
  const { major, minor, patch } = parseVersion(version);
  const downloaded = await downloadPackage(packageName, `${major}.${minor}.${patch}`, { cacheRoot });
  const built = await buildIndexFromPackage(
    downloaded.dir,
    providerId,
    downloaded.version,
    cacheRoot,
    synonyms,
    embedder,
  );
  if (built.dir !== cacheDir) {
    throw new Error(`Index for ${packageName}@${version} was written to ${built.dir}, expected ${cacheDir}`);
  }
  return warning === undefined ? { cacheDir, action } : { cacheDir, action, warning };
}
