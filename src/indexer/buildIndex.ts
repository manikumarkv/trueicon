import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RawIcon } from "../providers/adapter.js";
import { ADAPTERS } from "../providers/adapters/index.js";
import { getProvider } from "../providers/registry.js";
import type { IconRecord, IndexMeta, Synonyms } from "./types.js";

export const INDEX_FILE = "index.json";
export const META_FILE = "meta.json";
export const INDEX_VERSION = 1;

export interface BuildIndexOptions {
  providerId: string;
  /** Extracted package directory (e.g. from downloadPackage). */
  packageDir: string;
  /** Exact package version, e.g. "0.460.0". */
  version: string;
  /** Extra search terms per term; keys are matched against lowercased name parts and tags. */
  synonyms?: Synonyms;
}

export interface BuiltIndex {
  records: IconRecord[];
  meta: IndexMeta;
}

// JSON with object keys sorted, so equal synonym maps hash the same regardless of key order.
function canonicalJson(synonyms: Synonyms): string {
  const sorted = Object.keys(synonyms)
    .sort()
    .map((key) => [key, synonyms[key]]);
  return JSON.stringify(sorted);
}

export function hashSynonyms(synonyms: Synonyms): string {
  return createHash("sha256").update(canonicalJson(synonyms)).digest("hex");
}

export function buildKeywords(name: string, tags: readonly string[], synonyms: Synonyms): string[] {
  const terms = [...name.split("-"), ...tags].map((t) => t.toLowerCase()).filter(Boolean);
  const expansions = terms.flatMap((t) => (Object.hasOwn(synonyms, t) ? synonyms[t]! : []));
  return [...new Set([...terms, ...expansions.map((t) => t.toLowerCase())])];
}

function majorMinor(version: string): string {
  const match = /^(\d+)\.(\d+)\.\d+(?:[-+].*)?$/.exec(version);
  if (!match) throw new Error(`Expected an exact semver version, got "${version}"`);
  return `${match[1]}.${match[2]}`;
}

/** Parses a downloaded package with its provider's adapter and builds the index records. */
export async function buildIndex({
  providerId,
  packageDir,
  version,
  synonyms = {},
}: BuildIndexOptions): Promise<BuiltIndex> {
  const provider = getProvider(providerId);
  const adapter = ADAPTERS[providerId];
  if (!provider || provider.id !== providerId || !adapter) throw new Error(`Unknown provider: "${providerId}"`);
  const idPrefix = `${provider.package}@${majorMinor(version)}:`;

  const seen = new Set<string>();
  const records = adapter(packageDir).map((icon: RawIcon): IconRecord => {
    if (seen.has(icon.name)) throw new Error(`Duplicate icon name "${icon.name}" in ${provider.package}`);
    seen.add(icon.name);
    const tags = icon.tags ?? [];
    return {
      id: idPrefix + icon.name,
      name: icon.name,
      importName: icon.importName,
      importPath: icon.importPath,
      provider: provider.id,
      package: provider.package,
      version,
      style: icon.style,
      set: icon.set,
      categories: icon.categories ?? [],
      tags,
      keywords: buildKeywords(icon.name, tags, synonyms),
      svg: icon.svg,
    };
  });
  records.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const meta: IndexMeta = {
    provider: provider.id,
    package: provider.package,
    version,
    indexVersion: INDEX_VERSION,
    synonymsHash: hashSynonyms(synonyms),
    builtAt: new Date().toISOString(),
  };
  return { records, meta };
}

/** Writes index.json and then meta.json (so meta.json marks a complete index) into cacheDir. */
export async function writeIndex(cacheDir: string, records: IconRecord[], meta: IndexMeta): Promise<void> {
  await mkdir(cacheDir, { recursive: true });
  await writeFile(join(cacheDir, INDEX_FILE), JSON.stringify(records));
  await writeFile(join(cacheDir, META_FILE), `${JSON.stringify(meta, null, 2)}\n`);
}
