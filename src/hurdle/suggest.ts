// Bridges the Wordle board to Hurdle constraints and ranks the survivors.
import type { Row } from "../board.ts";
import type { Constraints, YellowConstraint } from "./constraints.ts";
import { emptyConstraints } from "./constraints.ts";
import { applyConstraints } from "./query.ts";

/**
 * Derives Hurdle constraints from the evaluated rows of a board.
 *
 * Duplicate letters are the tricky part. Within one guess, N correct/present
 * tiles of a letter mean "at least N copies"; across guesses we take the max,
 * not the sum. A grey tile for a letter that is also correct/present in the
 * same guess pins the exact count and also rules out that position.
 */
export function constraintsFromRows(rows: Row[]): Constraints {
  const c = emptyConstraints();
  const scored = rows.filter((r) => r.evaluated);

  const minCount = new Map<string, number>();
  const exactCount = new Map<string, number>();
  const notAt = new Map<string, Set<number>>();
  const everHit = new Set<string>(); // letters seen correct or present anywhere
  const greyOnly = new Set<string>();

  const exclude = (letter: string, pos: number) => {
    if (!notAt.has(letter)) notAt.set(letter, new Set());
    notAt.get(letter)!.add(pos);
  };

  for (const row of scored) {
    const hits = new Map<string, number>();
    for (const t of row.tiles) {
      if (t.state === "correct" || t.state === "present") {
        hits.set(t.letter, (hits.get(t.letter) ?? 0) + 1);
        everHit.add(t.letter);
      }
    }
    for (const [letter, n] of hits) {
      minCount.set(letter, Math.max(minCount.get(letter) ?? 0, n));
    }

    row.tiles.forEach((t, i) => {
      if (t.state === "correct") {
        c.greens[i] = t.letter;
      } else if (t.state === "present") {
        exclude(t.letter, i);
      } else if (t.state === "absent") {
        if (hits.has(t.letter)) {
          exactCount.set(t.letter, hits.get(t.letter)!);
          exclude(t.letter, i);
        } else {
          greyOnly.add(t.letter);
        }
      }
    });
  }

  const greenCount = new Map<string, number>();
  for (const g of c.greens) {
    if (g) greenCount.set(g, (greenCount.get(g) ?? 0) + 1);
  }

  // Yellow entries = copies required beyond what the greens already provide.
  for (const [letter, n] of minCount) {
    const extra = n - (greenCount.get(letter) ?? 0);
    const positions = [...(notAt.get(letter) ?? [])].sort((a, b) => a - b);
    for (let k = 0; k < extra; k++) {
      const y: YellowConstraint = { letter };
      if (positions.length) y.notAt = positions;
      c.yellows.push(y);
    }
    if (extra <= 0 && positions.length) {
      c.notAt = { ...(c.notAt ?? {}), [letter]: positions };
    }
  }

  c.yellows.sort((a, b) => a.letter.localeCompare(b.letter));
  c.greys = [...greyOnly].filter((l) => !everHit.has(l)).sort();

  if (exactCount.size) c.exactCounts = Object.fromEntries(exactCount);

  return c;
}

export interface Suggestion {
  word: string;
  score: number;
}

/**
 * Filters the pool and ranks survivors by how much of the remaining pool each
 * one "covers": sum over its distinct letters of positional and overall
 * frequency among the candidates. A cheap heuristic, not entropy, but it
 * pushes common-letter, no-repeat words to the top which is what you want.
 */
export function suggest(pool: string[], constraints: Constraints, limit: number): { total: number; suggestions: Suggestion[] } {
  const matches = applyConstraints(pool, constraints);
  const suggestions = rank(matches).slice(0, Math.max(0, limit));
  return { total: matches.length, suggestions };
}

export function rank(words: string[]): Suggestion[] {
  const overall = new Map<string, number>();
  const positional = Array.from({ length: 5 }, () => new Map<string, number>());
  for (const w of words) {
    for (const ch of new Set(w)) overall.set(ch, (overall.get(ch) ?? 0) + 1);
    for (let i = 0; i < 5; i++) {
      const ch = w[i]!;
      positional[i]!.set(ch, (positional[i]!.get(ch) ?? 0) + 1);
    }
  }
  const scored = words.map((word) => {
    let score = 0;
    const seen = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const ch = word[i]!;
      score += positional[i]!.get(ch) ?? 0;
      if (!seen.has(ch)) {
        score += overall.get(ch) ?? 0;
        seen.add(ch);
      }
    }
    return { word, score };
  });
  return scored.sort((a, b) => b.score - a.score || a.word.localeCompare(b.word));
}
