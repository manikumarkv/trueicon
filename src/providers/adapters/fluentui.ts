import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { toKebabCase, type RawIcon } from "../adapter.js";
import { LiteralCursor, type JsValue } from "../jsLiteral.js";
import { renderSvg, toSvgAttrs, type SvgNode } from "../svg.js";

/*
 * @fluentui/react-icons layout: lib/icons/chunk-<n>.js, many icons per chunk, one per line:
 *
 *   export const BackpackFilled = ( /*#__PURE__*\/createFluentIcon('BackpackFilled', "1em", ["M8 8.7c0-...", ...]));
 *   export const CalendarColor = ( /*#__PURE__*\/createFluentIcon('CalendarColor', "1em", [["path", { "d": "..." }], ["g", {...}, [...]]], { color: true }));
 *
 * Mono-color icons pass an array of path `d` strings; color icons pass [tag, attrs, ...children]
 * node tuples (which include their gradient/filter defs). An optional options object may follow.
 * Every export name ends in its style: Filled, Regular or Color.
 *
 * lib/sizedIcons/ holds size-specific variants (Backpack12Filled, Backpack16Filled, ...) of the
 * same artwork, about 20k near-duplicates; it is skipped and only the scalable 1em icons are
 * indexed. Fluent ships no categories.
 */

const ICONS_DIR = join("lib", "icons");
const ICON_EXPORT = /export const (\w+) = \(\s*\/\*#__PURE__\*\/\s*createFluentIcon\(/g;
const STYLE_SUFFIX = /(Filled|Regular|Color)$/;

function toNode(value: JsValue, cursor: LiteralCursor): SvgNode {
  if (typeof value === "string") return { tag: "path", attr: { d: value }, child: [] };
  if (!Array.isArray(value) || typeof value[0] !== "string") cursor.fail("expected path data or [tag, attrs]");
  const [tag, attrs, ...children] = value;
  return { tag, attr: toSvgAttrs(attrs), child: children.map((child) => toNode(child, cursor)) };
}

export function parseChunk(src: string): { importName: string; nodes: SvgNode[] }[] {
  const icons: { importName: string; nodes: SvgNode[] }[] = [];
  for (const match of src.matchAll(ICON_EXPORT)) {
    const importName = match[1]!;
    const cursor = new LiteralCursor(src, match.index + match[0].length);
    if (cursor.string() !== importName) cursor.fail(`display name does not match export ${importName}`);
    cursor.expect(",");
    cursor.string();
    cursor.expect(",");
    const nodes = cursor.array().map((value) => toNode(value, cursor));
    if (cursor.eat(",")) cursor.object();
    cursor.expect(")");
    icons.push({ importName, nodes });
  }
  return icons;
}

export function parseIcons(packageDir: string): RawIcon[] {
  const dir = join(packageDir, ICONS_DIR);
  const icons: RawIcon[] = [];
  for (const file of readdirSync(dir).filter((f) => /^chunk-\d+\.js$/.test(f)).sort()) {
    for (const { importName, nodes } of parseChunk(readFileSync(join(dir, file), "utf8"))) {
      const style = STYLE_SUFFIX.exec(importName)?.[1];
      if (!style) throw new Error(`${file}: ${importName} has no Filled/Regular/Color suffix`);
      icons.push({
        name: toKebabCase(importName),
        importName,
        importPath: "@fluentui/react-icons",
        style: style.toLowerCase(),
        set: "fluentui",
        categories: [],
        tags: [],
        svg: renderSvg(nodes),
      });
    }
  }
  return icons;
}
