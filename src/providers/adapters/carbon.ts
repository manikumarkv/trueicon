import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { toKebabCase, type RawIcon } from "../adapter.js";
import { LiteralCursor } from "../jsLiteral.js";
import { renderSvg, toSvgAttrs, type SvgNode } from "../svg.js";

/*
 * @carbon/icons-react layout: the package barrel (es/index.js) re-exports every icon from
 * es/generated/bucket-<n>.js, each holding ~125 icons:
 *
 *   const Accessibility = /*#__PURE__*\/ React.forwardRef(function Accessibility({ children, size = 16, ...rest }, ref) {
 *     return React.createElement(Icon, { width: size, ..., ...rest },
 *       /* @__PURE__ *\/ jsx("path", { d: "..." }), /* @__PURE__ *\/ jsx("path", { d: "..." }), children);
 *   });
 *   ...
 *   export { Accessibility, ..., Object$1 as Object, _4K };
 *
 * The buckets are read instead of the per-icon es/<Name>.js modules because they carry the
 * barrel export names: es/Q/H.js and es/watson-health/*.js export local names ("H") that the
 * barrel publishes as "QH" and "WatsonHealth...".
 *
 * A few icons nest elements: jsx("switch", { children: jsxs("g", { children: [jsx(...), ...] }) }).
 * Variants are separate exports suffixed Filled, Alt or Color; they get that suffix as their
 * style, while base icons have no style. Carbon ships no categories.
 */

const BUCKETS_DIR = join("es", "generated");
const ICON_DEF = /const ([\w$]+) = \/\*#__PURE__\*\/ React\.forwardRef\(/g;
const EXPORTS = /export\s*\{([^}]*)\}/;
const JSX_CALL = /(?<![\w$])(jsx|jsxs)\s*\(/g;
const STYLE_SUFFIX = /(Filled|Alt|Color)$/;

// Parses a compiled `jsx("tag", { ...attrs, children })` call, recursing into `children`.
export function parseJsxElement(cursor: LiteralCursor): SvgNode {
  const fn = cursor.identifier();
  if (fn !== "jsx" && fn !== "jsxs") cursor.fail(`expected jsx call, got ${fn}`);
  cursor.expect("(");
  const tag = cursor.string();
  cursor.expect(",");
  const attr: Record<string, string | number> = {};
  const child: SvgNode[] = [];
  cursor.expect("{");
  while (!cursor.eat("}")) {
    const ch = cursor.peek();
    const key = ch === '"' || ch === "'" ? cursor.string() : cursor.identifier();
    cursor.expect(":");
    if (key === "children") {
      if (cursor.eat("[")) {
        while (!cursor.eat("]")) {
          child.push(parseJsxElement(cursor));
          if (!cursor.eat(",") && cursor.peek() !== "]") cursor.fail('expected "," or "]"');
        }
      } else {
        child.push(parseJsxElement(cursor));
      }
    } else {
      Object.assign(attr, toSvgAttrs({ [key]: cursor.value() }));
    }
    if (!cursor.eat(",") && cursor.peek() !== "}") cursor.fail('expected "," or "}"');
  }
  cursor.expect(")");
  return { tag, attr, child };
}

// Parses every top-level jsx call in `src`, skipping calls nested inside one already parsed.
export function parseJsxElements(src: string): SvgNode[] {
  const nodes: SvgNode[] = [];
  let consumedEnd = 0;
  for (const match of src.matchAll(JSX_CALL)) {
    if (match.index < consumedEnd) continue;
    const cursor = new LiteralCursor(src, match.index);
    nodes.push(parseJsxElement(cursor));
    consumedEnd = cursor.pos;
  }
  return nodes;
}

// Maps local binding names to exported names from the bucket's `export { a, b$1 as b }` clause.
function exportNames(src: string): Map<string, string> {
  const clause = EXPORTS.exec(src);
  if (!clause) throw new Error("export clause not found");
  const names = new Map<string, string>();
  for (const spec of clause[1]!.split(",").map((s) => s.trim()).filter(Boolean)) {
    const [local, exported = local] = spec.split(/\s+as\s+/);
    names.set(local!, exported);
  }
  return names;
}

export function parseBucket(src: string): { importName: string; nodes: SvgNode[] }[] {
  const exported = exportNames(src);
  const defs = [...src.matchAll(ICON_DEF)];
  return defs.map((def, i) => {
    const importName = exported.get(def[1]!);
    if (!importName) throw new Error(`icon ${def[1]} is not exported`);
    const body = src.slice(def.index, defs[i + 1]?.index ?? src.length);
    return { importName, nodes: parseJsxElements(body) };
  });
}

// "Airport_01" -> "airport-01", "_4K" -> "4-k" (a leading underscore only makes a valid identifier).
function iconName(identifier: string): string {
  return toKebabCase(identifier.replace(/^_/, "")).replace(/_/g, "-");
}

export function parseIcons(packageDir: string): RawIcon[] {
  const dir = join(packageDir, BUCKETS_DIR);
  const icons: RawIcon[] = [];
  const files = readdirSync(dir).filter((f) => /^bucket-\d+\.js$/.test(f));
  for (const file of files.sort()) {
    for (const { importName, nodes } of parseBucket(readFileSync(join(dir, file), "utf8"))) {
      const suffix = STYLE_SUFFIX.exec(importName)?.[1];
      const style = suffix && suffix !== importName ? toKebabCase(suffix) : undefined;
      const base = style ? importName.slice(0, -suffix!.length) : importName;
      icons.push({
        name: style ? `${iconName(base)}-${style}` : iconName(base),
        importName,
        importPath: "@carbon/icons-react",
        style,
        set: "carbon",
        categories: [],
        tags: [],
        svg: renderSvg(nodes),
      });
    }
  }
  return icons;
}
