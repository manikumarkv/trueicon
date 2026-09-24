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
      ["fluentui", "@fluentui/react-icons"],
      ["carbon", "@carbon/icons-react"],
      ["antdesign", "@ant-design/icons"],
    ]);
    for (const p of PROVIDERS) expect(p.description).toBeTruthy();
  });

  it("looks up providers by id", () => {
    expect(getProvider("lucide")?.package).toBe("lucide-react");
    expect(getProvider("heroicons")?.package).toBe("@heroicons/react");
    expect(getProvider("phosphor")?.package).toBe("@phosphor-icons/react");
    expect(getProvider("tabler")?.package).toBe("@tabler/icons-react");
    expect(getProvider("iconoir")?.package).toBe("iconoir-react");
    expect(getProvider("fluentui")?.package).toBe("@fluentui/react-icons");
    expect(getProvider("carbon")?.package).toBe("@carbon/icons-react");
    expect(getProvider("antdesign")?.package).toBe("@ant-design/icons");
  });

  it("looks up providers by package name", () => {
    expect(getProvider("lucide-react")?.id).toBe("lucide");
    expect(getProvider("@heroicons/react")?.id).toBe("heroicons");
    expect(getProvider("react-icons")?.id).toBe("react-icons");
    expect(getProvider("@phosphor-icons/react")?.id).toBe("phosphor");
    expect(getProvider("@tabler/icons-react")?.id).toBe("tabler");
    expect(getProvider("iconoir-react")?.id).toBe("iconoir");
    expect(getProvider("@fluentui/react-icons")?.id).toBe("fluentui");
    expect(getProvider("@carbon/icons-react")?.id).toBe("carbon");
    expect(getProvider("@ant-design/icons")?.id).toBe("antdesign");
  });

  it("returns undefined for unknown providers", () => {
    expect(getProvider("font-awesome")).toBeUndefined();
  });
});
