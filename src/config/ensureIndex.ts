import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { downloadPackage } from "../cache/downloader.js";
import { buildIndexFromPackage, hashSynonyms, META_FILE } from "../indexer/buildIndex.js";
import type { IndexMeta, Synonyms } from "../indexer/types.js";
import { indexKey, parseVersion, resolveIndexAction, type IndexAction } from "./versions.js";

export interface EnsureIndexOptions {
  cacheRoot: string;
  providerId: string;
  packageName: string;
  /** Exact version or npm range, e.g. "^0.460.0". */
  version: string;
  synonyms: Synonyms;
}

export interface EnsureIndexResult {
  cacheDir: string;
  action: IndexAction;
}

// meta.json is written last by writeIndex, so its presence marks a complete index.
async function readMeta(cacheDir: string): Promise<IndexMeta | null> {
  try {
    return JSON.parse(await readFile(join(cacheDir, META_FILE), "utf8")) as IndexMeta;
  } catch {
    return null;
  }
}

/** Makes sure an up-to-date index for packageName@version exists under cacheRoot. */
export async function ensureIndex(opts: EnsureIndexOptions): Promise<EnsureIndexResult> {
  const { cacheRoot, providerId, packageName, version, synonyms } = opts;
  const cacheDir = join(cacheRoot, indexKey(packageName, version));
  const action = resolveIndexAction(version, await readMeta(cacheDir), hashSynonyms(synonyms));
  if (action === "use") return { cacheDir, action };

  // Download the range's base version exactly so the result lands under the same index key.
  const { major, minor, patch } = parseVersion(version);
  const downloaded = await downloadPackage(packageName, `${major}.${minor}.${patch}`, { cacheRoot });
  const built = await buildIndexFromPackage(downloaded.dir, providerId, downloaded.version, cacheRoot, synonyms);
  if (built.dir !== cacheDir) {
    throw new Error(`Index for ${packageName}@${version} was written to ${built.dir}, expected ${cacheDir}`);
  }
  return { cacheDir, action };
}
