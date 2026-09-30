import { existsSync, readFileSync } from "node:fs";
import { toKebabCase } from "../adapter.js";

/*
 * Helpers for Svelte icon packages. Their barrels re-export one .svelte component per icon:
 *
 *   export { default as Trash } from './trash.svelte';
 *
 * and deprecated names re-export an icon under its old name from a separate aliases module.
 */

const SVELTE_EXPORT = /export\s*\{\s*default\s+as\s+([\w$]+)\s*\}\s*from\s*['"]\.\/(?:icons\/)?([\w.-]+)\.svelte['"]/g;
const ALIAS_EXPORT = /default\s+as\s+([\w$]+)\s*\}\s*from\s*['"](?:\.\.\/icons\/|\.\/icons\/)([\w.-]+)\.(?:js|svelte)['"]/g;

/** Maps each .svelte file name (without extension) in a barrel to its export name. */
export function svelteExports(barrelSrc: string): Map<string, string> {
  const exports = new Map<string, string>();
  for (const [, name, file] of barrelSrc.matchAll(SVELTE_EXPORT)) exports.set(file!, name!);
  return exports;
}

/**
 * Maps each icon file to the kebab-case old names an aliases module re-exports it under,
 * after removing `strip` (e.g. the "Icon" prefix) from the export names.
 */
export function svelteAliases(aliasesFile: string, strip?: RegExp): Map<string, string[]> {
  const aliases = new Map<string, string[]>();
  if (!existsSync(aliasesFile)) return aliases;
  for (const [, name, file] of readFileSync(aliasesFile, "utf8").matchAll(ALIAS_EXPORT)) {
    const alias = toKebabCase(strip ? name!.replace(strip, "") : name!);
    const list = aliases.get(file!) ?? [];
    if (!list.includes(alias)) list.push(alias);
    aliases.set(file!, list);
  }
  return aliases;
}
