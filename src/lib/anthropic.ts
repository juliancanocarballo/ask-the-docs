import Anthropic from "@anthropic-ai/sdk";

export const CHAT_MODEL = "claude-haiku-4-5-20251001";

let cached: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (cached) return cached;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Missing env var: ANTHROPIC_API_KEY");
  cached = new Anthropic({ apiKey: key });
  return cached;
}
