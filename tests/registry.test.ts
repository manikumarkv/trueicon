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
      ["mui", "@mui/icons-material"],
      ["radix", "@radix-ui/react-icons"],
      ["remix", "@remixicon/react"],
      ["fontawesome-solid", "@fortawesome/free-solid-svg-icons"],
      ["fontawesome-regular", "@fortawesome/free-regular-svg-icons"],
      ["fontawesome-brands", "@fortawesome/free-brands-svg-icons"],
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
    expect(getProvider("mui")?.package).toBe("@mui/icons-material");
    expect(getProvider("radix")?.package).toBe("@radix-ui/react-icons");
    expect(getProvider("remix")?.package).toBe("@remixicon/react");
    expect(getProvider("fontawesome-solid")?.package).toBe("@fortawesome/free-solid-svg-icons");
    expect(getProvider("fontawesome-regular")?.package).toBe("@fortawesome/free-regular-svg-icons");
    expect(getProvider("fontawesome-brands")?.package).toBe("@fortawesome/free-brands-svg-icons");
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
    expect(getProvider("@mui/icons-material")?.id).toBe("mui");
    expect(getProvider("@radix-ui/react-icons")?.id).toBe("radix");
    expect(getProvider("@remixicon/react")?.id).toBe("remix");
    expect(getProvider("@fortawesome/free-solid-svg-icons")?.id).toBe("fontawesome-solid");
    expect(getProvider("@fortawesome/free-regular-svg-icons")?.id).toBe("fontawesome-regular");
    expect(getProvider("@fortawesome/free-brands-svg-icons")?.id).toBe("fontawesome-brands");
  });

  it("returns undefined for unknown providers", () => {
    expect(getProvider("font-awesome")).toBeUndefined();
  });
});
