import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RawIcon } from "../adapter.js";
import { LiteralCursor, type JsValue } from "../jsLiteral.js";
import { renderSvg, toSvgAttrs, type SvgNode } from "../svg.js";
import { svelteExports } from "./svelte.js";

/*
 * lucide-svelte and @lucide/svelte layout: dist/icons/<kebab-name>.svelte, one component per
 * icon, re-exported by dist/icons/index.js (`export { default as Trash } from './trash.svelte'`).
 * The artwork is a literal in the component's <script>:
 *
 *   lucide-svelte:   const iconNode = [["path", { "d": "..." }], ...];
 *   @lucide/svelte:  const iconData = { "name": "trash", "size": 24, "node": [...], "aliases": ["trash-2"] };
 *
 * Deprecated names ship as stub modules next to the icons, dist/icons/<old-name>.js
 * (`export { default } from "./trash.svelte"`), and from @lucide/svelte are also listed in
 * iconData.aliases. Both are added to the icon's tags. Lucide ships no categories.
 */

const ICONS_DIR = join("dist", "icons");
const ICON_NODE = /const\s+iconNode\s*=\s*/;
const ICON_DATA = /const\s+iconData\s*=\s*/;
const STUB = /export\s*\{\s*default\s*\}\s*from\s*['"]\.\/([\w.-]+)\.svelte['"]/;

// Maps each icon to the old names whose stub modules re-export it: trash -> ["trash-2"].
function stubAliases(dir: string): Map<string, string[]> {
  const aliases = new Map<string, string[]>();
  for (const file of readdirSync(dir).filter((f) => /^[\w-]+\.js$/.test(f) && f !== "index.js")) {
    const name = file.slice(0, -".js".length);
    const target = STUB.exec(readFileSync(join(dir, file), "utf8"))?.[1];
    if (target && target !== name) aliases.set(target, [...(aliases.get(target) ?? []), name]);
  }
  return aliases;
}

function toNodes(cursor: LiteralCursor, nodes: JsValue | undefined): SvgNode[] {
  if (!Array.isArray(nodes)) cursor.fail("expected an array of [tag, attrs]");
  return nodes.map((node) => {
    if (!Array.isArray(node) || typeof node[0] !== "string") cursor.fail("expected [tag, attrs]");
    return { tag: node[0], attr: toSvgAttrs(node[1]), child: [] };
  });
}

export function parseComponent(src: string): { nodes: SvgNode[]; aliases: string[] } {
  const data = ICON_DATA.exec(src);
  if (data) {
    const cursor = new LiteralCursor(src, data.index + data[0].length);
    const value = cursor.object();
    const aliases = Array.isArray(value.aliases) ? value.aliases.filter((a): a is string => typeof a === "string") : [];
    return { nodes: toNodes(cursor, value.node), aliases };
  }
  const node = ICON_NODE.exec(src);
  if (!node) throw new Error("neither iconNode nor iconData found");
  const cursor = new LiteralCursor(src, node.index + node[0].length);
  return { nodes: toNodes(cursor, cursor.array()), aliases: [] };
}

function parser(importPath: string) {
  return (packageDir: string): RawIcon[] => {
    const dir = join(packageDir, ICONS_DIR);
    const exported = svelteExports(readFileSync(join(dir, "index.js"), "utf8"));
    const aliasModules = stubAliases(dir);
    const icons: RawIcon[] = [];
    for (const [name, importName] of [...exported].sort(([a], [b]) => a.localeCompare(b))) {
      let parsed: ReturnType<typeof parseComponent>;
      try {
        parsed = parseComponent(readFileSync(join(dir, `${name}.svelte`), "utf8"));
      } catch (err) {
        throw new Error(`${name}.svelte: ${(err as Error).message}`, { cause: err });
      }
      const tags = [...new Set([...parsed.aliases, ...(aliasModules.get(name) ?? [])])].filter((t) => t !== name);
      icons.push({
        name,
        importName,
        importPath,
        style: "outline",
        set: "lucide",
        categories: [],
        tags,
        svg: renderSvg(parsed.nodes),
      });
    }
    return icons;
  };
}

export const parseLucideSvelte = parser("lucide-svelte");
export const parseLucideSvelteScoped = parser("@lucide/svelte");
