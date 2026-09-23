import { describe, expect, it } from "vitest";
import { getProvider, PROVIDERS } from "../src/providers/registry.js";

describe("provider registry", () => {
  it("lists exactly the supported providers", () => {
    expect(PROVIDERS.map((p) => [p.id, p.package])).toEqual([
      ["react-icons", "react-icons"],
      ["lucide", "lucide-react"],
      ["heroicons", "@heroicons/react"],
      ["phosphor", "@phosphor-icons/react"],
      ["tabler", "@tabler/icons-react"],
      ["iconoir", "iconoir-react"],
    ]);
    for (const p of PROVIDERS) expect(p.description).toBeTruthy();
  });

  it("looks up providers by id", () => {
    expect(getProvider("lucide")?.package).toBe("lucide-react");
    expect(getProvider("heroicons")?.package).toBe("@heroicons/react");
    expect(getProvider("phosphor")?.package).toBe("@phosphor-icons/react");
    expect(getProvider("tabler")?.package).toBe("@tabler/icons-react");
    expect(getProvider("iconoir")?.package).toBe("iconoir-react");
  });

  it("looks up providers by package name", () => {
    expect(getProvider("lucide-react")?.id).toBe("lucide");
    expect(getProvider("@heroicons/react")?.id).toBe("heroicons");
    expect(getProvider("react-icons")?.id).toBe("react-icons");
    expect(getProvider("@phosphor-icons/react")?.id).toBe("phosphor");
    expect(getProvider("@tabler/icons-react")?.id).toBe("tabler");
    expect(getProvider("iconoir-react")?.id).toBe("iconoir");
  });

  it("returns undefined for unknown providers", () => {
    expect(getProvider("font-awesome")).toBeUndefined();
  });
});
