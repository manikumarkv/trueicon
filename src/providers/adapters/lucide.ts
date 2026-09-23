import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RawIcon } from "../adapter.js";
import { LiteralCursor } from "../jsLiteral.js";
import { renderSvg, toSvgAttrs, type SvgNode } from "../svg.js";

/*
 * lucide-react layout: dist/esm/icons/<kebab-name>.js, one ESM module per icon:
 *
 *   const Trash2 = createLucideIcon("Trash2", [["path", { d: "...", key: "..." }], ...]);
 *
 * Deprecated alias names ship as re-export modules (`export { default } from './target.js'`);
 * they are not indexed separately but added to the target icon's tags so old names still match.
 * lucide-react ships no categories or tags of its own.
 */

const ICONS_DIR = join("dist", "esm", "icons");
const CREATE_CALL = /createLucideIcon\(\s*/;
const ALIAS_EXPORT = /export\s*\{\s*default\s*\}\s*from\s*['"]\.\/([\w-]+)\.js['"]/;

function parseNodes(cursor: LiteralCursor): SvgNode[] {
  const nodes = cursor.array();
  return nodes.map((node) => {
    if (!Array.isArray(node) || typeof node[0] !== "string") cursor.fail("expected [tag, attrs]");
    return { tag: node[0], attr: toSvgAttrs(node[1]), child: [] };
  });
}

export function parseIcons(packageDir: string): RawIcon[] {
  const dir = join(packageDir, ICONS_DIR);
  const icons = new Map<string, RawIcon>();
  const aliases: [alias: string, target: string][] = [];

  for (const file of readdirSync(dir).filter((f) => f.endsWith(".js")).sort()) {
    const name = file.slice(0, -".js".length);
    const src = readFileSync(join(dir, file), "utf8");
    const call = CREATE_CALL.exec(src);
    if (!call) {
      const alias = ALIAS_EXPORT.exec(src);
      if (alias) aliases.push([name, alias[1]!]);
      continue;
    }
    const cursor = new LiteralCursor(src, call.index + call[0].length);
    const importName = cursor.string();
    cursor.expect(",");
    icons.set(name, {
      name,
      importName,
      importPath: "lucide-react",
      style: "outline",
      set: "lucide",
      categories: [],
      tags: [],
      svg: renderSvg(parseNodes(cursor)),
    });
  }

  for (const [alias, target] of aliases) icons.get(target)?.tags?.push(alias);
  return [...icons.values()];
}
