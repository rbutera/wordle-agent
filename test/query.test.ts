import { describe, expect, it } from "bun:test";
import { emptyConstraints, normalizeConstraints } from "../src/hurdle/constraints.ts";
import { applyConstraints } from "../src/hurdle/query.ts";

describe("applyConstraints", () => {
  it("filters by green position", () => {
    const c = { ...emptyConstraints(), greens: [null, "r", null, null, null] };
    expect(applyConstraints(["trace", "roast", "brace"], c)).toEqual(["brace", "trace"]);
  });

  it("requires yellow letters to be present and not at excluded positions", () => {
    const c = { ...emptyConstraints(), yellows: [{ letter: "a", notAt: [0, 2] }] };
    expect(applyConstraints(["crane", "bland", "extra", "moist"], c)).toEqual(["extra"]);
  });

  it("counts duplicate yellows as a minimum count", () => {
    const c = { ...emptyConstraints(), yellows: [{ letter: "p" }, { letter: "p" }], greys: ["a", "e"] };
    expect(applyConstraints(["hippo", "paper", "puppy", "plump"], c)).toEqual(["hippo", "plump", "puppy"]);
  });

  it("drops greys that are also green or yellow (effective greys)", () => {
    const c = { ...emptyConstraints(), greens: [null, null, null, null, "s"], greys: ["s", "t"] };
    expect(normalizeConstraints(c).greys).toEqual(["t"]);
    expect(applyConstraints(["moss", "mists", "bliss"], c)).toEqual(["bliss"]);
  });

  it("enforces exact counts", () => {
    const c = { ...emptyConstraints(), yellows: [{ letter: "l" }], exactCounts: { l: 1 } };
    expect(applyConstraints(["hello", "lemon", "llama"], c)).toEqual(["lemon"]);
  });

  it("applies count-free position exclusions", () => {
    const c = { ...emptyConstraints(), greens: [null, null, "a", null, null], notAt: { a: [0] } };
    expect(applyConstraints(["abaft", "chart", "brand"], c)).toEqual(["brand", "chart"]);
  });

  it("returns a sorted copy without mutating input", () => {
    const words = ["zebra", "apple"];
    const out = applyConstraints(words, emptyConstraints());
    expect(out).toEqual(["apple", "zebra"]);
    expect(words).toEqual(["zebra", "apple"]);
  });

  it("rejects malformed constraints", () => {
    expect(() => applyConstraints([], { greens: [null], yellows: [], greys: [] })).toThrow(/exactly 5/);
    expect(() => applyConstraints([], { ...emptyConstraints(), yellows: [{ letter: "ab" }] })).toThrow(/1 character/);
  });
});
