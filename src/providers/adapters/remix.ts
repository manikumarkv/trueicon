import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { toKebabCase, type RawIcon } from "../adapter.js";
import { LiteralCursor } from "../jsLiteral.js";
import { parseCreateElement, renderSvg, type SvgNode } from "../svg.js";

/*
 * @remixicon/react layout: every icon is in one minified ESM bundle, index.mjs:
 *
 *   import t from"react";const s=({color:C="currentColor",size:e=24,className:l,...i})=>t.createElement("svg",
 *     {viewBox:"0 0 24 24",...,fill:C,...i,className:"remixicon "+(l||"")},t.createElement("path",{d:"..."})),r=...;
 *   export{s as Ri24HoursFill, ..., nF as RiZzzLine};
 *
 * The local names are minified and mapped to export names through the export clause. The root
 * <svg> props hold spreads and expressions and are skipped; its children are plain createElement
 * calls. Releases before 4.1 ship only a UMD bundle, index.js, with the same icon definitions and
 * exports assigned as `s.RiZzzLine=mz`. Export names are Ri<Name><Style> with style Line or Fill; a few icons (editor icons such
 * as RiBold) have neither. The Ri prefix is dropped from the name: RiDeleteBinLine ->
 * delete-bin-line. Remix Icon's React package ships no categories.
 */

const BUNDLES = ["index.mjs", "index.js"];
const ICON_DEF = /([\w$]+)=\(\{[^}]*\}\)=>[\w$]+\.createElement\(\s*"svg"\s*,\s*\{[^}]*\}/g;
const EXPORTS = /export\s*\{([^}]*)\}/;
const UMD_EXPORT = /[\w$]+\.(Ri\w+)=([\w$]+)/g;
const STYLE_SUFFIX = /(Line|Fill)$/;

// Maps local binding names to exported names from the bundle's `export{a as B,...}` clause, or
// from the UMD bundle's `s.RiBold=a` assignments.
function exportNames(src: string): Map<string, string> {
  const names = new Map<string, string>();
  const clause = EXPORTS.exec(src);
  if (!clause) {
    for (const [, exported, local] of src.matchAll(UMD_EXPORT)) names.set(local!, exported!);
    if (names.size === 0) throw new Error("no exports found");
    return names;
  }
  for (const spec of clause[1]!.split(",").map((s) => s.trim()).filter(Boolean)) {
    const [local, exported = local] = spec.split(/\s+as\s+/);
    names.set(local!, exported);
  }
  return names;
}

// Parses the root <svg> children of each exported icon in the bundle.
export function parseBundle(src: string): { importName: string; nodes: SvgNode[] }[] {
  const exported = exportNames(src);
  const icons: { importName: string; nodes: SvgNode[] }[] = [];
  for (const def of src.matchAll(ICON_DEF)) {
    const importName = exported.get(def[1]!);
    if (!importName?.startsWith("Ri")) continue;
    const cursor = new LiteralCursor(src, def.index + def[0].length);
    const nodes: SvgNode[] = [];
    while (cursor.eat(",")) nodes.push(parseCreateElement(cursor));
    cursor.expect(")");
    icons.push({ importName, nodes });
  }
  return icons;
}

export function parseIcons(packageDir: string): RawIcon[] {
  const bundle = BUNDLES.map((file) => join(packageDir, file)).find((path) => existsSync(path));
  if (!bundle) throw new Error(`none of ${BUNDLES.join(", ")} found`);
  return parseBundle(readFileSync(bundle, "utf8")).map(({ importName, nodes }) => {
    const style = STYLE_SUFFIX.exec(importName)?.[1];
    return {
      name: toKebabCase(importName.slice(2)),
      importName,
      importPath: "@remixicon/react",
      style: style?.toLowerCase(),
      set: "remix",
      categories: [],
      tags: [],
      svg: renderSvg(nodes),
    };
  });
}
