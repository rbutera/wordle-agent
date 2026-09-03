import { describe, expect, it } from "bun:test";
import type { Row, TileState } from "../src/board.ts";
import { applyConstraints } from "../src/hurdle/query.ts";
import { constraintsFromRows, rank, suggest } from "../src/hurdle/suggest.ts";

/** "tares" + "ybbby" → present, absent, absent, absent, present */
function row(word: string, pattern: string): Row {
  const map: Record<string, TileState> = { g: "correct", y: "present", b: "absent" };
  const tiles = Array.from(word).map((letter, i) => ({ letter, state: map[pattern[i]!]! }));
  return { word, tiles, evaluated: true };
}

describe("constraintsFromRows", () => {
  it("turns a single scored row into greens, yellows and greys", () => {
    const c = constraintsFromRows([row("tares", "ybbby")]);
    expect(c.greens).toEqual([null, null, null, null, null]);
    expect(c.yellows).toEqual([
      { letter: "s", notAt: [4] },
      { letter: "t", notAt: [0] },
    ]);
    expect(c.greys).toEqual(["a", "e", "r"]);
  });

  it("ignores unevaluated rows", () => {
    const pending: Row = { word: "cra", tiles: [], evaluated: false };
    expect(constraintsFromRows([pending]).yellows).toEqual([]);
  });

  it("takes the max count across guesses, not the sum", () => {
    // 'e' yellow in two separate guesses still means at least one 'e'
    const c = constraintsFromRows([row("crane", "bbbby"), row("meaty", "bybbb")]);
    expect(c.yellows).toEqual([{ letter: "e", notAt: [1, 4] }]);
  });

  it("keeps a yellow's position info after the letter turns green elsewhere", () => {
    const c = constraintsFromRows([row("stare", "bybbb"), row("moist", "bbbbg")]);
    expect(c.greens).toEqual([null, null, null, null, "t"]);
    expect(c.yellows).toEqual([]);
    expect(c.notAt).toEqual({ t: [1] });
  });

  it("pins the exact count when a duplicate comes back grey", () => {
    // 'l' green at 2, second 'l' grey at 3 → exactly one l, and not at 3
    const c = constraintsFromRows([row("holly", "bbgbb")]);
    expect(c.greens).toEqual([null, null, "l", null, null]);
    expect(c.exactCounts).toEqual({ l: 1 });
    expect(c.notAt).toEqual({ l: [3] });
    expect(c.greys).toEqual(["h", "o", "y"]);
    expect(applyConstraints(["allay", "belly", "salad", "solar"], c)).toEqual(["salad"]);
  });

  it("does not grey out a letter that was ever green or yellow", () => {
    const c = constraintsFromRows([row("crane", "bbbby"), row("react", "bybbb")]);
    expect(c.greys).toEqual(["a", "c", "n", "r", "t"]);
    expect(c.yellows).toEqual([{ letter: "e", notAt: [1, 4] }]);
  });
});

describe("suggest / rank", () => {
  it("filters and returns the top N", () => {
    const pool = ["joist", "moist", "hoist", "crane"];
    const c = constraintsFromRows([row("crane", "bbbbb")]);
    const out = suggest(pool, c, 2);
    expect(out.total).toBe(3);
    expect(out.suggestions).toHaveLength(2);
  });

  it("ranks by letter coverage of the remaining pool", () => {
    const ranked = rank(["salet", "trace", "zzzzz"]);
    expect(ranked[2]!.word).toBe("zzzzz");
    expect(ranked[0]!.score).toBeGreaterThan(ranked[2]!.score);
  });
});
