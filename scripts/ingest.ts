import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { chunkMarkdown, type Chunk } from "@/lib/chunking";
import { embed, embedBatch, EMBEDDING_DIMS } from "@/lib/embeddings";
import { crawlSupabaseDocs, getRemainingCredits } from "@/lib/firecrawl";
import { getSupabaseAdmin } from "@/lib/supabase";

const EMBED_PRICE_PER_1M = 0.02; // text-embedding-3-small, USD
const BATCH_SIZE = 100;
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 3000, 9000];
const FAIL_RATIO_ABORT = 0.1;

function loadEnvLocal(): void {
  const path = resolve(process.cwd(), ".env.local");
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function requireEnv(keys: string[]): void {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing env vars: ${missing.join(", ")}`);
  }
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const delay = RETRY_DELAYS_MS[attempt];
      const msg = (err as Error).message;
      console.warn(
        `  [retry] ${label} attempt ${attempt + 1}/${MAX_RETRIES} failed: ${msg}. Waiting ${delay}ms...`
      );
      if (attempt < MAX_RETRIES - 1) await sleep(delay);
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`${label} failed after ${MAX_RETRIES} attempts`);
}

async function runPreview(): Promise<void> {
  console.log("[preview] Crawling up to 5 pages from supabase.com/docs...");
  const pages = await crawlSupabaseDocs({ limit: 5 });
  console.log(`[preview] Got ${pages.length} pages.\n`);
  for (const p of pages) {
    console.log("=".repeat(80));
    console.log(`URL:   ${p.url}`);
    console.log(`TITLE: ${p.title}`);
    console.log("-".repeat(80));
    console.log(p.markdown.slice(0, 500));
    console.log("");
  }
  console.log("=".repeat(80));
  console.log(
    "[preview] Done. Review markdown quality before running full ingest."
  );
}

async function runIngest(): Promise<void> {
  const supabase = getSupabaseAdmin();
  const creditsBefore = await getRemainingCredits();
  console.log(
    `[ingest] Firecrawl credits before: ${creditsBefore ?? "unknown"}`
  );

  // 1. Crawl.
  console.log("[ingest] Crawling supabase.com/docs (limit=500)...");
  const t0 = Date.now();
  const pages = await crawlSupabaseDocs({ limit: 500 });
  console.log(
    `[ingest] Crawl done in ${((Date.now() - t0) / 1000).toFixed(1)}s. Pages: ${pages.length}`
  );

  // 2. Chunk all pages up-front.
  const allChunks: Chunk[] = [];
  for (const page of pages) {
    const chunks = chunkMarkdown({
      url: page.url,
      title: page.title,
      markdown: page.markdown,
    });
    allChunks.push(...chunks);
  }
  console.log(`[ingest] Total chunks: ${allChunks.length}`);

  // 3. Compute hashes, dedupe among this run.
  const hashed = allChunks.map((c) => ({ ...c, content_hash: sha256(c.content) }));
  const seen = new Set<string>();
  const uniqueChunks = hashed.filter((c) => {
    if (seen.has(c.content_hash)) return false;
    seen.add(c.content_hash);
    return true;
  });
  console.log(
    `[ingest] Unique chunks (intra-run dedupe): ${uniqueChunks.length}`
  );

  // 4. Embed + upsert in batches.
  const totalBatches = Math.ceil(uniqueChunks.length / BATCH_SIZE);
  let totalTokens = 0;
  let inserted = 0;
  let skipped = 0;
  const failedBatches: number[] = [];

  for (let i = 0; i < uniqueChunks.length; i += BATCH_SIZE) {
    const batchIndex = i / BATCH_SIZE;
    const batch = uniqueChunks.slice(i, i + BATCH_SIZE);

    // Abort if failure ratio too high.
    const processedBatches = batchIndex;
    if (
      processedBatches >= 5 &&
      failedBatches.length / processedBatches > FAIL_RATIO_ABORT
    ) {
      console.error(
        `[ingest] ABORT: ${failedBatches.length}/${processedBatches} batches failed (>${FAIL_RATIO_ABORT * 100}%). Stopping.`
      );
      break;
    }

    try {
      const { embeddings, totalTokens: batchTokens } = await withRetry(
        `embedBatch[${batchIndex}]`,
        () => embedBatch(batch.map((c) => c.content))
      );
      totalTokens += batchTokens;

      const rows = batch.map((c, idx) => {
        const emb = embeddings[idx];
        if (!emb || emb.length !== EMBEDDING_DIMS) {
          throw new Error(
            `Embedding shape mismatch at batch ${batchIndex} idx ${idx}: got ${emb?.length ?? 0}`
          );
        }
        return {
          source_url: c.source_url,
          source_title: c.source_title,
          section: c.section,
          breadcrumb: c.breadcrumb,
          content: c.content,
          content_hash: c.content_hash,
          embedding: emb,
          updated_at: new Date().toISOString(),
        };
      });

      const result = await withRetry(`upsert[${batchIndex}]`, async () => {
        const { data, error } = await supabase
          .from("documents")
          .upsert(rows, {
            onConflict: "content_hash",
            ignoreDuplicates: true,
          })
          .select("id");
        if (error) throw new Error(error.message);
        return data ?? [];
      });

      const newRows = result.length;
      inserted += newRows;
      skipped += rows.length - newRows;

      const pct = (((batchIndex + 1) / totalBatches) * 100).toFixed(1);
      console.log(
        `[ingest] Batch ${batchIndex + 1}/${totalBatches} (${pct}%) | tokens=${batchTokens} | inserted=${newRows} skipped=${rows.length - newRows}`
      );
    } catch (err) {
      failedBatches.push(batchIndex);
      console.error(
        `[ingest] FAILED batch ${batchIndex} after retries: ${(err as Error).message}`
      );
    }
  }

  const creditsAfter = await getRemainingCredits();
  const creditsUsed =
    creditsBefore !== null && creditsAfter !== null
      ? creditsBefore - creditsAfter
      : null;
  const embedCostUsd = (totalTokens / 1_000_000) * EMBED_PRICE_PER_1M;

  console.log("\n" + "=".repeat(80));
  console.log("[ingest] SUMMARY");
  console.log("=".repeat(80));
  console.log(`Pages processed:     ${pages.length}`);
  console.log(`Chunks generated:    ${allChunks.length}`);
  console.log(`Unique chunks:       ${uniqueChunks.length}`);
  console.log(`Rows inserted:       ${inserted}`);
  console.log(`Rows skipped (dup):  ${skipped}`);
  console.log(`Failed batches:      ${failedBatches.length}${failedBatches.length ? ` (indices: ${failedBatches.join(", ")})` : ""}`);
  console.log(`OpenAI tokens used:  ${totalTokens}`);
  console.log(`OpenAI cost (USD):   $${embedCostUsd.toFixed(4)}`);
  console.log(
    `Firecrawl credits:   ${creditsUsed !== null ? `used ${creditsUsed} (before=${creditsBefore}, after=${creditsAfter})` : "unknown"}`
  );
  console.log("=".repeat(80));

  // 5. Validation queries.
  await runValidationQueries();
}

async function runValidationQueries(): Promise<void> {
  const queries = [
    "How do I create a table?",
    "What are Row Level Security policies?",
    "How do I sign in with Google?",
    "What's the difference between anon key and service role key?",
  ];
  const supabase = getSupabaseAdmin();
  console.log("\n[validate] Running retrieval sanity checks...\n");
  for (const q of queries) {
    console.log(`Q: ${q}`);
    try {
      const queryEmbedding = await embed(q);
      const { data, error } = await supabase.rpc("match_documents", {
        query_embedding: queryEmbedding,
        match_threshold: 0.3,
        match_count: 3,
      });
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as Array<{
        source_url: string;
        source_title: string;
        similarity: number;
      }>;
      if (rows.length === 0) {
        console.log("  (no matches above threshold)\n");
        continue;
      }
      rows.forEach((r, i) => {
        console.log(
          `  ${i + 1}. [${r.similarity.toFixed(2)}] ${r.source_title} - ${r.source_url}`
        );
      });
      console.log("");
    } catch (err) {
      console.log(`  ERROR: ${(err as Error).message}\n`);
    }
  }
}

async function main(): Promise<void> {
  loadEnvLocal();
  requireEnv([
    "FIRECRAWL_API_KEY",
    "OPENAI_API_KEY",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]);

  const preview = process.argv.includes("--preview-only");
  if (preview) {
    await runPreview();
  } else {
    await runIngest();
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
