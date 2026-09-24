import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadPackage } from "../src/cache/downloader.js";
import { META_FILE, buildIndexFromPackage } from "../src/indexer/buildIndex.js";
import type { IndexMeta } from "../src/indexer/types.js";
import {
  getEmbedder,
  isTransformersInstalled,
  isTransformersMissing,
  TRANSFORMERS_MISSING_WARNING,
  type SemanticEmbedder,
} from "../src/semantic/embeddings.js";
import { loadSynonyms } from "../src/synonyms/loadSynonyms.js";
import { resolveContext, type ToolContext } from "../src/tools/context.js";
import { getIconTool } from "../src/tools/getIcon.js";
import { searchIconsTool } from "../src/tools/searchIcons.js";
import { HEROICONS_FILES, LUCIDE_FILES, makePackageDir } from "./helpers/fixtures.js";
import { setUpToolEnv, type ToolEnv } from "./helpers/toolEnv.js";

// Never load the real model: each test decides what getEmbedder does.
vi.mock("../src/semantic/embeddings.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/semantic/embeddings.js")>()),
  getEmbedder: vi.fn(),
  isTransformersInstalled: vi.fn(),
}));
// The tool env pre-builds every index, so any download means a fallback went wrong.
vi.mock("../src/cache/downloader.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/cache/downloader.js")>()),
  downloadPackage: vi.fn(async () => {
    throw new Error("unexpected download in test");
  }),
}));

/** Mirrors what Node throws when the optional peer dependency is absent. */
function missingPackageError(): Error {
  return Object.assign(
    new Error("Cannot find package '@huggingface/transformers' imported from /app/dist/semantic/embeddings.js"),
    { code: "ERR_MODULE_NOT_FOUND" },
  );
}

/** Deterministic 3D embedder: trash-ish texts point one way, everything else another. */
const fakeEmbedder: SemanticEmbedder = {
  embed: vi.fn(async (texts: string[]) => texts.map((t) => (/trash|delete|bin/.test(t) ? [1, 0, 0] : [0, 1, 0]))),
};

function lucideMeta(env: ToolEnv): IndexMeta {
  return JSON.parse(readFileSync(join(env.cacheRoot, "lucide-react@0.460", META_FILE), "utf8")) as IndexMeta;
}

let env: ToolEnv;
let ctx: ToolContext;
let prevSemantic: string | undefined;
beforeAll(async () => {
  env = await setUpToolEnv();
  ctx = resolveContext();
  prevSemantic = process.env.TRUEICON_SEMANTIC;
});
afterAll(() => {
  if (prevSemantic === undefined) delete process.env.TRUEICON_SEMANTIC;
  else process.env.TRUEICON_SEMANTIC = prevSemantic;
  env?.restore();
});
beforeEach(() => {
  vi.mocked(getEmbedder).mockReset();
  vi.mocked(isTransformersInstalled).mockReset().mockReturnValue(true);
  vi.mocked(downloadPackage).mockClear();
});

describe("semantic flag off", () => {
  beforeAll(() => {
    process.env.TRUEICON_SEMANTIC = "0";
  });

  it("never loads the embedder in search_icons", async () => {
    const output = await searchIconsTool({ query: "trash" }, ctx);
    expect(output.warnings).toBeUndefined();
    expect(output.results.some((r) => r.importName === "Trash2")).toBe(true);
    expect(getEmbedder).not.toHaveBeenCalled();
  });

  it("never loads the embedder in get_icon", async () => {
    const icon = await getIconTool({ name: "Trash2", provider: "lucide" }, ctx);
    expect(icon.importName).toBe("Trash2");
    expect(icon.warnings).toBeUndefined();
    expect(getEmbedder).not.toHaveBeenCalled();
    expect(downloadPackage).not.toHaveBeenCalled();
  });
});

describe("semantic flag on, @huggingface/transformers missing", () => {
  beforeAll(() => {
    process.env.TRUEICON_SEMANTIC = "1";
  });

  beforeEach(() => {
    vi.mocked(isTransformersInstalled).mockReturnValue(false);
  });

  it("search_icons falls back to keyword search with the install hint", async () => {
    vi.mocked(getEmbedder).mockRejectedValue(missingPackageError());
    const { results, warnings } = await searchIconsTool({ query: "trash" }, ctx);
    expect(warnings).toEqual([TRANSFORMERS_MISSING_WARNING]);
    expect(results.some((r) => r.importName === "Trash2")).toBe(true);
  });

  it("get_icon falls back to the keyword-only index instead of throwing", async () => {
    vi.mocked(getEmbedder).mockRejectedValue(missingPackageError());
    const icon = await getIconTool({ name: "Trash2", provider: "lucide" }, ctx);
    expect(icon.importName).toBe("Trash2");
    expect(icon.warnings).toEqual([TRANSFORMERS_MISSING_WARNING]);
    // The cached keyword index was reused: no download, no vectors.
    expect(downloadPackage).not.toHaveBeenCalled();
    expect(lucideMeta(env).embeddingModel).toBeUndefined();
  });

  it("uses the one-line install hint", () => {
    expect(TRANSFORMERS_MISSING_WARNING).toBe(
      "Semantic search needs @huggingface/transformers (~400MB one-time download); " +
        "run `npm i @huggingface/transformers` to enable",
    );
  });
});

describe("semantic flag on, other embedder failures", () => {
  beforeAll(() => {
    process.env.TRUEICON_SEMANTIC = "1";
  });

  it("search_icons keeps the generic warning", async () => {
    vi.mocked(getEmbedder).mockRejectedValue(new Error("fetch failed"));
    const { results, warnings } = await searchIconsTool({ query: "trash" }, ctx);
    expect(warnings).toEqual(["Semantic search unavailable (fetch failed); using keyword search"]);
    expect(results.length).toBeGreaterThan(0);
  });

  it("get_icon does not mistake them for a missing package", async () => {
    vi.mocked(getEmbedder).mockRejectedValue(new Error("fetch failed"));
    await expect(getIconTool({ name: "Trash2", provider: "lucide" }, ctx)).rejects.toThrow("fetch failed");
  });
});

describe("semantic flag on, @huggingface/transformers present", () => {
  const packageDirs: string[] = [];
  beforeAll(async () => {
    process.env.TRUEICON_SEMANTIC = "1";
    // Rebuild the tool env's indexes with vectors, as the first semantic run would.
    const synonyms = loadSynonyms();
    const lucide = makePackageDir(LUCIDE_FILES);
    const heroicons = makePackageDir(HEROICONS_FILES);
    packageDirs.push(lucide, heroicons);
    await buildIndexFromPackage(lucide, "lucide", "0.460.0", env.cacheRoot, synonyms, fakeEmbedder);
    await buildIndexFromPackage(heroicons, "heroicons", "2.1.5", env.cacheRoot, synonyms, fakeEmbedder);
  });
  afterAll(() => {
    for (const dir of packageDirs) rmSync(dir, { recursive: true, force: true });
  });

  it("search_icons ranks with the embedder and no warnings", async () => {
    vi.mocked(getEmbedder).mockResolvedValue(fakeEmbedder);
    const output = await searchIconsTool({ query: "garbage" }, ctx);
    expect(output.warnings).toBeUndefined();
    expect(fakeEmbedder.embed).toHaveBeenCalledWith(["garbage"]);
    expect(output.results.some((r) => r.importName === "Trash2")).toBe(true);
    expect(downloadPackage).not.toHaveBeenCalled();
  });

  it("get_icon uses the vector index with no warnings", async () => {
    vi.mocked(getEmbedder).mockResolvedValue(fakeEmbedder);
    const icon = await getIconTool({ name: "Trash2", provider: "lucide" }, ctx);
    expect(icon.importName).toBe("Trash2");
    expect(icon.warnings).toBeUndefined();
    expect(lucideMeta(env).embeddingModel).toBeDefined();
    expect(downloadPackage).not.toHaveBeenCalled();
  });

  it("get_icon still warns on every call once the package goes missing", async () => {
    vi.mocked(isTransformersInstalled).mockReturnValue(false);
    vi.mocked(getEmbedder).mockRejectedValue(missingPackageError());
    for (let call = 0; call < 2; call++) {
      const icon = await getIconTool({ name: "Trash2", provider: "lucide" }, ctx);
      expect(icon.importName).toBe("Trash2");
      expect(icon.warnings).toEqual([TRANSFORMERS_MISSING_WARNING]);
    }
    // Served from the cached vector index: no embedder load, no download.
    expect(getEmbedder).not.toHaveBeenCalled();
    expect(lucideMeta(env).embeddingModel).toBeDefined();
    expect(downloadPackage).not.toHaveBeenCalled();
  });
});

describe("isTransformersMissing", () => {
  it("matches only a missing @huggingface/transformers package", () => {
    expect(isTransformersMissing(missingPackageError())).toBe(true);
    expect(isTransformersMissing(new Error("Cannot find package '@huggingface/transformers' imported from x"))).toBe(
      true,
    );
    const otherPackage = Object.assign(new Error("Cannot find package 'onnxruntime-node'"), {
      code: "ERR_MODULE_NOT_FOUND",
    });
    expect(isTransformersMissing(otherPackage)).toBe(false);
    expect(isTransformersMissing(new Error("fetch failed"))).toBe(false);
    expect(isTransformersMissing(null)).toBe(false);
  });
});
