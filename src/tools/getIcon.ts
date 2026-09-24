import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ensureIndex } from "../config/ensureIndex.js";
import { CONFIG_FILE, loadProjectConfig } from "../config/loadConfig.js";
import type { IconRecord } from "../indexer/types.js";
import { toKebabCase } from "../providers/adapter.js";
import { getProvider } from "../providers/registry.js";
import { loadIndex } from "../search/search.js";
import { jsonToolResult, resolveContext, resolveSemanticSearch, resolveVersion, usageSnippet, type ToolContext } from "./context.js";
import type { ProjectLocator } from "./projectLocator.js";

export interface GetIconInput {
  /** Icon name ("trash-2") or import name ("Trash2"). */
  name: string;
  /** Provider id or npm package name. */
  provider: string;
  version?: string;
}

export type GetIconOutput = IconRecord & { usage: string; warnings?: string[] };

function findRecord(records: readonly IconRecord[], name: string): IconRecord | undefined {
  const exact = records.find((r) => r.name === name || r.importName === name);
  if (exact) return exact;
  const lower = name.toLowerCase();
  const caseInsensitive = records.find((r) => r.name.toLowerCase() === lower || r.importName.toLowerCase() === lower);
  if (caseInsensitive) return caseInsensitive;
  // Deprecated or renamed icons are kept as alias tags on the current icon, e.g. lucide 1.47
  // renamed trash-2 to trash, so "Trash2" resolves to the Trash record.
  const kebab = toKebabCase(name);
  return records.find((r) => r.tags.some((tag) => tag === lower || tag === kebab));
}

/** Looks up one icon by name or import name and returns its full record plus an import snippet. */
export async function getIconTool(input: GetIconInput, ctx: ToolContext): Promise<GetIconOutput> {
  const name = input.name?.trim() ?? "";
  if (!name) throw new Error("name must be a non-empty string");
  const provider = getProvider(input.provider);
  if (!provider) throw new Error(`Unknown provider "${input.provider}"`);

  const projectConfig = loadProjectConfig(ctx.projectDir);
  const version = input.version ?? resolveVersion(ctx.projectDir, projectConfig, provider.package)?.version;
  if (version === undefined) {
    throw new Error(
      `Could not determine the ${provider.package} version: pass "version", pin it in ${CONFIG_FILE}, ` +
        `or add ${provider.package} to package.json`,
    );
  }

  // With semantic on but @huggingface/transformers missing, ensureIndex falls back to a
  // keyword-only index and reports why; a name lookup never needs vectors anyway.
  const { cacheDir, warning } = await ensureIndex({
    cacheRoot: ctx.cacheRoot,
    providerId: provider.id,
    packageName: provider.package,
    version,
    synonyms: ctx.synonyms,
    semantic: resolveSemanticSearch(projectConfig),
  });
  const { records } = await loadIndex(cacheDir);
  const record = findRecord(records, name);
  if (!record) throw new Error(`Icon "${name}" not found in ${provider.id} (${provider.package}@${version})`);
  const icon = { ...record, usage: usageSnippet(record) };
  return warning === undefined ? icon : { ...icon, warnings: [warning] };
}

export function registerGetIconTool(server: McpServer, locateProject: ProjectLocator): void {
  server.registerTool(
    "get_icon",
    {
      description:
        "Get the full record and exact import statement for an icon whose name is already known, e.g. Trash2 from lucide.",
      inputSchema: {
        name: z.string().min(1).describe('Icon name or import name, e.g. "trash-2" or "Trash2"'),
        provider: z.string().min(1).describe('Provider id or npm package, e.g. "lucide" or "lucide-react"'),
        version: z.string().optional().describe("Package version or range; defaults to the project's version"),
      },
    },
    (input) => jsonToolResult(async () => getIconTool(input, resolveContext(await locateProject()))),
  );
}
