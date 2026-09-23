import { describe, expect, it } from "vitest";
import { toKebabCase } from "../../src/providers/adapter.js";
import { ADAPTERS } from "../../src/providers/adapters/index.js";
import { PROVIDERS } from "../../src/providers/registry.js";

describe("toKebabCase", () => {
  it("splits case and digit boundaries", () => {
    expect(toKebabCase("ArrowDown01")).toBe("arrow-down-01");
    expect(toKebabCase("Trash2")).toBe("trash-2");
    expect(toKebabCase("HTMLTag")).toBe("html-tag");
    expect(toKebabCase("Grid2x2")).toBe("grid-2x2");
    expect(toKebabCase("Fa500Px")).toBe("fa-500-px");
    expect(toKebabCase("Html5")).toBe("html-5");
  });
});

describe("ADAPTERS", () => {
  it("has an adapter for every registered provider", () => {
    for (const provider of PROVIDERS) expect(ADAPTERS[provider.id]).toBeTypeOf("function");
  });
});
