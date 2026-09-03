import { describe, expect, it } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { configFromEnv, defaultConfig, loadConfig, mergeConfig } from "../src/config.ts";
import { parseGreenFlag, parseGreyFlag, parseYellowFlag } from "../src/hurdle/flags.ts";
import { buildCandidateAnswers, loadWords, parseWordList } from "../src/hurdle/data.ts";
import { parsePastAnswersHtml } from "../src/hurdle/scrape.ts";

describe("config", () => {
  it("has hurdle on by default", () => {
    expect(defaultConfig().hurdle.enabled).toBe(true);
  });

  it("merges without letting undefined clobber defaults", () => {
    const merged = mergeConfig(defaultConfig(), { hurdle: { enabled: undefined, maxSuggestions: 3 } });
    expect(merged.hurdle.enabled).toBe(true);
    expect(merged.hurdle.maxSuggestions).toBe(3);
  });

  it("reads env overrides", () => {
    const patch = configFromEnv({ WORDLE_AGENT_HURDLE: "false", WORDLE_AGENT_MAX_SUGGESTIONS: "7", WORDLE_AGENT_FORMAT: "pretty" });
    expect(patch.hurdle?.enabled).toBe(false);
    expect(patch.hurdle?.maxSuggestions).toBe(7);
    expect(patch.output?.format).toBe("pretty");
  });

  it("layers file < env < flags", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wa-"));
    const file = path.join(dir, "config.json");
    writeFileSync(file, JSON.stringify({ hurdle: { maxSuggestions: 5, enabled: false }, output: { format: "pretty" } }));
    const { config, configPath } = await loadConfig({
      configPath: file,
      env: { WORDLE_AGENT_MAX_SUGGESTIONS: "9" },
      flags: { output: { format: "json" } },
    });
    expect(configPath).toBe(file);
    expect(config.hurdle.enabled).toBe(false);
    expect(config.hurdle.maxSuggestions).toBe(9);
    expect(config.output.format).toBe("json");
  });

  it("rejects bad values", async () => {
    await expect(loadConfig({ configPath: "/nonexistent", env: {}, flags: { output: { format: "yaml" as never } } })).rejects.toThrow(/output.format/);
  });
});

describe("hurdle flag parsing", () => {
  it("parses green templates", () => {
    expect(parseGreenFlag("_R.-e")).toEqual([null, "r", null, null, "e"]);
    expect(() => parseGreenFlag("abcdef")).toThrow(/exactly 5/);
  });
  it("parses yellow specs with 1-indexed exclusions", () => {
    expect(parseYellowFlag("a:not2:not4,E")).toEqual([{ letter: "a", notAt: [1, 3] }, { letter: "e" }]);
    expect(parseYellowFlag("  ")).toEqual([]);
  });
  it("parses grey letters loosely", () => {
    expect(parseGreyFlag("b, c D")).toEqual(["b", "c", "d"]);
  });
});

describe("data", () => {
  it("bundles a usable word list", () => {
    const words = loadWords();
    expect(words.length).toBeGreaterThan(5000);
    expect(words).toContain("crane");
  });
  it("parses and dedupes word lists", () => {
    expect(parseWordList("Crane\ncrane\nfour\nsixsix\n\n")).toEqual(["crane"]);
  });
  it("excludes past answers from the pool", () => {
    expect(buildCandidateAnswers(["crane", "moist"], ["CRANE"])).toEqual(["moist"]);
  });
  it("extracts past answers from list items", async () => {
    const html = `<ul><li>ABACK</li><li> ZESTY </li><li>Not a word</li><li>abcde</li></ul><li>QUERY</li>`;
    expect(await parsePastAnswersHtml(html)).toEqual(["ABACK", "QUERY", "ZESTY"]);
    await expect(parsePastAnswersHtml("<p>nothing</p>")).rejects.toThrow(/zero/);
  });
});
