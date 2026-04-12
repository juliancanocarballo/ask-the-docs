const CHARS_PER_TOKEN = 4;
const TARGET_TOKENS = 800;
const OVERLAP_TOKENS = 100;
const HARD_CAP_TOKENS = 1500;

const TARGET_CHARS = TARGET_TOKENS * CHARS_PER_TOKEN; // 3200
const OVERLAP_CHARS = OVERLAP_TOKENS * CHARS_PER_TOKEN; // 400
const HARD_CAP_CHARS = HARD_CAP_TOKENS * CHARS_PER_TOKEN; // 6000

export type ChunkInput = {
  url: string;
  title: string;
  markdown: string;
};

export type Chunk = {
  content: string;
  section: string;
  breadcrumb: string;
  source_url: string;
  source_title: string;
};

export function chunkMarkdown(input: ChunkInput): Chunk[] {
  const { url, title, markdown } = input;
  const section = detectSection(markdown) || title;
  const breadcrumb = buildBreadcrumb(url);

  const lines = markdown.split(/\r?\n/);
  const chunks: Chunk[] = [];

  let buf: string[] = [];
  let bufLen = 0;
  let insideFence = false;
  let fenceLang = "";
  let currentH1 = "";
  let currentH2 = "";
  let currentH3 = "";

  const flush = (reopenFenceLang: string | null = null): void => {
    const body = buf.join("\n").trim();
    if (!body) {
      buf = [];
      bufLen = 0;
      return;
    }
    const header = headerPrefix(currentH1, currentH2, currentH3);
    const content = header ? `${header}\n\n${body}` : body;
    chunks.push({
      content,
      section,
      breadcrumb,
      source_url: url,
      source_title: title,
    });

    // Build overlap from tail of emitted body (line-boundary).
    const overlapLines = takeTailLines(buf, OVERLAP_CHARS);
    buf = [];
    bufLen = 0;
    if (reopenFenceLang !== null) {
      const fenceLine = "```" + reopenFenceLang;
      buf.push(fenceLine);
      bufLen += fenceLine.length + 1;
    }
    for (const l of overlapLines) {
      buf.push(l);
      bufLen += l.length + 1;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine;

    // Track fences.
    const fenceMatch = line.match(/^```(\w*)\s*$/);
    if (fenceMatch) {
      if (!insideFence) {
        insideFence = true;
        fenceLang = fenceMatch[1] ?? "";
      } else {
        insideFence = false;
        fenceLang = "";
      }
    }

    // Track headers (only outside code fences).
    if (!insideFence) {
      const h = line.match(/^(#{1,3})\s+(.+?)\s*$/);
      if (h) {
        const level = h[1].length;
        const text = h[2].trim();
        if (level === 1) {
          currentH1 = text;
          currentH2 = "";
          currentH3 = "";
        } else if (level === 2) {
          currentH2 = text;
          currentH3 = "";
        } else {
          currentH3 = text;
        }
      }
    }

    buf.push(line);
    bufLen += line.length + 1;

    // Hard cap: force flush even mid-fence.
    if (bufLen >= HARD_CAP_CHARS) {
      if (insideFence) {
        // Close fence at end of current buffer so chunk is valid markdown.
        buf.push("```");
        const reopenLang = fenceLang;
        flush(reopenLang);
      } else {
        flush();
      }
      continue;
    }

    // Soft target: flush only if outside a fence.
    if (bufLen >= TARGET_CHARS && !insideFence) {
      flush();
    }
  }

  // Final flush.
  if (insideFence) {
    buf.push("```");
  }
  flush();

  return chunks;
}

function detectSection(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^#{1,2}\s+(.+?)\s*$/);
    if (m) return m[1].trim();
  }
  return "";
}

function buildBreadcrumb(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname
      .split("/")
      .filter(Boolean)
      .filter((p) => p !== "docs");
    return parts.map(titleCase).join(" > ");
  } catch {
    return "";
  }
}

function titleCase(s: string): string {
  return s
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function headerPrefix(h1: string, h2: string, h3: string): string {
  if (h2) return `## ${h2}`;
  if (h1) return `# ${h1}`;
  if (h3) return `### ${h3}`;
  return "";
}

function takeTailLines(lines: string[], maxChars: number): string[] {
  const out: string[] = [];
  let acc = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (acc + l.length + 1 > maxChars && out.length > 0) break;
    out.unshift(l);
    acc += l.length + 1;
  }
  return out;
}
