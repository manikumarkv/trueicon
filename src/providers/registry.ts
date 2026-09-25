export interface Provider {
  /** Stable identifier used by trueicon tools. */
  id: string;
  /** npm package the icons are read from. */
  package: string;
  description: string;
}

// Supported icon providers.
export const PROVIDERS: readonly Provider[] = [
  {
    id: "react-icons",
    package: "react-icons",
    description: "Aggregated icon sets (Font Awesome, Material, Feather, and more) as React components",
  },
  {
    id: "lucide",
    package: "lucide-react",
    description: "Lucide icons as React components",
  },
  {
    id: "heroicons",
    package: "@heroicons/react",
    description: "Heroicons by the Tailwind CSS team as React components",
  },
  {
    id: "phosphor",
    package: "@phosphor-icons/react",
    description: "Phosphor icons in six weights (thin, light, regular, bold, fill, duotone) as React components",
  },
  {
    id: "tabler",
    package: "@tabler/icons-react",
    description: "Tabler icons (outline and filled) as React components",
  },
  {
    id: "iconoir",
    package: "iconoir-react",
    description: "Iconoir icons (regular and solid) as React components",
  },
  {
    id: "fluentui",
    package: "@fluentui/react-icons",
    description: "Microsoft Fluent UI System icons (regular, filled and color) as React components",
  },
  {
    id: "carbon",
    package: "@carbon/icons-react",
    description: "IBM Carbon Design System icons as React components",
  },
  {
    id: "antdesign",
    package: "@ant-design/icons",
    description: "Ant Design icons (outlined, filled and two-tone) as React components",
  },
  {
    id: "mui",
    package: "@mui/icons-material",
    description: "Material UI icons (filled, outlined, rounded, sharp and two-tone) as React components",
  },
  {
    id: "radix",
    package: "@radix-ui/react-icons",
    description: "Radix UI icons (15x15) as React components",
  },
  {
    id: "remix",
    package: "@remixicon/react",
    description: "Remix Icon (line and fill) as React components",
  },
  {
    id: "fontawesome-solid",
    package: "@fortawesome/free-solid-svg-icons",
    description: "Font Awesome Free solid icons, rendered with @fortawesome/react-fontawesome",
  },
  {
    id: "fontawesome-regular",
    package: "@fortawesome/free-regular-svg-icons",
    description: "Font Awesome Free regular icons, rendered with @fortawesome/react-fontawesome",
  },
  {
    id: "fontawesome-brands",
    package: "@fortawesome/free-brands-svg-icons",
    description: "Font Awesome Free brand logos, rendered with @fortawesome/react-fontawesome",
  },
];

// Finds a provider by its id or by its npm package name.
export function getProvider(idOrPackage: string): Provider | undefined {
  return PROVIDERS.find((p) => p.id === idOrPackage || p.package === idOrPackage);
}
