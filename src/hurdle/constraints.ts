// Ported from @hurdle/core (github.com/rbutera/hurdle), MIT.

export type YellowConstraint = {
  letter: string;
  notAt?: number[]; // 0-indexed; omit/empty = position-agnostic
};

export type Constraints = {
  greens: (string | null)[]; // length 5
  yellows: YellowConstraint[];
  greys: string[];
  /**
   * Exact letter counts, learned when a guess shows a letter both grey and
   * green/yellow. Wordle marks the surplus copies grey, which pins the count.
   * Not part of Hurdle's original type; optional so plain Hurdle-style
   * constraints still work.
   */
  exactCounts?: Record<string, number>;
  /**
   * Positions a letter is known NOT to occupy, without implying an extra copy
   * of that letter. Used when a letter was yellow in one guess and later
   * turned green elsewhere: the yellow's position info still holds, but a
   * yellow entry would wrongly raise the required count.
   */
  notAt?: Record<string, number[]>;
};

export function emptyConstraints(): Constraints {
  return { greens: [null, null, null, null, null], yellows: [], greys: [] };
}

/**
 * Normalizes a Constraints object:
 * - Lowercases all letters (greens, yellow letters, greys)
 * - Validates greens has exactly length 5 (throws if not)
 * - Validates yellow letters are exactly 1 character (throws if not)
 * - Produces effective greys by removing any grey letter also in greens or yellows
 * - Returns a new object (does not mutate)
 */
export function normalizeConstraints(raw: Constraints): Constraints {
  if (raw.greens.length !== 5) {
    throw new Error(`greens must have exactly 5 entries, got ${raw.greens.length}`);
  }

  const greens = raw.greens.map((g) => (g === null ? null : g.toLowerCase()));

  const yellows: YellowConstraint[] = raw.yellows.map((y) => {
    if (y.letter.length !== 1) {
      throw new Error(`yellow letter must be exactly 1 character, got "${y.letter}"`);
    }
    return {
      letter: y.letter.toLowerCase(),
      ...(y.notAt !== undefined ? { notAt: [...y.notAt] } : {}),
    };
  });

  const greys = raw.greys.map((g) => g.toLowerCase());

  const greenLetters = new Set(greens.filter((g): g is string => g !== null));
  const yellowLetters = new Set(yellows.map((y) => y.letter));
  const effectiveGreys = greys.filter((g) => !greenLetters.has(g) && !yellowLetters.has(g));

  const exactCounts: Record<string, number> = {};
  for (const [letter, n] of Object.entries(raw.exactCounts ?? {})) {
    exactCounts[letter.toLowerCase()] = n;
  }

  const notAt: Record<string, number[]> = {};
  for (const [letter, positions] of Object.entries(raw.notAt ?? {})) {
    notAt[letter.toLowerCase()] = [...positions];
  }

  return { greens, yellows, greys: effectiveGreys, exactCounts, notAt };
}
