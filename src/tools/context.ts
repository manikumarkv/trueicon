import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { resolveCacheRoot } from "../cache/downloader.js";
import { detectVersion, type ProjectConfig } from "../config/loadConfig.js";
import type { IconRecord, Synonyms } from "../indexer/types.js";
import { loadSynonyms } from "../synonyms/loadSynonyms.js";

/** Everything the icon tools need from their environment. */
export interface ToolContext {
  projectDir: string;
  cacheRoot: string;
  synonyms: Synonyms;
}

export type VersionSource = "iconmcp.json" | "package.json";

export interface ResolvedVersion {
  version: string;
  source: VersionSource;
}

/** Resolves the context from $TRUEICON_PROJECT_DIR (else cwd), the cache root and the bundled synonyms. */
export function resolveContext(): ToolContext {
  return {
    projectDir: process.env.TRUEICON_PROJECT_DIR ?? process.cwd(),
    cacheRoot: resolveCacheRoot({}),
    synonyms: loadSynonyms(),
  };
}

/** The import statement for an icon, e.g. "import { Trash2 } from 'lucide-react';". */
export function usageSnippet(record: IconRecord): string {
  return `import { ${record.importName} } from '${record.importPath}';`;
}

/**
 * Version for packageName: the .iconmcp.json pin, else the range in package.json.
 * Returns null when neither is available.
 */
export function resolveVersion(projectDir: string, config: ProjectConfig, packageName: string): ResolvedVersion | null {
  const pinned = config.providers.find((p) => p.package === packageName)?.version;
  if (pinned !== undefined) return { version: pinned, source: "iconmcp.json" };
  try {
    return { version: detectVersion(projectDir, packageName), source: "package.json" };
  } catch {
    return null;
  }
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
