import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { resolveCacheRoot } from "../cache/downloader.js";
import {
  CONFIG_FILE,
  detectInstalledVersion,
  detectListedPackages,
  detectVersion,
  loadProjectConfig,
  type ProjectConfig,
} from "../config/loadConfig.js";
import type { IconRecord, Synonyms } from "../indexer/types.js";
import { PROVIDERS } from "../providers/registry.js";
import { loadSynonyms } from "../synonyms/loadSynonyms.js";

/** Where the project directory came from: the env var, a root shared by the MCP client, or cwd. */
export type ProjectSource = "TRUEICON_PROJECT_DIR" | "roots" | "cwd";

export interface ProjectLocation {
  dir: string;
  source: ProjectSource;
}

/** Everything the icon tools need from their environment. */
export interface ToolContext {
  projectDir: string;
  projectSource: ProjectSource;
  cacheRoot: string;
  synonyms: Synonyms;
}

/** Where a provider's version came from, in precedence order after an explicit tool argument. */
export type VersionSource = "iconmcp.json" | "node_modules" | "package.json";

export interface ResolvedVersion {
  version: string;
  source: VersionSource;
}

/** The project directory from $TRUEICON_PROJECT_DIR, else cwd. The server also consults client roots. */
export function defaultProjectLocation(): ProjectLocation {
  const fromEnv = process.env.TRUEICON_PROJECT_DIR;
  return fromEnv ? { dir: fromEnv, source: "TRUEICON_PROJECT_DIR" } : { dir: process.cwd(), source: "cwd" };
}

/** Resolves the context: the project location (default: env var, else cwd), cache root and synonyms. */
export function resolveContext(project: ProjectLocation = defaultProjectLocation()): ToolContext {
  return {
    projectDir: project.dir,
    projectSource: project.source,
    cacheRoot: resolveCacheRoot({}),
    synonyms: loadSynonyms(),
  };
}

/** The import statement for an icon, e.g. "import { Trash2 } from 'lucide-react';". */
export function usageSnippet(record: IconRecord): string {
  return `import { ${record.importName} } from '${record.importPath}';`;
}

/**
 * Version for packageName: the .iconmcp.json pin, else the version installed in node_modules,
 * else the range in package.json. Returns null when none is available.
 */
export function resolveVersion(projectDir: string, config: ProjectConfig, packageName: string): ResolvedVersion | null {
  const pinned = config.providers.find((p) => p.package === packageName)?.version;
  if (pinned !== undefined) return { version: pinned, source: "iconmcp.json" };
  const installed = detectInstalledVersion(projectDir, packageName);
  if (installed !== null) return { version: installed, source: "node_modules" };
  try {
    return { version: detectVersion(projectDir, packageName), source: "package.json" };
  } catch {
    return null;
  }
}

/** Which file named the project's providers. */
export type ProvidersSource = "iconmcp.json" | "package.json";

/**
 * Whether semantic search is enabled: TRUEICON_SEMANTIC=1/0 overrides the
 * "semantic" flag in .iconmcp.json (default off). The env override exists so
 * one-off runs and tests can flip it without editing the project config.
 */
export function resolveSemanticSearch(config: ProjectConfig): boolean {
  const fromEnv = process.env.TRUEICON_SEMANTIC?.trim().toLowerCase();
  if (fromEnv === "1" || fromEnv === "true") return true;
  if (fromEnv === "0" || fromEnv === "false") return false;
  return config.semantic ?? false;
}

export interface ProjectProviders {
  config: ProjectConfig;
  /** Packages to search, in order. May include unsupported packages listed in .iconmcp.json. */
  packages: string[];
  source: ProvidersSource | null;
}

/**
 * The icon packages this project uses: the providers listed in .iconmcp.json, else every supported
 * provider listed in package.json. `source` is null when neither names any.
 */
export function resolveProjectProviders(projectDir: string): ProjectProviders {
  const config = loadProjectConfig(projectDir);
  if (config.providers.length > 0) {
    return { config, packages: config.providers.map((p) => p.package), source: "iconmcp.json" };
  }
  const detected = detectListedPackages(projectDir, PROVIDERS.map((p) => p.package));
  return { config, packages: detected, source: detected.length > 0 ? "package.json" : null };
}

/** Error for a project that names no icon packages, saying where trueicon looked and how to fix it. */
export function noProvidersError(ctx: ToolContext): Error {
  const where =
    ctx.projectSource === "cwd"
      ? ` (the server's working directory; set TRUEICON_PROJECT_DIR if your project is elsewhere)`
      : ctx.projectSource === "roots"
        ? " (from the folders your MCP client shared)"
        : " (from TRUEICON_PROJECT_DIR)";
  return new Error(
    `No icon packages found in ${ctx.projectDir}${where}. Add a supported package to package.json (` +
      PROVIDERS.map((p) => p.package).join(", ") +
      `), list providers in ${CONFIG_FILE}, or pass "provider".`,
  );
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Runs a tool body and wraps its result (or error) as MCP JSON text content. */
export async function jsonToolResult(run: () => unknown): Promise<CallToolResult> {
  try {
    return { content: [{ type: "text", text: JSON.stringify(await run()) }] };
  } catch (error) {
    return { content: [{ type: "text", text: JSON.stringify({ error: errorMessage(error) }) }], isError: true };
  }
}
