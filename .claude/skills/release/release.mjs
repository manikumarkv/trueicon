#!/usr/bin/env node
/* global console, fetch, setTimeout */
// Release helper for trueicon. Run from the repo root.
//
//   node .claude/skills/release/release.mjs bump <patch|minor|major|x.y.z>
//   node .claude/skills/release/release.mjs check
//   node .claude/skills/release/release.mjs wait-npm [timeoutSeconds]

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const writeJson = (file, data) => writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

function nextVersion(current, spec) {
  if (/^\d+\.\d+\.\d+$/.test(spec)) return spec;
  const [major, minor, patch] = current.split(".").map(Number);
  if (spec === "major") return `${major + 1}.0.0`;
  if (spec === "minor") return `${major}.${minor + 1}.0`;
  if (spec === "patch") return `${major}.${minor}.${patch + 1}`;
  fail(`unknown version "${spec}"; use patch, minor, major or x.y.z`);
}

async function npmVersion(name, version) {
  const res = await fetch(`https://registry.npmjs.org/${name}/${version}`);
  return res.ok ? res.json() : null;
}

function bump(spec) {
  if (!spec) fail("usage: bump <patch|minor|major|x.y.z>");
  const pkg = readJson("package.json");
  const server = readJson("server.json");
  const version = nextVersion(pkg.version, spec);
  pkg.version = version;
  server.version = version;
  for (const p of server.packages) if (p.identifier === pkg.name) p.version = version;
  writeJson("package.json", pkg);
  writeJson("server.json", server);
  execSync("npm install --package-lock-only --ignore-scripts", { stdio: "ignore" });
  console.log(`✓ bumped to ${version} in package.json, package-lock.json and server.json`);
}

async function check() {
  const pkg = readJson("package.json");
  const lock = readJson("package-lock.json");
  const server = readJson("server.json");
  const npmPkg = server.packages.find((p) => p.identifier === pkg.name);
  const errors = [];

  if (pkg.mcpName !== server.name) errors.push(`package.json mcpName "${pkg.mcpName}" != server.json name "${server.name}"`);
  if (!npmPkg) errors.push(`server.json has no npm package with identifier "${pkg.name}"`);
  for (const [label, v] of [
    ["package-lock.json", lock.version],
    ["server.json version", server.version],
    ["server.json packages[].version", npmPkg?.version],
  ]) {
    if (v !== pkg.version) errors.push(`${label} is ${v}, package.json is ${pkg.version}`);
  }
  if (server.description.length > 100) errors.push(`server.json description is ${server.description.length} chars (max 100)`);
  if (await npmVersion(pkg.name, pkg.version)) errors.push(`${pkg.name}@${pkg.version} is already on npm; bump the version`);

  if (errors.length) fail(`release check failed:\n  - ${errors.join("\n  - ")}`);
  console.log(`✓ ${pkg.name}@${pkg.version} (${server.name}) is ready to publish`);
}

async function waitNpm(timeoutSeconds = 600) {
  const { name, version, mcpName } = readJson("package.json");
  const deadline = Date.now() + Number(timeoutSeconds) * 1000;
  while (Date.now() < deadline) {
    const published = await npmVersion(name, version);
    if (published) {
      if (published.mcpName !== mcpName) fail(`${name}@${version} is on npm but its mcpName is "${published.mcpName}"`);
      console.log(`✓ ${name}@${version} is live on npm with mcpName ${mcpName}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
  fail(`${name}@${version} did not appear on npm within ${timeoutSeconds}s`);
}

const [command, arg] = process.argv.slice(2);
if (command === "bump") bump(arg);
else if (command === "check") await check();
else if (command === "wait-npm") await waitNpm(arg);
else fail("usage: release.mjs <bump|check|wait-npm> [arg]");
