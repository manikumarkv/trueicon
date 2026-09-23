import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { toKebabCase, type RawIcon } from "../adapter.js";
import { LiteralCursor, type JsValue } from "../jsLiteral.js";
import { renderSvg, toSvgAttrs, type SvgNode } from "../svg.js";

/*
 * react-icons layout: one directory per icon set (fa/, fa6/, md/, ...), each with an
 * index.mjs that defines every icon of the set:
 *
 *   export function FaBeer (props) {
 *     return GenIcon({"tag":"svg","attr":{"viewBox":"0 0 448 512"},"child":[...]})(props);
 *   };
 *
 * The root node is the <svg> itself; its children become the icon's inner SVG.
 * Component names are only unique within a set (fa/FaBell and fa6/FaBell both exist), so
 * `name` is "<set>-<rest>" where <rest> is the component name minus its set prefix:
 * fa/FaBeer -> "fa-beer", fa6/FaBeer -> "fa6-beer", hi2/HiOutlineBell -> "hi2-outline-bell".
 * react-icons ships no categories or tags.
 */

const ICON_FUNCTION = /export function (\w+)\s*\(props\)\s*\{\s*return GenIcon\(/g;

function toNode(value: JsValue): SvgNode {
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.tag !== "string") {
    throw new Error("GenIcon node is missing a tag");
  }
  const child = Array.isArray(value.child) ? value.child.map(toNode) : [];
  return { tag: value.tag, attr: toSvgAttrs(value.attr), child };
}

function iconName(set: string, importName: string): string {
  // Set ids map to component prefixes: fa6 -> "Fa", lia -> "Lia", hi2 -> "Hi".
  const base = set.replace(/\d+$/, "");
  const prefix = base.charAt(0).toUpperCase() + base.slice(1);
  const rest = importName.startsWith(prefix) ? importName.slice(prefix.length) : importName;
  return `${set}-${toKebabCase(rest)}`;
}

export function parseSetFile(set: string, src: string): RawIcon[] {
  const icons: RawIcon[] = [];
  for (const match of src.matchAll(ICON_FUNCTION)) {
    const importName = match[1]!;
    const root = toNode(new LiteralCursor(src, match.index + match[0].length).value());
    icons.push({
      name: iconName(set, importName),
      importName,
      importPath: `react-icons/${set}`,
      set,
      categories: [],
      tags: [],
      svg: renderSvg(root.child),
    });
  }
  return icons;
}

export function parseIcons(packageDir: string): RawIcon[] {
  const icons: RawIcon[] = [];
  const sets = readdirSync(packageDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "lib")
    .map((entry) => entry.name)
    .sort();
  for (const set of sets) {
    const file = join(packageDir, set, "index.mjs");
    if (!existsSync(file)) continue;
    icons.push(...parseSetFile(set, readFileSync(file, "utf8")));
  }
  return icons;
}
