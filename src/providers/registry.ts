export interface Provider {
  /** Stable identifier used by trueicon tools. */
  id: string;
  /** npm package the icons are read from. */
  package: string;
  description: string;
}

// Icon providers supported in v1.
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
];

// Finds a provider by its id or by its npm package name.
export function getProvider(idOrPackage: string): Provider | undefined {
  return PROVIDERS.find((p) => p.id === idOrPackage || p.package === idOrPackage);
}
