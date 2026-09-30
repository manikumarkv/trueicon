import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { toKebabCase, type RawIcon } from "../adapter.js";

/*
 * phosphor-svelte layout: lib/<Name>Icon.svelte (plus a deprecated lib/<Name>.svelte with the
 * same artwork), re-exported by lib/index.js (`export { default as TrashIcon } from
 * './TrashIcon.svelte'`). Each weight's artwork is plain SVG markup in the template:
 *
 *   {#if weight === "bold"}
 *     <path d="..."/>
 *   {:else if weight === "duotone"}
 *     <path d="..." opacity="0.2"/><path d="..."/>
 *   ...
 *
 * As with @phosphor-icons/react, each weight is its own record: the default weight keeps the
 * plain name ("trash") and the others get a suffix ("trash-bold"). Old export names that the
 * barrel points at another icon's file become tags. Releases before the *Icon names (2.x and
 * earlier) export <Name> only, from a folder per icon (`from './Trash'` -> lib/Trash/Trash.svelte);
 * those names are used as-is.
 */

const LIB_DIR = "lib";
const DEFAULT_WEIGHT = "regular";
const BARREL_EXPORT = /export\s*\{\s*default\s+as\s+(\w+)\s*\}\s*from\s*['"]\.\/(\w+)(?:\.svelte)?['"]/g;
const WEIGHT_BLOCK = /\{(?:#if|:else if)\s+weight\s*===\s*"(\w+)"\s*\}([\s\S]*?)(?=\{:else|\{\/if\})/g;

/** Returns each weight's inner SVG markup, in template order. */
export function parseWeights(src: string): [weight: string, svg: string][] {
  const weights = [...src.matchAll(WEIGHT_BLOCK)].map(([, weight, svg]): [string, string] => [
    weight!,
    svg!.trim().replace(/>\s+</g, "><"),
  ]);
  if (weights.length === 0) throw new Error("no weight blocks found");
  return weights;
}

export function parsePhosphorSvelte(packageDir: string): RawIcon[] {
  const barrel = readFileSync(join(packageDir, LIB_DIR, "index.js"), "utf8");
  const namesByFile = new Map<string, string[]>();
  for (const [, name, file] of barrel.matchAll(BARREL_EXPORT)) {
    namesByFile.set(file!, [...(namesByFile.get(file!) ?? []), name!]);
  }
  // Prefer the <Name>Icon components; the plain <Name> files are deprecated duplicates.
  const hasIconNames = [...namesByFile.keys()].some((file) => file.endsWith("Icon"));
  const icons: RawIcon[] = [];
  for (const [file, names] of [...namesByFile].sort(([a], [b]) => a.localeCompare(b))) {
    if (hasIconNames && !file.endsWith("Icon")) continue;
    const path = [join(packageDir, LIB_DIR, `${file}.svelte`), join(packageDir, LIB_DIR, file, `${file}.svelte`)].find(existsSync);
    if (!path) continue;
    const src = readFileSync(path, "utf8");
    // The barrel also exports helpers such as IconContext, which have no weights.
    if (!/weight\s*===/.test(src)) continue;
    let weights: ReturnType<typeof parseWeights>;
    try {
      weights = parseWeights(src);
    } catch (err) {
      throw new Error(`${file}.svelte: ${(err as Error).message}`, { cause: err });
    }
    const component = hasIconNames ? file.slice(0, -"Icon".length) : file;
    const base = toKebabCase(component);
    const tags = names
      .filter((n) => n !== file)
      .map((n) => toKebabCase(hasIconNames ? n.replace(/Icon$/, "") : n))
      .filter((t) => t !== base);
    for (const [weight, svg] of weights) {
      icons.push({
        name: weight === DEFAULT_WEIGHT ? base : `${base}-${weight}`,
        importName: file,
        importPath: "phosphor-svelte",
        style: weight,
        set: "phosphor",
        categories: [],
        tags,
        svg,
      });
    }
  }
  return icons;
}
