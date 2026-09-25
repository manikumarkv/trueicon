#!/usr/bin/env node
/* global console */
// Local testing and debugging for trueicon. Run through the npm scripts:
//
//   npm run dev:call -- <tool> [key=value ...]   call one tool and print the result
//   npm run dev:inspect                          open the MCP Inspector web UI
//   npm run dev:debug                            same, with the Node debugger on port 9229
//
// Defaults: TRUEICON_PROJECT_DIR=playground/ (all 15 providers) and TRUEICON_CACHE=.cache/dev/,
// so your real ~/.trueicon cache is untouched. Set either variable to override. Pass --fresh
// to delete the dev cache first and force every index to rebuild.

import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SERVER = join(ROOT, "dist", "index.js");
const DEV_CACHE = join(ROOT, ".cache", "dev");

process.env.TRUEICON_PROJECT_DIR ??= join(ROOT, "playground");
process.env.TRUEICON_CACHE ??= DEV_CACHE;

const args = process.argv.slice(2);
const fresh = args.includes("--fresh");
const [command, ...rest] = args.filter((a) => a !== "--fresh");

if (fresh && process.env.TRUEICON_CACHE === DEV_CACHE) {
  rmSync(DEV_CACHE, { recursive: true, force: true });
  console.error(`cleared ${DEV_CACHE}`);
}

// "limit=5" -> 5, "name=Trash2" -> "Trash2"
function parseArg(pair) {
  const eq = pair.indexOf("=");
  if (eq < 1) throw new Error(`expected key=value, got "${pair}"`);
  const raw = pair.slice(eq + 1);
  let value = raw;
  try {
    value = JSON.parse(raw);
  } catch {
    // plain string
  }
  return [pair.slice(0, eq), value];
}

async function call(tool, pairs) {
  if (!tool) throw new Error("usage: npm run dev:call -- <tool> [key=value ...]");
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
  const client = new Client({ name: "trueicon-dev", version: "0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER], env: { ...process.env } }));
  try {
    const started = Date.now();
    const result = await client.callTool({ name: tool, arguments: Object.fromEntries(pairs.map(parseArg)) });
    for (const item of result.content) {
      if (item.type !== "text") continue;
      try {
        console.log(JSON.stringify(JSON.parse(item.text), null, 2));
      } catch {
        console.log(item.text);
      }
    }
    console.error(`${result.isError ? "✗ error" : "✓ ok"} in ${Date.now() - started}ms`);
    if (result.isError) process.exitCode = 1;
  } finally {
    await client.close();
  }
}

function inspect(debug) {
  const nodeArgs = debug ? ["--inspect=9229", SERVER] : [SERVER];
  if (debug) console.error("Debugger on port 9229: attach VS Code (\"Attach to Node Process\") or open chrome://inspect.");
  console.error(`project: ${process.env.TRUEICON_PROJECT_DIR}\ncache:   ${process.env.TRUEICON_CACHE}`);
  const child = spawn("npx", ["-y", "@modelcontextprotocol/inspector", process.execPath, ...nodeArgs], {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}

if (command === "call") await call(rest[0], rest.slice(1));
else if (command === "inspect") inspect(rest.includes("--debug"));
else {
  console.error("usage: dev.mjs <call|inspect> ...  (see the comment at the top of scripts/dev.mjs)");
  process.exitCode = 1;
}
