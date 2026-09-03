// Config resolution: defaults < config file < WORDLE_AGENT_* env < CLI flags.
import { homedir } from "node:os";
import path from "node:path";

export interface Config {
  hurdle: {
    /** Attach Hurdle candidate suggestions to status/guess output. */
    enabled: boolean;
    /** Drop words that have already been a Wordle answer. */
    excludePastAnswers: boolean;
    /** How many ranked suggestions to include. */
    maxSuggestions: number;
    /** Path to a refreshed past-answers.txt (written by `update-answers`). */
    pastAnswersPath: string;
  };
  browser: {
    /** Persistent WebView profile so the game survives across CLI invocations. */
    profileDir: string;
    url: string;
    width: number;
    height: number;
    /** Overall budget for getting from a fresh page to a playable board. */
    timeoutMs: number;
    /** Time to wait for a submitted row to finish scoring. */
    revealTimeoutMs: number;
    backend: "webkit" | "chrome";
    /** Mirror the page's console to stderr; useful when the DOM changes. */
    pageConsole: boolean;
  };
  output: {
    format: "json" | "pretty";
  };
}

export const CONFIG_ENV = "WORDLE_AGENT_CONFIG";

const XDG_CONFIG = process.env.XDG_CONFIG_HOME ?? path.join(homedir(), ".config");
const XDG_DATA = process.env.XDG_DATA_HOME ?? path.join(homedir(), ".local", "share");

export const DEFAULT_CONFIG_PATH = path.join(XDG_CONFIG, "wordle-agent", "config.json");
export const DEFAULT_DATA_DIR = path.join(XDG_DATA, "wordle-agent");

export function defaultConfig(): Config {
  return {
    hurdle: {
      enabled: true,
      excludePastAnswers: true,
      maxSuggestions: 20,
      pastAnswersPath: path.join(DEFAULT_DATA_DIR, "past-answers.txt"),
    },
    browser: {
      profileDir: path.join(DEFAULT_DATA_DIR, "profile"),
      url: "https://www.nytimes.com/games/wordle/index.html",
      width: 1000,
      height: 900,
      timeoutMs: 60_000,
      revealTimeoutMs: 15_000,
      backend: process.platform === "darwin" ? "webkit" : "chrome",
      pageConsole: false,
    },
    output: {
      format: "json",
    },
  };
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export function mergeConfig(base: Config, patch: DeepPartial<Config>): Config {
  return {
    hurdle: { ...base.hurdle, ...stripUndefined(patch.hurdle) },
    browser: { ...base.browser, ...stripUndefined(patch.browser) },
    output: { ...base.output, ...stripUndefined(patch.output) },
  };
}

function stripUndefined<T extends object | undefined>(obj: T): Partial<NonNullable<T>> {
  if (!obj) return {};
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<NonNullable<T>>;
}

/** Env overrides, e.g. WORDLE_AGENT_HURDLE=false, WORDLE_AGENT_PROFILE_DIR=/tmp/p. */
export function configFromEnv(env: Record<string, string | undefined> = process.env): DeepPartial<Config> {
  const bool = (v?: string) => (v === undefined ? undefined : !/^(0|false|no|off)$/i.test(v));
  const num = (v?: string) => (v === undefined || v === "" ? undefined : Number(v));
  return {
    hurdle: {
      enabled: bool(env.WORDLE_AGENT_HURDLE),
      excludePastAnswers: bool(env.WORDLE_AGENT_EXCLUDE_PAST_ANSWERS),
      maxSuggestions: num(env.WORDLE_AGENT_MAX_SUGGESTIONS),
      pastAnswersPath: env.WORDLE_AGENT_PAST_ANSWERS_PATH,
    },
    browser: {
      profileDir: env.WORDLE_AGENT_PROFILE_DIR,
      url: env.WORDLE_AGENT_URL,
      timeoutMs: num(env.WORDLE_AGENT_TIMEOUT_MS),
      backend: env.WORDLE_AGENT_BACKEND as Config["browser"]["backend"] | undefined,
      pageConsole: bool(env.WORDLE_AGENT_PAGE_CONSOLE),
    },
    output: {
      format: env.WORDLE_AGENT_FORMAT as Config["output"]["format"] | undefined,
    },
  };
}

export interface LoadedConfig {
  config: Config;
  /** Path that was read, or null if no file existed. */
  configPath: string | null;
}

export async function loadConfig(opts: {
  configPath?: string;
  flags?: DeepPartial<Config>;
  env?: Record<string, string | undefined>;
} = {}): Promise<LoadedConfig> {
  const env = opts.env ?? process.env;
  const filePath = opts.configPath ?? env[CONFIG_ENV] ?? DEFAULT_CONFIG_PATH;

  let config = defaultConfig();
  let configPath: string | null = null;

  const file = Bun.file(filePath);
  if (await file.exists()) {
    let parsed: DeepPartial<Config>;
    try {
      parsed = await file.json();
    } catch (err) {
      throw new Error(`Could not parse config at ${filePath}: ${(err as Error).message}`);
    }
    config = mergeConfig(config, parsed);
    configPath = filePath;
  }

  config = mergeConfig(config, configFromEnv(env));
  if (opts.flags) config = mergeConfig(config, opts.flags);

  validate(config);
  return { config, configPath };
}

function validate(c: Config): void {
  if (!["json", "pretty"].includes(c.output.format)) {
    throw new Error(`output.format must be "json" or "pretty", got "${c.output.format}"`);
  }
  if (!["webkit", "chrome"].includes(c.browser.backend)) {
    throw new Error(`browser.backend must be "webkit" or "chrome", got "${c.browser.backend}"`);
  }
  if (!(c.hurdle.maxSuggestions >= 0)) {
    throw new Error(`hurdle.maxSuggestions must be a non-negative number`);
  }
}
