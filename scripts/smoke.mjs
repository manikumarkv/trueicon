#!/usr/bin/env node
/* global console, fetch */
// Smoke test against the real npm packages: for every provider, download each listed version plus
// the current latest, build the index exactly as the server does, and check the icon count and a
// few well-known icons. Catches upstream format changes that the fixture-based tests cannot.
//
//   npm run smoke                       all providers
//   npm run smoke -- lucide tabler      only these providers
//
// Needs network access and `npm run build` first. Downloads are cached in .cache/smoke/.

import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { downloadPackage } from "../dist/cache/downloader.js";
import { buildIndex } from "../dist/indexer/buildIndex.js";
import { PROVIDERS } from "../dist/providers/registry.js";
import { loadSynonyms } from "../dist/synonyms/loadSynonyms.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, ".cache", "smoke");

// versions: releases to check besides the current latest, covering each module format a provider
//           has shipped. icons: import names that must exist in every checked version.
//           minIcons: lower bound on the index size, well under the real count, to catch an
//           adapter that silently stops finding most icons.
const TARGETS = {
  lucide: { versions: ["0.460.0", "0.577.0", "1.0.0"], icons: ["Search", "User", "House"], minIcons: 1000 },
  "react-icons": { versions: ["5.3.0"], icons: ["FaTrash", "MdSearch", "FiUser"], minIcons: 20000 },
  heroicons: { versions: ["2.1.1"], icons: ["TrashIcon", "MagnifyingGlassIcon", "UserIcon"], minIcons: 1000 },
  phosphor: { versions: ["2.1.10"], icons: ["TrashIcon", "MagnifyingGlassIcon", "UserIcon"], minIcons: 5000 },
  tabler: { versions: ["3.48.0"], icons: ["IconTrash", "IconSearch", "IconUser"], minIcons: 4000 },
  iconoir: { versions: ["7.12.1"], icons: ["Trash", "Search", "User"], minIcons: 1000 },
  fluentui: { versions: ["2.0.341"], icons: ["DeleteRegular", "SearchRegular", "PersonRegular"], minIcons: 3000 },
  carbon: { versions: ["11.89.0"], icons: ["TrashCan", "Search", "User"], minIcons: 1500 },
  antdesign: { versions: ["6.3.4"], icons: ["DeleteOutlined", "SearchOutlined", "UserOutlined"], minIcons: 400 },
  mui: { versions: ["5.0.0", "5.18.0", "6.5.0", "7.3.11"], icons: ["Delete", "SearchOutlined", "PersonRounded"], minIcons: 8000 },
  radix: { versions: ["1.0.0", "1.3.0"], icons: ["TrashIcon", "MagnifyingGlassIcon", "PersonIcon"], minIcons: 250 },
  remix: { versions: ["4.0.0", "4.6.0"], icons: ["RiDeleteBinLine", "RiSearchLine", "RiUserFill"], minIcons: 2500 },
  "fontawesome-solid": { versions: ["5.15.4", "6.7.2"], icons: ["faTrash", "faUser", "faHouseUser"], minIcons: 800 },
  "fontawesome-regular": { versions: ["5.15.4", "6.7.2"], icons: ["faUser", "faStar", "faHeart"], minIcons: 120 },
  "fontawesome-brands": { versions: ["5.15.4", "6.7.2"], icons: ["faGithub", "faReact", "faApple"], minIcons: 400 },
};

async function latestVersion(pkg) {
  const res = await fetch(`https://registry.npmjs.org/${pkg.replace("/", "%2F")}/latest`);
  if (!res.ok) throw new Error(`could not resolve latest ${pkg}: HTTP ${res.status}`);
  return (await res.json()).version;
}

async function check(provider, version, target, synonyms) {
  const { dir } = await downloadPackage(provider.package, version, { cacheRoot: CACHE });
  const { records } = await buildIndex({ providerId: provider.id, packageDir: dir, version, synonyms });
  const problems = [];
  if (records.length < target.minIcons) problems.push(`only ${records.length} icons (expected ≥ ${target.minIcons})`);
  const names = new Set(records.map((r) => r.importName));
  const missing = target.icons.filter((icon) => !names.has(icon));
  if (missing.length) problems.push(`missing ${missing.join(", ")}`);
  return { count: records.length, problems };
}

const only = process.argv.slice(2);
const unknown = only.filter((id) => !TARGETS[id]);
if (unknown.length) {
  console.error(`unknown provider(s): ${unknown.join(", ")}. Known: ${Object.keys(TARGETS).join(", ")}`);
  process.exit(1);
}
const missingTargets = PROVIDERS.filter((p) => !TARGETS[p.id]).map((p) => p.id);
if (missingTargets.length) {
  console.error(`no smoke targets for provider(s): ${missingTargets.join(", ")}. Add them to TARGETS.`);
  process.exit(1);
}

const synonyms = loadSynonyms();
let failures = 0;
for (const provider of PROVIDERS) {
  if (only.length && !only.includes(provider.id)) continue;
  const target = TARGETS[provider.id];
  const latest = await latestVersion(provider.package);
  const versions = [...new Set([...target.versions, latest])];
  for (const version of versions) {
    const label = `${provider.package}@${version}${version === latest ? " (latest)" : ""}`;
    try {
      const { count, problems } = await check(provider, version, target, synonyms);
      if (problems.length) {
        failures++;
        console.log(`✗ ${label}: ${problems.join("; ")}`);
      } else {
        console.log(`✓ ${label}: ${count} icons`);
      }
    } catch (error) {
      failures++;
      console.log(`✗ ${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall smoke checks passed");
