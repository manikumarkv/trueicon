import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ensureIndex } from "../config/ensureIndex.js";
import { CONFIG_FILE, loadProjectConfig } from "../config/loadConfig.js";
import type { IconRecord } from "../indexer/types.js";
import { getProvider } from "../providers/registry.js";
import { loadIndex } from "../search/search.js";
import { jsonToolResult, resolveContext, resolveVersion, usageSnippet, type ToolContext } from "./context.js";

export interface GetIconInput {
  /** Icon name ("trash-2") or import name ("Trash2"). */
  name: string;
  /** Provider id or npm package name. */
  provider: string;
  version?: string;
}

export type GetIconOutput = IconRecord & { usage: string };

function findRecord(records: readonly IconRecord[], name: string): IconRecord | undefined {
  const exact = records.find((r) => r.name === name || r.importName === name);
  if (exact) return exact;
  const lower = name.toLowerCase();
  return records.find((r) => r.name.toLowerCase() === lower || r.importName.toLowerCase() === lower);
}

/** Looks up one icon by name or import name and returns its full record plus an import snippet. */
export async function getIconTool(input: GetIconInput, ctx: ToolContext): Promise<GetIconOutput> {
  const name = input.name?.trim() ?? "";
  if (!name) throw new Error("name must be a non-empty string");
  const provider = getProvider(input.provider);
  if (!provider) throw new Error(`Unknown provider "${input.provider}"`);

  const version =
    input.version ?? resolveVersion(ctx.projectDir, loadProjectConfig(ctx.projectDir), provider.package)?.version;
  if (version === undefined) {
    throw new Error(
      `Could not determine the ${provider.package} version: pass "version", pin it in ${CONFIG_FILE}, ` +
        `or add ${provider.package} to package.json`,
    );
  }

  const { cacheDir } = await ensureIndex({
    cacheRoot: ctx.cacheRoot,
    providerId: provider.id,
    packageName: provider.package,
    version,
    synonyms: ctx.synonyms,
  });
  const { records } = await loadIndex(cacheDir);
  const record = findRecord(records, name);
  if (!record) throw new Error(`Icon "${name}" not found in ${provider.id} (${provider.package}@${version})`);
  return { ...record, usage: usageSnippet(record) };
}

export function registerGetIconTool(server: McpServer): void {
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
    (input) => jsonToolResult(() => getIconTool(input, resolveContext())),
  );
}
