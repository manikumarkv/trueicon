import { readFileSync } from "node:fs";
import { join } from "node:path";
import { toKebabCase, type RawIcon } from "../adapter.js";
import { LiteralCursor, type JsValue } from "../jsLiteral.js";
import { renderSvg, toSvgAttrs, type SvgNode } from "../svg.js";

/*
 * @radix-ui/react-icons layout: every icon is in one ESM bundle, dist/react-icons.esm.js:
 *
 *   var TrashIcon = /*#__PURE__*\/forwardRef(function (_ref, forwardedRef) {
 *     var _ref$color = _ref.color, color = ...;
 *     return createElement("svg", Object.assign({ width: "15", ... }, props, {
 *       ref: forwardedRef
 *     }), createElement("path", { d: "...", fill: color, fillRule: "evenodd", clipRule: "evenodd" }));
 *   });
 *   ...
 *   export { AccessibilityIcon, ..., ZoomOutIcon };
 *
 * Releases before 1.1 declare plain function components (`var TrashIcon = function TrashIcon(_ref)`)
 * and pass the svg props as `Object.assign({...}, props)`, without the forwarded ref.
 *
 * The children of the root <svg> follow its props. Their `fill: color` references the component's
 * color prop, which defaults to currentColor. Every export ends in "Icon", which is dropped from
 * the name. Names come from manifest.json, which lists every icon's kebab name, so TrashIcon ->
 * trash and GitHubLogoIcon -> github-logo; without a manifest they are derived from the export
 * name. Radix ships no styles or categories.
 */

const BUNDLE = join("dist", "react-icons.esm.js");
const ICON_DEF = /var ([\w$]+) = (?:\/\*#__PURE__\*\/\s*(?:[\w$]+\.)?forwardRef\()?function\b/g;
const SVG_PROPS_END = /\},\s*props(?:,\s*\{\s*ref:\s*forwardedRef\s*\})?\s*\)/g;
const EXPORTS = /export\s*\{([^}]*)\}/;

// Reads an attribute value; the `color` prop binding stands for its default, currentColor.
function readAttrValue(cursor: LiteralCursor): JsValue {
  if (/[A-Za-z_$]/.test(cursor.peek() ?? "")) {
    const start = cursor.pos;
    if (cursor.identifier() === "color") return "currentColor";
    cursor.pos = start;
  }
  return cursor.value();
}

// Parses `createElement("tag", {attrs}, ...children)`, reading `color` identifiers as currentColor.
function parseElement(cursor: LiteralCursor): SvgNode {
  const callee = cursor.identifier();
  if (callee !== "createElement") cursor.expect(".createElement");
  cursor.expect("(");
  const tag = cursor.string();
  cursor.expect(",");
  const attrs: Record<string, JsValue> = {};
  cursor.expect("{");
  while (!cursor.eat("}")) {
    const ch = cursor.peek();
    const key = ch === '"' || ch === "'" ? cursor.string() : cursor.identifier();
    cursor.expect(":");
    attrs[key] = readAttrValue(cursor);
    if (!cursor.eat(",") && cursor.peek() !== "}") cursor.fail('expected "," or "}"');
  }
  const child: SvgNode[] = [];
  while (cursor.eat(",")) child.push(parseElement(cursor));
  cursor.expect(")");
  return { tag, attr: toSvgAttrs(attrs), child };
}

// Parses the root <svg> children of each exported icon in the bundle.
export function parseBundle(src: string): { importName: string; nodes: SvgNode[] }[] {
  const clause = EXPORTS.exec(src);
  if (!clause) throw new Error("export clause not found");
  const exported = new Set(clause[1]!.split(",").map((s) => s.trim()));
  const icons: { importName: string; nodes: SvgNode[] }[] = [];
  for (const def of src.matchAll(ICON_DEF)) {
    const importName = def[1]!;
    if (!exported.has(importName)) continue;
    SVG_PROPS_END.lastIndex = def.index;
    const propsEnd = SVG_PROPS_END.exec(src);
    if (!propsEnd) throw new Error(`${importName}: root <svg> props not found`);
    const cursor = new LiteralCursor(src, propsEnd.index + propsEnd[0].length);
    const nodes: SvgNode[] = [];
    while (cursor.eat(",")) nodes.push(parseElement(cursor));
    cursor.expect(")");
    icons.push({ importName, nodes });
  }
  return icons;
}

// Maps "githublogo" (a name with case and dashes removed) to its manifest name "github-logo".
function manifestNames(packageDir: string): Map<string, string> {
  const names = new Map<string, string>();
  let manifest: { icons?: Record<string, Record<string, string>> };
  try {
    manifest = JSON.parse(readFileSync(join(packageDir, "manifest.json"), "utf8"));
  } catch {
    return names;
  }
  for (const size of Object.values(manifest.icons ?? {})) {
    for (const name of Object.keys(size)) names.set(name.replace(/-/g, ""), name);
  }
  return names;
}

export function parseIcons(packageDir: string): RawIcon[] {
  const names = manifestNames(packageDir);
  return parseBundle(readFileSync(join(packageDir, BUNDLE), "utf8")).map(({ importName, nodes }) => ({
    name: names.get(importName.replace(/Icon$/, "").toLowerCase()) ?? toKebabCase(importName.replace(/Icon$/, "")),
    importName,
    importPath: "@radix-ui/react-icons",
    set: "radix",
    categories: [],
    tags: [],
    svg: renderSvg(nodes),
  }));
}
