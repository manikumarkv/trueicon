import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildIndexFromPackage } from "../../src/indexer/buildIndex.js";
import { loadSynonyms } from "../../src/synonyms/loadSynonyms.js";
import { HEROICONS_FILES, LUCIDE_FILES, makePackageDir } from "./fixtures.js";

export interface ToolEnv {
  cacheRoot: string;
  projectDir: string;
  restore(): void;
}

/**
 * Builds real lucide + heroicons indexes from the fixtures into a temp cache, creates a temp project
 * whose .iconmcp.json pins both, and points $TRUEICON_CACHE / $TRUEICON_PROJECT_DIR at them.
 */
export async function setUpToolEnv(): Promise<ToolEnv> {
  const synonyms = loadSynonyms();
  const lucide = makePackageDir(LUCIDE_FILES);
  const heroicons = makePackageDir(HEROICONS_FILES);
  const cacheRoot = mkdtempSync(join(tmpdir(), "trueicon-tools-cache-"));
  const projectDir = mkdtempSync(join(tmpdir(), "trueicon-tools-project-"));
  await buildIndexFromPackage(lucide, "lucide", "0.460.0", cacheRoot, synonyms);
  await buildIndexFromPackage(heroicons, "heroicons", "2.1.5", cacheRoot, synonyms);
  writeFileSync(
    join(projectDir, ".iconmcp.json"),
    JSON.stringify({
      providers: [
        { package: "lucide-react", version: "0.460.0" },
        { package: "@heroicons/react", version: "2.1.5" },
      ],
    }),
  );

  const saved = { cache: process.env.TRUEICON_CACHE, project: process.env.TRUEICON_PROJECT_DIR };
  process.env.TRUEICON_CACHE = cacheRoot;
  process.env.TRUEICON_PROJECT_DIR = projectDir;

  return {
    cacheRoot,
    projectDir,
    restore() {
      for (const [key, value] of [
        ["TRUEICON_CACHE", saved.cache],
        ["TRUEICON_PROJECT_DIR", saved.project],
      ] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      for (const dir of [lucide, heroicons, cacheRoot, projectDir]) rmSync(dir, { recursive: true, force: true });
    },
  };
}
