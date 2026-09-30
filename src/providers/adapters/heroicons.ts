import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { toKebabCase, type RawIcon } from "../adapter.js";
import { LiteralCursor } from "../jsLiteral.js";
import { renderSvg, toSvgAttrs, type SvgNode } from "../svg.js";
import { parseVNodes } from "./vue.js";

/*
 * @heroicons/react layout: <size>/<style>/esm/<Name>Icon.js (24/outline, 24/solid, 20/solid,
 * 16/solid), one compiled component per file:
 *
 *   return React.createElement("svg", Object.assign({...}, props),
 *     title ? React.createElement("title", {id: titleId}, title) : null,
 *     React.createElement("path", {strokeLinecap: "round", d: "..."}), ...);
 *
 * The children after the optional <title> are the icon's inner SVG (they may nest, e.g.
 * <g>/<defs>). The same icon exists in every variant, so `name` carries the variant to stay
 * unique: 24/outline/TrashIcon -> "trash-24-outline". The top-level outline/ and solid/ dirs
 * are v1 compatibility stubs and are skipped. Heroicons ships no categories or tags.
 *
 * @heroicons/vue has the same directory layout, with a compiled Vue render function per file:
 *
 *   return (_openBlock(), _createElementBlock("svg", { viewBox: "0 0 24 24", ... }, [
 *     _createElementVNode("path", { "stroke-linecap": "round", d: "..." }) ]))
 */

const TITLE_CHILD = /title \? [^:]*?React\.createElement\("title",[\s\S]*?\) : null/;

function parseElement(cursor: LiteralCursor): SvgNode {
  cursor.expect("React.createElement(");
  const tag = cursor.string();
  cursor.expect(",");
  const attr = toSvgAttrs(cursor.value());
  const child: SvgNode[] = [];
  while (cursor.eat(",")) child.push(parseElement(cursor));
  cursor.expect(")");
  return { tag, attr, child };
}

export function parseIconFile(src: string): SvgNode[] {
  const title = TITLE_CHILD.exec(src);
  if (!title) throw new Error("svg <title> child not found");
  const cursor = new LiteralCursor(src, title.index + title[0].length);
  const nodes: SvgNode[] = [];
  while (cursor.eat(",")) nodes.push(parseElement(cursor));
  cursor.expect(")");
  return nodes;
}

const VUE_SVG = /createElementBlock\(\s*"svg"\s*,\s*/;

export function parseVueIconFile(src: string): SvgNode[] {
  const svg = VUE_SVG.exec(src);
  if (!svg) throw new Error('createElementBlock("svg", ...) not found');
  const cursor = new LiteralCursor(src, svg.index + svg[0].length);
  cursor.object();
  cursor.expect(",");
  return parseVNodes(cursor);
}

function subdirs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function parser(pkg: string, parseFile: (src: string) => SvgNode[]) {
  return (packageDir: string): RawIcon[] => {
    const icons: RawIcon[] = [];
    for (const size of subdirs(packageDir).filter((d) => /^\d+$/.test(d))) {
      for (const style of subdirs(join(packageDir, size))) {
        const esmDir = join(packageDir, size, style, "esm");
        if (!existsSync(esmDir)) continue;
        for (const file of readdirSync(esmDir).filter((f) => /^\w+Icon\.js$/.test(f)).sort()) {
          const importName = file.slice(0, -".js".length);
          let nodes: SvgNode[];
          try {
            nodes = parseFile(readFileSync(join(esmDir, file), "utf8"));
          } catch (err) {
            throw new Error(`${size}/${style}/${file}: ${(err as Error).message}`, { cause: err });
          }
          icons.push({
            name: `${toKebabCase(importName.slice(0, -"Icon".length))}-${size}-${style}`,
            importName,
            importPath: `${pkg}/${size}/${style}`,
            style,
            set: "heroicons",
            categories: [],
            tags: [],
            svg: renderSvg(nodes),
          });
        }
      }
    }
    return icons;
  };
}

export const parseIcons = parser("@heroicons/react", parseIconFile);
export const parseHeroiconsVue = parser("@heroicons/vue", parseVueIconFile);
