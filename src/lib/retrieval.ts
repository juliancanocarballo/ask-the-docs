import { embed } from "@/lib/embeddings";
import { getSupabaseAdmin } from "@/lib/supabase";

export type RetrievedChunk = {
  content: string;
  source_url: string;
  source_title: string;
  section: string | null;
  similarity: number;
};

export async function retrieveChunks(
  query: string,
  matchCount: number = 6,
  threshold: number = 0.25
): Promise<RetrievedChunk[]> {
  const queryEmbedding = await embed(query);
  const { data, error } = await getSupabaseAdmin().rpc("match_documents", {
    query_embedding: queryEmbedding,
    match_threshold: threshold,
    match_count: matchCount,
  });
  if (error) throw new Error(`retrieveChunks: ${error.message}`);
  const rows = (data ?? []) as Array<{
    content: string;
    source_url: string;
    source_title: string;
    section: string | null;
    similarity: number;
  }>;
  return rows.map((r) => ({
    content: r.content,
    source_url: r.source_url,
    source_title: r.source_title,
    section: r.section,
    similarity: r.similarity,
  }));
}
