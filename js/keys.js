// Keyboard mapping that works on any layout.
//
// - Movement, zoom, digits and the ratio keys are read by physical position
//   (KeyboardEvent.code), so French AZERTY players get ZQSD to pan and the
//   number row without Shift.
// - Mnemonic letters (R research, L leaderboard, O objectives, C capital)
//   are read by the character they type.
// - Escape is never used in-game: it leaves fullscreen on CrazyGames.
//   Backspace or X cancels instead (and right-click, or the tool again).

const BY_CODE = {
  KeyW: 'panUp', ArrowUp: 'panUp', KeyS: 'panDown', ArrowDown: 'panDown',
  KeyA: 'panLeft', ArrowLeft: 'panLeft', KeyD: 'panRight', ArrowRight: 'panRight',
  KeyE: 'zoomIn', Equal: 'zoomIn', NumpadAdd: 'zoomIn', KeyQ: 'zoomOut', Minus: 'zoomOut', NumpadSubtract: 'zoomOut',
  BracketLeft: 'ratioDown', BracketRight: 'ratioUp',
  Space: 'pause', Backspace: 'cancel', KeyX: 'cancel',
};
const BY_CHAR = { r: 'research', l: 'board', o: 'objectives', c: 'capital', '+': 'zoomIn', '-': 'zoomOut' };

/**
 * What a key press means: { action } or { action: 'digit', digit } or null.
 * `e` needs { code, key }.
 */
export function keyAction(e) {
  if (!e || e.code === 'Escape' || e.key === 'Escape') return null;
  // Browser shortcuts (Ctrl/Cmd/Alt + key) are never game keys.
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const d = /^(?:Digit|Numpad)(\d)$/.exec(e.code || '');
  if (d) return { action: 'digit', digit: d[1] };
  if (BY_CODE[e.code]) return { action: BY_CODE[e.code] };
  const ch = (e.key || '').toLowerCase();
  if (BY_CHAR[ch]) return { action: BY_CHAR[ch] };
  return null;
}

// Ctrl/Cmd+W closes the tab: blocked only while the game is fullscreen,
// where it is easy to press by accident (with W used to pan).
export const blockBrowserKey = (e, fullscreen) => !!fullscreen && !!(e.ctrlKey || e.metaKey) && e.code === 'KeyW';

// The label printed on a physical key in the player's layout (from
// navigator.keyboard.getLayoutMap(), when the browser offers it).
let layout = null;
export async function loadLayout(nav = globalThis.navigator) {
  try {
    layout = nav?.keyboard?.getLayoutMap ? await nav.keyboard.getLayoutMap() : null;
  } catch {
    layout = null;
  }
  return layout;
}
export function setLayout(map) { layout = map; }

const DEFAULT = { KeyW: 'W', KeyA: 'A', KeyS: 'S', KeyD: 'D', KeyQ: 'Q', KeyE: 'E', KeyX: 'X', BracketLeft: '[', BracketRight: ']' };
export function keyLabel(code) {
  const v = layout && typeof layout.get === 'function' ? layout.get(code) : null;
  return (v || DEFAULT[code] || code).toUpperCase();
}

// "WASD" in the player's layout, e.g. "ZQSD" on AZERTY.
export const panKeys = () => ['KeyW', 'KeyA', 'KeyS', 'KeyD'].map(keyLabel).join('');
