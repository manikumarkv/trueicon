import type { Synonyms } from "../indexer/types.js";
import bundled from "./synonyms.json" with { type: "json" };

/** Checks that `value` is an object mapping lowercase terms to arrays of lowercase strings. */
export function parseSynonyms(value: unknown): Synonyms {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Synonyms must be an object of term -> string[]");
  }
  const synonyms: Synonyms = {};
  for (const [term, alternates] of Object.entries(value)) {
    if (!Array.isArray(alternates) || !alternates.every((a): a is string => typeof a === "string")) {
      throw new Error(`Synonyms for "${term}" must be an array of strings`);
    }
    synonyms[term.toLowerCase()] = alternates.map((a) => a.toLowerCase());
  }
  return synonyms;
}

/** Loads the synonyms bundled with the package (src/synonyms/synonyms.json). */
export function loadSynonyms(): Synonyms {
  return parseSynonyms(bundled);
}
