import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // tests/fixtures mirrors third-party build output (including minified code).
  { ignores: ["dist/", "coverage/", "node_modules/", "tests/fixtures/", ".cache/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
