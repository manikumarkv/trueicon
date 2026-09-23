import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { toKebabCase, type RawIcon } from "../adapter.js";
import { LiteralCursor } from "../jsLiteral.js";
import { parseCreateElement, renderSvg, type SvgNode } from "../svg.js";

/*
 * iconoir-react layout: dist/esm/regular/<Name>.mjs and dist/esm/solid/<Name>.mjs, one minified
 * component per file whose render returns
 *
 *   n.createElement("svg", t({width: "1.5em", viewBox: "0 0 24 24", ...}, p),
 *     n.createElement("path", {d: "...", stroke: "currentColor", strokeLinecap: "round"}), ...)
 *
 * where `t(..., p)` merges the default attributes with context and props. That root call holds
 * non-literals (`ref: o`), so it is skipped; the children after it are the icon's inner SVG.
 * The package root re-exports regular icons as "<Name>" and solid ones as "<Name>Solid", so
 * solid icons are named "<name>-solid" to stay unique. The index.mjs barrels are skipped.
 * Iconoir ships no categories or tags.
 */

const VARIANTS = [
  { dir: "regular", suffix: "" },
  { dir: "solid", suffix: "Solid" },
];
const SVG_CALL = /\w+\.createElement\(\s*"svg"\s*,\s*\w+\(\s*\{[^}]*\}\s*,\s*\w+\s*\)/;

export function parseIconFile(src: string): SvgNode[] {
  const call = SVG_CALL.exec(src);
  if (!call) throw new Error("svg createElement call not found");
  const cursor = new LiteralCursor(src, call.index + call[0].length);
  const nodes: SvgNode[] = [];
  while (cursor.eat(",")) nodes.push(parseCreateElement(cursor));
  cursor.expect(")");
  return nodes;
}

export function parseIcons(packageDir: string): RawIcon[] {
  const icons: RawIcon[] = [];
  for (const { dir, suffix } of VARIANTS) {
    const variantDir = join(packageDir, "dist", "esm", dir);
    if (!existsSync(variantDir)) continue;
    for (const file of readdirSync(variantDir).filter((f) => /^[A-Z]\w*\.mjs$/.test(f)).sort()) {
      const component = file.slice(0, -".mjs".length);
      const importName = component + suffix;
      icons.push({
        name: toKebabCase(importName),
        importName,
        importPath: "iconoir-react",
        style: dir,
        set: "iconoir",
        categories: [],
        tags: [],
        svg: renderSvg(parseIconFile(readFileSync(join(variantDir, file), "utf8"))),
      });
    }
  }
  return icons;
}
