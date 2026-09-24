import { lucideIcon } from "../helpers/fixtures.js";

const icon = (importName: string) => lucideIcon(importName, `[["path", { d: "M12 5v14", key: "k" }]]`);

// Minimal lucide-react layout for the search quality eval. Mirrors real packaging:
// square-dashed-kanban ships the deprecated kanban-square-dashed alias (as in the real
// lucide-react@0.460.0, where "trash can" wrongly ranked it above the trash icons).
// trash-2 intentionally has NO trash-can alias, matching the real package.
export const LUCIDE_EVAL_FILES: Record<string, string> = {
  "package.json": `{"name":"lucide-react","version":"0.460.0"}`,
  "dist/esm/icons/trash-2.js": icon("Trash2"),
  "dist/esm/icons/square-dashed-kanban.js": icon("SquareDashedKanban"),
  "dist/esm/icons/kanban-square-dashed.js": `export { default } from './square-dashed-kanban.js';\n`,
  "dist/esm/icons/shopping-cart.js": icon("ShoppingCart"),
  "dist/esm/icons/car-taxi-front.js": icon("CarTaxiFront"),
  "dist/esm/icons/arrow-right.js": icon("ArrowRight"),
  "dist/esm/icons/circle-user-round.js": icon("CircleUserRound"),
  "dist/esm/icons/laptop.js": icon("Laptop"),
  "dist/esm/icons/headphones.js": icon("Headphones"),
  "dist/esm/icons/sun.js": icon("Sun"),
  "dist/esm/icons/dollar-sign.js": icon("DollarSign"),
  "dist/esm/icons/file.js": icon("File"),
  "dist/esm/icons/music.js": icon("Music"),
  "dist/esm/icons/camera.js": icon("Camera"),
  "dist/esm/icons/heart.js": icon("Heart"),
  "dist/esm/icons/bell.js": icon("Bell"),
  "dist/esm/icons/lock.js": icon("Lock"),
  "dist/esm/icons/map.js": icon("Map"),
  "dist/esm/icons/wifi.js": icon("Wifi"),
  "dist/esm/icons/play.js": icon("Play"),
  "dist/esm/icons/download.js": icon("Download"),
  "dist/esm/icons/settings.js": icon("Settings"),
  "dist/esm/icons/search.js": icon("Search"),
  "dist/esm/icons/mail.js": icon("Mail"),
  "dist/esm/icons/calendar.js": icon("Calendar"),
  "dist/esm/icons/star.js": icon("Star"),
};
