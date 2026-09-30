import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RawIcon } from "../adapter.js";
import { LiteralCursor } from "../jsLiteral.js";
import { renderSvg, toSvgAttrs, type SvgNode } from "../svg.js";
import { svelteAliases, svelteExports } from "./svelte.js";

/*
 * @tabler/icons-svelte layout: dist/icons/<kebab-name>.svelte, one component per icon,
 * re-exported by dist/icons/index.js (`export { default as IconTrash } from './trash.svelte'`):
 *
 *   <script>import Icon from '../Icon.svelte';
 *   const iconNode = [["path", { "d": "M4 7l16 0" }], ...];
 *   </script>
 *   <Icon type="outline" name="trash" {...$$props} iconNode={iconNode}>
 *
 * The Icon props give the style ("outline" or "filled") and the kebab name, which carries the
 * variant ("trash-filled"). dist/aliases.js re-exports icons under old names
 * (`default as Icon123 } from './icons/number-123.svelte'`); those become tags. Tabler ships
 * no categories.
 *
 * 2.x releases keep the components in dist/svelte/icons/Icon<Name>.svelte with the barrel
 * dist/svelte/tabler-icons-svelte.js, and their <Icon> has no type prop, so the style comes from
 * the name ("trash-filled" is filled).
 */

const LAYOUTS = [
  { icons: join("dist", "icons"), barrel: join("dist", "icons", "index.js") },
  { icons: join("dist", "svelte", "icons"), barrel: join("dist", "svelte", "tabler-icons-svelte.js") },
];
const ICON_NODE = /const\s+iconNode\s*=\s*/;
const ICON_PROPS = /<Icon\s+(?:type="(\w+)"\s+)?name="([\w-]+)"/;

export function parseComponent(src: string): { name: string; style: string; nodes: SvgNode[] } {
  const node = ICON_NODE.exec(src);
  const props = ICON_PROPS.exec(src);
  if (!node || !props) throw new Error("iconNode or <Icon type name> not found");
  const cursor: LiteralCursor = new LiteralCursor(src, node.index + node[0].length);
  const nodes = cursor.array().map((n) => {
    if (!Array.isArray(n) || typeof n[0] !== "string") cursor.fail("expected [tag, attrs]");
    return { tag: n[0], attr: toSvgAttrs(n[1]), child: [] };
  });
  const name = props[2]!;
  return { style: props[1] ?? (name.endsWith("-filled") ? "filled" : "outline"), name, nodes };
}

export function parseTablerSvelte(packageDir: string): RawIcon[] {
  const layout = LAYOUTS.find((l) => existsSync(join(packageDir, l.barrel)));
  if (!layout) throw new Error("no icons barrel found (dist/icons/index.js or dist/svelte/tabler-icons-svelte.js)");
  const dir = join(packageDir, layout.icons);
  const exported = svelteExports(readFileSync(join(packageDir, layout.barrel), "utf8"));
  const aliases = svelteAliases(join(packageDir, "dist", "aliases.js"), /^Icon/);
  const icons: RawIcon[] = [];
  for (const [file, importName] of [...exported].sort(([a], [b]) => a.localeCompare(b))) {
    let parsed: ReturnType<typeof parseComponent>;
    try {
      parsed = parseComponent(readFileSync(join(dir, `${file}.svelte`), "utf8"));
    } catch (err) {
      throw new Error(`${file}.svelte: ${(err as Error).message}`, { cause: err });
    }
    icons.push({
      name: parsed.name,
      importName,
      importPath: "@tabler/icons-svelte",
      style: parsed.style,
      set: "tabler",
      categories: [],
      tags: (aliases.get(file) ?? []).filter((alias) => alias !== parsed.name),
      svg: renderSvg(parsed.nodes),
    });
  }
  return icons;
}
