import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { x as extractTar } from "tar";

/*
 * Cache layout
 * ------------
 * Each downloaded package lives in its own directory:
 *
 *   <cacheRoot>/<sanitizedPackage>@<major>.<minor>/
 *
 * - cacheRoot: opts.cacheRoot, else $TRUEICON_CACHE, else ~/.trueicon/cache
 * - sanitizedPackage: package name with the leading "@" removed and "/" replaced by "-"
 *   (e.g. "@heroicons/react" -> "heroicons-react")
 * - Only major.minor is kept: patch releases of an icon package share one cache entry
 *   (e.g. @heroicons/react@1.0.6 -> heroicons-react@1.0).
 *
 * The tarball's "package/" prefix is stripped, so <dir>/package.json is the package manifest.
 * A ".download-complete" marker (containing the exact version) is written last; a directory
 * without it is treated as a partial download and replaced on the next call.
 */

export const REGISTRY_URL = "https://registry.npmjs.org";
export const MARKER_FILE = ".download-complete";

export interface DownloadOptions {
  cacheRoot?: string;
}

export interface DownloadResult {
  dir: string;
  version: string;
}

interface VersionMetadata {
  version: string;
  dist?: { tarball?: string; integrity?: string };
}

const EXACT_VERSION = /^(\d+)\.(\d+)\.\d+(?:[-+].*)?$/;
// Scoped or unscoped npm package name; rejects anything that could escape the cache root.
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;

export function resolveCacheRoot(opts: DownloadOptions = {}): string {
  return opts.cacheRoot ?? process.env.TRUEICON_CACHE ?? join(homedir(), ".trueicon", "cache");
}

export function sanitizePackageName(pkg: string): string {
  return pkg.replace(/^@/, "").replace(/\//g, "-");
}

// Returns the cache directory name for an exact version, e.g. "heroicons-react@1.0".
export function cacheDirName(pkg: string, version: string): string {
  const match = EXACT_VERSION.exec(version);
  if (!match) throw new Error(`Expected an exact semver version for ${pkg}, got "${version}"`);
  return `${sanitizePackageName(pkg)}@${match[1]}.${match[2]}`;
}

async function readMarker(dir: string): Promise<string | undefined> {
  try {
    return (await readFile(join(dir, MARKER_FILE), "utf8")).trim();
  } catch {
    return undefined;
  }
}

async function fetchOrThrow(url: string, what: string): Promise<Response> {
  try {
    return await fetch(url);
  } catch (error) {
    throw new Error(`Network error fetching ${what} from ${url}: ${String(error)}`, { cause: error });
  }
}

async function fetchVersionMetadata(pkg: string, version: string): Promise<VersionMetadata> {
  const url = `${REGISTRY_URL}/${pkg}/${encodeURIComponent(version)}`;
  const res = await fetchOrThrow(url, `metadata for ${pkg}@${version}`);
  if (res.status === 404) throw new Error(`Unknown package or version: ${pkg}@${version}`);
  if (!res.ok) throw new Error(`Registry returned HTTP ${res.status} for ${pkg}@${version}`);
  const meta = (await res.json()) as VersionMetadata;
  if (!meta.dist?.tarball) throw new Error(`Registry metadata for ${pkg}@${version} has no dist.tarball`);
  return meta;
}

// Verifies an SRI string's sha512 entry (if any) against the tarball bytes.
function verifyIntegrity(data: Buffer, integrity: string | undefined, label: string): void {
  const expected = integrity
    ?.split(/\s+/)
    .find((entry) => entry.startsWith("sha512-"))
    ?.slice("sha512-".length);
  if (!expected) return;
  const actual = createHash("sha512").update(data).digest("base64");
  if (actual !== expected) {
    throw new Error(`Integrity check failed for ${label}: expected sha512-${expected}, got sha512-${actual}`);
  }
}

/**
 * Downloads and extracts pkg@version from the npm registry into the local cache (see layout
 * above). `version` may be an exact version or a dist-tag such as "latest". Returns the
 * cache dir and the exact version it contains; skips the download if already cached.
 */
export async function downloadPackage(
  pkg: string,
  version: string,
  opts: DownloadOptions = {},
): Promise<DownloadResult> {
  if (!PACKAGE_NAME.test(pkg)) throw new Error(`Invalid npm package name: "${pkg}"`);
  const cacheRoot = resolveCacheRoot(opts);

  // Exact versions can be checked against the cache without touching the network.
  if (EXACT_VERSION.test(version)) {
    const dir = join(cacheRoot, cacheDirName(pkg, version));
    const cached = await readMarker(dir);
    if (cached) return { dir, version: cached };
  }

  const meta = await fetchVersionMetadata(pkg, version);
  const dir = join(cacheRoot, cacheDirName(pkg, meta.version));
  const cached = await readMarker(dir);
  if (cached) return { dir, version: cached };

  const label = `${pkg}@${meta.version}`;
  const tarballUrl = meta.dist!.tarball!;
  const res = await fetchOrThrow(tarballUrl, `tarball for ${label}`);
  if (!res.ok) throw new Error(`Tarball download for ${label} failed with HTTP ${res.status}`);
  let data: Buffer;
  try {
    data = Buffer.from(await res.arrayBuffer());
  } catch (error) {
    throw new Error(`Network error reading tarball for ${label}: ${String(error)}`, { cause: error });
  }
  verifyIntegrity(data, meta.dist!.integrity, label);

  // Clear any partial previous attempt, then extract (dropping the tarball's "package/" prefix).
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  try {
    await pipeline(Readable.from(data), extractTar({ cwd: dir, strip: 1 }));
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw new Error(`Failed to extract tarball for ${label}: ${String(error)}`, { cause: error });
  }
  await writeFile(join(dir, MARKER_FILE), `${meta.version}\n`);

  return { dir, version: meta.version };
}
