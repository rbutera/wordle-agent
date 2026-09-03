// Board model shared by the browser layer, the Hurdle bridge, and the CLI output.

export type TileState = "correct" | "present" | "absent" | "tbd" | "empty";
export type GameStatus = "IN_PROGRESS" | "WIN" | "FAIL";

export interface Tile {
  letter: string; // lowercase, "" when empty
  state: TileState;
}

export interface Row {
  word: string; // lowercase letters typed so far
  tiles: Tile[];
  /** true once the row has been submitted and every tile scored */
  evaluated: boolean;
}

export interface Board {
  puzzle: { date?: string; number?: number };
  status: GameStatus;
  currentRow: number; // 0-indexed row that the next guess goes into
  rows: Row[]; // always 6
  keyboard: Record<string, Exclude<TileState, "tbd" | "empty">>;
  /** Only known after a loss, when the game reveals it. */
  answer?: string;
}

export const EMOJI: Record<TileState, string> = {
  correct: "🟩",
  present: "🟨",
  absent: "⬛",
  tbd: "▫️",
  empty: "⬜",
};

export function rowPattern(row: Row): string {
  return row.tiles.map((t) => EMOJI[t.state]).join("");
}

export function evaluatedRows(board: Board): Row[] {
  return board.rows.filter((r) => r.evaluated);
}

export function guessesRemaining(board: Board): number {
  return board.status === "IN_PROGRESS" ? 6 - evaluatedRows(board).length : 0;
}
