import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { toKebabCase, type RawIcon } from "../adapter.js";
import { LiteralCursor } from "../jsLiteral.js";
import { renderSvg, toSvgAttrs, type SvgNode } from "../svg.js";

/*
 * @mui/icons-material layout: <Name>.js at the package root, one CommonJS module per icon, with
 * the artwork passed to createSvgIcon as compiled JSX, either one element or an array of keyed
 * elements:
 *
 *   var _default = exports.default = (0, _createSvgIcon.default)(/*#__PURE__*\/(0, _jsxRuntime.jsx)("path", {
 *     d: "M6 19c0 1.1.9 2 2 2h8..."
 *   }), 'Delete');
 *
 *   ... (0, _createSvgIcon.default)([/*#__PURE__*\/(0, _jsxRuntime.jsx)("path", { d: "...", opacity: ".3" }, "0"), ...], 'DeleteTwoTone');
 *
 * A few icons nest elements through `children`, including React.Fragment wrappers, which are
 * flattened away. Each icon comes in five themes, exported as separate components: the base
 * name (Filled), and the Outlined, Rounded, Sharp and TwoTone suffixes. The base icons get the
 * style "filled". index.js, the utils/ helpers and the .mjs twins of each module are skipped.
 * MUI ships no categories.
 */

const MODULE_FILE = /^[A-Z]\w*\.js$/;
const CREATE_CALL = /\(0,\s*_createSvgIcon\.default\)\(/;
const THEME_SUFFIX = /(Outlined|Rounded|Sharp|TwoTone)$/;

// Parses `(0, _jsxRuntime.jsx)("tag" | React.Fragment, { ...attrs, children }, "key"?)`. Fragments
// return their children.
function parseJsx(cursor: LiteralCursor): SvgNode[] {
  cursor.expect("(");
  cursor.expect("0");
  cursor.expect(",");
  cursor.identifier();
  cursor.expect(".");
  const fn = cursor.identifier();
  if (fn !== "jsx" && fn !== "jsxs") cursor.fail(`expected jsx call, got ${fn}`);
  cursor.expect(")");
  cursor.expect("(");
  let tag: string | undefined;
  if (cursor.peek() === '"' || cursor.peek() === "'") {
    tag = cursor.string();
  } else {
    do cursor.identifier();
    while (cursor.eat("."));
  }
  cursor.expect(",");
  const attr: Record<string, string | number> = {};
  const child: SvgNode[] = [];
  cursor.expect("{");
  while (!cursor.eat("}")) {
    const ch = cursor.peek();
    const key = ch === '"' || ch === "'" ? cursor.string() : cursor.identifier();
    cursor.expect(":");
    if (key === "children") child.push(...parseChildren(cursor));
    else Object.assign(attr, toSvgAttrs({ [key]: cursor.value() }));
    if (!cursor.eat(",") && cursor.peek() !== "}") cursor.fail('expected "," or "}"');
  }
  if (cursor.eat(",")) cursor.value();
  cursor.expect(")");
  return tag === undefined ? child : [{ tag, attr, child }];
}

// Parses one jsx element or an array of them.
function parseChildren(cursor: LiteralCursor): SvgNode[] {
  if (!cursor.eat("[")) return parseJsx(cursor);
  const nodes: SvgNode[] = [];
  while (!cursor.eat("]")) {
    nodes.push(...parseJsx(cursor));
    if (!cursor.eat(",") && cursor.peek() !== "]") cursor.fail('expected "," or "]"');
  }
  return nodes;
}

/** Returns the SVG nodes and display name passed to createSvgIcon, or undefined for other modules. */
export function parseModule(src: string): { displayName: string; nodes: SvgNode[] } | undefined {
  const call = CREATE_CALL.exec(src);
  if (!call) return undefined;
  const cursor = new LiteralCursor(src, call.index + call[0].length);
  const nodes = parseChildren(cursor);
  cursor.expect(",");
  return { displayName: cursor.string(), nodes };
}

export function parseIcons(packageDir: string): RawIcon[] {
  const icons: RawIcon[] = [];
  for (const file of readdirSync(packageDir).filter((f) => MODULE_FILE.test(f)).sort()) {
    const importName = file.slice(0, -".js".length);
    let icon: ReturnType<typeof parseModule>;
    try {
      icon = parseModule(readFileSync(join(packageDir, file), "utf8"));
    } catch (err) {
      throw new Error(`${file}: ${(err as Error).message}`, { cause: err });
    }
    if (!icon) continue;
    const theme = THEME_SUFFIX.exec(importName)?.[1];
    icons.push({
      name: toKebabCase(importName),
      importName,
      importPath: "@mui/icons-material",
      style: theme && theme !== importName ? toKebabCase(theme) : "filled",
      set: "mui",
      categories: [],
      tags: [],
      svg: renderSvg(icon.nodes),
    });
  }
  return icons;
}
