import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { toKebabCase, type RawIcon } from "../adapter.js";
import { LiteralCursor } from "../jsLiteral.js";
import { parseCreateElement, renderSvg, type SvgNode } from "../svg.js";

/*
 * @phosphor-icons/react layout: one component module per icon in dist/csr/<Name>.es.js, which
 * exports "<Name>Icon" (plus a deprecated "<Name>" and sometimes alias names such as
 * "FolderNotchIcon" from Folder.es.js), and its SVG per weight in dist/defs/<Name>.es.js:
 *
 *   const a = new Map([
 *     ["bold", e.createElement(e.Fragment, null, e.createElement("path", { d: "..." }), ...)],
 *     ["duotone", ...], ["fill", ...], ["light", ...], ["regular", ...], ["thin", ...]
 *   ]);
 *
 * All weights share one component and are picked with its `weight` prop, so each weight is
 * indexed as its own record with `style` set to the weight. The default weight keeps the plain
 * name ("acorn") and the others get a suffix ("acorn-bold"), so the default sorts first.
 * Alias export names are added to the tags. Phosphor ships no categories.
 */

const CSR_DIR = join("dist", "csr");
const DEFS_DIR = join("dist", "defs");
const DEFAULT_WEIGHT = "regular";
const WEIGHT_MAP = /new Map\(\s*/;
const ICON_EXPORT = /\bas (\w+)Icon\b/g;

export function parseWeights(src: string): [weight: string, nodes: SvgNode[]][] {
  const map = WEIGHT_MAP.exec(src);
  if (!map) throw new Error("weights Map not found");
  const cursor = new LiteralCursor(src, map.index + map[0].length);
  const weights: [string, SvgNode[]][] = [];
  cursor.expect("[");
  while (cursor.eat("[")) {
    const weight = cursor.string();
    cursor.expect(",");
    // The Fragment wrapper: <ns>.createElement(<ns>.Fragment, null, ...children).
    cursor.identifier();
    cursor.expect(".createElement(");
    cursor.identifier();
    cursor.expect(".Fragment,");
    cursor.expect("null");
    const nodes: SvgNode[] = [];
    while (cursor.eat(",")) nodes.push(parseCreateElement(cursor));
    cursor.expect(")");
    cursor.expect("]");
    weights.push([weight, nodes]);
    cursor.eat(",");
  }
  cursor.expect("]");
  return weights;
}

export function parseIcons(packageDir: string): RawIcon[] {
  const icons: RawIcon[] = [];
  const files = readdirSync(join(packageDir, CSR_DIR)).filter((f) => f.endsWith(".es.js"));
  for (const file of files.sort()) {
    const component = file.slice(0, -".es.js".length);
    const importName = `${component}Icon`;
    const src = readFileSync(join(packageDir, CSR_DIR, file), "utf8");
    const aliases = [...src.matchAll(ICON_EXPORT)].map((m) => m[1]!).filter((name) => name !== component);
    const base = toKebabCase(component);
    const weights = parseWeights(readFileSync(join(packageDir, DEFS_DIR, file), "utf8"));
    for (const [weight, nodes] of weights) {
      icons.push({
        name: weight === DEFAULT_WEIGHT ? base : `${base}-${weight}`,
        importName,
        importPath: "@phosphor-icons/react",
        style: weight,
        set: "phosphor",
        categories: [],
        tags: aliases.map(toKebabCase),
        svg: renderSvg(nodes),
      });
    }
  }
  return icons;
}
