import type { JsValue, LiteralCursor } from "./jsLiteral.js";

export interface SvgNode {
  tag: string;
  attr: Record<string, string | number>;
  child: SvgNode[];
}

// SVG attributes whose names are camelCase in SVG itself, so React names must be kept as-is.
const CASE_SENSITIVE_ATTRS = new Set([
  "viewBox",
  "preserveAspectRatio",
  "baseProfile",
  "pathLength",
  "textLength",
  "lengthAdjust",
  "startOffset",
  "spreadMethod",
  "gradientUnits",
  "gradientTransform",
  "patternUnits",
  "patternContentUnits",
  "patternTransform",
  "clipPathUnits",
  "maskUnits",
  "maskContentUnits",
  "filterUnits",
  "primitiveUnits",
  "markerUnits",
  "markerWidth",
  "markerHeight",
  "refX",
  "refY",
  "stdDeviation",
  "baseFrequency",
  "numOctaves",
  "stitchTiles",
  "kernelMatrix",
  "kernelUnitLength",
  "tableValues",
  "surfaceScale",
  "specularConstant",
  "specularExponent",
  "diffuseConstant",
  "edgeMode",
  "targetX",
  "targetY",
  "xChannelSelector",
  "yChannelSelector",
  "limitingConeAngle",
  "pointsAtX",
  "pointsAtY",
  "pointsAtZ",
  "attributeName",
  "attributeType",
  "repeatCount",
  "calcMode",
  "keyTimes",
  "keySplines",
]);

const SPECIAL_ATTRS: Record<string, string> = {
  className: "class",
  xlinkHref: "xlink:href",
  xmlnsXlink: "xmlns:xlink",
  xmlSpace: "xml:space",
};

// React-only props that are not SVG attributes.
const DROPPED_ATTRS = new Set(["key", "ref", "children"]);

// Maps a React prop name (strokeWidth) to its SVG attribute name (stroke-width).
export function svgAttrName(reactName: string): string {
  if (SPECIAL_ATTRS[reactName]) return SPECIAL_ATTRS[reactName];
  if (CASE_SENSITIVE_ATTRS.has(reactName)) return reactName;
  return reactName.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

// Serializes nodes to SVG markup, e.g. [{tag: "path", attr: {d: "M0 0"}}] -> '<path d="M0 0"/>'.
export function renderSvg(nodes: readonly SvgNode[]): string {
  return nodes
    .map((node) => {
      const attrs = Object.entries(node.attr)
        .filter(([name]) => !DROPPED_ATTRS.has(name))
        .map(([name, value]) => ` ${svgAttrName(name)}="${escapeAttr(String(value))}"`)
        .join("");
      return node.child.length > 0
        ? `<${node.tag}${attrs}>${renderSvg(node.child)}</${node.tag}>`
        : `<${node.tag}${attrs}/>`;
    })
    .join("");
}

// Keeps only string/number attribute values from a parsed object literal.
export function toSvgAttrs(value: JsValue | undefined): Record<string, string | number> {
  const attrs: Record<string, string | number> = {};
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, v] of Object.entries(value)) {
      if (typeof v === "string" || typeof v === "number") attrs[key] = v;
    }
  }
  return attrs;
}

// Parses a compiled `<ns>.createElement("tag", {attrs} | null, ...children)` call (any namespace
// identifier, e.g. "React" or a minified "e"), recursing into element children.
export function parseCreateElement(cursor: LiteralCursor): SvgNode {
  cursor.identifier();
  cursor.expect(".createElement(");
  const tag = cursor.string();
  cursor.expect(",");
  const attr = toSvgAttrs(cursor.value());
  const child: SvgNode[] = [];
  while (cursor.eat(",")) child.push(parseCreateElement(cursor));
  cursor.expect(")");
  return { tag, attr, child };
}
