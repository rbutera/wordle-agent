// Word data. The bundled lists ship inside the binary via Bun text imports;
// a user-local past-answers.txt (refreshed by `update-answers`) takes precedence.
import bundledWords from "../../data/words.txt" with { type: "text" };
import bundledPastAnswers from "../../data/past-answers.txt" with { type: "text" };

const FIVE_LOWER = /^[a-z]{5}$/;

/** Parses a newline-separated word list into sorted, deduped, lowercase 5-letter words. */
export function parseWordList(raw: string): string[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim().toLowerCase())
    .filter((l) => FIVE_LOWER.test(l));
  return [...new Set(lines)].sort();
}

export function loadWords(): string[] {
  return parseWordList(bundledWords);
}

/**
 * Loads past answers. If `overridePath` exists it wins over the bundled list;
 * otherwise the bundled snapshot is used.
 */
export async function loadPastAnswers(overridePath?: string): Promise<string[]> {
  if (overridePath) {
    const file = Bun.file(overridePath);
    if (await file.exists()) return parseWordList(await file.text());
  }
  return parseWordList(bundledPastAnswers);
}

/**
 * Builds the candidate answer pool: all words not in pastAnswers,
 * deduplicated and sorted. Lowercases both inputs for comparison.
 */
export function buildCandidateAnswers(words: string[], pastAnswers: string[]): string[] {
  const pastSet = new Set(pastAnswers.map((w) => w.toLowerCase()));
  const candidates = words.map((w) => w.toLowerCase()).filter((w) => !pastSet.has(w));
  return [...new Set(candidates)].sort();
}
