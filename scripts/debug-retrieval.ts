import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { embed } from "@/lib/embeddings";
import { getSupabaseAdmin } from "@/lib/supabase";

function loadEnvLocal(): void {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

async function main(): Promise<void> {
  loadEnvLocal();

  const query = "How do I set up Row Level Security?";
  console.log(`Query: ${query}\n`);

  // --- Step 1: embed ---
  const t0 = Date.now();
  const embedding = await embed(query);
  const t1 = Date.now();

  console.log("== Embedding ==");
  console.log(`  took:        ${t1 - t0}ms`);
  console.log(`  length:      ${embedding.length}`);
  console.log(`  first 5:     [${embedding.slice(0, 5).join(", ")}]`);
  console.log(`  typeof:      ${typeof embedding}`);
  console.log(`  Array.isArray: ${Array.isArray(embedding)}`);
  console.log(`  constructor: ${(embedding as unknown as { constructor: { name: string } }).constructor.name}`);
  console.log(`  typeof [0]:  ${typeof embedding[0]}`);
  console.log(`  has NaN:     ${embedding.some((v) => Number.isNaN(v))}`);
  console.log(`  min/max:     ${Math.min(...embedding).toFixed(6)} / ${Math.max(...embedding).toFixed(6)}`);

  // --- Step 1b: dump embedding as pgvector string to file for manual SQL testing ---
  const q1Str = `[${embedding.join(",")}]`;
  const outPath = resolve(process.cwd(), "q1_embedding.txt");
  writeFileSync(outPath, q1Str, "utf8");
  console.log(`\n== Q1 embedding dumped ==`);
  console.log(`  file:     ${outPath}`);
  console.log(`  length:   ${q1Str.length} chars`);
  console.log(`  preview:  ${q1Str.slice(0, 80)}...${q1Str.slice(-40)}`);
  console.log(`\n  Paste into Supabase SQL Editor:`);
  console.log(`  -------------------------------`);
  console.log(`  select source_title, source_url,`);
  console.log(`         1 - (embedding <=> '<PASTE_EMBEDDING_HERE>'::vector) as similarity`);
  console.log(`  from documents`);
  console.log(`  order by embedding <=> '<PASTE_EMBEDDING_HERE>'::vector`);
  console.log(`  limit 6;`);

  // --- Step 2: RPC same as retrieveChunks ---
  const sb = getSupabaseAdmin();

  console.log("\n== RPC call (mirrors retrieveChunks exactly) ==");
  const t2 = Date.now();
  const rpcResponse = await sb.rpc("match_documents", {
    query_embedding: embedding,
    match_threshold: 0.25,
    match_count: 6,
  });
  const t3 = Date.now();

  console.log(`  took: ${t3 - t2}ms`);
  console.log(`  status:      ${rpcResponse.status}`);
  console.log(`  statusText:  ${rpcResponse.statusText}`);
  console.log(`  error:       ${rpcResponse.error ? JSON.stringify(rpcResponse.error) : "null"}`);
  console.log(`  data type:   ${rpcResponse.data === null ? "null" : Array.isArray(rpcResponse.data) ? "array" : typeof rpcResponse.data}`);
  console.log(`  data length: ${Array.isArray(rpcResponse.data) ? rpcResponse.data.length : "n/a"}`);

  if (Array.isArray(rpcResponse.data) && rpcResponse.data.length > 0) {
    console.log("\n== Rows ==");
    for (const row of rpcResponse.data as Array<{
      source_url: string;
      source_title: string;
      similarity: number;
    }>) {
      console.log(`  [${row.similarity?.toFixed?.(3) ?? row.similarity}] ${row.source_title} — ${row.source_url}`);
    }
  } else {
    console.log("\n(no rows returned)");
  }

  // --- Step 2b: threshold 0.0, count 10 — accept everything, see raw ranking ---
  console.log("\n== RPC call with threshold=0.0, count=10 (accept all) ==");
  const tA = Date.now();
  const rpcAll = await sb.rpc("match_documents", {
    query_embedding: embedding,
    match_threshold: 0.0,
    match_count: 10,
  });
  const tB = Date.now();

  console.log(`  took: ${tB - tA}ms`);
  console.log(`  status:      ${rpcAll.status}`);
  console.log(`  error:       ${rpcAll.error ? JSON.stringify(rpcAll.error) : "null"}`);
  console.log(`  data length: ${Array.isArray(rpcAll.data) ? rpcAll.data.length : "n/a"}`);

  if (Array.isArray(rpcAll.data) && rpcAll.data.length > 0) {
    console.log("\n== Top 10 (threshold=0.0) ==");
    for (const row of rpcAll.data as Array<{
      source_url: string;
      source_title: string;
      similarity: number;
    }>) {
      console.log(`  [${row.similarity?.toFixed?.(4) ?? row.similarity}] ${row.source_title} — ${row.source_url}`);
    }
  } else {
    console.log("\n(threshold=0.0 also returned 0 rows — there is another bug)");
  }

  // --- Step 3: sanity — try with embedding serialized as a pgvector string literal ---
  console.log("\n== RPC call variant: embedding as string '[v1,v2,...]' ==");
  const embeddingStr = `[${embedding.join(",")}]`;
  const t4 = Date.now();
  const rpcStr = await sb.rpc("match_documents", {
    query_embedding: embeddingStr,
    match_threshold: 0.25,
    match_count: 6,
  });
  const t5 = Date.now();

  console.log(`  took: ${t5 - t4}ms`);
  console.log(`  status:      ${rpcStr.status}`);
  console.log(`  error:       ${rpcStr.error ? JSON.stringify(rpcStr.error) : "null"}`);
  console.log(`  data length: ${Array.isArray(rpcStr.data) ? rpcStr.data.length : "n/a"}`);

  if (Array.isArray(rpcStr.data) && rpcStr.data.length > 0) {
    console.log("\n== Rows (string variant) ==");
    for (const row of rpcStr.data as Array<{
      source_url: string;
      source_title: string;
      similarity: number;
    }>) {
      console.log(`  [${row.similarity?.toFixed?.(3) ?? row.similarity}] ${row.source_title} — ${row.source_url}`);
    }
  }

  // --- Step 3b: raw fetch to PostgREST, bypassing supabase-js ---
  console.log("\n== Raw fetch to PostgREST /rest/v1/rpc/match_documents ==");
  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const url = `${SUPABASE_URL}/rest/v1/rpc/match_documents`;
  const body = JSON.stringify({
    query_embedding: embedding,
    match_threshold: 0.0,
    match_count: 6,
  });

  console.log("  Body length:", body.length);
  console.log("  Body first 200 chars:", body.substring(0, 200));

  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body,
  });

  console.log("  Status:", res.status);
  console.log("  Headers:", Object.fromEntries(res.headers.entries()));
  const text = await res.text();
  console.log("  Response body (first 500):", text.substring(0, 500));

  // --- Step 3c: raw fetch BUT embedding as pgvector string "[v1,v2,...]" ---
  console.log("\n== Raw fetch with embedding as STRING '[v1,v2,...]' ==");
  const embeddingStrRaw = `[${embedding.join(",")}]`;
  const rawStrBody = JSON.stringify({
    query_embedding: embeddingStrRaw,
    match_threshold: 0.0,
    match_count: 6,
  });
  console.log("  Body length:", rawStrBody.length);
  console.log("  Body first 200 chars:", rawStrBody.substring(0, 200));

  const resStr = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: rawStrBody,
  });

  console.log("  Status:", resStr.status);
  console.log("  Headers:", Object.fromEntries(resStr.headers.entries()));
  const textStr = await resStr.text();
  console.log("  Response body (first 500):", textStr.substring(0, 500));

  try {
    const parsed = JSON.parse(textStr);
    if (Array.isArray(parsed)) {
      console.log(`  parsed rows: ${parsed.length}`);
      for (const row of parsed.slice(0, 6) as Array<{
        source_url: string;
        source_title: string;
        similarity: number;
      }>) {
        console.log(`    [${row.similarity?.toFixed?.(4) ?? row.similarity}] ${row.source_title} — ${row.source_url}`);
      }
    }
  } catch {
    // not json
  }

  // --- Step 3d: use the embedding of a stored RLS chunk as query vector ---
  console.log("\n" + "=".repeat(80));
  console.log("== Step 3d: query using embedding of a stored RLS chunk ==");
  console.log("=".repeat(80));

  const { data: rlsRows, error: rlsErr } = await sb
    .from("documents")
    .select("id, source_url, source_title, content, embedding")
    .ilike("content", "%row level security%")
    .limit(1);

  if (rlsErr) {
    console.log(`  ❌ failed to fetch RLS chunk: ${rlsErr.message}`);
  } else if (!rlsRows || rlsRows.length === 0) {
    console.log("  ❌ no chunk with 'row level security' in content found");
  } else {
    const row = rlsRows[0] as {
      id: number;
      source_url: string;
      source_title: string;
      content: string;
      embedding: unknown;
    };
    console.log(`  seed chunk id=${row.id} | ${row.source_title} | ${row.source_url}`);

    // pgvector column may come back as string "[v1,v2,...]" or as number[]
    let storedEmbedding: number[];
    if (Array.isArray(row.embedding)) {
      storedEmbedding = row.embedding as number[];
      console.log(`  embedding came back as array, length=${storedEmbedding.length}`);
    } else if (typeof row.embedding === "string") {
      const s = row.embedding.trim();
      const inner = s.startsWith("[") && s.endsWith("]") ? s.slice(1, -1) : s;
      storedEmbedding = inner.split(",").map((x) => Number(x));
      console.log(`  embedding came back as string, parsed length=${storedEmbedding.length}`);
    } else {
      console.log(`  ⚠️ unexpected embedding type: ${typeof row.embedding}`);
      storedEmbedding = [];
    }

    if (storedEmbedding.length === 1536) {
      const rpcSeed = await sb.rpc("match_documents", {
        query_embedding: storedEmbedding,
        match_threshold: 0.05,
        match_count: 6,
      });

      console.log(`  RPC status:  ${rpcSeed.status}`);
      console.log(`  RPC error:   ${rpcSeed.error ? JSON.stringify(rpcSeed.error) : "null"}`);
      console.log(`  data length: ${Array.isArray(rpcSeed.data) ? rpcSeed.data.length : "n/a"}`);

      if (Array.isArray(rpcSeed.data) && rpcSeed.data.length > 0) {
        console.log("\n  Top matches (seed = stored RLS embedding):");
        for (const r of rpcSeed.data as Array<{
          id: number;
          source_url: string;
          source_title: string;
          similarity: number;
        }>) {
          const self = r.id === row.id ? " (SELF)" : "";
          console.log(`    [${r.similarity?.toFixed?.(4) ?? r.similarity}] ${r.source_title} — ${r.source_url}${self}`);
        }
        console.log("\n  → If this returned rows, PostgREST/RPC works with native JS array.");
        console.log("    If Q1 (OpenAI-embedded) returns 0 for the same threshold,");
        console.log("    the issue is that OpenAI embedding ≠ similar to any chunk.");
      } else {
        console.log("\n  → Stored embedding also returned 0 rows. Transport/RPC bug, not query issue.");
      }
    }
  }

  // --- Step 4: side-by-side comparison across the 3 test-chat queries ---
  console.log("\n" + "=".repeat(80));
  console.log("== Side-by-side: all 3 test-chat queries (threshold=0.25, count=6) ==");
  console.log("=".repeat(80));

  const queries = [
    "How do I set up Row Level Security?",
    "What's the best pricing strategy for SaaS?",
    "I need help implementing Supabase Auth in my Next.js app — can someone help?",
  ];

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    console.log(`\n[Q${i + 1}] ${q}`);
    try {
      const emb = await embed(q);
      const rpc = await sb.rpc("match_documents", {
        query_embedding: emb,
        match_threshold: 0.25,
        match_count: 6,
      });
      const rows = Array.isArray(rpc.data)
        ? (rpc.data as Array<{
            source_url: string;
            source_title: string;
            similarity: number;
          }>)
        : [];
      const top = rows.length > 0 ? rows[0].similarity : null;
      console.log(`  embedding length: ${emb.length}`);
      console.log(`  rpc error:        ${rpc.error ? JSON.stringify(rpc.error) : "null"}`);
      console.log(`  rpc data length:  ${rows.length}`);
      console.log(`  top similarity:   ${top !== null ? top.toFixed(4) : "(none)"}`);
      if (rows.length > 0) {
        console.log("  top source:       " + rows[0].source_title + " — " + rows[0].source_url);
      }
    } catch (err) {
      console.log(`  ERROR: ${(err as Error).message}`);
    }
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
