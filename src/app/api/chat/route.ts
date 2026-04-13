import { createHash, randomUUID } from "node:crypto";
import { headers } from "next/headers";
import type { NextRequest } from "next/server";

import { CHAT_MODEL, getAnthropic } from "@/lib/anthropic";
import {
  SHOW_EMAIL_CAPTURE_MARKER,
  SYSTEM_PROMPT,
  buildUserPrompt,
  detectLanguage,
  getNoInfoMessage,
} from "@/lib/prompts";
import { chatRatelimit, getClientIp } from "@/lib/ratelimit";
import { retrieveChunks, type RetrievedChunk } from "@/lib/retrieval";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_TOKENS = 1024;
const TEMPERATURE = 0.3;
const TOP_K = 6;
const MATCH_THRESHOLD = 0.25;

type ChatRole = "user" | "assistant";

type ClientMessage = { role: ChatRole; content: string };

type ChatRequestBody = {
  messages: ClientMessage[];
  conversationId?: string;
};

type SourcePayload = {
  title: string;
  url: string;
  section: string | null;
  similarity: number;
};

function sseData(text: string): string {
  return `data: ${JSON.stringify(text)}\n\n`;
}

function sseEvent(event: string, payload: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function hashIp(ip: string): string {
  const salt = process.env.IP_HASH_SALT ?? "";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

function toSourcePayload(chunks: RetrievedChunk[]): SourcePayload[] {
  return chunks.map((c) => ({
    title: c.source_title,
    url: c.source_url,
    section: c.section,
    similarity: Number(c.similarity.toFixed(4)),
  }));
}

export async function POST(req: NextRequest): Promise<Response> {
  const startedAt = Date.now();

  const clientIp = getClientIp(req.headers);
  const rl = await chatRatelimit.limit(clientIp);
  if (!rl.success) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Please try again later." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "X-RateLimit-Limit": String(rl.limit),
          "X-RateLimit-Remaining": String(rl.remaining),
          "X-RateLimit-Reset": String(rl.reset),
        },
      }
    );
  }

  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser || !lastUser.content?.trim()) {
    return Response.json(
      { error: "messages[] must contain at least one user message" },
      { status: 400 }
    );
  }

  const query = lastUser.content.trim();
  const sessionId = body.conversationId?.trim() || randomUUID();

  const hdrs = await headers();
  const rawIp =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    hdrs.get("x-real-ip") ||
    "unknown";
  const ipHash = hashIp(rawIp);

  const supabase = getSupabaseAdmin();

  // Persist user message BEFORE calling Claude (analytics-friendly on failures).
  try {
    await supabase.from("conversations").insert({
      session_id: sessionId,
      ip_hash: ipHash,
      role: "user",
      content: query,
    });
  } catch (err) {
    console.error("[api/chat] failed to persist user message:", err);
    // continue — user message loss is acceptable vs failing the chat
  }

  // Retrieve chunks.
  let chunks: RetrievedChunk[] = [];
  try {
    chunks = await retrieveChunks(query, TOP_K, MATCH_THRESHOLD);
  } catch (err) {
    console.error("[api/chat] retrieval failed:", err);
    return Response.json(
      { error: "Retrieval failed", detail: (err as Error).message },
      { status: 500 }
    );
  }

  const sources = toSourcePayload(chunks);
  const topSimilarity = chunks[0]?.similarity ?? null;
  const encoder = new TextEncoder();
  const responseHeaders = {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Conversation-Id": sessionId,
    "Access-Control-Expose-Headers": "X-Conversation-Id",
  };

  // ----- INTERCEPT PATH: no chunks, return fixed no-info message. -----
  if (chunks.length === 0) {
    const lang = detectLanguage(query);
    const fullText = getNoInfoMessage(lang);

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode(sseEvent("sources", [])));
        controller.enqueue(encoder.encode(sseData(fullText)));
        controller.enqueue(encoder.encode(sseEvent("done", "")));

        try {
          await supabase.from("conversations").insert({
            session_id: sessionId,
            ip_hash: ipHash,
            role: "assistant",
            content: fullText,
            sources: [],
          });
        } catch (err) {
          console.error("[api/chat] failed to persist assistant (intercept):", err);
        }

        console.log("[api/chat]", {
          query: query.slice(0, 80),
          num_chunks_retrieved: 0,
          top_similarity_score: null,
          commercial_intent_detected: false,
          claude_input_tokens: 0,
          claude_output_tokens: 0,
          duration_ms: Date.now() - startedAt,
          intercepted: true,
        });

        controller.close();
      },
    });

    return new Response(stream, { headers: responseHeaders });
  }

  // ----- CLAUDE PATH: build augmented user prompt + stream. -----
  const history = messages.slice(0, -1).map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const augmentedLast = {
    role: "user" as const,
    content: buildUserPrompt({ query, chunks }),
  };
  const claudeMessages = [...history, augmentedLast];

  const anthropic = getAnthropic();
  const anthropicStream = anthropic.messages.stream({
    model: CHAT_MODEL,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    system: SYSTEM_PROMPT,
    messages: claudeMessages,
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let fullText = "";
      let inputTokens = 0;
      let outputTokens = 0;

      try {
        controller.enqueue(encoder.encode(sseEvent("sources", sources)));

        for await (const event of anthropicStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const delta = event.delta.text;
            fullText += delta;
            controller.enqueue(encoder.encode(sseData(delta)));
          }
        }

        const finalMessage = await anthropicStream.finalMessage();
        inputTokens = finalMessage.usage.input_tokens;
        outputTokens = finalMessage.usage.output_tokens;
      } catch (err) {
        console.error("[api/chat] streaming error:", err);
        const msg =
          "\n\n[error: streaming interrupted. Please retry.]";
        fullText += msg;
        controller.enqueue(encoder.encode(sseData(msg)));
      }

      controller.enqueue(encoder.encode(sseEvent("done", "")));

      const commercialIntent = fullText.includes(SHOW_EMAIL_CAPTURE_MARKER);

      try {
        await supabase.from("conversations").insert({
          session_id: sessionId,
          ip_hash: ipHash,
          role: "assistant",
          content: fullText,
          sources,
        });
      } catch (err) {
        console.error("[api/chat] failed to persist assistant message:", err);
      }

      console.log("[api/chat]", {
        query: query.slice(0, 80),
        num_chunks_retrieved: chunks.length,
        top_similarity_score:
          topSimilarity !== null ? Number(topSimilarity.toFixed(4)) : null,
        commercial_intent_detected: commercialIntent,
        claude_input_tokens: inputTokens,
        claude_output_tokens: outputTokens,
        duration_ms: Date.now() - startedAt,
      });

      controller.close();
    },
  });

  return new Response(stream, { headers: responseHeaders });
}
