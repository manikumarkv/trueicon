import type { IconRecord } from "../indexer/types.js";

/**
 * Embedding model for opt-in semantic search. all-MiniLM-L6-v2 is small (~90MB ONNX),
 * fast on CPU, and plenty for short icon names/keywords. The Xenova namespace hosts the
 * ONNX-optimized build that transformers.js loads.
 */
export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";

/** Dimensionality of EMBEDDING_MODEL output vectors. */
export const EMBEDDING_DIMENSIONS = 384;

export interface SemanticEmbedder {
  /** Embeds each text into a normalized vector of EMBEDDING_DIMENSIONS numbers. */
  embed(texts: string[]): Promise<number[][]>;
}

/**
 * Text embedded per icon: the dashed name plus its keyword expansions (tags and
 * synonyms are already baked into keywords at index time, so the vector inherits them).
 */
export function semanticText(record: Pick<IconRecord, "name" | "keywords">): string {
  return [record.name, ...record.keywords].join(" ");
}

let cached: Promise<SemanticEmbedder> | null = null;

/**
 * Loads the embedding model on first use and reuses it afterwards. The model file
 * (~90MB) downloads to the transformers.js cache on the very first run only.
 * The dynamic import keeps transformers.js out of the startup path entirely when
 * semantic search is disabled.
 */
export function getEmbedder(): Promise<SemanticEmbedder> {
  cached ??= (async (): Promise<SemanticEmbedder> => {
    const { pipeline } = await import("@huggingface/transformers");
    const extractor = await pipeline("feature-extraction", EMBEDDING_MODEL);
    return {
      async embed(texts: string[]): Promise<number[][]> {
        const output = await extractor(texts, { pooling: "mean", normalize: true });
        return output.tolist() as number[][];
      },
    };
  })();
  return cached;
}
