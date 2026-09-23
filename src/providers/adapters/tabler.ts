import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { toKebabCase, type RawIcon } from "../adapter.js";
import { LiteralCursor } from "../jsLiteral.js";
import { renderSvg, toSvgAttrs, type SvgNode } from "../svg.js";

/*
 * @tabler/icons-react layout: dist/esm/icons/Icon<Name>.mjs, one ESM module per icon:
 *
 *   const __iconNode = [["path", { "d": "M4 7l16 0", "key": "svg-0" }], ...];
 *   const IconTrash = createReactComponent("outline", "trash", "Trash", __iconNode);
 *   export { __iconNode, IconTrash as default };
 *
 * createReactComponent's arguments give the style ("outline" or "filled") and the kebab icon
 * name, which already carries the variant ("trash" vs "trash-filled"), so names are unique.
 * The package barrel (dist/esm/tabler-icons-react.mjs) re-exports some icons under old names
 * (`export { default as Icon123, default as IconNumber123 } from './icons/IconNumber123.mjs'`);
 * those are added to the target icon's tags. dist/esm/icons/index.mjs is a barrel and is
 * skipped. Tabler ships no categories.
 */

const ICONS_DIR = join("dist", "esm", "icons");
const BARREL = join("dist", "esm", "tabler-icons-react.mjs");
const ICON_NODE = /const __iconNode = /;
const CREATE_CALL = /createReactComponent\(\s*/;
const BARREL_EXPORT = /export\s*\{([^}]*)\}\s*from\s*['"]\.\/icons\/(\w+)\.mjs['"]/g;

function parseNodes(cursor: LiteralCursor): SvgNode[] {
  return cursor.array().map((node) => {
    if (!Array.isArray(node) || typeof node[0] !== "string") cursor.fail("expected [tag, attrs]");
    return { tag: node[0], attr: toSvgAttrs(node[1]), child: [] };
  });
}

// Maps icon module name (IconNumber123) to its alias names in the barrel (["123"]).
function barrelAliases(packageDir: string): Map<string, string[]> {
  const aliases = new Map<string, string[]>();
  const file = join(packageDir, BARREL);
  if (!existsSync(file)) return aliases;
  for (const match of readFileSync(file, "utf8").matchAll(BARREL_EXPORT)) {
    const target = match[2]!;
    const names = [...match[1]!.matchAll(/default as (\w+)/g)].map((m) => m[1]!).filter((n) => n !== target);
    if (names.length > 0) aliases.set(target, names.map((n) => toKebabCase(n.replace(/^Icon/, ""))));
  }
  return aliases;
}

export function parseIconFile(src: string): { name: string; style: string; nodes: SvgNode[] } {
  const iconNode = ICON_NODE.exec(src);
  const call = CREATE_CALL.exec(src);
  if (!iconNode || !call) throw new Error("createReactComponent call not found");
  const nodes = parseNodes(new LiteralCursor(src, iconNode.index + iconNode[0].length));
  const cursor = new LiteralCursor(src, call.index + call[0].length);
  const style = cursor.string();
  cursor.expect(",");
  return { name: cursor.string(), style, nodes };
}

export function parseIcons(packageDir: string): RawIcon[] {
  const dir = join(packageDir, ICONS_DIR);
  const aliases = barrelAliases(packageDir);
  const icons: RawIcon[] = [];
  for (const file of readdirSync(dir).filter((f) => /^Icon\w+\.mjs$/.test(f)).sort()) {
    const importName = file.slice(0, -".mjs".length);
    const { name, style, nodes } = parseIconFile(readFileSync(join(dir, file), "utf8"));
    icons.push({
      name,
      importName,
      importPath: "@tabler/icons-react",
      style,
      set: "tabler",
      categories: [],
      tags: aliases.get(importName) ?? [],
      svg: renderSvg(nodes),
    });
  }
  return icons;
}
