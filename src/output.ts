// JSON by default (this is a tool for agents); --pretty for humans.
import type { Board } from "./board.ts";
import { EMOJI, evaluatedRows, guessesRemaining, rowPattern } from "./board.ts";
import type { Constraints } from "./hurdle/constraints.ts";
import type { Suggestion } from "./hurdle/suggest.ts";

export interface HurdleReport {
  constraints: Constraints;
  matching: number;
  suggestions: Suggestion[];
}

export interface Report {
  ok: true;
  puzzle: Board["puzzle"];
  status: Board["status"];
  guessesUsed: number;
  guessesRemaining: number;
  rows: { word: string; pattern: string; tiles: Board["rows"][number]["tiles"] }[];
  keyboard: Board["keyboard"];
  guess?: { word: string; pattern: string; correct: boolean };
  /** Revealed by the game after a loss. */
  answer?: string;
  hurdle?: HurdleReport;
}

export function buildReport(board: Board, opts: { guess?: string; hurdle?: HurdleReport } = {}): Report {
  const scored = evaluatedRows(board);
  const report: Report = {
    ok: true,
    puzzle: board.puzzle,
    status: board.status,
    guessesUsed: scored.length,
    guessesRemaining: guessesRemaining(board),
    rows: scored.map((r) => ({ word: r.word, pattern: rowPattern(r), tiles: r.tiles })),
    keyboard: board.keyboard,
  };
  if (board.answer) report.answer = board.answer;
  if (opts.guess) {
    const row = scored.find((r) => r.word === opts.guess);
    if (row) report.guess = { word: row.word, pattern: rowPattern(row), correct: row.tiles.every((t) => t.state === "correct") };
  }
  if (opts.hurdle) report.hurdle = opts.hurdle;
  return report;
}

export function formatReport(report: Report, format: "json" | "pretty"): string {
  if (format === "json") return JSON.stringify(report, null, 2);

  const lines: string[] = [];
  const title = [report.puzzle.number ? `Wordle #${report.puzzle.number}` : "Wordle", report.puzzle.date].filter(Boolean).join(" · ");
  lines.push(`${title} — ${report.status} (${report.guessesUsed}/6 used)`);
  lines.push("");
  for (const r of report.rows) lines.push(`  ${r.pattern}  ${r.word.toUpperCase()}`);
  for (let i = report.rows.length; i < 6; i++) lines.push(`  ${EMOJI.empty.repeat(5)}`);
  if (report.guess) {
    lines.push("");
    lines.push(report.guess.correct ? `  ${report.guess.word.toUpperCase()} is correct. Solved!` : `  ${report.guess.word.toUpperCase()} → ${report.guess.pattern}`);
  }
  if (report.answer && report.status === "FAIL") {
    lines.push(`  Out of guesses. The answer was ${report.answer.toUpperCase()}.`);
  }
  if (report.hurdle) {
    lines.push("");
    lines.push(`Hurdle: ${report.hurdle.matching} candidate${report.hurdle.matching === 1 ? " remains" : "s remain"}`);
    if (report.hurdle.suggestions.length) {
      lines.push("  " + report.hurdle.suggestions.map((s) => s.word).join("  "));
    }
  }
  return lines.join("\n");
}

export interface ErrorReport {
  ok: false;
  error: { code: string; message: string; details?: Record<string, unknown> };
}

export function formatError(report: ErrorReport, format: "json" | "pretty"): string {
  if (format === "json") return JSON.stringify(report, null, 2);
  return `error [${report.error.code}]: ${report.error.message}`;
}
