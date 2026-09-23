import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ensureIndex } from "../config/ensureIndex.js";
import { CONFIG_FILE, loadProjectConfig } from "../config/loadConfig.js";
import { getProvider, type Provider } from "../providers/registry.js";
import { loadIndex, searchIcons, type SearchResult } from "../search/search.js";
import { errorMessage, jsonToolResult, resolveContext, resolveVersion, usageSnippet, type ToolContext } from "./context.js";

export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 50;

export interface SearchIconsInput {
  query: string;
  /** Provider id or npm package name; defaults to every configured provider. */
  provider?: string;
  version?: string;
  style?: string;
  set?: string;
  limit?: number;
}

export interface SearchIconsHit {
  name: string;
  importName: string;
  importPath: string;
  package: string;
  version: string;
  style?: string;
  set?: string;
  usage: string;
  score: number;
}

export interface SearchIconsOutput {
  results: SearchIconsHit[];
  warnings?: string[];
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)));
}

function toHit({ record, score }: SearchResult): SearchIconsHit {
  return {
    name: record.name,
    importName: record.importName,
    importPath: record.importPath,
    package: record.package,
    version: record.version,
    style: record.style,
    set: record.set,
    usage: usageSnippet(record),
    score,
  };
}

/** Searches the indexes of the requested (or all configured) providers and merges the ranked hits. */
export async function searchIconsTool(input: SearchIconsInput, ctx: ToolContext): Promise<SearchIconsOutput> {
  const query = input.query?.trim() ?? "";
  if (!query) throw new Error("query must be a non-empty string");

  const config = loadProjectConfig(ctx.projectDir);
  const warnings: string[] = [];
  let candidates: Provider[];
  if (input.provider !== undefined) {
    const provider = getProvider(input.provider);
    if (!provider) throw new Error(`Unknown provider "${input.provider}"`);
    candidates = [provider];
  } else {
    if (config.providers.length === 0) {
      throw new Error(
        `No icon providers configured. Create ${CONFIG_FILE} in ${ctx.projectDir} with a "providers" array, ` +
          `e.g. {"providers":[{"package":"lucide-react"}]}, or pass "provider".`,
      );
    }
    candidates = [];
    for (const { package: pkg } of config.providers) {
      const provider = getProvider(pkg);
      if (provider) candidates.push(provider);
      else warnings.push(`Skipping ${pkg}: not a supported icon provider`);
    }
  }

  const hits: SearchResult[] = [];
  for (const provider of candidates) {
    const version = input.version ?? resolveVersion(ctx.projectDir, config, provider.package)?.version;
    if (version === undefined) {
      warnings.push(
        `Skipping ${provider.id}: could not determine the ${provider.package} version ` +
          `(pin it in ${CONFIG_FILE} or add it to package.json)`,
      );
      continue;
    }
    try {
      const { cacheDir } = await ensureIndex({
        cacheRoot: ctx.cacheRoot,
        providerId: provider.id,
        packageName: provider.package,
        version,
        synonyms: ctx.synonyms,
      });
      const { records } = await loadIndex(cacheDir);
      hits.push(...searchIcons(records, query, { provider: provider.id, style: input.style, set: input.set }));
    } catch (error) {
      // One broken provider should not hide results from the others.
      if (candidates.length === 1) throw error;
      warnings.push(`Skipping ${provider.id}@${version}: ${errorMessage(error)}`);
    }
  }

  const results = hits.sort((a, b) => a.score - b.score).slice(0, clampLimit(input.limit)).map(toHit);
  return warnings.length > 0 ? { results, warnings } : { results };
}

export function registerSearchIconsTool(server: McpServer): void {
  server.registerTool(
    "search_icons",
    {
      description:
        "Search icons in the icon packages installed in the project. Returns ranked matches with ready-to-paste import statements.",
      inputSchema: {
        query: z.string().min(1).describe('What the icon should depict, e.g. "trash can"'),
        provider: z.string().optional().describe('Provider id or npm package, e.g. "lucide" or "lucide-react"'),
        version: z.string().optional().describe("Package version or range; defaults to the project's version"),
        style: z.string().optional().describe('Style filter, e.g. "outline" or "solid"'),
        set: z.string().optional().describe('Icon set filter (react-icons), e.g. "fa6"'),
        limit: z.number().int().optional().describe(`Maximum results (1-${MAX_LIMIT}, default ${DEFAULT_LIMIT})`),
      },
    },
    (input) => jsonToolResult(() => searchIconsTool(input, resolveContext())),
  );
}
