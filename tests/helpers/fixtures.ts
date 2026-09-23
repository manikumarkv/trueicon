import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// Writes { relativePath: contents } into a fresh temp dir and returns its path.
export function makePackageDir(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "trueicon-fixture-"));
  for (const [rel, contents] of Object.entries(files)) {
    const path = join(root, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }
  return root;
}

const lucideIcon = (importName: string, nodes: string) =>
  `import createLucideIcon from '../createLucideIcon.js';\n\n` +
  `const ${importName} = createLucideIcon("${importName}", ${nodes});\n\n` +
  `export { ${importName} as default };\n`;

// Minimal lucide-react layout: dist/esm/icons/<kebab>.js plus one deprecated alias module.
export const LUCIDE_FILES: Record<string, string> = {
  "package.json": `{"name":"lucide-react","version":"0.460.0"}`,
  "dist/esm/icons/trash-2.js": lucideIcon(
    "Trash2",
    `[["path", { d: "M3 6h18", key: "d0wm0j" }], ["line", { x1: "10", x2: "10", y1: "11", y2: "17", key: "1uufr5" }]]`,
  ),
  "dist/esm/icons/arrow-down.js": lucideIcon("ArrowDown", `[["path", { d: "M12 5v14", key: "s699le" }]]`),
  "dist/esm/icons/trash-can.js": `export { default } from './trash-2.js';\n`,
};

const heroIcon = (importName: string, children: string) =>
  `import * as React from "react";\n` +
  `function ${importName}({ title, titleId, ...props }, svgRef) {\n` +
  `  return /*#__PURE__*/React.createElement("svg", Object.assign({\n` +
  `    xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", "aria-hidden": "true", ref: svgRef, "aria-labelledby": titleId\n` +
  `  }, props), title ? /*#__PURE__*/React.createElement("title", {\n` +
  `    id: titleId\n` +
  `  }, title) : null, ${children});\n` +
  `}\n` +
  `const ForwardRef = /*#__PURE__*/ React.forwardRef(${importName});\n` +
  `export default ForwardRef;\n`;

const heroPath = (d: string) =>
  `/*#__PURE__*/React.createElement("path", {\n    strokeLinecap: "round",\n    strokeLinejoin: "round",\n    d: "${d}"\n  })`;

// Minimal @heroicons/react layout, including a v1 compatibility stub dir that must be skipped.
export const HEROICONS_FILES: Record<string, string> = {
  "package.json": `{"name":"@heroicons/react","version":"2.1.5"}`,
  "24/outline/esm/TrashIcon.js": heroIcon("TrashIcon", heroPath("m14.74 9-.346 9")),
  "24/outline/esm/ArrowDownIcon.js": heroIcon("ArrowDownIcon", heroPath("M19.5 13.5 12 21")),
  "24/outline/esm/index.js": `export { default as TrashIcon } from './TrashIcon.js';\n`,
  "20/solid/esm/TrashIcon.js": heroIcon(
    "TrashIcon",
    `/*#__PURE__*/React.createElement("g", {\n    clipPath: "url(#a)"\n  }, ${heroPath("M8.75 1A2.75")})`,
  ),
  "outline/index.js": `throw new Error("v1 stub");\n`,
};

// Minimal react-icons layout: two sets with a clashing component name, plus the lib/ dir.
export const REACT_ICONS_FILES: Record<string, string> = {
  "package.json": `{"name":"react-icons","version":"5.4.0"}`,
  "lib/index.mjs": `export function GenIcon() {}\n`,
  "fa/index.mjs":
    `// THIS FILE IS AUTO GENERATED\nimport { GenIcon } from '../lib/index.mjs';\n` +
    `export function FaBeer (props) {\n  return GenIcon({"tag":"svg","attr":{"viewBox":"0 0 448 512"},"child":[{"tag":"path","attr":{"d":"M368 96h-48"},"child":[]}]})(props);\n};\n` +
    `export function FaBell (props) {\n  return GenIcon({"tag":"svg","attr":{"viewBox":"0 0 448 512"},"child":[{"tag":"path","attr":{"d":"M224 512c35"},"child":[]}]})(props);\n};\n`,
  "fa6/index.mjs":
    `import { GenIcon } from '../lib/index.mjs';\n` +
    `export function FaBell (props) {\n  return GenIcon({"tag":"svg","attr":{"viewBox":"0 0 448 512"},"child":[{"tag":"path","attr":{"d":"M224 0c-17"},"child":[]}]})(props);\n};\n`,
  "hi2/index.mjs":
    `import { GenIcon } from '../lib/index.mjs';\n` +
    `export function HiOutlineTrash (props) {\n  return GenIcon({"tag":"svg","attr":{"fill":"none","viewBox":"0 0 24 24","strokeWidth":"1.5"},"child":[{"tag":"path","attr":{"strokeLinecap":"round","d":"m14.74 9"},"child":[]}]})(props);\n};\n`,
};
