// Ported from @hurdle/core (github.com/rbutera/hurdle), MIT.
import { normalizeConstraints } from "./constraints.ts";
import type { Constraints } from "./constraints.ts";

/**
 * Applies constraints to a list of candidates and returns a new
 * alphabetically-sorted array of matching candidates. Pure function.
 *
 * Filter pipeline (same as Hurdle, plus step 5):
 * 1. Green check — candidate letter at each non-null position must match
 * 2. Yellow presence with letter-count awareness — candidate must contain
 *    at least as many of each letter as appear across greens + yellows combined
 * 3. Yellow notAt check — candidate must not have a yellow letter at its
 *    forbidden positions
 * 4. Effective grey check — candidate must not contain any effective grey letter
 * 5. Exact count check — when a guess pinned a letter's count, enforce it
 * 6. Position exclusions that carry no count information (see Constraints.notAt)
 */
export function applyConstraints(candidates: string[], constraints: Constraints): string[] {
  const norm = normalizeConstraints(constraints);

  const requiredCounts = new Map<string, number>();
  for (const g of norm.greens) {
    if (g !== null) requiredCounts.set(g, (requiredCounts.get(g) ?? 0) + 1);
  }
  for (const y of norm.yellows) {
    requiredCounts.set(y.letter, (requiredCounts.get(y.letter) ?? 0) + 1);
  }

  const effectiveGreySet = new Set(norm.greys);
  const exactCounts = Object.entries(norm.exactCounts ?? {});
  const notAt = Object.entries(norm.notAt ?? {});

  const result = candidates.filter((candidate) => {
    const word = candidate.toLowerCase();

    for (let i = 0; i < 5; i++) {
      const green = norm.greens[i];
      if (green != null && word[i] !== green) return false;
    }

    for (const [letter, required] of requiredCounts) {
      if (countOf(word, letter) < required) return false;
    }

    for (const y of norm.yellows) {
      if (!y.notAt) continue;
      for (const pos of y.notAt) {
        if (word[pos] === y.letter) return false;
      }
    }

    for (const ch of word) {
      if (effectiveGreySet.has(ch)) return false;
    }

    for (const [letter, n] of exactCounts) {
      if (countOf(word, letter) !== n) return false;
    }

    for (const [letter, positions] of notAt) {
      for (const pos of positions) {
        if (word[pos] === letter) return false;
      }
    }

    return true;
  });

  return result.slice().sort();
}

function countOf(word: string, letter: string): number {
  let n = 0;
  for (const ch of word) if (ch === letter) n++;
  return n;
}
