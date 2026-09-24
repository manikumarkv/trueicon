import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProvider, PROVIDERS } from "../providers/registry.js";
import {
  jsonToolResult,
  resolveContext,
  resolveProjectProviders,
  resolveVersion,
  type ProjectSource,
  type ProvidersSource,
  type ToolContext,
  type VersionSource,
} from "./context.js";
import type { ProjectLocator } from "./projectLocator.js";

export interface ConfiguredProvider {
  /** Registry id, or null when the package is not a supported provider. */
  id: string | null;
  package: string;
  version: string | null;
  /** Where the version came from. */
  source: VersionSource | null;
}

export interface ListProvidersOutput {
  /** The project directory the tools read, and how it was found. */
  project: { dir: string; source: ProjectSource };
  /** Which file named the configured providers, or null when neither names any. */
  providersFrom: ProvidersSource | null;
  configured: ConfiguredProvider[];
  registry: { id: string; package: string; description: string }[];
}

/**
 * Lists the providers the project uses (from .iconmcp.json, else detected in package.json) with
 * their resolved versions, and every supported provider.
 */
export function listProvidersTool(ctx: ToolContext): ListProvidersOutput {
  const { config, packages, source: providersFrom } = resolveProjectProviders(ctx.projectDir);
  const configured = packages.map((pkg): ConfiguredProvider => {
    const resolved = resolveVersion(ctx.projectDir, config, pkg);
    return {
      id: getProvider(pkg)?.id ?? null,
      package: pkg,
      version: resolved?.version ?? null,
      source: resolved?.source ?? null,
    };
  });
  const registry = PROVIDERS.map(({ id, package: pkg, description }) => ({ id, package: pkg, description }));
  return { project: { dir: ctx.projectDir, source: ctx.projectSource }, providersFrom, configured, registry };
}

export function registerListProvidersTool(server: McpServer, locateProject: ProjectLocator): void {
  server.registerTool(
    "list_providers",
    {
      description:
        "List the icon providers this project uses (from .iconmcp.json, else detected in package.json) with their versions, the project directory trueicon reads, and all providers trueicon supports.",
    },
    () => jsonToolResult(async () => listProvidersTool(resolveContext(await locateProject()))),
  );
}
