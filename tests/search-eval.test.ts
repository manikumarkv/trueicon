import { readFileSync, rmSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { buildIndex } from "../src/indexer/buildIndex.js";
import { searchIcons } from "../src/search/search.js";
import { loadSynonyms } from "../src/synonyms/loadSynonyms.js";
import { makePackageDir } from "./helpers/fixtures.js";
import { LUCIDE_EVAL_FILES } from "./eval/fixture.js";

/*
 * Search quality eval: a data-driven answer key for "does search feel right".
 * Cases live in ./eval/cases.json — add one whenever a real query misbehaves.
 * Each case asserts the expected icon(s) rank within the top N; an empty
 * `expect` list asserts the query returns nothing. The suite gates like any
 * other test: a ranking or synonym change that breaks a case must update the
 * case, so regressions are caught instead of rediscovered.
 */

interface EvalCase {
  query: string;
  /** Icon names; at least one must rank within the top `top` results. Empty = expect no results. */
  expect: string[];
  /** 1-based rank cutoff. Defaults to 3. */
  top?: number;
}

const cases = JSON.parse(readFileSync(new URL("./eval/cases.json", import.meta.url), "utf8")) as EvalCase[];

const synonyms = loadSynonyms();
const packageDir = makePackageDir(LUCIDE_EVAL_FILES);
afterAll(() => rmSync(packageDir, { recursive: true, force: true }));

const { records } = await buildIndex({ providerId: "lucide", packageDir, version: "0.460.0", synonyms });

function check(c: EvalCase): { pass: boolean; detail: string } {
  const top = c.top ?? 3;
  const names = searchIcons(records, c.query, { limit: top }).map((r) => r.record.name);
  if (c.expect.length === 0) {
    return { pass: names.length === 0, detail: `expected no results, got [${names.join(", ")}]` };
  }
  const hit = c.expect.some((name) => names.includes(name));
  return { pass: hit, detail: `top-${top}: [${names.join(", ")}]` };
}

describe("search quality eval", () => {
  for (const c of cases) {
    const want = c.expect.length === 0 ? "no results" : `${c.expect.join("|")} in top ${c.top ?? 3}`;
    it(`"${c.query}" -> ${want}`, () => {
      const { pass, detail } = check(c);
      expect(pass, `"${c.query}": ${detail}`).toBe(true);
    });
  }

  it("reports the eval score", () => {
    const results = cases.map(check);
    const passed = results.filter((r) => r.pass).length;
    console.log(`search eval: ${passed}/${cases.length} cases pass`);
    results.forEach((r, i) => {
      if (!r.pass) console.log(`  FAIL "${cases[i]!.query}": ${r.detail}`);
    });
    expect(passed).toBe(cases.length);
  });
});
