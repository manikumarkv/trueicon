import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildIndexFromPackage } from "../src/indexer/buildIndex.js";
import { PROVIDERS } from "../src/providers/registry.js";
import { loadSynonyms } from "../src/synonyms/loadSynonyms.js";
import { resolveContext, type ToolContext } from "../src/tools/context.js";
import { getIconTool } from "../src/tools/getIcon.js";
import { listProvidersTool } from "../src/tools/listProviders.js";
import { searchIconsTool } from "../src/tools/searchIcons.js";

/*
 * End-to-end tool tests for every provider: each fixture under tests/fixtures/ is indexed into a
 * temp cache, a temp project pins all of them in .iconmcp.json, and the tools run against that.
 * The adapter tests check parsing; these check that each provider works through search_icons,
 * get_icon and list_providers, including the import line an assistant would paste.
 */

interface ProviderCase {
  id: string;
  package: string;
  fixture: string;
  version: string;
  /** search_icons query that must return `icon` among its results. */
  query: string;
  /** An icon get_icon must find by name, with its exact import line. */
  icon: { name: string; importName: string; usage: string };
  /** A deprecated alias that get_icon must resolve to the current icon. */
  alias?: { name: string; importName: string };
}

const CASES: ProviderCase[] = [
  {
    id: "lucide",
    package: "lucide-react",
    fixture: "lucide-v1",
    version: "1.47.0",
    query: "trash",
    icon: { name: "trash", importName: "Trash", usage: "import { Trash } from 'lucide-react';" },
    alias: { name: "Trash2", importName: "Trash" },
  },
  {
    id: "react-icons",
    package: "react-icons",
    fixture: "react-icons",
    version: "5.3.0",
    query: "beer",
    icon: { name: "fa6-beer", importName: "FaBeer", usage: "import { FaBeer } from 'react-icons/fa6';" },
  },
  {
    id: "heroicons",
    package: "@heroicons/react",
    fixture: "heroicons",
    version: "2.1.1",
    query: "trash",
    icon: {
      name: "trash-24-outline",
      importName: "TrashIcon",
      usage: "import { TrashIcon } from '@heroicons/react/24/outline';",
    },
  },
  {
    id: "phosphor",
    package: "@phosphor-icons/react",
    fixture: "phosphor",
    version: "2.1.10",
    query: "trash",
    icon: { name: "trash", importName: "TrashIcon", usage: "import { TrashIcon } from '@phosphor-icons/react';" },
    alias: { name: "folder-notch", importName: "FolderIcon" },
  },
  {
    id: "tabler",
    package: "@tabler/icons-react",
    fixture: "tabler",
    version: "3.48.0",
    query: "trash",
    icon: { name: "trash", importName: "IconTrash", usage: "import { IconTrash } from '@tabler/icons-react';" },
    alias: { name: "123", importName: "IconNumber123" },
  },
  {
    id: "iconoir",
    package: "iconoir-react",
    fixture: "iconoir",
    version: "7.12.1",
    query: "trash",
    icon: { name: "trash-solid", importName: "TrashSolid", usage: "import { TrashSolid } from 'iconoir-react';" },
  },
  {
    id: "fluentui",
    package: "@fluentui/react-icons",
    fixture: "fluentui",
    version: "2.0.341",
    query: "backpack",
    icon: {
      name: "backpack-regular",
      importName: "BackpackRegular",
      usage: "import { BackpackRegular } from '@fluentui/react-icons';",
    },
  },
  {
    id: "carbon",
    package: "@carbon/icons-react",
    fixture: "carbon",
    version: "11.89.0",
    query: "accessibility",
    icon: {
      name: "accessibility",
      importName: "Accessibility",
      usage: "import { Accessibility } from '@carbon/icons-react';",
    },
  },
  {
    id: "antdesign",
    package: "@ant-design/icons",
    fixture: "antdesign",
    version: "6.3.4",
    query: "delete",
    icon: {
      name: "delete-outlined",
      importName: "DeleteOutlined",
      usage: "import { DeleteOutlined } from '@ant-design/icons';",
    },
  },
  {
    id: "mui",
    package: "@mui/icons-material",
    fixture: "mui",
    version: "9.4.0",
    query: "delete",
    icon: { name: "delete", importName: "Delete", usage: "import { Delete } from '@mui/icons-material';" },
  },
  {
    id: "radix",
    package: "@radix-ui/react-icons",
    fixture: "radix",
    version: "1.3.2",
    query: "trash",
    icon: { name: "trash", importName: "TrashIcon", usage: "import { TrashIcon } from '@radix-ui/react-icons';" },
  },
  {
    id: "remix",
    package: "@remixicon/react",
    fixture: "remix",
    version: "4.9.0",
    query: "delete",
    icon: {
      name: "delete-bin-line",
      importName: "RiDeleteBinLine",
      usage: "import { RiDeleteBinLine } from '@remixicon/react';",
    },
  },
  // The three Font Awesome packages share one module layout, so they share one fixture.
  {
    id: "fontawesome-solid",
    package: "@fortawesome/free-solid-svg-icons",
    fixture: "fontawesome",
    version: "7.3.1",
    query: "trash",
    icon: {
      name: "trash-can",
      importName: "faTrashCan",
      usage: "import { faTrashCan } from '@fortawesome/free-solid-svg-icons';",
    },
    alias: { name: "trash-alt", importName: "faTrashCan" },
  },
  {
    id: "fontawesome-regular",
    package: "@fortawesome/free-regular-svg-icons",
    fixture: "fontawesome",
    version: "7.3.1",
    query: "trash",
    icon: {
      name: "trash-can",
      importName: "faTrashCan",
      usage: "import { faTrashCan } from '@fortawesome/free-regular-svg-icons';",
    },
  },
  {
    id: "fontawesome-brands",
    package: "@fortawesome/free-brands-svg-icons",
    fixture: "fontawesome",
    version: "7.3.1",
    query: "trash",
    icon: { name: "trash", importName: "faTrash", usage: "import { faTrash } from '@fortawesome/free-brands-svg-icons';" },
  },
];

let cacheRoot: string;
let projectDir: string;
let ctx: ToolContext;
const saved = { cache: process.env.TRUEICON_CACHE, project: process.env.TRUEICON_PROJECT_DIR };

beforeAll(async () => {
  const synonyms = loadSynonyms();
  cacheRoot = mkdtempSync(join(tmpdir(), "trueicon-providers-cache-"));
  projectDir = mkdtempSync(join(tmpdir(), "trueicon-providers-project-"));
  for (const c of CASES) {
    await buildIndexFromPackage(join(import.meta.dirname, "fixtures", c.fixture), c.id, c.version, cacheRoot, synonyms);
  }
  writeFileSync(
    join(projectDir, ".iconmcp.json"),
    JSON.stringify({ providers: CASES.map((c) => ({ package: c.package, version: c.version })) }),
  );
  process.env.TRUEICON_CACHE = cacheRoot;
  process.env.TRUEICON_PROJECT_DIR = projectDir;
  ctx = resolveContext();
});

afterAll(() => {
  for (const [key, value] of [
    ["TRUEICON_CACHE", saved.cache],
    ["TRUEICON_PROJECT_DIR", saved.project],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  for (const dir of [cacheRoot, projectDir]) if (dir) rmSync(dir, { recursive: true, force: true });
});

it("covers every registered provider", () => {
  expect(CASES.map((c) => c.id).sort()).toEqual(PROVIDERS.map((p) => p.id).sort());
});

describe.each(CASES)("$id", (c) => {
  it("search_icons finds the icon with its import line", async () => {
    const { results, warnings } = await searchIconsTool({ query: c.query, provider: c.id }, ctx);
    expect(warnings ?? []).toEqual([]);
    expect(results.length).toBeGreaterThan(0);
    for (const hit of results) expect(hit).toMatchObject({ package: c.package, version: c.version });
    expect(results).toContainEqual(
      expect.objectContaining({ name: c.icon.name, importName: c.icon.importName, usage: c.icon.usage }),
    );
  });

  it("search_icons accepts the npm package name as the provider", async () => {
    const { results } = await searchIconsTool({ query: c.query, provider: c.package }, ctx);
    expect(results.map((r) => r.name)).toContain(c.icon.name);
  });

  it("get_icon returns the record by name and by import name", async () => {
    const byName = await getIconTool({ name: c.icon.name, provider: c.id }, ctx);
    expect(byName).toMatchObject({
      name: c.icon.name,
      importName: c.icon.importName,
      provider: c.id,
      package: c.package,
      version: c.version,
      usage: c.icon.usage,
    });
    expect(byName.svg.length).toBeGreaterThan(0);
    // react-icons repeats import names across sets (FaBeer in fa and fa6), so only the name is unique there.
    if (c.id !== "react-icons") {
      expect((await getIconTool({ name: c.icon.importName, provider: c.id }, ctx)).name).toBe(c.icon.name);
    }
  });

  it("get_icon reports a missing icon with the provider and version", async () => {
    await expect(getIconTool({ name: "no-such-icon", provider: c.id }, ctx)).rejects.toThrow(
      new RegExp(`"no-such-icon" not found in ${c.id} \\(${c.package.replace("/", "\\/")}@${c.version.replace(/\./g, "\\.")}\\)`),
    );
  });

  it.runIf(c.alias)("get_icon resolves a deprecated alias to the current icon", async () => {
    const icon = await getIconTool({ name: c.alias!.name, provider: c.id }, ctx);
    expect(icon.importName).toBe(c.alias!.importName);
  });
});

describe("all providers together", () => {
  it("list_providers reports every configured provider with its pinned version", async () => {
    const { configured } = listProvidersTool(ctx);
    expect(configured.map((p) => [p.id, p.version]).sort()).toEqual(CASES.map((c) => [c.id, c.version]).sort());
  });

  it("search_icons without a provider searches every configured provider", async () => {
    const { results } = await searchIconsTool({ query: "trash", limit: 50 }, ctx);
    const packages = new Set(results.map((r) => r.package));
    for (const c of CASES.filter((c) => c.query === "trash")) expect(packages).toContain(c.package);
  });
});
