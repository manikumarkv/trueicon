import { rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { downloadPackage } from "../src/cache/downloader.js";
import { ensureIndex } from "../src/config/ensureIndex.js";
import { LUCIDE_FILES, makePackageDir } from "./helpers/fixtures.js";

const packageDir = makePackageDir(LUCIDE_FILES);
vi.mock("../src/cache/downloader.js", () => ({
  downloadPackage: vi.fn(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    return { dir: packageDir, version: "0.460.0" };
  }),
}));

const tempDirs: string[] = [packageDir];
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe("ensureIndex concurrency", () => {
  it("shares one download between concurrent calls for the same index", async () => {
    const cacheRoot = await mkdtemp(join(tmpdir(), "trueicon-ensure-"));
    tempDirs.push(cacheRoot);
    const opts = { cacheRoot, providerId: "lucide", packageName: "lucide-react", synonyms: {}, semantic: false };

    const [a, b] = await Promise.all([
      ensureIndex({ ...opts, version: "^0.460.0" }),
      ensureIndex({ ...opts, version: "0.460.0" }),
    ]);

    expect(downloadPackage).toHaveBeenCalledTimes(1);
    expect(a.cacheDir).toBe(join(cacheRoot, "lucide-react@0.460"));
    expect(b).toEqual(a);

    // Once built, later calls reuse the cached index without downloading again.
    expect(await ensureIndex({ ...opts, version: "0.460.9" })).toEqual({ cacheDir: a.cacheDir, action: "use" });
    expect(downloadPackage).toHaveBeenCalledTimes(1);
  });
});
