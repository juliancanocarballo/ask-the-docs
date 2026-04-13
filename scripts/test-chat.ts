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

type TestCase = {
  label: string;
  query: string;
  expect: {
    contains?: string[];
    equalsOneOf?: string[];
  };
};

const cases: TestCase[] = [
  {
    label: "Technical (expect citations)",
    query: "How do I set up Row Level Security?",
    expect: {
      contains: ["[Fuente:"],
    },
  },
  {
    label: "Out-of-context (expect no-info)",
    query: "What's the best pricing strategy for SaaS?",
    expect: {
      equalsOneOf: [NO_INFO_ES, NO_INFO_EN],
    },
  },
  {
    label: "Commercial intent (expect marker)",
    query:
      "I need help implementing Supabase Auth in my Next.js app — can someone help?",
    expect: {
      contains: [SHOW_EMAIL_CAPTURE_MARKER],
    },
  },
];

type SseEvent = { event: string; data: string };

async function* parseSse(stream: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
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

async function runCase(c: TestCase, idx: number): Promise<boolean> {
  console.log("=".repeat(80));
  console.log(`[${idx + 1}/${cases.length}] ${c.label}`);
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
    const text = await res.text();
    console.log(text);
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
    for (const s of sources as Array<{ title: string; url: string; similarity: number }>) {
      console.log(`  [${s.similarity}] ${s.title} — ${s.url}`);
    }
  } else {
    console.log("Sources: (none)");
  }

  // Assertions
  let pass = true;
  if (c.expect.contains) {
    for (const needle of c.expect.contains) {
      const ok = fullText.includes(needle);
      console.log(`${ok ? "✅" : "❌"} contains "${needle}"`);
      if (!ok) pass = false;
    }
  }
  if (c.expect.equalsOneOf) {
    const trimmed = fullText.trim();
    const ok = c.expect.equalsOneOf.includes(trimmed);
    console.log(`${ok ? "✅" : "❌"} response equals canonical no-info message`);
    if (!ok) pass = false;
  }
  console.log("");
  return pass;
}

async function main(): Promise<void> {
  loadEnvLocal();
  console.log(`[test-chat] target: ${BASE_URL}/api/chat`);
  console.log(
    "[test-chat] make sure the dev server is running (npm run dev)\n"
  );

  const results: boolean[] = [];
  for (let i = 0; i < cases.length; i++) {
    try {
      const ok = await runCase(cases[i], i);
      results.push(ok);
    } catch (err) {
      console.log(`❌ error: ${(err as Error).message}`);
      results.push(false);
    }
  }

  console.log("=".repeat(80));
  const passed = results.filter(Boolean).length;
  console.log(`Results: ${passed}/${results.length} passed`);
  if (passed < results.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
