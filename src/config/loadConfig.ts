import { readFileSync } from "node:fs";
import { join } from "node:path";

export const CONFIG_FILE = ".iconmcp.json";

export interface ProviderConfig {
  package: string;
  version?: string;
}

export interface ProjectConfig {
  providers: ProviderConfig[];
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
  return { providers };
}

/** Returns the version range declared for packageName in <projectDir>/package.json. */
export function detectVersion(projectDir: string, packageName: string): string {
  const path = join(projectDir, "package.json");
  let raw: unknown;
  try {
    raw = readJson(path);
  } catch (error) {
    if (isMissing(error)) throw new Error(`No package.json found at ${path}`, { cause: error });
    throw error;
  }
  if (!isObject(raw)) throw new Error(`Invalid ${path}: expected a JSON object`);

  for (const field of ["dependencies", "devDependencies"] as const) {
    const deps = raw[field];
    const version = isObject(deps) ? deps[packageName] : undefined;
    if (typeof version === "string" && version.trim() !== "") return version;
  }
  throw new Error(`${packageName} is not listed in dependencies or devDependencies of ${path}`);
}
