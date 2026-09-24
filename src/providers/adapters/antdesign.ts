import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { toKebabCase, type RawIcon } from "../adapter.js";

/*
 * @ant-design/icons layout: lib/icons/<Name><Theme>.js, one CommonJS module per icon, with Theme
 * one of Filled, Outlined or TwoTone (DeleteOutlined.js, DeleteTwoTone.js). The artwork itself
 * lives in @ant-design/icons-svg as an abstract node tree, but every icon module carries a
 * generated preview comment with the full SVG:
 *
 *   /**![delete](data:image/svg+xml;base64,PHN2ZyB3aWR0aD0i...) *\/
 *
 * The preview is decoded and the root <svg> element stripped. It hardcodes the default preview
 * colors (the twotone fills, for example) where the component uses currentColor and a
 * configurable twotone color. lib/icons/index.js is a barrel and is skipped. Ant Design ships
 * no categories.
 */

const ICONS_DIR = join("lib", "icons");
const ICON_FILE = /^\w+(Filled|Outlined|TwoTone)\.js$/;
const PREVIEW = /\/\*\*!\[[^\]]*\]\(data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)\)\s*\*\//;
const SVG_ROOT = /^\s*<svg\b[^>]*>([\s\S]*)<\/svg>\s*$/;

// Returns the inner markup of the base64 SVG preview comment in an icon module.
export function previewSvg(src: string): string {
  const preview = PREVIEW.exec(src);
  if (!preview) throw new Error("SVG preview comment not found");
  const svg = Buffer.from(preview[1]!, "base64").toString("utf8");
  const root = SVG_ROOT.exec(svg);
  if (!root) throw new Error("SVG preview has no root <svg> element");
  return root[1]!.trim();
}

export function parseIcons(packageDir: string): RawIcon[] {
  const dir = join(packageDir, ICONS_DIR);
  const icons: RawIcon[] = [];
  for (const file of readdirSync(dir).sort()) {
    const theme = ICON_FILE.exec(file)?.[1];
    if (!theme) continue;
    const importName = file.slice(0, -".js".length);
    let svg: string;
    try {
      svg = previewSvg(readFileSync(join(dir, file), "utf8"));
    } catch (err) {
      throw new Error(`${file}: ${(err as Error).message}`, { cause: err });
    }
    icons.push({
      name: toKebabCase(importName),
      importName,
      importPath: "@ant-design/icons",
      style: toKebabCase(theme),
      set: "antdesign",
      categories: [],
      tags: [],
      svg,
    });
  }
  return icons;
}
