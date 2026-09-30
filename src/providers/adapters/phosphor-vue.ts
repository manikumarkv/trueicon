import { readFileSync } from "node:fs";
import { join } from "node:path";
import { toKebabCase, type RawIcon } from "../adapter.js";
import { LiteralCursor } from "../jsLiteral.js";
import { renderSvg, type SvgNode } from "../svg.js";
import { parseVNode, parseVNodes } from "./vue.js";

/*
 * @phosphor-icons/vue layout: dist/icons/Ph<Name>.vue.mjs, one minified compiled component per
 * icon, imported by the barrel dist/index.mjs (`import aT from "./icons/PhTrash.vue.mjs"`) and
 * exported under its name plus any old names (`a as PhFolder, a as PhFolderNotch`).
 *
 * Every weight's artwork is hoisted into variables, and the render function picks a group by
 * the weight prop:
 *
 *   y = e("path", { d: "..." }, null, -1), f = [ y ], ...
 *   o.value === "bold" ? (a(), t("g", M, f)) : o.value === "duotone" ? (a(), t("g", w, x)) : ...
 *
 * As with @phosphor-icons/react, each weight is its own record: the default weight keeps the
 * plain name ("trash") and the others get a suffix ("trash-bold"). Old export names become tags.
 */

const BARREL = join("dist", "index.mjs");
const ICONS_DIR = join("dist", "icons");
const DEFAULT_WEIGHT = "regular";
const IMPORT = /import\s+([\w$]+)\s+from\s+"\.\/icons\/(Ph\w+)\.vue\.mjs"/g;
const EXPORTS = /export\s*\{([^}]*)\}/;
const WEIGHT_BRANCH = /===\s*"(\w+)"\s*\?\s*\(\s*[\w$]+\(\)\s*,\s*[\w$]+\(\s*"g"\s*,\s*[\w$]+\s*,\s*([\w$]+)\s*\)\s*\)/g;

const escape = (name: string) => name.replace(/[$]/g, "\\$");

// Finds the value assigned to a minified variable: `, f = [` or `const g = [`.
function assignment(src: string, name: string): LiteralCursor {
  const match = new RegExp(`(?<![\\w$.])${escape(name)}\\s*=(?!=)\\s*`).exec(src);
  if (!match) throw new Error(`variable ${name} not found`);
  return new LiteralCursor(src, match.index + match[0].length);
}

/** Returns each weight's SVG nodes, in the order the render function lists them. */
export function parseWeights(src: string): [weight: string, nodes: SvgNode[]][] {
  const resolve = (name: string): SvgNode[] => [parseVNode(assignment(src, name), resolve)];
  const weights: [string, SvgNode[]][] = [];
  for (const [, weight, group] of src.matchAll(WEIGHT_BRANCH)) {
    weights.push([weight!, parseVNodes(assignment(src, group!), resolve)]);
  }
  if (weights.length === 0) throw new Error("no weight branches found");
  return weights;
}

// Maps each icon file (PhFolder) to all names the barrel exports it under.
function barrelNames(src: string): Map<string, string[]> {
  const files = new Map([...src.matchAll(IMPORT)].map((m) => [m[1]!, m[2]!]));
  const names = new Map<string, string[]>();
  for (const spec of (EXPORTS.exec(src)?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    const [local, exported = local] = spec.split(/\s+as\s+/);
    const file = files.get(local!);
    if (file) names.set(file, [...(names.get(file) ?? []), exported!]);
  }
  return names;
}

export function parsePhosphorVue(packageDir: string): RawIcon[] {
  const icons: RawIcon[] = [];
  const names = barrelNames(readFileSync(join(packageDir, BARREL), "utf8"));
  for (const [file, exported] of [...names].sort(([a], [b]) => a.localeCompare(b))) {
    let weights: ReturnType<typeof parseWeights>;
    try {
      weights = parseWeights(readFileSync(join(packageDir, ICONS_DIR, `${file}.vue.mjs`), "utf8"));
    } catch (err) {
      throw new Error(`${file}.vue.mjs: ${(err as Error).message}`, { cause: err });
    }
    const base = toKebabCase(file.replace(/^Ph/, ""));
    const tags = exported.filter((n) => n !== file).map((n) => toKebabCase(n.replace(/^Ph/, "")));
    for (const [weight, nodes] of weights) {
      icons.push({
        name: weight === DEFAULT_WEIGHT ? base : `${base}-${weight}`,
        importName: file,
        importPath: "@phosphor-icons/vue",
        style: weight,
        set: "phosphor",
        categories: [],
        tags,
        svg: renderSvg(nodes),
      });
    }
  }
  return icons;
}
