import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RawIcon } from "../adapter.js";
import { LiteralCursor, type JsValue } from "../jsLiteral.js";
import { renderSvg } from "../svg.js";

/*
 * @fortawesome/free-{solid,regular,brands}-svg-icons layout: one CommonJS module per icon at the
 * package root, fa<Name>.js, holding the icon definition in plain vars:
 *
 *   var prefix = 'fas';
 *   var iconName = 'trash-can';
 *   var aliases = [61460,"trash-alt"];
 *   var svgPathData = 'M136.7 5.9C141.1...';
 *   ...
 *   exports.faTrashCan = exports.definition;
 *
 * Deprecated alias names ship as their own modules that re-export another icon
 * (`var source = require('./faTrashCan');`). They are not indexed separately; like the string
 * entries of `aliases` they are added to the target icon's tags so old names still match.
 * svgPathData is a string, or an array of [secondary, primary] strings for duotone icons.
 * Version 5 has no `aliases` var and ships renamed icons as full copies instead of re-exports,
 * so there every name is indexed as its own icon.
 *
 * The icons are rendered through @fortawesome/react-fontawesome (<FontAwesomeIcon icon={faTrash} />),
 * but the definitions are imported from the icon package itself. Each style is its own package,
 * so each is its own provider; they share this parser. Font Awesome ships no categories.
 */

const MODULE_FILE = /^fa[A-Z0-9]\w*\.js$/;
const EXPORT = /exports\.(fa\w+)\s*=\s*exports\.definition/;
const ALIAS_SOURCE = /require\(\s*['"]\.\/(fa\w+)(?:\.js)?['"]\s*\)/;

/** Reads the value assigned by `var <name> = ` in src, or undefined when there is none. */
function readVar(src: string, name: string): JsValue | undefined {
  const match = new RegExp(`var ${name}\\s*=\\s*`).exec(src);
  return match ? new LiteralCursor(src, match.index + match[0].length).value() : undefined;
}

// Renders svgPathData: one path, or the secondary and primary paths of a duotone icon.
export function pathsSvg(pathData: unknown): string {
  const paths = typeof pathData === "string" ? [pathData] : pathData;
  if (!Array.isArray(paths) || !paths.every((d) => typeof d === "string")) {
    throw new Error("svgPathData is neither a string nor an array of strings");
  }
  return renderSvg(paths.filter((d) => d).map((d) => ({ tag: "path", attr: { d }, child: [] })));
}

function kebabIconName(exportName: string): string {
  return exportName
    .slice(2)
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

export function parseModule(src: string): { importName: string; name: string; aliases: string[]; svg: string } {
  const importName = EXPORT.exec(src)?.[1];
  if (!importName) throw new Error("exports.fa<Name> = exports.definition not found");
  const name = readVar(src, "iconName");
  if (typeof name !== "string") throw new Error("iconName is not a string");
  const aliases = readVar(src, "aliases");
  return {
    importName,
    name,
    aliases: Array.isArray(aliases) ? aliases.filter((a): a is string => typeof a === "string") : [],
    svg: pathsSvg(readVar(src, "svgPathData")),
  };
}

function parser(importPath: string, style: string, set: string) {
  return (packageDir: string): RawIcon[] => {
    const icons = new Map<string, RawIcon>();
    const aliases: [alias: string, target: string][] = [];
    for (const file of readdirSync(packageDir).filter((f) => MODULE_FILE.test(f)).sort()) {
      const src = readFileSync(join(packageDir, file), "utf8");
      const aliasOf = ALIAS_SOURCE.exec(src)?.[1];
      if (aliasOf) {
        aliases.push([kebabIconName(file.slice(0, -".js".length)), aliasOf]);
        continue;
      }
      let icon: ReturnType<typeof parseModule>;
      try {
        icon = parseModule(src);
      } catch (err) {
        throw new Error(`${file}: ${(err as Error).message}`, { cause: err });
      }
      icons.set(icon.importName, {
        name: icon.name,
        importName: icon.importName,
        importPath,
        style,
        set,
        categories: [],
        tags: [...icon.aliases],
        svg: icon.svg,
      });
    }
    for (const [alias, target] of aliases) {
      const icon = icons.get(target);
      const tags = icon?.tags;
      if (tags && alias !== icon.name && !tags.includes(alias)) tags.push(alias);
    }
    return [...icons.values()];
  };
}

export const parseSolid = parser("@fortawesome/free-solid-svg-icons", "solid", "fontawesome");
export const parseRegular = parser("@fortawesome/free-regular-svg-icons", "regular", "fontawesome");
export const parseBrands = parser("@fortawesome/free-brands-svg-icons", "brands", "fontawesome");
