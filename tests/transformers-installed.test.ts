import { beforeEach, describe, expect, it, vi } from "vitest";

// Stub the resolver so the presence check never touches the real package (or a model).
const resolve = vi.hoisted(() => vi.fn());
vi.mock("node:module", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:module")>()),
  createRequire: () => ({ resolve }),
}));

const { isTransformersInstalled } = await import("../src/semantic/embeddings.js");

beforeEach(() => {
  resolve.mockReset();
});

describe("isTransformersInstalled", () => {
  it("is true when the package resolves", () => {
    resolve.mockReturnValue("/app/node_modules/@huggingface/transformers/dist/transformers.node.cjs");
    expect(isTransformersInstalled()).toBe(true);
    expect(resolve).toHaveBeenCalledWith("@huggingface/transformers");
  });

  it("is false when the package is missing", () => {
    resolve.mockImplementation(() => {
      throw Object.assign(new Error("Cannot find module '@huggingface/transformers'"), { code: "MODULE_NOT_FOUND" });
    });
    expect(isTransformersInstalled()).toBe(false);
  });

  it("rethrows any other error", () => {
    const other = Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
    resolve.mockImplementation(() => {
      throw other;
    });
    expect(() => isTransformersInstalled()).toThrow(other);
  });
});
