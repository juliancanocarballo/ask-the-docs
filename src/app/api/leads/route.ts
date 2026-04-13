import type { NextRequest } from "next/server";

import { getClientIp, leadsRatelimit } from "@/lib/ratelimit";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LEN = 254;
const MAX_NAME_LEN = 100;
const MAX_CONTEXT_LEN = 500;

type LeadRequestBody = {
  email?: unknown;
  name?: unknown;
  conversationId?: unknown;
  context?: unknown;
};

export async function POST(req: NextRequest): Promise<Response> {
  const clientIp = getClientIp(req.headers);
  const rl = await leadsRatelimit.limit(clientIp);
  if (!rl.success) {
    return new Response(
      JSON.stringify({ error: "Too many submissions. Please try again later." }),
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

  let body: LeadRequestBody;
  try {
    body = (await req.json()) as LeadRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (
    !rawEmail ||
    rawEmail.length > MAX_EMAIL_LEN ||
    !EMAIL_RE.test(rawEmail)
  ) {
    return Response.json({ error: "Invalid email" }, { status: 400 });
  }

  const rawName = typeof body.name === "string" ? body.name.trim() : "";
  const rawContext =
    typeof body.context === "string" ? body.context.slice(0, MAX_CONTEXT_LEN) : "";
  const sessionId =
    typeof body.conversationId === "string" && body.conversationId.trim().length > 0
      ? body.conversationId.trim()
      : null;

  const finalContext =
    rawName.length > 0
      ? `Name: ${rawName.slice(0, MAX_NAME_LEN)}\n\n${rawContext}`
      : rawContext.length > 0
        ? rawContext
        : null;

  try {
    const { error } = await getSupabaseAdmin().from("leads").insert({
      email: rawEmail,
      session_id: sessionId,
      context: finalContext,
    });
    if (error) {
      console.error("[api/leads] insert error:", error);
      return Response.json({ error: "Server error" }, { status: 500 });
    }
  } catch (err) {
    console.error("[api/leads] unexpected error:", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }

  return Response.json({ success: true });
}
