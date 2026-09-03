// Past-answers refresh, ported from Hurdle's scraper but using Bun's built-in
// HTMLRewriter instead of cheerio so the CLI stays dependency-free.
import { parseWordList } from "./data.ts";

export const PAST_ANSWERS_URL = "https://www.rockpapershotgun.com/wordle-past-answers";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const WORD_RE = /^[A-Z]{5}$/;

export async function fetchPastAnswersHtml(url = PAST_ANSWERS_URL): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status} ${res.statusText}`);
  return res.text();
}

/**
 * Extracts every `<li>` whose trimmed text is exactly five uppercase letters.
 * Throws if nothing is found, which almost certainly means the page changed.
 */
export async function parsePastAnswersHtml(html: string): Promise<string[]> {
  const words: string[] = [];
  let current = "";
  const rewriter = new HTMLRewriter().on("li", {
    element(el) {
      current = "";
      el.onEndTag(() => {
        const text = current.trim();
        if (WORD_RE.test(text)) words.push(text);
      });
    },
    text(chunk) {
      current += chunk.text;
    },
  });
  await rewriter.transform(new Response(html)).text();

  if (words.length === 0) {
    throw new Error("parsePastAnswersHtml: extracted zero 5-letter words; page structure has likely changed");
  }
  return [...new Set(words)].sort();
}

export interface UpdateResult {
  total: number;
  added: string[];
  removed: string[];
  changed: boolean;
  outputPath: string;
}

/** Fetches, parses, diffs against `outputPath`, and writes only when changed. */
export async function updatePastAnswers(outputPath: string): Promise<UpdateResult> {
  const fetched = await parsePastAnswersHtml(await fetchPastAnswersHtml());
  const file = Bun.file(outputPath);
  const existing = (await file.exists()) ? parseWordList(await file.text()).map((w) => w.toUpperCase()) : [];

  const fetchedSet = new Set(fetched);
  const existingSet = new Set(existing);
  const added = fetched.filter((w) => !existingSet.has(w));
  const removed = existing.filter((w) => !fetchedSet.has(w));
  const changed = added.length > 0 || removed.length > 0;

  if (changed) await Bun.write(outputPath, fetched.join("\n") + "\n");

  return { total: fetched.length, added, removed, changed, outputPath };
}
