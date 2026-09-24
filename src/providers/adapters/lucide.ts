import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RawIcon } from "../adapter.js";
import { LiteralCursor, type JsValue } from "../jsLiteral.js";
import { renderSvg, toSvgAttrs, type SvgNode } from "../svg.js";

/*
 * lucide-react layout: dist/esm/icons/<kebab-name>.js (.mjs from 1.x), one ESM module per icon.
 * The module body has changed across releases; all three shapes are supported:
 *
 *   older 0.x:        const Trash2 = createLucideIcon("Trash2", [["path", { d: "...", key: "..." }], ...]);
 *   later 0.x - 1.46: const __iconNode = [["path", { ... }], ...];
 *                     const Trash2 = createLucideIcon("trash-2", __iconNode);
 *   1.47+:            const __iconData = { name: "trash-2", size: 24, node: [...], aliases: ["..."] };
 *                     const Trash2 = createLucideIcon(__iconData);
 *
 * The import name always comes from the `const <Name> = createLucideIcon(` binding, because the
 * string argument is the component name in older releases but the kebab name in later ones.
 *
 * Deprecated alias names ship as re-export modules (`export { default } from './target.js'`), and
 * from 1.47 also in __iconData.aliases. They are not indexed separately but added to the target
 * icon's tags so old names still match. lucide-react ships no categories or tags of its own.
 */

const ICONS_DIR = join("dist", "esm", "icons");
const MODULE_FILE = /^(?<name>[\w-]+)\.m?js$/;
const CREATE_CALL = /const\s+(?<importName>[\w$]+)\s*=\s*createLucideIcon\(\s*/;
const ICON_NODE = /const\s+__iconNode\s*=\s*/;
const ICON_DATA = /const\s+__iconData\s*=\s*/;
const ALIAS_EXPORT = /export\s*\{\s*default\s*\}\s*from\s*['"]\.\/([\w-]+)\.m?js['"]/;

function toNodes(cursor: LiteralCursor, nodes: JsValue): SvgNode[] {
  if (!Array.isArray(nodes)) cursor.fail("expected an array of [tag, attrs]");
  return nodes.map((node) => {
    if (!Array.isArray(node) || typeof node[0] !== "string") cursor.fail("expected [tag, attrs]");
    return { tag: node[0], attr: toSvgAttrs(node[1]), child: [] };
  });
}

/** Reads the value assigned by `const <binding> = ` in src. */
function readBinding(src: string, binding: RegExp): { cursor: LiteralCursor; value: JsValue } | undefined {
  const match = binding.exec(src);
  if (!match) return undefined;
  const cursor = new LiteralCursor(src, match.index + match[0].length);
  return { cursor, value: cursor.value() };
}

function parseModule(src: string): { importName: string; nodes: SvgNode[]; aliases: string[] } | undefined {
  const call = CREATE_CALL.exec(src);
  if (!call) return undefined;
  const importName = call.groups!.importName!;

  const data = readBinding(src, ICON_DATA);
  if (data) {
    const { value } = data;
    const cursor: LiteralCursor = data.cursor;
    if (!value || typeof value !== "object" || Array.isArray(value)) cursor.fail("expected __iconData object");
    const aliases = Array.isArray(value.aliases) ? value.aliases.filter((a) => typeof a === "string") : [];
    return { importName, nodes: toNodes(cursor, value.node ?? null), aliases };
  }

  const iconNode = readBinding(src, ICON_NODE);
  if (iconNode) return { importName, nodes: toNodes(iconNode.cursor, iconNode.value), aliases: [] };

  // Older 0.x: createLucideIcon("<Name>", [...nodes]).
  const cursor = new LiteralCursor(src, call.index + call[0].length);
  cursor.string();
  cursor.expect(",");
  return { importName, nodes: toNodes(cursor, cursor.array()), aliases: [] };
}

export function parseIcons(packageDir: string): RawIcon[] {
  const dir = join(packageDir, ICONS_DIR);
  const icons = new Map<string, RawIcon>();
  const aliases: [alias: string, target: string][] = [];

  for (const file of readdirSync(dir).sort()) {
    const name = MODULE_FILE.exec(file)?.groups?.name;
    if (!name) continue;
    const src = readFileSync(join(dir, file), "utf8");
    const icon = parseModule(src);
    if (!icon) {
      const alias = ALIAS_EXPORT.exec(src);
      if (alias) aliases.push([name, alias[1]!]);
      continue;
    }
    icons.set(name, {
      name,
      importName: icon.importName,
      importPath: "lucide-react",
      style: "outline",
      set: "lucide",
      categories: [],
      tags: [],
      svg: renderSvg(icon.nodes),
    });
    for (const alias of icon.aliases) aliases.push([alias, name]);
  }

  for (const [alias, target] of aliases) {
    const tags = icons.get(target)?.tags;
    if (tags && !tags.includes(alias)) tags.push(alias);
  }
  return [...icons.values()];
}
