import { parseArgs } from "node:util";
import { rmSync } from "node:fs";
import path from "node:path";
import type { Board } from "./board.ts";
import { WordleError, WordleSession } from "./browser/session.ts";
import { DEFAULT_CONFIG_PATH, loadConfig, type Config } from "./config.ts";
import { buildCandidateAnswers, loadPastAnswers, loadWords } from "./hurdle/data.ts";
import { updatePastAnswers } from "./hurdle/scrape.ts";
import { constraintsFromRows, suggest } from "./hurdle/suggest.ts";
import { parseGreenFlag, parseGreyFlag, parseYellowFlag } from "./hurdle/flags.ts";
import { buildReport, formatError, formatReport, type HurdleReport } from "./output.ts";

const USAGE = `wordle-agent — play today's NYT Wordle from the command line

Usage:
  wordle-agent status                Show today's board (opens the game if needed)
  wordle-agent guess <word>          Submit a guess and show the result
  wordle-agent suggest               Hurdle suggestions for the current board
  wordle-agent solve [--green ..]    Hurdle query with explicit clues, no browser
  wordle-agent screenshot [file]     Save a PNG of the current board (default: wordle.png)
  wordle-agent update-answers        Refresh the past-answers list from Rock Paper Shotgun
  wordle-agent config                Print the effective config and where it came from
  wordle-agent reset                 Delete the saved browser profile (starts a fresh anonymous game)

Options:
  --json / --pretty                  Output format (default: json)
  --no-hurdle                        Skip Hurdle suggestions
  --max <n>                          Number of suggestions (default: 20)
  --include-past                     Keep past Wordle answers in the candidate pool
  --config <path>                    Config file (default: ${DEFAULT_CONFIG_PATH})
  --profile <dir>                    Browser profile directory
  --timeout <ms>                     Time budget for the board to appear
  --page-console                     Mirror the page's console to stderr
  -h, --help

solve flags (Hurdle syntax, positions are 1-indexed):
  --green _r___      Known letters by position; _ - . for unknown
  --yellow a:not2,e  Present letters, optional :not<pos> exclusions
  --grey bcd         Absent letters

Environment: WORDLE_AGENT_CONFIG, WORDLE_AGENT_HURDLE, WORDLE_AGENT_MAX_SUGGESTIONS,
  WORDLE_AGENT_EXCLUDE_PAST_ANSWERS, WORDLE_AGENT_PROFILE_DIR, WORDLE_AGENT_URL,
  WORDLE_AGENT_TIMEOUT_MS, WORDLE_AGENT_BACKEND, WORDLE_AGENT_FORMAT, WORDLE_AGENT_PAGE_CONSOLE
`;

export async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      json: { type: "boolean" },
      pretty: { type: "boolean" },
      hurdle: { type: "boolean" },
      "no-hurdle": { type: "boolean" },
      max: { type: "string" },
      "include-past": { type: "boolean" },
      config: { type: "string" },
      profile: { type: "string" },
      timeout: { type: "string" },
      backend: { type: "string" },
      "page-console": { type: "boolean" },
      green: { type: "string" },
      yellow: { type: "string" },
      grey: { type: "string" },
      bundled: { type: "boolean" },
    },
  });

  const [command, ...rest] = positionals;
  if (values.help || !command) {
    process.stdout.write(USAGE);
    return values.help ? 0 : 1;
  }

  const { config, configPath } = await loadConfig({
    configPath: values.config,
    flags: {
      hurdle: {
        enabled: values["no-hurdle"] ? false : values.hurdle ? true : undefined,
        maxSuggestions: values.max !== undefined ? Number(values.max) : undefined,
        excludePastAnswers: values["include-past"] ? false : undefined,
      },
      browser: {
        profileDir: values.profile,
        timeoutMs: values.timeout !== undefined ? Number(values.timeout) : undefined,
        backend: values.backend as Config["browser"]["backend"] | undefined,
        pageConsole: values["page-console"],
      },
      output: { format: values.pretty ? "pretty" : values.json ? "json" : undefined },
    },
  });
  const fmt = config.output.format;

  try {
    switch (command) {
      case "status":
        return await withSession(config, async (s) => {
          const board = await s.readBoard();
          print(formatReport(buildReport(board, { hurdle: await hurdleFor(board, config) }), fmt));
          return 0;
        });

      case "guess": {
        const word = rest[0];
        if (!word) throw new WordleError("INVALID_GUESS", "Usage: wordle-agent guess <word>");
        return await withSession(config, async (s) => {
          const board = await s.guess(word);
          print(formatReport(buildReport(board, { guess: word.toLowerCase(), hurdle: await hurdleFor(board, config) }), fmt));
          return 0;
        });
      }

      case "suggest":
        return await withSession(config, async (s) => {
          const board = await s.readBoard();
          const hurdle = await hurdleFor(board, { ...config, hurdle: { ...config.hurdle, enabled: true } });
          print(formatReport(buildReport(board, { hurdle }), fmt));
          return 0;
        });

      case "solve": {
        const constraints = {
          greens: values.green !== undefined ? parseGreenFlag(values.green) : [null, null, null, null, null],
          yellows: values.yellow !== undefined ? parseYellowFlag(values.yellow) : [],
          greys: values.grey !== undefined ? parseGreyFlag(values.grey) : [],
        };
        const pool = await candidatePool(config);
        const { total, suggestions } = suggest(pool, constraints, config.hurdle.maxSuggestions);
        const out = { ok: true, constraints, matching: total, suggestions };
        print(fmt === "json" ? JSON.stringify(out, null, 2) : `${total} candidates\n  ${suggestions.map((s) => s.word).join("  ")}`);
        return 0;
      }

      case "screenshot": {
        const file = path.resolve(rest[0] ?? "wordle.png");
        return await withSession(config, async (s) => {
          await Bun.write(file, await s.screenshot());
          print(fmt === "json" ? JSON.stringify({ ok: true, file }, null, 2) : `saved ${file}`);
          return 0;
        });
      }

      case "update-answers": {
        // --bundled refreshes the repo's data file (used by the CI cron);
        // the default refreshes the user-local copy that overrides it.
        const target = values.bundled
          ? path.join(import.meta.dir, "..", "data", "past-answers.txt")
          : config.hurdle.pastAnswersPath;
        const result = await updatePastAnswers(target);
        print(
          fmt === "json"
            ? JSON.stringify({ ok: true, ...result }, null, 2)
            : result.changed
              ? `updated ${result.outputPath}: +${result.added.length} -${result.removed.length} (${result.total} total)`
              : `no changes (${result.total} total)`,
        );
        return 0;
      }

      case "config":
        print(fmt === "json" ? JSON.stringify({ ok: true, configPath, config }, null, 2) : `config file: ${configPath ?? "(none)"}\n${JSON.stringify(config, null, 2)}`);
        return 0;

      case "reset":
        rmSync(config.browser.profileDir, { recursive: true, force: true });
        print(fmt === "json" ? JSON.stringify({ ok: true, removed: config.browser.profileDir }, null, 2) : `removed ${config.browser.profileDir}`);
        return 0;

      default:
        process.stderr.write(`Unknown command: ${command}\n\n${USAGE}`);
        return 1;
    }
  } catch (err) {
    const e = err instanceof WordleError ? err : new WordleError("BROWSER", (err as Error).message ?? String(err));
    const details = e.details && "board" in e.details ? { ...e.details, board: buildReport(e.details.board as Board) } : e.details;
    print(formatError({ ok: false, error: { code: e.code, message: e.message, ...(details ? { details } : {}) } }, fmt), true);
    return e.code === "GUESS_REJECTED" || e.code === "INVALID_GUESS" || e.code === "GAME_OVER" ? 2 : 1;
  }
}

async function withSession(config: Config, fn: (s: WordleSession) => Promise<number>): Promise<number> {
  using session = new WordleSession(config.browser);
  await session.open();
  // `await` matters: returning the bare promise would dispose the view first.
  return await fn(session);
}

async function candidatePool(config: Config): Promise<string[]> {
  const words = loadWords();
  if (!config.hurdle.excludePastAnswers) return words;
  return buildCandidateAnswers(words, await loadPastAnswers(config.hurdle.pastAnswersPath));
}

async function hurdleFor(board: Board, config: Config): Promise<HurdleReport | undefined> {
  if (!config.hurdle.enabled || board.status !== "IN_PROGRESS") return undefined;
  const constraints = constraintsFromRows(board.rows);
  const { total, suggestions } = suggest(await candidatePool(config), constraints, config.hurdle.maxSuggestions);
  return { constraints, matching: total, suggestions };
}

function print(text: string, toStderr = false): void {
  (toStderr ? process.stderr : process.stdout).write(text + "\n");
}
