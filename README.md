# ask-the-docs

A public demo: an AI chatbot with RAG trained on the official Supabase docs. Answers technical questions with citations, gracefully handles out-of-scope questions, and captures leads on commercial intent. Built as a sales demo for a freelance chatbot-integration service.

## Stack

- Next.js 15 (App Router) + TypeScript
- Tailwind CSS + shadcn/ui
- Claude Haiku 4.5 (`claude-haiku-4-5-20251001`)
- OpenAI `text-embedding-3-small`
- Supabase (Postgres + pgvector)
- Firecrawl (ingest), Upstash Redis (rate limit + cache)
- Vercel (hosting), Plausible (analytics)

## Setup

1. Clone and install:
   ```bash
   npm install
   ```
2. Create a Supabase project and run `supabase/schema.sql` in the SQL Editor.
3. Copy `.env.example` to `.env.local` and fill in the keys.
4. Run the dev server:
   ```bash
   npm run dev
   ```

## Status

Day 1 complete — Setup done (Next.js + Tailwind + shadcn/ui scaffolded, Supabase schema ready, env template in place).

---

Need this for your own docs? 7-day custom implementation. Contact me.
