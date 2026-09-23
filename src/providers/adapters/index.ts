import type { ParseIcons } from "../adapter.js";
import { parseIcons as parseHeroicons } from "./heroicons.js";
import { parseIcons as parseLucide } from "./lucide.js";
import { parseIcons as parseReactIcons } from "./react-icons.js";

// Adapter per provider id (see ../registry.ts).
export const ADAPTERS: Readonly<Record<string, ParseIcons>> = {
  "react-icons": parseReactIcons,
  lucide: parseLucide,
  heroicons: parseHeroicons,
};
