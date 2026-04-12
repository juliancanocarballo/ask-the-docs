import OpenAI from "openai";

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMS = 1536;
const MAX_BATCH = 100;

let cached: OpenAI | null = null;

function getClient(): OpenAI {
  if (cached) return cached;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Missing env var: OPENAI_API_KEY");
  cached = new OpenAI({ apiKey: key });
  return cached;
}

export async function embed(text: string): Promise<number[]> {
  const res = await getClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return res.data[0].embedding;
}

export type EmbedBatchResult = {
  embeddings: number[][];
  totalTokens: number;
};

export async function embedBatch(texts: string[]): Promise<EmbedBatchResult> {
  if (texts.length === 0) return { embeddings: [], totalTokens: 0 };
  if (texts.length > MAX_BATCH) {
    throw new Error(
      `embedBatch received ${texts.length} inputs, max is ${MAX_BATCH}`
    );
  }
  const res = await getClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });
  return {
    embeddings: res.data.map((d) => d.embedding),
    totalTokens: res.usage.total_tokens,
  };
}
