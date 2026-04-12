import { Firecrawl } from "@mendable/firecrawl-js";

export type CrawledPage = {
  url: string;
  title: string;
  markdown: string;
};

let cached: Firecrawl | null = null;

function getClient(): Firecrawl {
  if (cached) return cached;
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("Missing env var: FIRECRAWL_API_KEY");
  cached = new Firecrawl({ apiKey: key });
  return cached;
}

export type CrawlOptions = {
  limit?: number;
  excludePaths?: string[];
};

export async function crawlSupabaseDocs(
  opts: CrawlOptions = {}
): Promise<CrawledPage[]> {
  const limit = opts.limit ?? 500;
  const excludePaths = opts.excludePaths ?? [
    "/blog",
    "/customers",
    "/partners",
    "/changelog",
  ];

  const job = await getClient().crawl("https://supabase.com/docs", {
    limit,
    excludePaths,
    scrapeOptions: {
      formats: ["markdown"],
      onlyMainContent: true,
    },
  });

  const pages: CrawledPage[] = [];
  for (const doc of job.data ?? []) {
    const markdown = (doc.markdown ?? "").trim();
    if (!markdown) continue;
    const meta = doc.metadata ?? {};
    const url = meta.sourceURL || meta.url || meta.ogUrl || "";
    const title = meta.title || meta.ogTitle || "Untitled";
    if (!url) continue;
    pages.push({ url, title, markdown });
  }
  return pages;
}

export async function getRemainingCredits(): Promise<number | null> {
  try {
    const res = await getClient().getCreditUsage();
    return res.remainingCredits ?? null;
  } catch {
    return null;
  }
}
