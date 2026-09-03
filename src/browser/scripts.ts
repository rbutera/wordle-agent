// JavaScript evaluated inside the Wordle page. Kept as plain expression
// strings because Bun.WebView.evaluate() takes source, not functions.
// Selectors here were verified against nytimes.com in September 2026; if the
// page changes, this is the file to fix.

/** Removes the Fides consent overlay, which otherwise blocks native clicks. */
export const REMOVE_CONSENT = `(() => {
  const els = document.querySelectorAll('#fides-overlay, #fides-banner-container');
  els.forEach((e) => e.remove());
  return els.length;
})()`;

/** Number of board tiles rendered (30 once the board is up). */
export const TILE_COUNT = `document.querySelectorAll('[data-testid="tile"]').length`;

/**
 * Clicks the landing-page button if it is showing: "Play" on a fresh day,
 * "Continue" for a game in progress, "Admire Puzzle" once it is finished.
 */
export const CLICK_LANDING = `(() => {
  const btn = document.querySelector('[data-testid="Play"], [data-testid="Admire Puzzle"]')
    ?? Array.from(document.querySelectorAll('button')).find((b) => /^(Play|Continue|Admire Puzzle)$/.test(b.textContent.trim()));
  if (!btn || btn.getBoundingClientRect().width === 0) return false;
  btn.click();
  return true;
})()`;

/** Center of the "Continue to Wordle" interstitial skip button, or null. */
export const INTERSTITIAL_SKIP_POINT = `(() => {
  const b = Array.from(document.querySelectorAll('button'))
    .find((b) => /^Continue to Wordle/.test(b.textContent.trim()) && b.getBoundingClientRect().width > 0);
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
})()`;

/** Closes any open modal (help, stats) and reports whether one was found. */
export const CLOSE_MODAL = `(() => {
  const b = document.querySelector('[data-testid="modal-overlay"] button[aria-label="Close"]');
  if (!b || b.getBoundingClientRect().width === 0) return false;
  b.click();
  return true;
})()`;

export const MODAL_OPEN = `!!document.querySelector('[data-testid="modal-overlay"]')`;

/**
 * True once no tile is mid-reveal. A restored game replays the flip
 * animation for every previous row and ignores input until it finishes.
 */
export const BOARD_SETTLED = `Array.from(document.querySelectorAll('[data-testid="tile"]'))
  .every((t) => t.getAttribute('data-animation') === 'idle' && t.getAttribute('data-state') !== 'tbd')`;

/** Puzzle number from the landing page ("No. 1902"), if visible. */
export const PUZZLE_NUMBER = `(() => {
  const m = document.body.innerText.match(/No\\.\\s*(\\d+)/);
  return m ? Number(m[1]) : null;
})()`;

/** Full board read: rows, keyboard, and the persisted game state. */
export const READ_BOARD = `(() => {
  const rows = [];
  for (let n = 1; n <= 6; n++) {
    const row = document.querySelector('[aria-label="Row ' + n + '"]');
    const tiles = row ? Array.from(row.querySelectorAll('[data-testid="tile"]')) : [];
    rows.push(tiles.map((t) => ({
      letter: (t.textContent || '').trim().toLowerCase(),
      state: t.getAttribute('data-state') || 'empty',
      animation: t.getAttribute('data-animation') || 'idle',
    })));
  }
  const keyboard = {};
  for (const k of document.querySelectorAll('[data-key][data-state]')) {
    const key = k.getAttribute('data-key');
    if (/^[a-z]$/.test(key)) keyboard[key] = k.getAttribute('data-state');
  }
  let game = null;
  try {
    const key = Object.keys(localStorage).find((k) => k.startsWith('games-state-wordleV2/'));
    if (key) {
      const parsed = JSON.parse(localStorage.getItem(key));
      const st = Array.isArray(parsed?.states) ? parsed.states[parsed.states.length - 1] : null;
      if (st) game = { status: st.data?.status, currentRowIndex: st.data?.currentRowIndex, printDate: st.printDate, hardMode: st.data?.hardMode };
    }
  } catch {}
  const toasts = Array.from(document.querySelectorAll('[class*="Toast-module_toast"]'))
    .map((t) => t.textContent.trim()).filter(Boolean);
  return { rows, keyboard, game, toasts };
})()`;

export const clickKey = (key: string) => `(() => {
  const k = document.querySelector('[data-key=' + ${JSON.stringify(JSON.stringify(key))} + ']');
  if (!k) return false;
  k.click();
  return true;
})()`;

export const rowText = (rowIndex: number) =>
  `Array.from(document.querySelector('[aria-label="Row ${rowIndex + 1}"]').querySelectorAll('[data-testid="tile"]')).map((t) => (t.textContent || '').trim().toLowerCase()).join('')`;

/** Every tile in the row carries a final state (the last flip has begun). */
export const rowScored = (rowIndex: number) =>
  `Array.from(document.querySelector('[aria-label="Row ${rowIndex + 1}"]').querySelectorAll('[data-testid="tile"]')).every((t) => ['correct','present','absent'].includes(t.getAttribute('data-state')))`;

/** At least one tile has flipped or is flipping: the guess was accepted. */
export const rowStartedScoring = (rowIndex: number) =>
  `Array.from(document.querySelector('[aria-label="Row ${rowIndex + 1}"]').querySelectorAll('[data-testid="tile"]')).some((t) => ['correct','present','absent'].includes(t.getAttribute('data-state')) || /flip/.test(t.getAttribute('data-animation') || ''))`;

export const TOAST_TEXT = `Array.from(document.querySelectorAll('[class*="Toast-module_toast"]')).map((t) => t.textContent.trim()).filter(Boolean)[0] ?? null`;

export const ROW_SHAKING = `document.getAnimations().some((a) => /Shake/.test(a.animationName || ''))`;
