import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

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

async function main() {
  loadEnvLocal();
  const sb = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  console.log("== Tables ==");
  for (const t of ["documents", "conversations", "leads"]) {
    const { count, error } = await sb.from(t).select("*", { count: "exact", head: true });
    console.log(error ? `  ❌ ${t}: ${error.message}` : `  ✅ ${t}: ${count} rows`);
  }

  console.log("\n== match_documents RPC ==");
  const zeroVec = new Array(1536).fill(0);
  const { error: rpcErr } = await sb.rpc("match_documents", {
    query_embedding: zeroVec,
    match_threshold: 0.0,
    match_count: 1,
  });
  console.log(rpcErr ? `  ❌ ${rpcErr.message}` : "  ✅ callable");

  console.log("\n== Expected indexes on documents ==");
  console.log("  (can't query pg_indexes via PostgREST without a helper RPC)");
  console.log("  Heuristic: try inserting two rows with the same content_hash.");

  const hash = "verify-test-" + Date.now();
  const row = {
    source_url: "https://example.com/verify",
    source_title: "verify",
    content: "verify",
    content_hash: hash,
  };
  const ins1 = await sb.from("documents").insert(row).select("id");
  if (ins1.error) {
    console.log(`  ❌ first insert failed: ${ins1.error.message}`);
    return;
  }
  const ins2 = await sb.from("documents").insert(row).select("id");
  if (ins2.error && /duplicate|unique/i.test(ins2.error.message)) {
    console.log("  ✅ UNIQUE(content_hash) enforced (duplicate rejected)");
  } else if (ins2.error) {
    console.log(`  ⚠️  second insert errored but not as unique: ${ins2.error.message}`);
  } else {
    console.log("  ❌ duplicate content_hash was accepted — UNIQUE index missing");
  }

  await sb.from("documents").delete().eq("content_hash", hash);
  console.log("\n(verify rows cleaned up)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
