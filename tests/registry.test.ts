import { describe, expect, it } from "vitest";
import { getProvider, PROVIDERS } from "../src/providers/registry.js";

describe("provider registry", () => {
  it("lists exactly the three v1 providers", () => {
    expect(PROVIDERS.map((p) => [p.id, p.package])).toEqual([
      ["react-icons", "react-icons"],
      ["lucide", "lucide-react"],
      ["heroicons", "@heroicons/react"],
    ]);
    for (const p of PROVIDERS) expect(p.description).toBeTruthy();
  });

  it("looks up providers by id", () => {
    expect(getProvider("lucide")?.package).toBe("lucide-react");
    expect(getProvider("heroicons")?.package).toBe("@heroicons/react");
  });

  it("looks up providers by package name", () => {
    expect(getProvider("lucide-react")?.id).toBe("lucide");
    expect(getProvider("@heroicons/react")?.id).toBe("heroicons");
    expect(getProvider("react-icons")?.id).toBe("react-icons");
  });

  it("returns undefined for unknown providers", () => {
    expect(getProvider("font-awesome")).toBeUndefined();
  });
});
