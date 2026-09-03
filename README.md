# wordle-agent

A Bun CLI that plays today's Wordle on nytimes.com, built for AI agents to drive. It runs the real game in a headless [`Bun.WebView`](https://bun.com/docs/runtime/webview) (no Puppeteer, no Playwright, no Chrome download on macOS), reads the board back as JSON, and by default attaches candidate suggestions from [Hurdle](https://github.com/rbutera/hurdle), a Wordle constraint solver.

```
$ wordle-agent guess tares --pretty
Wordle #1902 · 2026-09-03 — IN_PROGRESS (1/6 used)

  🟨⬛⬛⬛🟨  TARES
  ⬜⬜⬜⬜⬜
  ⬜⬜⬜⬜⬜
  ⬜⬜⬜⬜⬜
  ⬜⬜⬜⬜⬜
  ⬜⬜⬜⬜⬜

  TARES → 🟨⬛⬛⬛🟨

Hurdle: 30 candidates remain
  silty  sooty  sixty  softy  stogy  fisty  misty  fusty  busty  spilt ...
```

The game state lives in a persistent browser profile, so each CLI call is one move and the agent can think in between.

## Requirements

- [Bun](https://bun.sh) 1.4 or newer (`Bun.WebView` is experimental and shipped in 1.4).
- macOS: nothing else, it uses the system WKWebView.
- Linux / Windows: an installed Chrome, Chromium, Edge, or Brave. Bun drives it over the DevTools Protocol. Set `BUN_CHROME_PATH` if it is somewhere unusual. This path is untested; reports welcome.

## Install

```bash
git clone https://github.com/rbutera/wordle-agent
cd wordle-agent
bun install
bun link            # puts `wordle-agent` on your PATH
```

Or build a single self-contained binary (word lists included):

```bash
bun run build       # → dist/wordle-agent
```

## Commands

| Command | What it does |
| --- | --- |
| `wordle-agent status` | Show today's board. Opens the game, clears the consent banner, ad interstitial, and help modal on the way. |
| `wordle-agent guess <word>` | Submit a guess and return the scored board. |
| `wordle-agent suggest` | Hurdle suggestions for the current board (forces Hurdle on). |
| `wordle-agent solve --green _r___ --yellow a:not2,e --grey bcd` | Hurdle query with explicit clues. No browser. |
| `wordle-agent screenshot [file.png]` | PNG of the current board. |
| `wordle-agent update-answers` | Refresh the past-answers list from Rock Paper Shotgun into your data dir. |
| `wordle-agent config` | Print the effective config and which file it came from. |
| `wordle-agent reset` | Delete the browser profile. Next run starts a fresh anonymous game. |

Output is JSON by default. Add `--pretty` for the human view above.

### Exit codes

- `0` success
- `1` browser or page failure (board never appeared, page script broke, config invalid)
- `2` the guess itself was refused: not in the word list, not five letters, or the game is already over. The JSON error carries the current board so the agent can recover without another call.

## JSON shape

`status` and `guess` print the same report:

```jsonc
{
  "ok": true,
  "puzzle": { "date": "2026-09-03", "number": 1902 },
  "status": "IN_PROGRESS",          // or "WIN" / "FAIL"
  "guessesUsed": 1,
  "guessesRemaining": 5,
  "rows": [
    { "word": "tares", "pattern": "🟨⬛⬛⬛🟨",
      "tiles": [ { "letter": "t", "state": "present" }, /* ... */ ] }
  ],
  "keyboard": { "t": "present", "a": "absent", /* ... */ },
  "guess": { "word": "tares", "pattern": "🟨⬛⬛⬛🟨", "correct": false },   // guess only
  "answer": "joist",                 // only after a loss
  "hurdle": {                        // omitted with --no-hurdle or once the game is over
    "constraints": { "greens": [null, null, null, null, null],
                     "yellows": [ { "letter": "s", "notAt": [4] }, { "letter": "t", "notAt": [0] } ],
                     "greys": ["a", "e", "r"] },
    "matching": 30,
    "suggestions": [ { "word": "silty", "score": 137 }, /* ... */ ]
  }
}
```

Errors:

```json
{ "ok": false, "error": { "code": "GUESS_REJECTED", "message": "Guess \"zzzzz\" rejected: Not in word list",
                          "details": { "reason": "Not in word list", "board": { /* report */ } } } }
```

Codes: `GUESS_REJECTED`, `INVALID_GUESS`, `GAME_OVER`, `BOARD_TIMEOUT`, `REVEAL_TIMEOUT`, `BROWSER`.

## Agent loop

The intended workflow is one process per move:

```bash
wordle-agent status                 # see the board and opening suggestions
wordle-agent guess tares            # play, read the pattern and the narrowed candidate list
wordle-agent guess joist            # repeat until status is WIN or FAIL
```

A guess takes about three seconds; the first call of the day a little longer because of the pre-game ad.

Give the agent the JSON, let it pick from `hurdle.suggestions` (or reason on its own with `--no-hurdle`), and feed the word back in. Rankings are a cheap letter-coverage heuristic, not full entropy, so a capable model will sometimes do better than the top suggestion.

## Configuration

Resolution order: built-in defaults, then the config file, then `WORDLE_AGENT_*` environment variables, then CLI flags.

Config file: `~/.config/wordle-agent/config.json` (override the path with `--config` or `WORDLE_AGENT_CONFIG`). Every key is optional:

```json
{
  "hurdle": {
    "enabled": true,
    "excludePastAnswers": true,
    "maxSuggestions": 20,
    "pastAnswersPath": "~/.local/share/wordle-agent/past-answers.txt"
  },
  "browser": {
    "profileDir": "~/.local/share/wordle-agent/profile",
    "url": "https://www.nytimes.com/games/wordle/index.html",
    "width": 1000,
    "height": 900,
    "timeoutMs": 60000,
    "revealTimeoutMs": 15000,
    "backend": "webkit",
    "pageConsole": false
  },
  "output": { "format": "json" }
}
```

| Setting | Env | Flag | Notes |
| --- | --- | --- | --- |
| `hurdle.enabled` | `WORDLE_AGENT_HURDLE` | `--no-hurdle` / `--hurdle` | On by default. |
| `hurdle.excludePastAnswers` | `WORDLE_AGENT_EXCLUDE_PAST_ANSWERS` | `--include-past` | NYT has not repeated an answer so far, so past answers are dropped from the pool. |
| `hurdle.maxSuggestions` | `WORDLE_AGENT_MAX_SUGGESTIONS` | `--max <n>` | |
| `hurdle.pastAnswersPath` | `WORDLE_AGENT_PAST_ANSWERS_PATH` | | Written by `update-answers`; overrides the bundled list when present. |
| `browser.profileDir` | `WORDLE_AGENT_PROFILE_DIR` | `--profile <dir>` | Separate profiles are separate anonymous games. |
| `browser.url` | `WORDLE_AGENT_URL` | | |
| `browser.timeoutMs` | `WORDLE_AGENT_TIMEOUT_MS` | `--timeout <ms>` | Budget for getting from page load to a playable board. |
| `browser.backend` | `WORDLE_AGENT_BACKEND` | `--backend webkit\|chrome` | Defaults to webkit on macOS, chrome elsewhere. |
| `browser.pageConsole` | `WORDLE_AGENT_PAGE_CONSOLE` | `--page-console` | Mirrors the page console to stderr. Useful when the NYT DOM changes. |
| `output.format` | `WORDLE_AGENT_FORMAT` | `--json` / `--pretty` | |

## Hurdle

The solver is a port of `@hurdle/core` from the [Hurdle](https://github.com/rbutera/hurdle) repo (same word list, same past-answers scraper, same `solve` flag syntax), so it can ship in one dependency-free package. Two additions on top of Hurdle's filter pipeline, both derived automatically from the board:

- **Exact counts.** When a guess shows a letter both grey and green/yellow, the answer has exactly that many copies.
- **Count-free position exclusions.** A yellow that later turns green elsewhere keeps its "not here" information without inflating the required count.

Across guesses the required count of a letter is the maximum seen in any single guess, not the sum.

The bundled `data/past-answers.txt` is refreshed daily by a GitHub Actions cron (same as Hurdle). Locally, `wordle-agent update-answers` pulls the latest list into your data dir without updating the package.

## How it works

Everything is in `src/browser/`. The page is driven through `Bun.WebView.evaluate()` plus a couple of native clicks:

1. Load the page, remove the Fides consent overlay (it blocks native clicks and its buttons ignore synthetic ones).
2. Click Play / Continue / Admire Puzzle on the landing screen, then click through the "Continue to Wordle" ad interstitial when it shows.
3. Close the help modal (first visit) or stats modal (finished game).
4. Wait for the board to settle: a restored game replays the flip animation for every previous row and ignores input until it finishes.
5. Type by clicking the on-screen keyboard (`[data-key]`), wait for the row to show the word, click ↵.
6. Watch the row's tiles for `data-state` to become `correct` / `present` / `absent`. A toast before any tile flips means the guess was refused; the row is cleared and the toast text is returned.

Selectors are in `src/browser/scripts.ts`. If NYT changes the page, that is the file to fix.

## Development

```bash
bun test              # engine, board→constraints, config, parsers
bun run typecheck
bun run build         # single binary in dist/
```

Anything that touches the live site is exercised manually; there is no fixture for nytimes.com.

## Caveats

- `Bun.WebView` is experimental. Pin the Bun version if you depend on this.
- This plays the real puzzle as an anonymous visitor. It does not fetch the answer from NYT's API or otherwise cheat; the agent only ever sees what a human would.
- Not affiliated with The New York Times. Use it for your own daily game.

## License

MIT. Word list from [darkermango/5-Letter-words](https://github.com/darkermango/5-Letter-words); past answers from [Rock Paper Shotgun](https://www.rockpapershotgun.com/wordle-past-answers).
