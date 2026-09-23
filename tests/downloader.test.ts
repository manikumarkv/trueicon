import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cacheDirName,
  downloadPackage,
  MARKER_FILE,
  resolveCacheRoot,
  sanitizePackageName,
} from "../src/cache/downloader.js";

// Tiny real package (a few KB) used to exercise the live registry end to end.
const PKG = "is-odd";
const VERSION = "3.0.1";

describe("cache dir naming", () => {
  it("sanitizes package names", () => {
    expect(sanitizePackageName("@heroicons/react")).toBe("heroicons-react");
    expect(sanitizePackageName("lucide-react")).toBe("lucide-react");
  });

  it("uses <sanitizedPackage>@<major.minor>", () => {
    expect(cacheDirName("@heroicons/react", "1.0.6")).toBe("heroicons-react@1.0");
    expect(cacheDirName("react-icons", "5.4.0")).toBe("react-icons@5.4");
    expect(cacheDirName("lucide-react", "0.460.1-beta.2")).toBe("lucide-react@0.460");
  });

  it("rejects non-exact versions", () => {
    expect(() => cacheDirName("is-odd", "latest")).toThrow(/exact semver/);
  });
});

describe("resolveCacheRoot", () => {
  const saved = process.env.TRUEICON_CACHE;
  afterEach(() => {
    if (saved === undefined) delete process.env.TRUEICON_CACHE;
    else process.env.TRUEICON_CACHE = saved;
  });

  it("prefers opts.cacheRoot, then TRUEICON_CACHE, then ~/.trueicon/cache", () => {
    process.env.TRUEICON_CACHE = "/from-env";
    expect(resolveCacheRoot({ cacheRoot: "/from-opts" })).toBe("/from-opts");
    expect(resolveCacheRoot()).toBe("/from-env");
    delete process.env.TRUEICON_CACHE;
    expect(resolveCacheRoot()).toBe(join(homedir(), ".trueicon", "cache"));
  });
});

describe("downloadPackage (live npm registry)", () => {
  let cacheRoot: string;

  beforeEach(async () => {
    cacheRoot = await mkdtemp(join(tmpdir(), "trueicon-cache-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(cacheRoot, { recursive: true, force: true });
  });

  it("downloads, extracts, marks complete, and skips re-download", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const first = await downloadPackage(PKG, VERSION, { cacheRoot });
    expect(first).toEqual({ dir: join(cacheRoot, "is-odd@3.0"), version: VERSION });
    const manifest = JSON.parse(await readFile(join(first.dir, "package.json"), "utf8"));
    expect(manifest).toMatchObject({ name: PKG, version: VERSION });
    expect((await readFile(join(first.dir, MARKER_FILE), "utf8")).trim()).toBe(VERSION);
    expect(fetchSpy).toHaveBeenCalledTimes(2); // metadata + tarball

    fetchSpy.mockClear();
    const second = await downloadPackage(PKG, VERSION, { cacheRoot });
    expect(second).toEqual(first);
    expect(fetchSpy).not.toHaveBeenCalled();
  }, 30_000);

  it("honours TRUEICON_CACHE and resolves dist-tags", async () => {
    const saved = process.env.TRUEICON_CACHE;
    process.env.TRUEICON_CACHE = cacheRoot;
    try {
      const result = await downloadPackage(PKG, "latest");
      expect(result.dir.startsWith(cacheRoot)).toBe(true);
      expect(result.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(existsSync(join(result.dir, MARKER_FILE))).toBe(true);
    } finally {
      if (saved === undefined) delete process.env.TRUEICON_CACHE;
      else process.env.TRUEICON_CACHE = saved;
    }
  }, 30_000);

  it("throws a clear error for an unknown version", async () => {
    await expect(downloadPackage(PKG, "99.0.0", { cacheRoot })).rejects.toThrow(
      /Unknown package or version: is-odd@99\.0\.0/,
    );
  }, 30_000);

  it("throws on integrity mismatch and leaves no marker", async () => {
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const res = await realFetch(input, init);
      if (!String(input).endsWith(`/${VERSION}`)) return res;
      const meta = await res.json();
      meta.dist.integrity = `sha512-${Buffer.alloc(64).toString("base64")}`;
      return new Response(JSON.stringify(meta), { status: 200 });
    });

    await expect(downloadPackage(PKG, VERSION, { cacheRoot })).rejects.toThrow(/Integrity check failed/);
    expect(existsSync(join(cacheRoot, "is-odd@3.0", MARKER_FILE))).toBe(false);
  }, 30_000);

  it("throws a clear error on network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));
    await expect(downloadPackage(PKG, VERSION, { cacheRoot })).rejects.toThrow(/Network error/);
  });

  it("rejects invalid package names", async () => {
    await expect(downloadPackage("../evil", "1.0.0", { cacheRoot })).rejects.toThrow(/Invalid npm package name/);
  });
});
