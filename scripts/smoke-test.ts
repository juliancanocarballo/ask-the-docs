import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

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

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

type Result = { name: string; ok: boolean; detail: string };

async function testAnthropic(): Promise<Result> {
  try {
    const client = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 20,
      messages: [{ role: "user", content: "Say 'ok' in 3 words." }],
    });
    const text = res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim();
    return { name: "Anthropic", ok: true, detail: `reply="${text}"` };
  } catch (err) {
    return { name: "Anthropic", ok: false, detail: (err as Error).message };
  }
}

async function testOpenAI(): Promise<Result> {
  try {
    const client = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
    const res = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: "hello world",
    });
    const len = res.data[0]?.embedding.length ?? 0;
    if (len !== 1536) {
      return {
        name: "OpenAI",
        ok: false,
        detail: `expected 1536 dims, got ${len}`,
      };
    }
    return { name: "OpenAI", ok: true, detail: `embedding dims=${len}` };
  } catch (err) {
    return { name: "OpenAI", ok: false, detail: (err as Error).message };
  }
}

async function testSupabase(): Promise<Result> {
  try {
    const client = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } }
    );

    const docs = await client
      .from("documents")
      .select("*", { count: "exact", head: true });
    if (docs.error) throw new Error(`documents: ${docs.error.message}`);

    const convs = await client
      .from("conversations")
      .select("*", { count: "exact", head: true });
    if (convs.error) throw new Error(`conversations: ${convs.error.message}`);

    const leads = await client
      .from("leads")
      .select("*", { count: "exact", head: true });
    if (leads.error) throw new Error(`leads: ${leads.error.message}`);

    return {
      name: "Supabase",
      ok: true,
      detail: `documents=${docs.count ?? 0}, conversations=${convs.count ?? 0}, leads=${leads.count ?? 0}`,
    };
  } catch (err) {
    return { name: "Supabase", ok: false, detail: (err as Error).message };
  }
}

async function testFirecrawl(): Promise<Result> {
  try {
    const key = requireEnv("FIRECRAWL_API_KEY");
    const res = await fetch(
      "https://api.firecrawl.dev/v2/team/credit-usage",
      { headers: { Authorization: `Bearer ${key}` } }
    );
    if (!res.ok) {
      const body = await res.text();
      return {
        name: "Firecrawl",
        ok: false,
        detail: `HTTP ${res.status}: ${body.slice(0, 200)}`,
      };
    }
    const json = (await res.json()) as unknown;
    return {
      name: "Firecrawl",
      ok: true,
      detail: `credits=${JSON.stringify(json)}`,
    };
  } catch (err) {
    return { name: "Firecrawl", ok: false, detail: (err as Error).message };
  }
}

async function main(): Promise<void> {
  loadEnvLocal();

  const tests = [testAnthropic, testOpenAI, testSupabase, testFirecrawl];
  const results: Result[] = [];

  for (const test of tests) {
    const r = await test();
    results.push(r);
    const icon = r.ok ? "✅" : "❌";
    console.log(`${icon} ${r.name}: ${r.detail}`);
  }

  console.log("");
  const allOk = results.every((r) => r.ok);
  if (allOk) {
    console.log("🎉 All APIs working, ready for day 2");
  } else {
    console.log("⚠️  Fix failing APIs before day 2");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
