/**
 * Pure math for hybrid search: cosine similarity for the semantic side and
 * reciprocal rank fusion (RRF) for merging ranked lists. No model, no I/O —
 * everything here is unit-testable with hand-made vectors.
 */

/** Cosine similarity in [-1, 1]. Returns 0 when either vector is all zeros. */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new Error(`cosineSimilarity: vector length mismatch (${a.length} vs ${b.length})`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Reciprocal rank fusion over ranked id lists: score(id) = sum of 1/(k + rank)
 * across every list containing the id (rank is 1-based, k = 60 is the literature
 * standard). Higher is better. An id both Fuse and semantic search agree on
 * accumulates from both lists and outranks an id only one side surfaced — no
 * score normalization between the two systems needed.
 */
export function reciprocalRankFusion(rankedIdLists: string[][], k = 60): Map<string, number> {
  const scores = new Map<string, number>();
  for (const ids of rankedIdLists) {
    ids.forEach((id, index) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1));
    });
  }
  return scores;
}
