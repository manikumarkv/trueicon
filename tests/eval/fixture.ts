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
};
