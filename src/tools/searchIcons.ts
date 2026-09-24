import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ensureIndex } from "../config/ensureIndex.js";
import { CONFIG_FILE } from "../config/loadConfig.js";
import { getProvider, type Provider } from "../providers/registry.js";
import { loadIndex, searchIcons, searchIconsHybrid, type SearchResult } from "../search/search.js";
import { getEmbedder, isTransformersMissing, TRANSFORMERS_MISSING_WARNING } from "../semantic/embeddings.js";
import {
  errorMessage,
  jsonToolResult,
  noProvidersError,
  resolveContext,
  resolveProjectProviders,
  resolveSemanticSearch,
  resolveVersion,
  usageSnippet,
  type ToolContext,
} from "./context.js";
import type { ProjectLocator } from "./projectLocator.js";

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

/**
 * Searches the indexes of the requested provider, or of every provider the project uses (from
 * .iconmcp.json, else detected in package.json), and merges the ranked hits.
 */
export async function searchIconsTool(input: SearchIconsInput, ctx: ToolContext): Promise<SearchIconsOutput> {
  const query = input.query?.trim() ?? "";
  if (!query) throw new Error("query must be a non-empty string");

  const { config, packages } = resolveProjectProviders(ctx.projectDir);
  const warnings: string[] = [];

  // Opt-in semantic search: embed the query once, then merge the cosine-similarity
  // ranking with the keyword ranking per provider. A missing optional peer dependency or a
  // broken model download degrades to keyword search with a warning instead of failing the call.
  let queryVector: number[] | null = null;
  if (resolveSemanticSearch(config)) {
    try {
      queryVector = (await (await getEmbedder()).embed([query]))[0]!;
    } catch (error) {
      warnings.push(
        isTransformersMissing(error)
          ? TRANSFORMERS_MISSING_WARNING
          : `Semantic search unavailable (${errorMessage(error)}); using keyword search`,
      );
    }
  }
  const semantic = queryVector !== null;
  let candidates: Provider[];
  if (input.provider !== undefined) {
    const provider = getProvider(input.provider);
    if (!provider) throw new Error(`Unknown provider "${input.provider}"`);
    candidates = [provider];
  } else {
    if (packages.length === 0) throw noProvidersError(ctx);
    candidates = [];
    for (const pkg of packages) {
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
        semantic,
      });
      const { records } = await loadIndex(cacheDir);
      const searchOptions = { provider: provider.id, style: input.style, set: input.set };
      hits.push(
        ...(semantic
          ? searchIconsHybrid(records, query, queryVector!, searchOptions)
          : searchIcons(records, query, searchOptions)),
      );
    } catch (error) {
      // One broken provider should not hide results from the others.
      if (candidates.length === 1) throw error;
      warnings.push(`Skipping ${provider.id}@${version}: ${errorMessage(error)}`);
    }
  }

  const results = hits.sort((a, b) => a.score - b.score).slice(0, clampLimit(input.limit)).map(toHit);
  return warnings.length > 0 ? { results, warnings } : { results };
}

export function registerSearchIconsTool(server: McpServer, locateProject: ProjectLocator): void {
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
    (input) => jsonToolResult(async () => searchIconsTool(input, resolveContext(await locateProject()))),
  );
}
