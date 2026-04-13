import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  NO_INFO_EN,
  NO_INFO_ES,
  SHOW_EMAIL_CAPTURE_MARKER,
} from "@/lib/prompts";

function loadEnvLocal(): void {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch {
    // .env.local optional for this script; we only need BASE_URL.
  }
}

const BASE_URL = process.env.CHAT_BASE_URL ?? "http://localhost:3000";

type Category = "technical" | "out-of-context" | "commercial" | "ambiguous";

type Expect = {
  contains?: string[];
  notContains?: string[];
  equalsOneOf?: string[];
  matches?: RegExp[];
  anyOf?: Array<{ contains?: string[]; equalsOneOf?: string[] }>;
};

type TestCase = {
  label: string;
  category: Category;
  lang: "en" | "es";
  query: string;
  expect: Expect;
};

const cases: TestCase[] = [
  {
    label: "Technical EN — anon vs service role key",
    category: "technical",
    lang: "en",
    query:
      "What's the difference between anon key and service role key?",
    expect: {
      contains: ["[Source:"],
      notContains: [SHOW_EMAIL_CAPTURE_MARKER, "[Fuente:"],
    },
  },
  {
    label: "Technical EN — edge function secrets",
    category: "technical",
    lang: "en",
    query: "How do Edge Functions handle secrets?",
    expect: {
      contains: ["[Source:"],
      notContains: [SHOW_EMAIL_CAPTURE_MARKER, "[Fuente:"],
    },
  },
  {
    label: "Technical ES — RLS policies (expanded to avoid embedding outlier)",
    category: "technical",
    lang: "es",
    query:
      "¿Cómo configuro políticas de Row Level Security en Postgres para mi base de datos Supabase?",
    expect: {
      contains: ["[Fuente:"],
      notContains: ["[Source:"],
    },
  },
  {
    label: "Technical EN — Google sign-in",
    category: "technical",
    lang: "en",
    query: "How do I sign in with Google using Supabase Auth?",
    expect: {
      contains: ["[Source:"],
      notContains: [SHOW_EMAIL_CAPTURE_MARKER, "[Fuente:"],
    },
  },
  {
    label: "Out-of-context EN — SaaS pricing strategy",
    category: "out-of-context",
    lang: "en",
    query: "What's the best pricing strategy for my SaaS?",
    expect: {
      equalsOneOf: [NO_INFO_EN],
      notContains: [SHOW_EMAIL_CAPTURE_MARKER, "[Source:", "[Fuente:"],
    },
  },
  {
    label: "Out-of-context ES — best JS framework",
    category: "out-of-context",
    lang: "es",
    query: "¿Cuál es el mejor framework de JavaScript en 2026?",
    expect: {
      equalsOneOf: [NO_INFO_ES],
      notContains: [SHOW_EMAIL_CAPTURE_MARKER, "[Source:", "[Fuente:"],
    },
  },
  {
    label: "Commercial EN — hiring help with Supabase Auth",
    category: "commercial",
    lang: "en",
    query:
      "I need help implementing Supabase Auth in my Next.js app — can someone help?",
    expect: {
      contains: [SHOW_EMAIL_CAPTURE_MARKER, "[Source:"],
      notContains: ["I don't have that information in the documentation"],
      matches: [/.{400,}/s],
    },
  },
  {
    label: "Commercial ES — Realtime + pedido de ayuda para implementar",
    category: "commercial",
    lang: "es",
    query:
      "¿Cómo uso Realtime en Supabase para mostrar actualizaciones en vivo en mi app? Necesito ayuda implementándolo.",
    expect: {
      contains: [SHOW_EMAIL_CAPTURE_MARKER, "[Fuente:"],
      notContains: ["[Source:", "No tengo esa información en la documentación"],
      matches: [/.{400,}/s],
    },
  },
  {
    label: "Ambiguous EN — Supabase vs Firebase",
    category: "ambiguous",
    lang: "en",
    query: "Should I use Supabase or Firebase for my project?",
    expect: {
      notContains: [SHOW_EMAIL_CAPTURE_MARKER],
      anyOf: [
        { contains: ["[Source:"] },
        { equalsOneOf: [NO_INFO_EN] },
      ],
    },
  },
  {
    label: "Ambiguous ES — subir archivos a Storage",
    category: "ambiguous",
    lang: "es",
    query:
      "¿Cómo subo archivos a Supabase Storage desde una aplicación web?",
    expect: {
      notContains: [SHOW_EMAIL_CAPTURE_MARKER],
      anyOf: [
        { contains: ["[Fuente:"] },
        { equalsOneOf: [NO_INFO_ES] },
      ],
    },
  },
];

type SseEvent = { event: string; data: string };

async function* parseSse(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<SseEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep = buffer.indexOf("\n\n");
    while (sep !== -1) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const lines = raw.split(/\r?\n/);
      let event = "message";
      const dataLines: string[] = [];
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      yield { event, data: dataLines.join("\n") };
      sep = buffer.indexOf("\n\n");
    }
  }
}

function evalExpect(fullText: string, expect: Expect): { pass: boolean; notes: string[] } {
  const notes: string[] = [];
  let pass = true;
  const trimmed = fullText.trim();

  if (expect.contains) {
    for (const needle of expect.contains) {
      const ok = fullText.includes(needle);
      notes.push(`${ok ? "✅" : "❌"} contains "${needle}"`);
      if (!ok) pass = false;
    }
  }
  if (expect.notContains) {
    for (const needle of expect.notContains) {
      const ok = !fullText.includes(needle);
      notes.push(`${ok ? "✅" : "❌"} does NOT contain "${needle}"`);
      if (!ok) pass = false;
    }
  }
  if (expect.equalsOneOf) {
    const ok = expect.equalsOneOf.includes(trimmed);
    notes.push(`${ok ? "✅" : "❌"} response equals canonical sentence`);
    if (!ok) pass = false;
  }
  if (expect.matches) {
    for (const re of expect.matches) {
      const ok = re.test(fullText);
      notes.push(`${ok ? "✅" : "❌"} matches ${re}`);
      if (!ok) pass = false;
    }
  }
  if (expect.anyOf) {
    const ok = expect.anyOf.some((sub) => {
      if (sub.contains && !sub.contains.every((n) => fullText.includes(n))) return false;
      if (sub.equalsOneOf && !sub.equalsOneOf.includes(trimmed)) return false;
      return true;
    });
    notes.push(`${ok ? "✅" : "❌"} satisfies anyOf (${expect.anyOf.length} branches)`);
    if (!ok) pass = false;
  }
  return { pass, notes };
}

async function runCase(c: TestCase, idx: number): Promise<boolean> {
  console.log("=".repeat(80));
  console.log(
    `[${idx + 1}/${cases.length}] ${c.label}  (${c.category}/${c.lang})`
  );
  console.log(`Q: ${c.query}`);
  console.log("-".repeat(80));

  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: c.query }],
    }),
  });

  if (!res.ok) {
    console.log(`❌ HTTP ${res.status}`);
    console.log(await res.text());
    return false;
  }

  const conversationId = res.headers.get("X-Conversation-Id");
  console.log(`X-Conversation-Id: ${conversationId ?? "(missing)"}`);
  console.log("");

  if (!res.body) {
    console.log("❌ no response body");
    return false;
  }

  let fullText = "";
  let sources: unknown = null;
  process.stdout.write("A: ");
  for await (const evt of parseSse(res.body)) {
    if (evt.event === "sources") {
      try {
        sources = JSON.parse(evt.data);
      } catch {
        sources = evt.data;
      }
    } else if (evt.event === "done") {
      break;
    } else if (evt.event === "message") {
      try {
        const delta = JSON.parse(evt.data);
        if (typeof delta === "string") {
          fullText += delta;
          process.stdout.write(delta);
        }
      } catch {
        // ignore malformed
      }
    }
  }
  process.stdout.write("\n\n");

  if (Array.isArray(sources) && sources.length > 0) {
    console.log(`Sources (${sources.length}):`);
    for (const s of sources as Array<{
      title: string;
      url: string;
      similarity: number;
    }>) {
      console.log(`  [${s.similarity}] ${s.title} — ${s.url}`);
    }
  } else {
    console.log("Sources: (none)");
  }

  const { pass, notes } = evalExpect(fullText, c.expect);
  for (const n of notes) console.log(n);
  console.log("");
  return pass;
}

async function main(): Promise<void> {
  loadEnvLocal();
  console.log(`[test-chat] target: ${BASE_URL}/api/chat`);
  console.log(
    "[test-chat] make sure the dev server is running (npm run dev)\n"
  );

  const results: Array<{ c: TestCase; ok: boolean }> = [];
  for (let i = 0; i < cases.length; i++) {
    try {
      const ok = await runCase(cases[i], i);
      results.push({ c: cases[i], ok });
    } catch (err) {
      console.log(`❌ error: ${(err as Error).message}`);
      results.push({ c: cases[i], ok: false });
    }
  }

  console.log("=".repeat(80));
  const byCat = new Map<Category, { pass: number; total: number }>();
  for (const { c, ok } of results) {
    const cur = byCat.get(c.category) ?? { pass: 0, total: 0 };
    cur.total += 1;
    if (ok) cur.pass += 1;
    byCat.set(c.category, cur);
  }
  console.log("Results by category:");
  for (const [cat, { pass, total }] of byCat) {
    console.log(`  ${cat}: ${pass}/${total}`);
  }
  const passed = results.filter((r) => r.ok).length;
  console.log(`\nTOTAL: ${passed}/${results.length} passed`);
  if (passed < results.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
