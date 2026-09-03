# For agents working in this repo

- Runtime is Bun ≥ 1.4. `bun test`, `bun run typecheck`, `bun run build`.
- `src/browser/scripts.ts` holds every selector used against nytimes.com. Verify against the live page before changing them; there is no DOM fixture.
- `src/hurdle/` is a port of `@hurdle/core`. Keep its filter semantics compatible with Hurdle (see README "Hurdle" for the two intentional additions).
- Output is JSON first. Pretty output is a convenience; never break the JSON shape without a version bump.
- The default browser profile is a real anonymous game for today. Use `--profile /tmp/something` when testing so you do not burn the user's daily puzzle.
