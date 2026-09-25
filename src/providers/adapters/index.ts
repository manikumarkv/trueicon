import type { ParseIcons } from "../adapter.js";
import { parseIcons as parseAntDesign } from "./antdesign.js";
import { parseIcons as parseCarbon } from "./carbon.js";
import { parseIcons as parseFluentUi } from "./fluentui.js";
import { parseBrands, parseRegular, parseSolid } from "./fontawesome.js";
import { parseIcons as parseHeroicons } from "./heroicons.js";
import { parseIcons as parseIconoir } from "./iconoir.js";
import { parseIcons as parseLucide } from "./lucide.js";
import { parseIcons as parseMui } from "./mui.js";
import { parseIcons as parsePhosphor } from "./phosphor.js";
import { parseIcons as parseRadix } from "./radix.js";
import { parseIcons as parseReactIcons } from "./react-icons.js";
import { parseIcons as parseRemix } from "./remix.js";
import { parseIcons as parseTabler } from "./tabler.js";

// Adapter per provider id (see ../registry.ts).
export const ADAPTERS: Readonly<Record<string, ParseIcons>> = {
  "react-icons": parseReactIcons,
  lucide: parseLucide,
  heroicons: parseHeroicons,
  phosphor: parsePhosphor,
  tabler: parseTabler,
  iconoir: parseIconoir,
  fluentui: parseFluentUi,
  carbon: parseCarbon,
  antdesign: parseAntDesign,
  mui: parseMui,
  radix: parseRadix,
  remix: parseRemix,
  "fontawesome-solid": parseSolid,
  "fontawesome-regular": parseRegular,
  "fontawesome-brands": parseBrands,
};
