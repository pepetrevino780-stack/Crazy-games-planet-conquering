// Pixel sprites and icons, authored as character grids.
//
// Building sprites are tinted with the owner's colour at runtime:
//   .  transparent     o  outline        a  owner colour
//   b  owner shadow    h  owner light    x/y  fixed accent colours
//   w  white           k  near-black
//   l  blinking light  m/n  dark / light metal   g  glass
// Icons use the same grammar with a fixed per-icon colour set.

const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const toHex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export const shadeHex = (h, k) => toHex(hex(h).map(v => v * k));
export const mixHex = (a, b, t) => { const A = hex(a), B = hex(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };

// ---------- Buildings ----------

export const SPRITES = {
  // Planet capitals: one silhouette per civilization.
  capital_vulkara: { accent: ['#ff7a1f', '#ffd25e'], rows: [
    '......o......',
    '.o...oho...o.',
    '.oo..oao..oo.',
    '.oho.oao.oho.',
    '.oao.oao.oao.',
    'ooaoooaoooaoo',
    'oaaaahaaaaaao',
    'oabaaxxxaabao',
    'oabaxyyyxabao',
    'oabaxyyyxabao',
    'ooooooooooooo',
  ] },
  capital_cryonis: { accent: ['#d8f2ff', '#9fd8ff'], rows: [
    '......o......',
    '.....oxo.....',
    '....oxyxo....',
    '...o.oxo.o...',
    '..oxooaooxo..',
    '..oyoahaoyo..',
    '.ooxoahaoxoo.',
    'oaaoaahaaoaao',
    'oabaaaaaaabao',
    'oabbaaaaabbao',
    'ooooooooooooo',
  ] },
  capital_mycelion: { accent: ['#ff6ad2', '#c4ff6a'], rows: [
    '....ooooo....',
    '..ooaxaxaoo..',
    '.oaaaaaaaaao.',
    'oahaxaaaxaaao',
    'oaaaaaayaaabo',
    '.oobbbbbbboo.',
    '....oyxyo....',
    '....oxyxo....',
    '...ooxyxoo...',
    '..oaaaaaaao..',
    '..ooooooooo..',
  ] },
  capital_xythera: { accent: ['#3ad8ff', '#e3b45e'], rows: [
    '......o......',
    '.....oxo.....',
    '....oyhyo....',
    '....oahao....',
    '...oaahaao...',
    '...oayayao...',
    '..oaaahaaao..',
    '..oayayayao..',
    '.oaaaahaaaao.',
    'oaaaaxxxaaaao',
    'ooooooooooooo',
  ] },
  capital_noctyra: { accent: ['#ff2a3a', '#b98bff'], rows: [
    '.....oxo.....',
    '....oxyxo....',
    '.o...oxo...o.',
    'oho..oao..oho',
    'oao.oahao.oao',
    'oaooaahaaooao',
    'oaaaaxxxaaaao',
    'oabaxykyxabao',
    'oabaxykyxabao',
    'oabaaxxxaabao',
    'ooooooooooooo',
  ] },
  vent: { accent: ['#ff5a1a', '#ffd25e'], rows: [
    '....y.x.y....',
    '.....xyx.....',
    '....ooxoo....',
    '...oaaxaao...',
    '..oahaaaaao..',
    '.oahaaaabbao.',
    'oaaaaaabbbbao',
    'ooooooooooooo',
  ] },
  fortress: { accent: ['#e9f1ff', '#9aa8c0'], rows: [
    'oxo.oxo.oxo',
    'oao.oao.oao',
    'oaoooaoooao',
    'oahaaahaaao',
    'oaaaxxxaaao',
    'oabaxkxabao',
    'oabaxkxabao',
    'ooooooooooo',
  ] },
  crystal: { accent: ['#c9a2ff', '#f2e6ff'], rows: [
    '....o......',
    '...oyo..o..',
    '...oxo.oyo.',
    '.o.oxo.oxo.',
    'oyooxxooxo.',
    'oxooxxxoxxo',
    'oxxoxxxoxxo',
    'ooaaaaaaaoo',
    'ooooooooooo',
  ] },
  hub: { accent: ['#c4ff6a', '#ff6ad2'], rows: [
    '.x...y...x.',
    '...ooooo...',
    '.ooahahaoo.',
    'oaaxaaaxaao',
    'oahaaaaabao',
    '.oobbbbboo.',
    '...oxyxo...',
    '..ooyxyoo..',
    '.ooooooooo.',
  ] },
  relay: { accent: ['#3ad8ff', '#a8f4ff'], rows: [
    '....ooo....',
    '...oyxyo...',
    '....oxo....',
    '...ooaoo...',
    '....oho....',
    '...oaaao...',
    '...oahao...',
    '..oaaaaao..',
    '.oabaaabao.',
    'ooooooooooo',
  ] },
  turret: { accent: ['#ff4040', '#ffd25e'], rows: [
    '.......ooo',
    '......oxyo',
    '...oooxoo.',
    '..oahaxo..',
    '.oahaaao..',
    '.oaaaabo..',
    'oaabbbbao.',
    'oooooooooo',
  ] },
  factory: { accent: ['#e3b45e', '#3ad8ff'], rows: [
    '.oo.......',
    '.oxo..oo..',
    '.oxo.oxyo.',
    'ooaoooaoo.',
    'oaahaaaaoo',
    'oayaayaaao',
    'oaaaaaaabo',
    'oxxoaxxabo',
    'oooooooooo',
  ] },
  command: { accent: ['#ff2a3a', '#ffe0e0'], rows: [
    '.....o.....',
    '....oyo....',
    '..o..o..o..',
    '...o.o.o...',
    '....oxo....',
    '...oahao...',
    '..oaaxaao..',
    '..oaahaao..',
    '.oabaaabao.',
    'ooooooooooo',
  ] },
  citadel: { accent: ['#ff2a3a', '#b98bff'], rows: [
    '......oxo......',
    '.....oxyxo.....',
    '.o....oxo....o.',
    'oho..ooaoo..oho',
    'oao.oaahaao.oao',
    'oaoooayayaoooao',
    'oaaaaaahaaaaaao',
    'oabaaaxxxaaabao',
    'oabaaxykyxaabao',
    'oabaaxykyxaabao',
    'ooooooooooooooo',
  ] },
  normal: { accent: ['#ffd25e', '#000000'], rows: [
    '.oo....',
    'oaho.o.',
    'oaaoaho',
    'oxaoaao',
    'ooooooo',
  ] },
  barracks: { accent: ['#ffd25e', '#ffffff'], rows: [
    '.ox....',
    '.oxx...',
    '.ox....',
    '.oo....',
    'oaho...',
    'oaaao..',
    'ooooo..',
  ] },
  bastion: { accent: ['#e9f1ff', '#9aa8c0'], rows: [
    'o.o.o.o',
    'ooooooo',
    'oxxxxxo',
    'oxkxxxo',
    'ooooooo',
  ] },
  habitat: { accent: ['#bff2ff', '#3fd0ff'], rows: [
    '...ooo...',
    '.ooxyxoo.',
    'oaahxhaao',
    'oahaaahao',
    'oaaxaxaao',
    'ooooooooo',
  ] },
  extractor: { accent: ['#ffd25e', '#c9a2ff'], rows: [
    '...o.o...',
    '..oaoao..',
    '..oahao..',
    '...oao...',
    '.ooaaaoo.',
    'oaabxbaao',
    'oooxyxooo',
  ] },
  starport: { accent: ['#3ad8ff', '#ffd25e'], rows: [
    '....o....',
    '...oho...',
    '..oaaao..',
    '..oaaao..',
    '.oxoaoxo.',
    'ooooooooo',
    'oyaaaaayo',
    'ooooooooo',
  ] },
  spire: { accent: ['#ff6ad2', '#ffd6f4'], rows: [
    '...y...',
    '..oxo..',
    '..oho..',
    '..oao..',
    '.oahao.',
    '.oaaao.',
    'oabaabo',
    'ooooooo',
  ] },
  ruin: { accent: ['#e3b45e', '#8a6e4a'], rows: [
    '.....o.....',
    '....oxo....',
    '...oxyxo...',
    '..oxyxyxo..',
    '.oxyxyxyxo.',
    'oooooooooo.',
  ] },
  fleet: { accent: ['#ffffff', '#000000'], rows: [
    '..o..',
    '.oho.',
    'oahao',
    'oaaao',
    '.o.o.',
  ] },
};

export const CAPITAL_SPRITE = {
  vulkara: 'capital_vulkara', cryonis: 'capital_cryonis', mycelion: 'capital_mycelion',
  xythera: 'capital_xythera', noctyra: 'capital_noctyra',
};

// ---------- Icons (9x9) ----------

export const ICONS = {
  troops: { c: ['#3fd0ff', '#bff2ff'], rows: ['...ooo...', '..oaaao..', '..oahao..', '...oao...', '.ooaaaoo.', 'oaahaaaao', 'oaaaaaaao', 'oaaaaaaao', 'ooooooooo'] },
  minerals: { c: ['#c9a2ff', '#f2e6ff'], rows: ['....o....', '...oho...', '..oahao..', '.oaahaao.', 'oaaahaaao', '.oaaaaao.', '..oaaao..', '...oao...', '....o....'] },
  energy: { c: ['#ffd25e', '#fff3c4'], rows: ['....ooo..', '...oaao..', '..oaao...', '.oahaooo.', 'oaaaaaao.', 'ooooaao..', '...oao...', '..oao....', '..oo.....'] },
  exotic: { c: ['#ff6ad2', '#ffd6f4'], rows: ['...ooo...', '.oo.a.oo.', 'o..oho..o', 'o.oahao.o', 'oaahwhaao', 'o.oahao.o', 'o..oho..o', '.oo.a.oo.', '...ooo...'] },
  build: { c: ['#e3b45e', '#ffe7b0'], rows: ['.ooooo...', 'oahaaao..', 'oaaaaao..', '.oooaao..', '....oao..', '....oao..', '....oaao.', '.....oaao', '......oo.'] },
  research: { c: ['#7ff0c8', '#e0fff4'], rows: ['..ooooo..', '..oahao..', '...oao...', '...oao...', '..oaaao..', '.oaaaaao.', 'oaahaaaao', 'oaaaaaaao', '.ooooooo.'] },
  fleet: { c: ['#3fd0ff', '#bff2ff'], rows: ['o........', 'oao......', 'oahao..o.', 'oaaaaooao', 'oahao.oaa', 'oao...oao', 'o......o.', '.........', '.........'] },
  defense: { c: ['#9aa8c0', '#e9f1ff'], rows: ['ooooooooo', 'oaaahaaao', 'oaaahaaao', 'oaaahaaao', 'oaaahaaao', '.oaahaao.', '.oaaaaao.', '..oaaao..', '...ooo...'] },
  attack: { c: ['#ff4b3e', '#ffc4be'], rows: ['......ooo', '.....oaho', '....oaao.', 'o..oaao..', 'oo.oao...', '.ooao....', '.oaoo....', 'oao..o...', 'oo.......'] },
  event: { c: ['#ffd25e', '#fff3c4'], rows: ['....o....', '...oao...', '...oao...', '..oahao..', '..oahao..', '.oaaaaao.', '.oaoooao.', 'oaaaaaaao', 'ooooooooo'] },
  strike: { c: ['#ff7a1f', '#ffd25e'], rows: ['....o....', '....o....', '.o..o..o.', '..o.o.o..', 'oooahaooo', '..oaaao..', '.o.oao.o.', '...oao...', '....o....'] },
  rally: { c: ['#7ff0c8', '#e0fff4'], rows: ['...ooo...', '...oao...', 'ooooaoooo', 'oaaahaaao', 'ooooaoooo', '...oao...', '...oao...', '...oao...', '...ooo...'] },
  emp: { c: ['#3ad8ff', '#a8f4ff'], rows: ['...ooo...', '.oo...oo.', 'o..ooo..o', 'o.o.h.o.o', 'o.ohaho.o', 'o.o.h.o.o', 'o..ooo..o', '.oo...oo.', '...ooo...'] },
  objectives: { c: ['#ffd25e', '#fff3c4'], rows: ['o........', 'oooooo...', 'oaahaao..', 'oaahaaoo.', 'oaaaaaao.', 'oooooooo.', 'o........', 'o........', 'o........'] },
  upgrades: { c: ['#7ff0c8', '#e0fff4'], rows: ['....o....', '...oho...', '..oahao..', '.oaahaao.', 'ooooaoooo', '...oao...', '...oao...', '...oao...', '...ooo...'] },
  victory: { c: ['#ffd25e', '#fff3c4'], rows: ['o..o.o..o', 'oaoaoaoao', 'oaaahaaao', 'oaaaaaaao', 'oayaaayao', 'oaaaaaaao', 'ooooooooo', '.........', '.........'] },
  defeat: { c: ['#ff4b3e', '#ffc4be'], rows: ['.ooooooo.', 'oaaaaaaao', 'oaoaaaoao', 'oaoaaaoao', 'oaaahaaao', '.oaaaaao.', '..oaoao..', '..ooooo..', '.........'] },
  pause: { c: ['#e9f1ff', '#ffffff'], rows: ['.........', '.ooo.ooo.', '.oao.oao.', '.oao.oao.', '.oao.oao.', '.oao.oao.', '.oao.oao.', '.ooo.ooo.', '.........'] },
  play: { c: ['#7ff0c8', '#e0fff4'], rows: ['.o.......', '.ooo.....', '.oaoo....', '.oahoo...', '.oaaaoo..', '.oahoo...', '.oaoo....', '.ooo.....', '.o.......'] },
  speed: { c: ['#e9f1ff', '#ffffff'], rows: ['.........', 'o...o....', 'oo..oo...', 'oaoooaoo.', 'oahaoahao', 'oaoooaoo.', 'oo..oo...', 'o...o....', '.........'] },
  settings: { c: ['#9aa8c0', '#e9f1ff'], rows: ['...ooo...', '.o.oao.o.', '.oooaooo.', 'ooaaoaaoo', 'oaao.oaao', 'ooaaoaaoo', '.oooaooo.', '.o.oao.o.', '...ooo...'] },
  sound: { c: ['#e9f1ff', '#ffffff'], rows: ['....o....', '...oo..o.', 'oooao.o..', 'oaaao..o.', 'oaaao..o.', 'oaaao..o.', 'oooao.o..', '...oo..o.', '....o....'] },
  mute: { c: ['#ff4b3e', '#ffc4be'], rows: ['....o....', '...oo....', 'oooao....', 'oaaao.o.o', 'oaaao..o.', 'oaaao.o.o', 'oooao....', '...oo....', '....o....'] },
  help: { c: ['#3fd0ff', '#bff2ff'], rows: ['..ooooo..', '.oaaaaao.', '.oaoooao.', '.ooo.oao.', '....oao..', '...oao...', '...ooo...', '...oao...', '...ooo...'] },
  recenter: { c: ['#e9f1ff', '#ffffff'], rows: ['....o....', '...oao...', '.o.ooo.o.', 'oao...oao', 'oo.oho.oo', 'oao...oao', '.o.ooo.o.', '...oao...', '....o....'] },
  zoomin: { c: ['#e9f1ff', '#ffffff'], rows: ['.........', '...ooo...', '...oao...', '.ooohooo.', '.oahwhao.', '.ooohooo.', '...oao...', '...ooo...', '.........'] },
  zoomout: { c: ['#e9f1ff', '#ffffff'], rows: ['.........', '.........', '.........', '.ooooooo.', '.oahwhao.', '.ooooooo.', '.........', '.........', '.........'] },
  map: { c: ['#7ff0c8', '#e0fff4'], rows: ['ooooooooo', 'oaahoaaho', 'oahaoahao', 'oaaooaaao', 'ooooooooo', 'oahaoaaho', 'oaaaoahao', 'oaahoaaao', 'ooooooooo'] },
  labels: { c: ['#e9f1ff', '#ffffff'], rows: ['ooooooooo', 'oaaaaaaao', 'oaoooooao', 'oaaaaaaao', 'oaoooaaao', 'oaaaaaaao', 'ooooooooo', '..o......', '.o.......'] },
  lock: { c: ['#9aa8c0', '#e9f1ff'], rows: ['..ooooo..', '.oo...oo.', '.o.....o.', 'ooooooooo', 'oaaahaaao', 'oaaoooaao', 'oaaaoaaao', 'oaaaaaaao', 'ooooooooo'] },
  crown: { c: ['#ffd25e', '#fff3c4'], rows: ['.........', 'o...o...o', 'oo.oao.oo', 'oaoaaaoao', 'oaaahaaao', 'oaaaaaaao', 'ooooooooo', '.........', '.........'] },
  territory: { c: ['#3fd0ff', '#bff2ff'], rows: ['..ooooo..', '.oaaaaao.', 'oaahaaaao', 'oaaaaaabo', 'oaaaaaabo', 'oaaaaabbo', '.oaabbbo.', '..ooooo..', '.........'] },
  close: { c: ['#e9f1ff', '#ffffff'], rows: ['.........', '.oo...oo.', '.oao.oao.', '..oaoao..', '...oao...', '..oaoao..', '.oao.oao.', '.oo...oo.', '.........'] },
  enemy: { c: ['#ff4b3e', '#ffc4be'], rows: ['..ooooo..', '.oaaaaao.', 'oaaaaaaao', 'oaoaaaoao', 'oaoaaaoao', 'oaaahaaao', '.oaaaaao.', '..oaoao..', '..ooooo..'] },
};

function colorFor(ch, base, accent, frame = 0) {
  switch (ch) {
    case 'l': return frame ? '#3a2a14' : (accent[0] || '#ffe066');
    case 'm': return '#454b5e';
    case 'n': return '#8f9ab0';
    case 'g': return mixHex(base, '#e8fbff', 0.55);
    case 'o': return '#0a0a14';
    case 'k': return '#06050a';
    case 'w': return '#ffffff';
    case 'a': return base;
    case 'b': return shadeHex(base, 0.6);
    case 'h': return mixHex(base, '#ffffff', 0.5);
    case 'x': return frame ? mixHex(accent[0], '#ffffff', 0.35) : accent[0];
    case 'y': return accent[1];
    default: return null;
  }
}

const spriteCache = new Map();

// Canvas of a building sprite tinted for an owner colour (cached).
// frame 1 is the "lights" frame: blinking lights go dark, accents brighten.
export function spriteCanvas(name, ownerColor, frame = 0) {
  const key = name + ownerColor + frame;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const def = SPRITES[name] || levelSprite(name);
  const h = def.rows.length, w = Math.max(...def.rows.map(r => r.length));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  def.rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const col = colorFor(ch, ownerColor, def.accent, frame);
    if (!col) return;
    ctx.fillStyle = col;
    ctx.fillRect(x, y, 1, 1);
  }));
  spriteCache.set(key, c);
  return c;
}

// A twice-as-detailed version of a sprite for close zoom: each pixel becomes
// 2x2, edges facing the top-left light are brightened, edges facing away are
// shaded, and flat areas get a fine dither so structures read as built objects.
const hiCache = new Map();
export function spriteCanvasHi(name, ownerColor, frame = 0) {
  const key = name + ownerColor + frame;
  if (hiCache.has(key)) return hiCache.get(key);
  // Buildings have hand-drawn detailed art; everything else is upscaled.
  if (DETAIL[name.replace(/_\d$/, '')]) {
    const c = spriteCanvas('hd_' + name, ownerColor, frame);
    hiCache.set(key, c);
    return c;
  }
  const base = spriteCanvas(name, ownerColor, frame);
  const w = base.width, h = base.height;
  const src = base.getContext('2d').getImageData(0, 0, w, h).data;
  const c = document.createElement('canvas');
  c.width = w * 2; c.height = h * 2;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w * 2, h * 2);
  const W2 = w * 2;
  const alpha = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : src[(y * w + x) * 4 + 3]);
  for (let y = 0; y < h * 2; y++) {
    for (let x = 0; x < W2; x++) {
      const sx = x >> 1, sy = y >> 1, si = (sy * w + sx) * 4;
      if (!src[si + 3]) continue;
      let f = 1;
      const left = (x & 1) === 0, top = (y & 1) === 0;
      if ((top && !alpha(sx, sy - 1)) || (left && !alpha(sx - 1, sy))) f = 1.3;
      else if ((!top && !alpha(sx, sy + 1)) || (!left && !alpha(sx + 1, sy))) f = 0.62;
      else if ((x + y) % 4 === 0) f = 0.9;
      const o = (y * W2 + x) * 4;
      img.data[o] = Math.min(255, src[si] * f); img.data[o + 1] = Math.min(255, src[si + 1] * f); img.data[o + 2] = Math.min(255, src[si + 2] * f);
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  hiCache.set(key, c);
  return c;
}

const iconCache = new Map();

// PNG data URL for an icon at an integer scale (for <img> in the HUD).
export function iconURL(name, scale = 3) {
  const key = name + scale;
  if (iconCache.has(key)) return iconCache.get(key);
  const def = ICONS[name];
  const c = document.createElement('canvas');
  c.width = 9 * scale; c.height = 9 * scale;
  const ctx = c.getContext('2d');
  def.rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const col = ch === 'o' ? '#05050c' : ch === 'w' ? '#ffffff' : ch === 'a' ? def.c[0] : ch === 'h' ? def.c[1] : ch === 'b' ? shadeHex(def.c[0], 0.6) : ch === 'y' ? '#ff4b3e' : null;
    if (!col) return;
    ctx.fillStyle = col;
    ctx.fillRect(x * scale, y * scale, scale, scale);
  }));
  const url = c.toDataURL();
  iconCache.set(key, url);
  return url;
}

export function iconImg(name, cls = 'px-icon') {
  return `<img class="${cls}" src="${iconURL(name)}" alt="" aria-hidden="true">`;
}

// Sprite name for a territory on a planet.
export function spriteFor(planetId, type) {
  if (type === 'capital') return CAPITAL_SPRITE[planetId];
  return SPRITES[type] ? type : 'normal';
}

// ---------- Detailed buildings and levels ----------
// Hand-drawn art at twice the resolution, used close up. Upgraded buildings
// (level 2 and 3) grow a side module, then a second module and a beacon, at
// both resolutions: name_2 / name_3 and hd_name_2 / hd_name_3.

const DETAIL = {
  habitat: { accent: ['#ffe066', '#3fd0ff'], rows: [
    '......ooooo......',
    '....oogggggoo....',
    '...ogwwgggggbo...',
    '..oggwggggggbbo..',
    '..ogggggggggbbo..',
    '.ooooooooooooooo.',
    '.ohhhhhhhhhhhhbo.',
    '.ohalaaaaaaalabo.',
    '.oaaaaaannnaaabo.',
    '.oaaaaaankkaaabo.',
    '.obbbbbbnkkbbbbo.',
    'ooooooooooooooooo',
  ] },
  extractor: { accent: ['#ffd25e', '#c9a2ff'], rows: [
    '......ooo......',
    '......olo......',
    '.....onnno.....',
    '.....omnmo.....',
    '....onmnmno....',
    '....omnmnmo....',
    '...onmnmnmno...',
    '..ooooooooooo..',
    '..ohhhhhhhhbo..',
    '..oaaxxxxxabo..',
    '..oaaxyyyxabo..',
    '.ooooooooooooo.',
    '.oxxkxxkxxkxxo.',
    'ooooooooooooooo',
  ] },
  starport: { accent: ['#3ad8ff', '#ffd25e'], rows: [
    '..........o....',
    '.........olo...',
    '.........ono...',
    '....o....ono...',
    '...oho...ono...',
    '..ohaho..ono...',
    '..oaaao..ono...',
    '.oaagaao.ono...',
    '.oxoaoxo.ono...',
    'ooooooooooooooo',
    'ohhhhhhhhhhhhbo',
    'oyaaayaaayaaayo',
    'ooooooooooooooo',
  ] },
  bastion: { accent: ['#e9f1ff', '#9aa8c0'], rows: [
    'oao.oao.oao.oao',
    'ooooooooooooooo',
    'onnnnnnnnnnnnmo',
    'onmnnmnnnmnnmmo',
    'onnnnoooooonnmo',
    'onnmnokkkkonmmo',
    'onnnnokkkkonnmo',
    'ommmmokkkkommmo',
    'ooooooooooooooo',
  ] },
  spire: { accent: ['#ff6ad2', '#ffd6f4'], rows: [
    '....ooo....',
    '...oxyxo...',
    '...oylyo...',
    '...oxyxo...',
    '....ooo....',
    '....ono....',
    '...ohao....',
    '...oaabo...',
    '...ohabo...',
    '..oaalabo..',
    '..ohaaabo..',
    '.oaaaaaabo.',
    '.obbbbbbbo.',
    'ooooooooooo',
  ] },
};
// Keep every detailed grid rectangular.
for (const d of Object.values(DETAIL)) {
  const w = Math.max(...d.rows.map(r => r.length));
  d.rows = d.rows.map(r => r.padEnd(w, '.'));
}

const PARTS = {
  small: {
    annex: ['ooo', 'oho', 'oao', 'ooo'],
    beacon: ['.l.', '.o.'],
  },
  hd: {
    annex: ['oooooo', 'ohhhbo', 'oalabo', 'oaaabo', 'onnnmo', 'oaaabo', 'oooooo'],
    beacon: ['.l.', 'olo', '.o.', '.n.', '.n.'],
  },
};

// Grow a building grid for its level: a side module at level 2, a module on
// each side plus a beacon on the roof at level 3.
function composeLevel(rows, level, parts) {
  if (level <= 1) return rows;
  const H = rows.length, W = rows[0].length;
  const a = parts.annex, aw = a[0].length, ah = a.length;
  const b = parts.beacon, bh = b.length;
  const left = level >= 3 ? aw - 1 : 0, top = level >= 3 ? bh : 0;
  const outW = W + (aw - 1) + left, outH = H + top;
  const out = Array.from({ length: outH }, () => Array(outW).fill('.'));
  const put = (grid, ox, oy, mirror = false) => grid.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch !== '.') out[oy + y][ox + (mirror ? row.length - 1 - x : x)] = ch;
  }));
  put(a, left + W - 1, top + H - ah);
  if (level >= 3) put(a, 0, top + H - ah, true);
  put(rows, left, top);
  if (level >= 3) {
    const cx = left + Math.floor(W / 2);
    let roof = 0;
    while (roof < H && rows[roof][Math.floor(W / 2)] === '.') roof++;
    put(b, cx - 1, top + roof - bh);
  }
  return out.map(r => r.join(''));
}

// Resolves generated names: habitat_2, hd_habitat, hd_habitat_3 ...
function levelSprite(name) {
  const m = /^(hd_)?([a-z]+)(?:_(\d))?$/.exec(name);
  if (!m) throw new Error(`Unknown sprite ${name}`);
  const [, hd, type, lvl] = m;
  const base = hd ? DETAIL[type] : SPRITES[type];
  return { accent: base.accent, rows: composeLevel(base.rows, Number(lvl || 1), hd ? PARTS.hd : PARTS.small) };
}

// Simple 5x5 map icons for zoomed-out views, so the map stays readable.
export const MINI = {
  habitat: ['.ooo.', 'ohgao', 'ooooo', 'oaaao', 'ooooo'],
  extractor: ['..o..', '.oxo.', '.oxo.', 'oaaao', 'ooooo'],
  starport: ['...o.', 'o.oxo', 'oaoao', 'ooooo', 'oaaao'],
  bastion: ['oaoao', 'ooooo', 'onnno', 'onkno', 'ooooo'],
  spire: ['..x..', '.oxo.', '.oao.', 'oaaao', 'ooooo'],
  capital: ['oaoao', 'oaaao', 'oaxao', 'oaaao', 'ooooo'],
  site: ['.ooo.', 'oxxxo', 'oxyxo', 'oxxxo', '.ooo.'],
};

const miniCache = new Map();
export function miniCanvas(kind, ownerColor, accent = ['#ffd25e', '#ffffff']) {
  const key = kind + ownerColor + accent.join();
  if (miniCache.has(key)) return miniCache.get(key);
  const rows = MINI[kind] || MINI.site;
  const c = document.createElement('canvas');
  c.width = 5; c.height = 5;
  const ctx = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const col = colorFor(ch, ownerColor, accent);
    if (!col) return;
    ctx.fillStyle = col;
    ctx.fillRect(x, y, 1, 1);
  }));
  miniCache.set(key, c);
  return c;
}

export const spriteAccent = name => (SPRITES[name] || DETAIL[name] || { accent: ['#ffd25e', '#ffffff'] }).accent;

// White glyphs for zoomed-out badges (the filled pixels of the 5x5 icons).
const glyphCache = new Map();
export function glyphCanvas(kind) {
  if (glyphCache.has(kind)) return glyphCache.get(kind);
  const rows = MINI[kind] || MINI.site;
  const c = document.createElement('canvas');
  c.width = 5; c.height = 5;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.' && ch !== 'o') ctx.fillRect(x, y, 1, 1); }));
  glyphCache.set(kind, c);
  return c;
}
