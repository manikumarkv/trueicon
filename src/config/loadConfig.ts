import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const CONFIG_FILE = ".iconmcp.json";

export interface ProviderConfig {
  package: string;
  version?: string;
}

export interface ProjectConfig {
  providers: ProviderConfig[];
  /**
   * Opt-in semantic search: when true, indexes embed every icon with a local
   * embedding model (~90MB download on first use) and search_icons merges
   * cosine-similarity ranking with the keyword ranking. Default false.
   */
  semantic?: boolean;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJson(path: string): unknown {
  const text = readFileSync(path, "utf8");
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`Invalid JSON in ${path}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
}

/** Reads <projectDir>/.iconmcp.json; a missing file means no configured providers. */
export function loadProjectConfig(projectDir: string): ProjectConfig {
  const path = join(projectDir, CONFIG_FILE);
  let raw: unknown;
  try {
    raw = readJson(path);
  } catch (error) {
    if (isMissing(error)) return { providers: [] };
    throw error;
  }

  if (!isObject(raw) || !Array.isArray(raw.providers)) {
    throw new Error(`Invalid ${path}: expected an object with a "providers" array`);
  }
  const semantic = raw.semantic;
  if (semantic !== undefined && typeof semantic !== "boolean") {
    throw new Error(`Invalid ${path}: "semantic" must be a boolean when set`);
  }
  const providers = raw.providers.map((entry: unknown, i): ProviderConfig => {
    if (!isObject(entry) || typeof entry.package !== "string" || entry.package.trim() === "") {
      throw new Error(`Invalid ${path}: providers[${i}].package must be a non-empty string`);
    }
    if (entry.version === undefined) return { package: entry.package };
    if (typeof entry.version !== "string" || entry.version.trim() === "") {
      throw new Error(`Invalid ${path}: providers[${i}].version must be a non-empty string when set`);
    }
    return { package: entry.package, version: entry.version };
  });
  return { providers, semantic };
}

/** Reads <projectDir>/package.json, or returns null when there is none. */
function readPackageJson(projectDir: string): Record<string, unknown> | null {
  const path = join(projectDir, "package.json");
  let raw: unknown;
  try {
    raw = readJson(path);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
  if (!isObject(raw)) throw new Error(`Invalid ${path}: expected a JSON object`);
  return raw;
}

const DEPENDENCY_FIELDS = ["dependencies", "devDependencies"] as const;

/** Returns the version range declared for packageName in <projectDir>/package.json. */
export function detectVersion(projectDir: string, packageName: string): string {
  const pkg = readPackageJson(projectDir);
  const path = join(projectDir, "package.json");
  if (!pkg) throw new Error(`No package.json found at ${path}`);
  for (const field of DEPENDENCY_FIELDS) {
    const deps = pkg[field];
    const version = isObject(deps) ? deps[packageName] : undefined;
    if (typeof version === "string" && version.trim() !== "") return version;
  }
  throw new Error(`${packageName} is not listed in dependencies or devDependencies of ${path}`);
}

/**
 * Returns the packages from `candidates` that <projectDir>/package.json lists in dependencies or
 * devDependencies, in candidate order. A missing package.json lists nothing.
 */
export function detectListedPackages(projectDir: string, candidates: readonly string[]): string[] {
  const pkg = readPackageJson(projectDir);
  if (!pkg) return [];
  const listed = new Set<string>();
  for (const field of DEPENDENCY_FIELDS) {
    const deps = pkg[field];
    if (isObject(deps)) for (const name of Object.keys(deps)) listed.add(name);
  }
  return candidates.filter((name) => listed.has(name));
}

/**
 * Returns the version of packageName installed in node_modules, looking in <projectDir> and then
 * each parent directory, as Node's module resolution does (this covers hoisted monorepo installs).
 * Returns null when it is not installed or its package.json has no version.
 */
export function detectInstalledVersion(projectDir: string, packageName: string): string | null {
  for (let dir = projectDir; ; dir = dirname(dir)) {
    try {
      const raw = readJson(join(dir, "node_modules", packageName, "package.json"));
      if (isObject(raw) && typeof raw.version === "string" && raw.version.trim() !== "") return raw.version;
    } catch {
      // Not installed here, or unreadable: keep looking further up.
    }
    if (dirname(dir) === dir) return null;
  }
}
