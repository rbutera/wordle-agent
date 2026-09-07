import { describe, expect, it } from "bun:test";
import { boardFromRaw, type RawBoard } from "../src/browser/session.ts";

// Minimal RawBoard builders. READ_BOARD always returns 6 rows.
function emptyRow() {
  return Array.from({ length: 5 }, () => ({ letter: "", state: "empty", animation: "idle" }));
}
function scoredRow(word: string, states: string[]) {
  return word.split("").map((letter, i) => ({ letter, state: states[i] ?? "empty", animation: "idle" }));
}
function rawBoard(partial: Partial<RawBoard>): RawBoard {
  return {
    rows: Array.from({ length: 6 }, emptyRow),
    keyboard: {},
    game: null,
    toasts: [],
    ...partial,
  };
}

const winRow = scoredRow("joist", ["correct", "correct", "correct", "correct", "correct"]);

describe("boardFromRaw reconciliation (workspace-l0t63)", () => {
  it("does not report a stale WIN over an empty board", () => {
    // The exact shape that misfired: a previous day's finished WIN left in
    // localStorage, an empty DOM board, and today's live puzzle number.
    const board = boardFromRaw(
      rawBoard({ game: { status: "WIN", currentRowIndex: 6, printDate: "2026-09-03" } }),
      1904,
    );
    expect(board.status).toBe("IN_PROGRESS");
    expect(board.puzzle.date).toBeUndefined(); // stale date dropped
    expect(board.puzzle.number).toBe(1904); // live number kept
    expect(board.currentRow).toBe(0);
    expect(board.rows.filter((r) => r.evaluated)).toHaveLength(0);
  });

  it("does not report a stale FAIL over an empty board", () => {
    const board = boardFromRaw(
      rawBoard({ game: { status: "FAIL", currentRowIndex: 6, printDate: "2026-09-03" } }),
      1904,
    );
    expect(board.status).toBe("IN_PROGRESS");
    expect(board.puzzle.date).toBeUndefined();
  });

  it("keeps a WIN the DOM corroborates and its printDate", () => {
    const rows = [winRow, ...Array.from({ length: 5 }, emptyRow)];
    const board = boardFromRaw(
      rawBoard({ rows, game: { status: "WIN", currentRowIndex: 1, printDate: "2026-09-05" } }),
      1904,
    );
    expect(board.status).toBe("WIN");
    expect(board.puzzle.date).toBe("2026-09-05");
    expect(board.rows.filter((r) => r.evaluated)).toHaveLength(1);
  });

  it("keeps a FAIL the DOM corroborates (six scored rows)", () => {
    const miss = scoredRow("slate", ["absent", "absent", "absent", "absent", "absent"]);
    const rows = Array.from({ length: 6 }, () => miss.map((t) => ({ ...t })));
    const board = boardFromRaw(
      rawBoard({ rows, game: { status: "FAIL", currentRowIndex: 6, printDate: "2026-09-05" } }),
      1904,
    );
    expect(board.status).toBe("FAIL");
    expect(board.puzzle.date).toBe("2026-09-05");
  });

  it("trusts an IN_PROGRESS persisted status on any board", () => {
    const board = boardFromRaw(
      rawBoard({ game: { status: "IN_PROGRESS", currentRowIndex: 0, printDate: "2026-09-05" } }),
      1904,
    );
    expect(board.status).toBe("IN_PROGRESS");
    expect(board.puzzle.date).toBe("2026-09-05");
    expect(board.currentRow).toBe(0);
  });

  it("falls back to the DOM when there is no persisted state", () => {
    const board = boardFromRaw(rawBoard({ game: null }), 1904);
    expect(board.status).toBe("IN_PROGRESS");
    expect(board.puzzle.date).toBeUndefined();
    expect(board.puzzle.number).toBe(1904);
  });
});
