import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { ensureIndex } from "../src/config/ensureIndex.js";
import { detectInstalledVersion, detectListedPackages, detectVersion, loadProjectConfig } from "../src/config/loadConfig.js";
import { indexKey, parseVersion, resolveIndexAction } from "../src/config/versions.js";
import { buildIndex, hashSynonyms, INDEX_VERSION, writeIndex } from "../src/indexer/buildIndex.js";
import type { IndexMeta, Synonyms } from "../src/indexer/types.js";
import { LUCIDE_FILES, makePackageDir } from "./helpers/fixtures.js";

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

// Creates a temp project dir containing { fileName: contents }.
function makeProject(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "trueicon-config-"));
  tempDirs.push(dir);
  for (const [name, contents] of Object.entries(files)) writeFileSync(join(dir, name), contents);
  return dir;
}

describe("loadProjectConfig", () => {
  it("reads providers from .iconmcp.json", () => {
    const dir = makeProject({
      ".iconmcp.json": JSON.stringify({
        providers: [{ package: "lucide-react", version: "0.460.0" }, { package: "react-icons" }],
      }),
    });
    expect(loadProjectConfig(dir)).toEqual({
      providers: [{ package: "lucide-react", version: "0.460.0" }, { package: "react-icons" }],
    });
  });

  it("returns no providers when the file is missing", () => {
    expect(loadProjectConfig(makeProject())).toEqual({ providers: [] });
  });

  it("throws on invalid JSON, naming the file", () => {
    const dir = makeProject({ ".iconmcp.json": "{ providers: " });
    expect(() => loadProjectConfig(dir)).toThrow(/Invalid JSON in .*\.iconmcp\.json/);
  });

  it.each([
    ["a non-object", "[]", /"providers" array/],
    ["providers not an array", `{"providers": {}}`, /"providers" array/],
    ["missing package", `{"providers": [{"version": "1.0.0"}]}`, /providers\[0\]\.package/],
    ["empty package", `{"providers": [{"package": ""}]}`, /providers\[0\]\.package/],
    ["non-string version", `{"providers": [{"package": "a"}, {"package": "b", "version": 1}]}`, /providers\[1\]\.version/],
    ["empty version", `{"providers": [{"package": "a", "version": ""}]}`, /providers\[0\]\.version/],
  ])("throws on bad shape: %s", (_label, contents, message) => {
    const dir = makeProject({ ".iconmcp.json": contents });
    expect(() => loadProjectConfig(dir)).toThrow(message);
    expect(() => loadProjectConfig(dir)).toThrow(/\.iconmcp\.json/);
  });
});

describe("detectVersion", () => {
  const dir = makeProject({
    "package.json": JSON.stringify({
      dependencies: { "lucide-react": "^0.460.0" },
      devDependencies: { "react-icons": "~5.3.1", "lucide-react": "0.1.0" },
    }),
  });

  it("reads the version from dependencies", () => {
    expect(detectVersion(dir, "lucide-react")).toBe("^0.460.0");
  });

  it("falls back to devDependencies", () => {
    expect(detectVersion(dir, "react-icons")).toBe("~5.3.1");
  });

  it("throws when the package is not listed", () => {
    expect(() => detectVersion(dir, "@heroicons/react")).toThrow(/@heroicons\/react is not listed/);
  });

  it("throws when package.json is missing or unparseable", () => {
    expect(() => detectVersion(makeProject(), "lucide-react")).toThrow(/No package.json/);
    expect(() => detectVersion(makeProject({ "package.json": "nope" }), "lucide-react")).toThrow(
      /Invalid JSON in .*package\.json/,
    );
  });
});

describe("parseVersion", () => {
  it.each([
    ["0.460.0", { major: 0, minor: 460, patch: 0 }],
    ["^0.460.0", { major: 0, minor: 460, patch: 0 }],
    ["~5.3.1", { major: 5, minor: 3, patch: 1 }],
    [">=1.2.3", { major: 1, minor: 2, patch: 3 }],
    ["<= 4.5.6", { major: 4, minor: 5, patch: 6 }],
    ["=2.1.5", { major: 2, minor: 1, patch: 5 }],
    ["1.2.3-beta.1", { major: 1, minor: 2, patch: 3 }],
    ["1.2.3 - 2.0.0", { major: 1, minor: 2, patch: 3 }],
    ["^1.2.3 || ^2.0.0", { major: 1, minor: 2, patch: 3 }],
  ])("parses %s", (input, expected) => {
    expect(parseVersion(input)).toEqual(expected);
  });

  it.each(["", "latest", "1.2", "x.y.z", "^^1.2.3", "*"])("throws on %j", (input) => {
    expect(() => parseVersion(input)).toThrow(/Unparseable version/);
  });
});

describe("indexKey", () => {
  it("ignores the patch version", () => {
    expect(indexKey("lucide-react", "0.460.3")).toBe("lucide-react@0.460");
    expect(indexKey("lucide-react", "^0.460.0")).toBe(indexKey("lucide-react", "0.460.3"));
  });

  it("changes with the major version", () => {
    expect(indexKey("react-icons", "5.3.0")).not.toBe(indexKey("react-icons", "4.3.0"));
  });
});

describe("resolveIndexAction", () => {
  const hash = hashSynonyms({ trash: ["delete"] });
  const meta: IndexMeta = {
    provider: "lucide",
    package: "lucide-react",
    version: "0.460.0",
    indexVersion: INDEX_VERSION,
    synonymsHash: hash,
    builtAt: "2026-01-01T00:00:00.000Z",
  };

  it("uses the index for the same minor, ignoring patch", () => {
    expect(resolveIndexAction("0.460.0", meta, hash)).toBe("use");
    expect(resolveIndexAction("^0.460.5", meta, hash)).toBe("use");
  });

  it("rebuilds on a minor or major bump", () => {
    expect(resolveIndexAction("0.461.0", meta, hash)).toBe("rebuild");
    expect(resolveIndexAction("1.460.0", meta, hash)).toBe("rebuild");
  });

  it("rebuilds when the synonyms hash differs", () => {
    expect(resolveIndexAction("0.460.0", meta, hashSynonyms({}))).toBe("rebuild");
  });

  it("rebuilds when the index format is outdated", () => {
    expect(resolveIndexAction("0.460.0", { ...meta, indexVersion: 0 as unknown as 1 }, hash)).toBe("rebuild");
  });

  it("reports a missing index when there is no meta", () => {
    expect(resolveIndexAction("0.460.0", null, hash)).toBe("missing");
  });
});

describe("ensureIndex", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses a valid cached index without downloading", async () => {
    const synonyms: Synonyms = { trash: ["delete"] };
    const packageDir = makePackageDir(LUCIDE_FILES);
    const cacheRoot = mkdtempSync(join(tmpdir(), "trueicon-ensure-"));
    tempDirs.push(packageDir, cacheRoot);

    // A package name that is not on npm, so any download attempt would fail.
    const packageName = "trueicon-bogus-package-does-not-exist";
    const built = await buildIndex({ providerId: "lucide", packageDir, version: "0.460.0", synonyms });
    await writeIndex(join(cacheRoot, indexKey(packageName, "0.460.0")), built.records, built.meta);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await ensureIndex({ cacheRoot, providerId: "lucide", packageName, version: "^0.460.2", synonyms });

    expect(result).toEqual({ cacheDir: join(cacheRoot, `${packageName}@0.460`), action: "use" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("detectListedPackages", () => {
  const candidates = ["react-icons", "lucide-react", "@heroicons/react"];

  it("returns the candidates listed in dependencies or devDependencies, in candidate order", () => {
    const dir = makeProject({
      "package.json": JSON.stringify({
        dependencies: { "lucide-react": "^1.47.0", react: "^19.0.0" },
        devDependencies: { "react-icons": "^5.3.0" },
      }),
    });
    expect(detectListedPackages(dir, candidates)).toEqual(["react-icons", "lucide-react"]);
  });

  it("returns nothing without a package.json and throws on invalid JSON", () => {
    expect(detectListedPackages(makeProject(), candidates)).toEqual([]);
    expect(() => detectListedPackages(makeProject({ "package.json": "nope" }), candidates)).toThrow(/Invalid JSON/);
  });
});

describe("detectInstalledVersion", () => {
  // Writes node_modules/<pkg>/package.json under dir.
  function install(dir: string, pkg: string, version: string): void {
    const pkgDir = join(dir, "node_modules", pkg);
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(join(pkgDir, "package.json"), JSON.stringify({ name: pkg, version }));
  }

  it("reads the version installed in the project's node_modules, including scoped packages", () => {
    const dir = makeProject();
    install(dir, "lucide-react", "1.52.0");
    install(dir, "@heroicons/react", "2.2.0");
    expect(detectInstalledVersion(dir, "lucide-react")).toBe("1.52.0");
    expect(detectInstalledVersion(dir, "@heroicons/react")).toBe("2.2.0");
  });

  it("finds packages hoisted to a parent directory, as in monorepos", () => {
    const root = makeProject();
    install(root, "lucide-react", "1.50.0");
    const app = join(root, "apps", "web");
    mkdirSync(app, { recursive: true });
    expect(detectInstalledVersion(app, "lucide-react")).toBe("1.50.0");
  });

  it("prefers the nearest node_modules", () => {
    const root = makeProject();
    install(root, "lucide-react", "1.50.0");
    const app = join(root, "apps", "web");
    install(app, "lucide-react", "1.52.0");
    expect(detectInstalledVersion(app, "lucide-react")).toBe("1.52.0");
  });

  it("returns null when the package is not installed", () => {
    expect(detectInstalledVersion(makeProject(), "some-package-that-is-not-installed-anywhere")).toBeNull();
  });
});
