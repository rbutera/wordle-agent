// Hurdle CLI flag syntax, ported so `solve` accepts the same clues as `hurdle solve`.
import type { YellowConstraint } from "./constraints.ts";

/** `_r___` → [null, "r", null, null, null]. `_`, `-`, `.` mean unknown. */
export function parseGreenFlag(input: string): (string | null)[] {
  if (input.length !== 5) {
    throw new Error(`--green must be exactly 5 characters, got ${input.length}: "${input}"`);
  }
  return Array.from(input).map((ch) => {
    const lower = ch.toLowerCase();
    return lower === "_" || lower === "-" || lower === "." ? null : lower;
  });
}

/** `a:not2:not4,e` → [{ letter: "a", notAt: [1, 3] }, { letter: "e" }]. Positions are 1-indexed. */
export function parseYellowFlag(input: string): YellowConstraint[] {
  if (!input.trim()) return [];
  return input.split(",").map((entry) => {
    const [head = "", ...suffixes] = entry.trim().split(":");
    const letter = head.toLowerCase();
    const notAt: number[] = [];
    for (const part of suffixes) {
      const match = /^not(\d+)$/i.exec(part);
      if (match) notAt.push(parseInt(match[1]!, 10) - 1);
    }
    const constraint: YellowConstraint = { letter };
    if (notAt.length) constraint.notAt = notAt;
    return constraint;
  });
}

/** Any mix of letters; commas and whitespace are ignored. */
export function parseGreyFlag(input: string): string[] {
  const cleaned = input.replace(/[,\s]/g, "");
  return cleaned ? Array.from(cleaned).map((ch) => ch.toLowerCase()) : [];
}
