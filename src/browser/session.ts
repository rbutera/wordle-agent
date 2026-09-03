// Drives nytimes.com/games/wordle through Bun.WebView.
import { mkdirSync } from "node:fs";
import type { Board, Row, Tile, TileState } from "../board.ts";
import type { Config } from "../config.ts";
import * as js from "./scripts.ts";

export class WordleError extends Error {
  constructor(
    public code:
      | "BOARD_TIMEOUT"
      | "REVEAL_TIMEOUT"
      | "GUESS_REJECTED"
      | "GAME_OVER"
      | "INVALID_GUESS"
      | "BROWSER",
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

interface RawTile {
  letter: string;
  state: string;
  animation: string;
}
interface RawBoard {
  rows: RawTile[][];
  keyboard: Record<string, string>;
  game: { status?: string; currentRowIndex?: number; printDate?: string; hardMode?: boolean } | null;
  toasts: string[];
}

const KEY_ENTER = "↵";
const KEY_BACKSPACE = "←";

export class WordleSession {
  private view: Bun.WebView;
  private puzzleNumber: number | null = null;

  constructor(private cfg: Config["browser"]) {
    mkdirSync(cfg.profileDir, { recursive: true });
    this.view = new Bun.WebView({
      width: cfg.width,
      height: cfg.height,
      backend: cfg.backend,
      dataStore: { directory: cfg.profileDir },
      ...(cfg.pageConsole ? { console: (type: string, ...args: unknown[]) => console.error(`[page:${type}]`, ...args) } : {}),
    });
  }

  close(): void {
    this.view.close();
  }

  [Symbol.dispose](): void {
    this.close();
  }

  /** Navigates to Wordle and gets the board on screen with all overlays gone. */
  async open(): Promise<void> {
    try {
      await this.view.navigate(this.cfg.url);
    } catch (err) {
      throw new WordleError("BROWSER", `Could not load ${this.cfg.url}: ${(err as Error).message}`);
    }

    const deadline = Date.now() + this.cfg.timeoutMs;
    let landingClicked = false;
    while (Date.now() < deadline) {
      await this.eval(js.REMOVE_CONSENT);
      if ((await this.eval<number>(js.TILE_COUNT)) >= 30) break;

      if (!landingClicked) {
        if (this.puzzleNumber === null) this.puzzleNumber = await this.eval<number | null>(js.PUZZLE_NUMBER);
        landingClicked = await this.eval<boolean>(js.CLICK_LANDING);
      }
      const skip = await this.eval<{ x: number; y: number } | null>(js.INTERSTITIAL_SKIP_POINT);
      if (skip) await this.view.click(skip.x, skip.y);

      await Bun.sleep(300);
    }
    if ((await this.eval<number>(js.TILE_COUNT)) < 30) {
      throw new WordleError("BOARD_TIMEOUT", `Board did not appear within ${this.cfg.timeoutMs}ms`);
    }

    // The help modal opens on first visit; the stats modal after a finished game.
    await this.dismissModals();
    await this.eval(js.REMOVE_CONSENT);
    await this.waitForSettled();
  }

  /**
   * Restored games replay every previous row's flip animation and drop input
   * until it ends. Require two quiet checks in a row so we don't sneak in
   * between the restore and the first flip.
   */
  private async waitForSettled(): Promise<void> {
    const deadline = Date.now() + this.cfg.revealTimeoutMs;
    let quiet = 0;
    while (Date.now() < deadline && quiet < 2) {
      quiet = (await this.eval<boolean>(js.BOARD_SETTLED)) ? quiet + 1 : 0;
      await Bun.sleep(quiet ? 250 : 100);
    }
  }

  /**
   * Closes modals as they appear. Modals open a beat after the board (help on
   * first visit, stats after a finished game), so keep watching for `graceMs`
   * after the last one closed before deciding there are none.
   */
  private async dismissModals(graceMs = 1500): Promise<void> {
    let until = Date.now() + graceMs;
    while (Date.now() < until) {
      if (await this.eval<boolean>(js.CLOSE_MODAL)) {
        await this.waitFor(`!(${js.MODAL_OPEN})`, 3000);
        until = Date.now() + graceMs;
        continue;
      }
      await Bun.sleep(120);
    }
  }

  async readBoard(): Promise<Board> {
    const raw = await this.eval<RawBoard>(js.READ_BOARD);
    return this.toBoard(raw);
  }

  /**
   * Types `word` into the current row and submits it. Resolves with the
   * updated board once the row has been scored. Rejected guesses (not in the
   * word list, hard-mode violations) are cleared from the row and thrown as
   * GUESS_REJECTED with the toast text.
   */
  async guess(word: string): Promise<Board> {
    const w = word.trim().toLowerCase();
    if (!/^[a-z]{5}$/.test(w)) {
      throw new WordleError("INVALID_GUESS", `Guess must be exactly five letters a-z, got "${word}"`);
    }

    const before = await this.readBoard();
    if (before.status !== "IN_PROGRESS") {
      throw new WordleError("GAME_OVER", `Today's game is already over (${before.status})`, { board: before });
    }
    const rowIndex = before.currentRow;

    await this.clearRow(rowIndex);
    for (const ch of w) await this.eval(js.clickKey(ch));
    if (!(await this.waitFor(`(${js.rowText(rowIndex)}) === ${JSON.stringify(w)}`, 5000))) {
      throw new WordleError("BROWSER", `Typed "${w}" but row ${rowIndex + 1} did not update`);
    }

    await this.eval(js.clickKey(KEY_ENTER));

    const deadline = Date.now() + this.cfg.revealTimeoutMs;
    while (Date.now() < deadline) {
      const scored = await this.eval<boolean>(js.rowScored(rowIndex));
      const toast = await this.eval<string | null>(js.TOAST_TEXT);
      // A toast before any tile has flipped is a rejection ("Not in word
      // list", hard-mode rules). Toasts after scoring are "Magnificent" or
      // the revealed answer, and the board carries that information anyway.
      if (toast && !scored && !(await this.eval<boolean>(js.rowStartedScoring(rowIndex)))) {
        await this.waitFor(`!(${js.ROW_SHAKING})`, 2000);
        await this.clearRow(rowIndex);
        throw new WordleError("GUESS_REJECTED", `Guess "${w}" rejected: ${toast}`, { reason: toast, board: before });
      }
      if (scored) {
        // Let the last flip finish and the game state persist, then read back.
        await Bun.sleep(400);
        const board = await this.readBoard();
        if (board.status === "FAIL") {
          // The loss toast is the answer in capitals.
          const toast = await this.eval<string | null>(js.TOAST_TEXT);
          if (toast && /^[A-Z]{5}$/.test(toast)) board.answer = toast.toLowerCase();
        }
        return board;
      }
      await Bun.sleep(80);
    }
    throw new WordleError("REVEAL_TIMEOUT", `Row ${rowIndex + 1} did not finish scoring within ${this.cfg.revealTimeoutMs}ms`);
  }

  async screenshot(): Promise<Uint8Array> {
    return (await this.view.screenshot({ encoding: "buffer" })) as Uint8Array;
  }

  private async clearRow(rowIndex: number): Promise<void> {
    const typed = await this.eval<string>(js.rowText(rowIndex));
    for (let i = 0; i < typed.length; i++) await this.eval(js.clickKey(KEY_BACKSPACE));
    if (typed.length) await this.waitFor(`(${js.rowText(rowIndex)}) === ''`, 3000);
  }

  private toBoard(raw: RawBoard): Board {
    const rows: Row[] = raw.rows.map((tiles) => {
      const mapped: Tile[] = tiles.map((t) => ({ letter: t.letter, state: asTileState(t.state) }));
      const evaluated = mapped.length === 5 && mapped.every((t) => ["correct", "present", "absent"].includes(t.state));
      return { word: mapped.map((t) => t.letter).join(""), tiles: mapped, evaluated };
    });

    const evaluatedCount = rows.filter((r) => r.evaluated).length;
    const won = rows.some((r) => r.evaluated && r.tiles.every((t) => t.state === "correct"));
    const statusFromDom = won ? "WIN" : evaluatedCount >= 6 ? "FAIL" : "IN_PROGRESS";
    const status = isStatus(raw.game?.status) ? raw.game.status : statusFromDom;

    const keyboard: Board["keyboard"] = {};
    for (const [k, s] of Object.entries(raw.keyboard)) {
      if (s === "correct" || s === "present" || s === "absent") keyboard[k] = s;
    }

    return {
      puzzle: {
        ...(raw.game?.printDate ? { date: raw.game.printDate } : {}),
        ...(this.puzzleNumber ? { number: this.puzzleNumber } : {}),
      },
      status,
      currentRow: raw.game?.currentRowIndex ?? evaluatedCount,
      rows,
      keyboard,
    };
  }

  private async waitFor(expr: string, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.eval<boolean>(expr)) return true;
      await Bun.sleep(60);
    }
    return false;
  }

  private async eval<T = unknown>(script: string): Promise<T> {
    try {
      return (await this.view.evaluate(script)) as T;
    } catch (err) {
      throw new WordleError("BROWSER", `Page script failed: ${(err as Error).message}`, { script: script.slice(0, 120) });
    }
  }
}

function asTileState(s: string): TileState {
  return s === "correct" || s === "present" || s === "absent" || s === "tbd" ? s : "empty";
}

function isStatus(s: unknown): s is Board["status"] {
  return s === "IN_PROGRESS" || s === "WIN" || s === "FAIL";
}
