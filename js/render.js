// Canvas renderer. Maps are authored in landscape (1000x600); on portrait
// screens the map is rotated so the player's side sits at the bottom.
import { getPlanet } from './campaign.js';
import {
  terr, neighbors, isPowered, isShielded, networkStatus, eventPhase, index, fleetPos,
  empActive, defMult, threatOn, TURRET_RANGE,
} from './rules.js';

export const WORLD_W = 1000;
export const WORLD_H = 600;
const NEUTRAL_TEXT = '#e9e4f0';

export const RADIUS = { capital: 30, citadel: 34, fortress: 26, factory: 26, command: 25, hub: 25 };
export const radiusOf = t => RADIUS[t.type] || 22;

export function makeView(width, height, insets = {}) {
  const { top = 0, right = 0, bottom = 0, left = 0 } = insets;
  const aw = Math.max(100, width - left - right);
  const ah = Math.max(100, height - top - bottom);
  const portrait = ah > aw * 1.05;
  const ww = portrait ? WORLD_H : WORLD_W;
  const wh = portrait ? WORLD_W : WORLD_H;
  const pad = 36;
  const scale = Math.min(aw / (ww + pad * 2), ah / (wh + pad * 2));
  const ox = left + (aw - ww * scale) / 2;
  const oy = top + (ah - wh * scale) / 2;
  return {
    width, height, portrait, scale, ox, oy,
    toScreen(x, y) {
      if (portrait) return { x: ox + y * scale, y: oy + (WORLD_W - x) * scale };
      return { x: ox + x * scale, y: oy + y * scale };
    },
    toWorld(sx, sy) {
      const u = (sx - ox) / scale, v = (sy - oy) / scale;
      if (portrait) return { x: WORLD_W - v, y: u };
      return { x: u, y: v };
    },
  };
}

// Territory under a screen point; generous radius for touch.
export function hitTest(state, view, sx, sy) {
  const w = view.toWorld(sx, sy);
  const slack = Math.max(10, 22 / view.scale);
  let best = null, bestD = Infinity;
  for (const t of state.territories) {
    const d = Math.hypot(t.x - w.x, t.y - w.y);
    if (d < radiusOf(t) + slack && d < bestD) { best = t; bestD = d; }
  }
  return best;
}

const starCache = new Map();
function stars(planetId) {
  if (starCache.has(planetId)) return starCache.get(planetId);
  let seed = [...planetId].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const list = Array.from({ length: 140 }, () => ({ x: rnd(), y: rnd(), r: rnd() * 1.4 + 0.3, a: rnd() * 0.6 + 0.2 }));
  starCache.set(planetId, list);
  return list;
}

function ownerColor(state, owner, theme) {
  if (owner === 0) return theme.neutral;
  return state.factions[owner].color;
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = v => Math.max(0, Math.min(255, Math.round(v)));
  const r = c(((n >> 16) & 255) * amt), g = c(((n >> 8) & 255) * amt), b = c((n & 255) * amt);
  return `rgb(${r},${g},${b})`;
}

function drawIcon(ctx, type, x, y, s, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, s * 0.18);
  ctx.beginPath();
  switch (type) {
    case 'capital': case 'citadel': { // crown
      ctx.moveTo(-s, s * 0.5); ctx.lineTo(-s, -s * 0.4); ctx.lineTo(-s * 0.5, s * 0.05);
      ctx.lineTo(0, -s * 0.7); ctx.lineTo(s * 0.5, s * 0.05); ctx.lineTo(s, -s * 0.4); ctx.lineTo(s, s * 0.5);
      ctx.closePath(); ctx.fill();
      if (type === 'citadel') { ctx.beginPath(); ctx.arc(0, -s * 1.05, s * 0.3, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'fortress': // shield
      ctx.moveTo(0, -s); ctx.lineTo(s * 0.85, -s * 0.6); ctx.lineTo(s * 0.7, s * 0.3);
      ctx.lineTo(0, s); ctx.lineTo(-s * 0.7, s * 0.3); ctx.lineTo(-s * 0.85, -s * 0.6); ctx.closePath(); ctx.fill();
      break;
    case 'crystal': // diamond
      ctx.moveTo(0, -s); ctx.lineTo(s * 0.65, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.65, 0); ctx.closePath(); ctx.fill();
      break;
    case 'hub': // spore burst
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
      }
      ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, s * 0.35, 0, Math.PI * 2); ctx.fill();
      break;
    case 'relay': // bolt
      ctx.moveTo(s * 0.2, -s); ctx.lineTo(-s * 0.6, s * 0.15); ctx.lineTo(-s * 0.05, s * 0.15);
      ctx.lineTo(-s * 0.25, s); ctx.lineTo(s * 0.6, -s * 0.2); ctx.lineTo(s * 0.05, -s * 0.2); ctx.closePath(); ctx.fill();
      break;
    case 'turret': // triangle with barrel
      ctx.moveTo(0, -s); ctx.lineTo(s * 0.9, s * 0.7); ctx.lineTo(-s * 0.9, s * 0.7); ctx.closePath(); ctx.fill();
      break;
    case 'factory': // gear
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.rect(Math.cos(a) * s * 0.75 - s * 0.15, Math.sin(a) * s * 0.75 - s * 0.15, s * 0.3, s * 0.3);
      }
      ctx.fill(); ctx.beginPath(); ctx.arc(0, 0, s * 0.55, 0, Math.PI * 2); ctx.fill();
      break;
    case 'command': // hexagon with dot
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * s, Math.sin(a) * s);
      }
      ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, s * 0.3, 0, Math.PI * 2); ctx.fill();
      break;
    case 'vent': // flame
      ctx.moveTo(0, -s); ctx.quadraticCurveTo(s * 0.9, 0, 0, s); ctx.quadraticCurveTo(-s * 0.9, 0, 0, -s); ctx.fill();
      break;
    default:
      ctx.restore();
      return;
  }
  ctx.restore();
}

/**
 * ui: { selection:Set, hover, drag:{from, x, y}, highlights:Set, vision:Set,
 *       abilityMode, now (ms), validTargets:Set }
 */
export function render(ctx, state, view, ui) {
  const planet = getPlanet(state.planetId);
  const th = planet.theme;
  const ix = index(state);
  const now = ui.now / 1000;
  const S = view.scale;
  const P = (x, y) => view.toScreen(x, y);
  const ev = eventPhase(state);

  // Background.
  const g = ctx.createRadialGradient(view.width / 2, view.height / 2, 10, view.width / 2, view.height / 2, Math.max(view.width, view.height) * 0.75);
  g.addColorStop(0, th.bg2);
  g.addColorStop(1, th.bg1);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, view.width, view.height);
  for (const s of stars(state.planetId)) {
    ctx.globalAlpha = s.a * (0.7 + 0.3 * Math.sin(now * 1.3 + s.x * 40));
    ctx.fillStyle = '#fff';
    ctx.fillRect(s.x * view.width, s.y * view.height, s.r, s.r);
  }
  ctx.globalAlpha = 1;

  // Network links (hub -> member regions).
  for (const t of state.territories) {
    if (!t.net) continue;
    const hub = terr(state, ix.hubs.get(t.net));
    const a = P(hub.x, hub.y), b = P(t.x, t.y);
    const status = networkStatus(state, t);
    ctx.strokeStyle = status === 'nourished' ? 'rgba(160,255,120,0.55)' : status === 'withered' ? 'rgba(150,110,70,0.45)' : 'rgba(160,255,120,0.18)';
    ctx.lineWidth = Math.max(1, 3 * S);
    ctx.setLineDash([2 * S + 1, 5 * S + 1]);
    ctx.lineDashOffset = status === 'nourished' ? -now * 20 : 0;
    ctx.beginPath();
    const mx = (a.x + b.x) / 2 + (a.y - b.y) * 0.12, my = (a.y + b.y) / 2 + (b.x - a.x) * 0.12;
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(mx, my, b.x, b.y);
    ctx.stroke();
  }
  // Power conduits (relay -> turret).
  for (const t of state.territories) {
    for (const tid of t.powers || []) {
      const tu = terr(state, tid);
      const a = P(t.x, t.y), b = P(tu.x, tu.y);
      const lit = isPowered(state, tu) && tu.owner === t.owner;
      ctx.strokeStyle = lit ? 'rgba(255,230,90,0.75)' : 'rgba(255,230,90,0.15)';
      ctx.lineWidth = Math.max(1, 2 * S);
      ctx.setLineDash([6 * S + 1, 6 * S + 1]);
      ctx.lineDashOffset = lit ? -now * 40 : 0;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }
  ctx.setLineDash([]);

  // Lanes.
  for (const [aId, bId, kind] of state.lanes) {
    const A = terr(state, aId), B = terr(state, bId);
    const a = P(A.x, A.y), b = P(B.x, B.y);
    const active = ui.selection.size && ((ui.selection.has(aId) && ui.validTargets.has(bId)) || (ui.selection.has(bId) && ui.validTargets.has(aId)));
    ctx.strokeStyle = active ? 'rgba(255,255,255,0.65)' : kind === 'ice' ? 'rgba(200,240,255,0.55)' : th.lane;
    ctx.lineWidth = Math.max(1.5, (active ? 5 : 4) * S);
    if (kind === 'ice') ctx.setLineDash([8 * S + 2, 6 * S + 2]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.setLineDash([]);
  }

  // Turret range rings.
  for (const t of state.territories) {
    if (t.type !== 'turret' || !isPowered(state, t)) continue;
    const c = P(t.x, t.y);
    ctx.fillStyle = ev.type === 'surge' && ev.active ? 'rgba(255,80,80,0.14)' : 'rgba(255,80,80,0.07)';
    ctx.strokeStyle = 'rgba(255,90,90,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(c.x, c.y, TURRET_RANGE * S, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  // Event ambience under the territories.
  if (ev.active) {
    ctx.save();
    if (ev.type === 'eclipse') {
      ctx.fillStyle = 'rgba(0,0,0,0.38)';
      ctx.fillRect(0, 0, view.width, view.height);
    } else if (ev.type === 'eruption') {
      for (const t of state.territories) if (t.type === 'vent') {
        const c = P(t.x, t.y);
        const rg = ctx.createRadialGradient(c.x, c.y, 2, c.x, c.y, 80 * S);
        rg.addColorStop(0, 'rgba(255,120,30,0.45)'); rg.addColorStop(1, 'rgba(255,120,30,0)');
        ctx.fillStyle = rg; ctx.fillRect(c.x - 80 * S, c.y - 80 * S, 160 * S, 160 * S);
      }
    }
    ctx.restore();
  }

  const vision = ui.vision;
  const threatened = new Set();
  if (state.factions[1].scouting >= 3) {
    for (const t of state.territories) {
      if (t.owner === 1 && threatOn(state, t) > t.troops * defMult(state, t)) threatened.add(t.id);
    }
  }

  // Territories.
  for (const t of state.territories) {
    const c = P(t.x, t.y);
    const r = radiusOf(t) * S;
    const col = ownerColor(state, t.owner, th);
    const shielded = isShielded(state, t);

    if (ui.highlights.has(t.id)) {
      const pulse = 0.5 + 0.5 * Math.sin(now * 4);
      ctx.strokeStyle = `rgba(255,255,140,${0.4 + 0.5 * pulse})`;
      ctx.lineWidth = Math.max(2, 4 * S);
      ctx.beginPath(); ctx.arc(c.x, c.y, r + (10 + 6 * pulse) * S, 0, Math.PI * 2); ctx.stroke();
    }
    if (threatened.has(t.id)) {
      const pulse = 0.5 + 0.5 * Math.sin(now * 6);
      ctx.strokeStyle = `rgba(255,60,60,${0.4 + 0.5 * pulse})`;
      ctx.lineWidth = Math.max(2, 3 * S);
      ctx.beginPath(); ctx.arc(c.x, c.y, r + 7 * S, 0, Math.PI * 2); ctx.stroke();
    }
    const ns = networkStatus(state, t);
    if (ns === 'nourished') {
      ctx.fillStyle = 'rgba(150,255,110,0.18)';
      ctx.beginPath(); ctx.arc(c.x, c.y, r + 6 * S, 0, Math.PI * 2); ctx.fill();
    }

    // Body.
    const grad = ctx.createRadialGradient(c.x - r * 0.3, c.y - r * 0.3, r * 0.1, c.x, c.y, r);
    grad.addColorStop(0, shade(col.startsWith('#') ? col : '#888888', 1.35));
    grad.addColorStop(1, shade(col.startsWith('#') ? col : '#888888', ns === 'withered' ? 0.45 : 0.75));
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = Math.max(1.5, 3 * S);
    ctx.strokeStyle = t.type === 'fortress' || t.type === 'citadel' ? '#dfe8ff' : 'rgba(255,255,255,0.35)';
    if ((t.type === 'fortress' || t.type === 'citadel') && defMult(state, t) < 1.5 * (state.factions[t.owner]?.def || 1)) ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.stroke();
    if (t.type === 'fortress' || t.type === 'citadel') {
      ctx.lineWidth = Math.max(1, 1.5 * S);
      ctx.beginPath(); ctx.arc(c.x, c.y, r - 4 * S, 0, Math.PI * 2); ctx.stroke();
    }

    if (ui.selection.has(t.id)) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(2, 4 * S);
      ctx.setLineDash([6 * S + 2, 4 * S + 2]);
      ctx.lineDashOffset = -now * 30;
      ctx.beginPath(); ctx.arc(c.x, c.y, r + 6 * S, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    } else if (ui.validTargets.has(t.id)) {
      ctx.strokeStyle = t.owner === 1 ? 'rgba(140,220,255,0.7)' : 'rgba(255,200,120,0.85)';
      ctx.lineWidth = Math.max(1.5, 2.5 * S);
      ctx.beginPath(); ctx.arc(c.x, c.y, r + 5 * S, 0, Math.PI * 2); ctx.stroke();
    }
    if (ui.hover === t.id) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = Math.max(1, 2 * S);
      ctx.beginPath(); ctx.arc(c.x, c.y, r + 2 * S, 0, Math.PI * 2); ctx.stroke();
    }

    if (shielded) {
      const pulse = 0.5 + 0.5 * Math.sin(now * 3);
      ctx.strokeStyle = `rgba(190,255,150,${0.5 + 0.4 * pulse})`;
      ctx.fillStyle = 'rgba(190,255,150,0.12)';
      ctx.lineWidth = Math.max(2, 3 * S);
      ctx.beginPath(); ctx.arc(c.x, c.y, r + 12 * S, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    if (empActive(state, t)) {
      ctx.strokeStyle = 'rgba(120,200,255,0.9)';
      ctx.lineWidth = Math.max(1, 2 * S);
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.arc(c.x, c.y, r + 9 * S, now * 2, now * 2 + Math.PI * 1.6); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Icon and troop count.
    const iconColor = 'rgba(255,255,255,0.9)';
    const hasIcon = t.type !== 'normal';
    if (hasIcon) drawIcon(ctx, t.type, c.x, c.y - r * 0.42, r * 0.28, iconColor);
    if (t.type === 'turret' && !isPowered(state, t) && t.owner !== 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill();
    }
    const visible = vision.has(t.id);
    const label = visible ? String(Math.floor(t.troops)) : '?';
    ctx.font = `700 ${Math.max(10, Math.round(r * (hasIcon ? 0.62 : 0.75)))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(label, c.x, c.y + (hasIcon ? r * 0.22 : 0));
    ctx.fillStyle = t.owner === 0 ? NEUTRAL_TEXT : '#fff';
    ctx.fillText(label, c.x, c.y + (hasIcon ? r * 0.22 : 0));

    if (t.name && S > 0.45) {
      ctx.font = `600 ${Math.max(9, Math.round(11 * S))}px system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(t.name, c.x, c.y + r + 12 * S + 5);
    }
  }

  // Fleets.
  for (const fl of state.fleets) {
    const visible = fl.owner === 1 || vision.has(fl.to) || vision.has(fl.from);
    if (!visible) continue;
    const w = fleetPos(fl);
    const c = P(w.x, w.y);
    const rr = Math.max(5, (6 + Math.min(10, Math.sqrt(fl.troops) * 1.3)) * S);
    ctx.fillStyle = fl.frost ? '#bfe9ff' : state.factions[fl.owner].color;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(c.x, c.y, rr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.font = `700 ${Math.max(9, Math.round(rr * 1.1))}px system-ui, sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 3;
    const lbl = String(Math.ceil(fl.troops));
    ctx.strokeText(lbl, c.x, c.y - rr - 7);
    ctx.fillText(lbl, c.x, c.y - rr - 7);
  }

  // Drag line.
  if (ui.drag && ui.drag.active) {
    const from = terr(state, ui.drag.from);
    const a = P(from.x, from.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = Math.max(2, 4 * S);
    ctx.setLineDash([10, 8]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(ui.drag.x, ui.drag.y); ctx.stroke();
    ctx.setLineDash([]);
  }

  // Storm haze on top.
  if (ev.type === 'storm' && (ev.active || ev.warning)) {
    ctx.fillStyle = `rgba(220,240,255,${ev.active ? 0.22 + 0.05 * Math.sin(now * 5) : 0.06})`;
    ctx.fillRect(0, 0, view.width, view.height);
  }
  if (ev.type === 'bloom' && ev.active) {
    ctx.fillStyle = 'rgba(150,255,100,0.08)';
    ctx.fillRect(0, 0, view.width, view.height);
  }
}

export function validTargetsFor(state, selection) {
  const out = new Set();
  for (const id of selection) for (const n of neighbors(state, id)) if (!selection.has(n)) out.add(n);
  return out;
}
