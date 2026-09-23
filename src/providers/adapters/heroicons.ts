import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { toKebabCase, type RawIcon } from "../adapter.js";
import { LiteralCursor } from "../jsLiteral.js";
import { renderSvg, toSvgAttrs, type SvgNode } from "../svg.js";

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

function subdirs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export function parseIcons(packageDir: string): RawIcon[] {
  const icons: RawIcon[] = [];
  for (const size of subdirs(packageDir).filter((d) => /^\d+$/.test(d))) {
    for (const style of subdirs(join(packageDir, size))) {
      const esmDir = join(packageDir, size, style, "esm");
      if (!existsSync(esmDir)) continue;
      for (const file of readdirSync(esmDir).filter((f) => /^\w+Icon\.js$/.test(f)).sort()) {
        const importName = file.slice(0, -".js".length);
        const nodes = parseIconFile(readFileSync(join(esmDir, file), "utf8"));
        icons.push({
          name: `${toKebabCase(importName.slice(0, -"Icon".length))}-${size}-${style}`,
          importName,
          importPath: `@heroicons/react/${size}/${style}`,
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
}
