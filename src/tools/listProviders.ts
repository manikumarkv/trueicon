import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadProjectConfig } from "../config/loadConfig.js";
import { getProvider, PROVIDERS } from "../providers/registry.js";
import { jsonToolResult, resolveContext, resolveVersion, type ToolContext, type VersionSource } from "./context.js";

export interface ConfiguredProvider {
  /** Registry id, or null when the package is not a supported provider. */
  id: string | null;
  package: string;
  version: string | null;
  source: VersionSource | null;
}

export interface ListProvidersOutput {
  configured: ConfiguredProvider[];
  registry: { id: string; package: string; description: string }[];
}

/** Lists the providers configured in .iconmcp.json (with resolved versions) and every supported provider. */
export function listProvidersTool(ctx: ToolContext): ListProvidersOutput {
  const config = loadProjectConfig(ctx.projectDir);
  const configured = config.providers.map(({ package: pkg }): ConfiguredProvider => {
    const resolved = resolveVersion(ctx.projectDir, config, pkg);
    return {
      id: getProvider(pkg)?.id ?? null,
      package: pkg,
      version: resolved?.version ?? null,
      source: resolved?.source ?? null,
    };
  });
  const registry = PROVIDERS.map(({ id, package: pkg, description }) => ({ id, package: pkg, description }));
  return { configured, registry };
}

export function registerListProvidersTool(server: McpServer): void {
  server.registerTool(
    "list_providers",
    { description: "List the icon providers configured for this project and all providers trueicon supports." },
    () => jsonToolResult(() => listProvidersTool(resolveContext())),
  );
}
