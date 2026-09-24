import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { RootsListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { CONFIG_FILE } from "../config/loadConfig.js";
import { defaultProjectLocation, type ProjectLocation } from "./context.js";

/*
 * Finds the project directory for each tool call:
 *
 *   1. $TRUEICON_PROJECT_DIR, when set.
 *   2. The first of the MCP client's roots (the folders the user is working in) that has a
 *      package.json or .iconmcp.json, when the client supports roots.
 *   3. The server's working directory, when it has one of those files. Clients that start the
 *      server in the project (Claude Code does) land here.
 *   4. The first root, else the working directory.
 *
 * Roots are fetched once and cached until the client sends roots/list_changed.
 */

/** The parts of the SDK Server the locator needs, so tests can pass a fake. */
export type RootsClient = Pick<Server, "getClientCapabilities" | "listRoots" | "setNotificationHandler">;

export type ProjectLocator = () => Promise<ProjectLocation>;

// A client that advertises roots but never answers should not stall every tool call for the
// SDK's default 60s request timeout.
const LIST_ROOTS_TIMEOUT_MS = 5_000;

function isProjectDir(dir: string): boolean {
  return existsSync(join(dir, "package.json")) || existsSync(join(dir, CONFIG_FILE));
}

export function createProjectLocator(
  client: RootsClient,
  fallback: () => ProjectLocation = defaultProjectLocation,
): ProjectLocator {
  let roots: Promise<string[]> | undefined;
  client.setNotificationHandler(RootsListChangedNotificationSchema, () => {
    roots = undefined;
  });

  function rootDirs(): Promise<string[]> {
    if (!client.getClientCapabilities()?.roots) return Promise.resolve([]);
    roots ??= client.listRoots(undefined, { timeout: LIST_ROOTS_TIMEOUT_MS }).then(
      ({ roots: list }) => list.filter((r) => r.uri.startsWith("file://")).map((r) => fileURLToPath(r.uri)),
      () => {
        roots = undefined; // retry on the next call
        return [];
      },
    );
    return roots;
  }

  return async () => {
    const location = fallback();
    if (location.source === "TRUEICON_PROJECT_DIR") return location;
    const dirs = await rootDirs();
    const project = dirs.find(isProjectDir);
    if (project) return { dir: project, source: "roots" };
    if (dirs.length === 0 || isProjectDir(location.dir)) return location;
    return { dir: dirs[0]!, source: "roots" };
  };
}
