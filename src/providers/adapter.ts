/**
 * One icon as extracted from a package's shipped files, before indexing.
 * `name` must be unique within the package: it becomes part of the index record id.
 */
export interface RawIcon {
  /** Kebab-case icon name, unique within the package (e.g. "trash-2", "fa6-beer"). */
  name: string;
  /** Exported component name (e.g. "Trash2", "FaBeer", "TrashIcon"). */
  importName: string;
  /** Module specifier to import the component from (e.g. "react-icons/fa"). */
  importPath: string;
  style?: string;
  set?: string;
  categories?: string[];
  tags?: string[];
  /** Inner SVG markup (the children of the root <svg> element). */
  svg: string;
}

export type ParseIcons = (packageDir: string) => RawIcon[];

// Converts a PascalCase/camelCase identifier to kebab-case: "ArrowDown01" -> "arrow-down-01",
// "Fa500Px" -> "fa-500-px", "Grid2x2" -> "grid-2x2", "HTMLTag" -> "html-tag".
export function toKebabCase(identifier: string): string {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .replace(/(?<!\d)([a-zA-Z])(\d)/g, "$1-$2")
    .toLowerCase();
}
