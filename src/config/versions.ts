import { INDEX_VERSION } from "../indexer/buildIndex.js";
import type { IndexMeta } from "../indexer/types.js";

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
}

export type IndexAction = "use" | "rebuild" | "missing";

const BASE_VERSION = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+.\s]|$)/;

/**
 * Parses an exact version or an npm range ("^0.460.0", "~5.3.1", ">=1.2.3") into its base
 * x.y.z. Only the first segment of "a || b" or "a - b" ranges is considered.
 */
export function parseVersion(v: string): ParsedVersion {
  const first = v.split("||")[0]!.trim().split(/\s+-\s+/)[0]!;
  const base = first.replace(/^(?:\^|~|>=|<=|>|<|=)\s*/, "");
  const match = BASE_VERSION.exec(base);
  if (!match) throw new Error(`Unparseable version: "${v}"`);
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/** Cache key for a package's index: patch releases share one index, e.g. "lucide-react@0.460". */
export function indexKey(packageName: string, version: string): string {
  const { major, minor } = parseVersion(version);
  return `${packageName}@${major}.${minor}`;
}

/** Decides whether a cached index can serve requestedVersion with the current synonyms. */
export function resolveIndexAction(
  requestedVersion: string,
  meta: IndexMeta | null,
  currentSynonymsHash: string,
): IndexAction {
  if (meta === null) return "missing";
  const requested = parseVersion(requestedVersion);
  const cached = parseVersion(meta.version);
  const sameMinor = cached.major === requested.major && cached.minor === requested.minor;
  return sameMinor && meta.synonymsHash === currentSynonymsHash && meta.indexVersion === INDEX_VERSION
    ? "use"
    : "rebuild";
}
