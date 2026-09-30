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
 *
 * @tabler/icons-vue has the same layout (barrel dist/esm/tabler-icons-vue.mjs) but passes the
 * nodes inline: `createVueComponent("outline", "trash", "Trash", [["path", {...}], ...])`.
 * Its 2.x releases use .js files and leave out the style: `createVueComponent("trash",
 * "IconTrash", [...])`, so the style comes from the name ("trash-filled" is filled).
 */

const ICONS_DIR = join("dist", "esm", "icons");

const ICON_NODE = /const __iconNode = /;
const CREATE_CALL = /create(?:React|Vue)Component\(\s*/;
const BARREL_EXPORT = /export\s*\{([^}]*)\}\s*from\s*['"]\.\/icons\/(\w+)\.m?js['"]/g;

function parseNodes(cursor: LiteralCursor): SvgNode[] {
  return cursor.array().map((node) => {
    if (!Array.isArray(node) || typeof node[0] !== "string") cursor.fail("expected [tag, attrs]");
    return { tag: node[0], attr: toSvgAttrs(node[1]), child: [] };
  });
}

// Maps icon module name (IconNumber123) to its alias names in the barrel (["123"]).
function barrelAliases(packageDir: string, barrel: string): Map<string, string[]> {
  const aliases = new Map<string, string[]>();
  const file = [barrel, barrel.replace(/\.mjs$/, ".js")].map((b) => join(packageDir, "dist", "esm", b)).find(existsSync);
  if (!file) return aliases;
  for (const match of readFileSync(file, "utf8").matchAll(BARREL_EXPORT)) {
    const target = match[2]!;
    const names = [...match[1]!.matchAll(/default as (\w+)/g)].map((m) => m[1]!).filter((n) => n !== target);
    if (names.length > 0) aliases.set(target, names.map((n) => toKebabCase(n.replace(/^Icon/, ""))));
  }
  return aliases;
}

const STYLES = new Set(["outline", "filled"]);

export function parseIconFile(src: string): { name: string; style: string; nodes: SvgNode[] } {
  const call = CREATE_CALL.exec(src);
  if (!call) throw new Error("createReactComponent/createVueComponent call not found");
  const cursor = new LiteralCursor(src, call.index + call[0].length);
  const first = cursor.string();
  cursor.expect(",");
  const second = cursor.string();
  // 3.x: (style, name, PascalName, nodes); 2.x Vue: (name, IconName, nodes).
  const modern = STYLES.has(first);
  const name = modern ? second : first;
  const style = modern ? first : name.endsWith("-filled") ? "filled" : "outline";
  const iconNode = ICON_NODE.exec(src);
  if (iconNode) return { name, style, nodes: parseNodes(new LiteralCursor(src, iconNode.index + iconNode[0].length)) };
  if (modern) {
    cursor.expect(",");
    cursor.string();
  }
  cursor.expect(",");
  return { name, style, nodes: parseNodes(cursor) };
}

function parser(importPath: string, barrel: string) {
  return (packageDir: string): RawIcon[] => {
    const dir = join(packageDir, ICONS_DIR);
    const aliases = barrelAliases(packageDir, barrel);
    const icons: RawIcon[] = [];
    for (const file of readdirSync(dir).filter((f) => /^Icon\w+\.m?js$/.test(f)).sort()) {
      const importName = file.replace(/\.m?js$/, "");
      let parsed: ReturnType<typeof parseIconFile>;
      try {
        parsed = parseIconFile(readFileSync(join(dir, file), "utf8"));
      } catch (err) {
        throw new Error(`${file}: ${(err as Error).message}`, { cause: err });
      }
      icons.push({
        name: parsed.name,
        importName,
        importPath,
        style: parsed.style,
        set: "tabler",
        categories: [],
        tags: aliases.get(importName) ?? [],
        svg: renderSvg(parsed.nodes),
      });
    }
    return icons;
  };
}

export const parseIcons = parser("@tabler/icons-react", "tabler-icons-react.mjs");
export const parseTablerVue = parser("@tabler/icons-vue", "tabler-icons-vue.mjs");
