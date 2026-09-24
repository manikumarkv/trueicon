import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getEmbedder } from "../src/semantic/embeddings.js";
import { resolveContext, type ToolContext } from "../src/tools/context.js";
import { isTransformersMissing, searchIconsTool, TRANSFORMERS_MISSING_WARNING } from "../src/tools/searchIcons.js";
import { setUpToolEnv, type ToolEnv } from "./helpers/toolEnv.js";

// Never load the real model: each test decides how getEmbedder fails.
vi.mock("../src/semantic/embeddings.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/semantic/embeddings.js")>()),
  getEmbedder: vi.fn(),
}));

/** Mirrors what Node throws when the optional peer dependency is absent. */
function missingPackageError(): Error {
  return Object.assign(
    new Error("Cannot find package '@huggingface/transformers' imported from /app/dist/semantic/embeddings.js"),
    { code: "ERR_MODULE_NOT_FOUND" },
  );
}

let env: ToolEnv;
let ctx: ToolContext;
let prevSemantic: string | undefined;
beforeAll(async () => {
  env = await setUpToolEnv();
  ctx = resolveContext();
  prevSemantic = process.env.TRUEICON_SEMANTIC;
  process.env.TRUEICON_SEMANTIC = "1";
});
afterAll(() => {
  if (prevSemantic === undefined) delete process.env.TRUEICON_SEMANTIC;
  else process.env.TRUEICON_SEMANTIC = prevSemantic;
  env?.restore();
});

describe("searchIconsTool semantic fallback", () => {
  it("explains how to install @huggingface/transformers when it is missing", async () => {
    vi.mocked(getEmbedder).mockRejectedValue(missingPackageError());
    const { results, warnings } = await searchIconsTool({ query: "trash" }, ctx);
    expect(warnings).toEqual([TRANSFORMERS_MISSING_WARNING]);
    expect(TRANSFORMERS_MISSING_WARNING).toContain("npm install @huggingface/transformers");
    expect(results.some((r) => r.importName === "Trash2")).toBe(true);
  });

  it("keeps the generic warning for other load failures", async () => {
    vi.mocked(getEmbedder).mockRejectedValue(new Error("fetch failed"));
    const { results, warnings } = await searchIconsTool({ query: "trash" }, ctx);
    expect(warnings).toEqual(["Semantic search unavailable (fetch failed); using keyword search"]);
    expect(results.length).toBeGreaterThan(0);
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
