// The sky view: zoomed out from the planet. A star sits at the center with a planet for each month
// this world has lived through (up to 12), placed like a clock by calendar month. Your planet is this
// month's; the others are snapshots of how it looked when their month ended, with the moons (and ring)
// earned by that month's goals. Tap one for that month's summary.
// Goals live in the sky too: each goal you're working on is a nebula condensing into a star, and every
// goal met stays as a twinkling star.
import {
  CATS, DAY, MILESTONES, CATACLYSMS, CATACLYSM_HIT, monthKey, goalMonth, goalPace, worldMonths, monthVisuals,
  monthSummary, visuals, openGoals,
} from '../sim.js';
import { Globe } from '../globe.js';
import { icon } from '../icons.js';
import { state } from './store.js';
import { $, esc, fmtPct, fmtMins, fmtDate, monthName } from './util.js';
import { paceStatus } from './goals.js';
import { setView } from './layout.js';

const PX = 3; // screen pixels per sky pixel
const sky = $('#sky'), canvas = $('#skyCanvas'), ctx = canvas.getContext('2d');
const buf = document.createElement('canvas'), bctx = buf.getContext('2d');
let on = false;

export const skyOn = () => on;
export function setSky(v) {
  on = v;
  document.body.dataset.sky = v ? '1' : '';
  sky.hidden = false;
  sky.setAttribute('aria-hidden', String(!v));
  $('#viewToggle').innerHTML = v ? `${icon('left')}<span>PLANET</span>` : `<span>SKY</span>${icon('right')}`;
  $('#viewToggle').setAttribute('aria-label', v ? 'Back to your planet' : 'Zoom out to the sky');
  closeSkyTip();
  if (v) { sizeSky(); if (innerWidth <= 860) setView('none'); }
}
$('#viewToggle').addEventListener('click', () => setSky(!on));
// scrolling out from the planet opens the sky; scrolling in goes back
$('#globeWrap').addEventListener('wheel', (e) => { if (e.deltaY > 30 && !on) { e.preventDefault(); setSky(true); } }, { passive: false });
sky.addEventListener('wheel', (e) => { if (e.deltaY < -30 && on) { e.preventDefault(); setSky(false); } }, { passive: false });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && on && !document.querySelector('dialog[open]')) setSky(false); });

function sizeSky() {
  const w = Math.max(60, Math.ceil(sky.clientWidth / PX)), h = Math.max(60, Math.ceil(sky.clientHeight / PX));
  if (buf.width !== w || buf.height !== h) { buf.width = w; buf.height = h; canvas.width = w * PX; canvas.height = h * PX; }
}
addEventListener('resize', () => { if (on) sizeSky(); });

// ---------- colors (category colors come from the theme) ----------
let colors = null, colorsAt = -1e9;
function hexOf(v) {
  const m = /^#([0-9a-f]{6})$/i.exec(v.trim());
  return m ? [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4), 16)] : [220, 220, 255];
}
function themeColors(t) {
  if (colors && t - colorsAt < 2000) return colors;
  const css = getComputedStyle(document.documentElement);
  colors = { PHYS: hexOf(css.getPropertyValue('--heat')), MIND: hexOf(css.getPropertyValue('--atmos')), LIFE: hexOf(css.getPropertyValue('--life')), gold: hexOf(css.getPropertyValue('--gold')) };
  colorsAt = t;
  return colors;
}
const mix = (a, b, m) => [a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m, a[2] + (b[2] - a[2]) * m];
const COOL = [140, 156, 205], WHITE = [255, 255, 255];

// ---------- pixels ----------
let img = null;
function put(x, y, c, a = 1) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const o = (y * img.width + x) * 4, d = img.data, al = Math.max(0, Math.min(1, a));
  d[o] = d[o] + (c[0] - d[o]) * al; d[o + 1] = d[o + 1] + (c[1] - d[o + 1]) * al; d[o + 2] = d[o + 2] + (c[2] - d[o + 2]) * al;
  d[o + 3] = Math.max(d[o + 3], Math.round(al * 255));
}
function hash(n, s) { let h = (n * 374761393 + s * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
const strHash = (str) => { let h = 7; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 2654435761); return h >>> 0; };

// ---------- layout ----------
// The star in the middle and the shared orbit, sized to the view.
function layout() {
  const w = buf.width, h = buf.height;
  const cx = w / 2, cy = h * 0.56;
  // a flatter orbit on wide screens, a rounder one on tall (phone) screens
  const tall = h > w * 1.2;
  const rx = Math.min(w * (tall ? 0.36 : 0.4), h * 1.05), ry = Math.min(rx * (tall ? 0.85 : 0.36), h * 0.3);
  return { w, h, cx, cy, rx, ry };
}
// Where a goal's nebula (and later its star) sits: picked from its id, clear of the orbit and of
// the other goals' nebulae.
function goalSpot(g, L, taken) {
  const seed = strHash(g.id);
  for (let k = 0; k < 40; k++) {
    const fx = 0.08 + hash(seed, k * 2) * 0.84, fy = 0.07 + hash(seed, k * 2 + 1) * 0.86;
    const x = fx * L.w, y = fy * L.h;
    const e = ((x - L.cx) / (L.rx + 18)) ** 2 + ((y - L.cy) / (L.ry + 16)) ** 2; // outside the orbit band
    if (e < 1.25 && k < 39) continue;
    if (taken.some((p) => Math.hypot(p.x - x, p.y - y) < 36) && k < 39) continue;
    return { x, y };
  }
  return { x: L.w * 0.5, y: L.h * 0.12 };
}

// ---------- drawing ----------
const monthGlobes = new Map(); // month -> { globe, key } (past months are drawn once)
const mainGlobe = new Globe(null, { res: 40, r: 11 });
let nodes = []; // what can be tapped, in sky pixels

export function drawSky(t) {
  sizeSky();
  const L = layout(), now = Date.now(), C = themeColors(t);
  img = bctx.createImageData(L.w, L.h);
  nodes = [];
  // faint background stars
  for (let i = 0; i < L.w * L.h / 140; i++) put(hash(i, 1) * L.w, hash(i, 2) * L.h, [150, 140, 190], 0.25 + hash(i, 3) * 0.35);
  // stars: every goal met, twinkling; the newest ones (last 3 days) glow
  const taken = [];
  for (const g of state.goals.filter((x) => x.done).sort((a, b) => a.done - b.done)) {
    const p = goalSpot(g, L, []);
    const tw = 0.55 + 0.45 * Math.sin(t * 0.0021 + strHash(g.id) % 100);
    const c = mix(C[g.cat] || WHITE, WHITE, 0.45);
    const fresh = now - g.done < 3 * DAY;
    put(p.x, p.y, WHITE, 1); put(p.x + 1, p.y, c, 0.8); put(p.x, p.y + 1, c, 0.8); put(p.x + 1, p.y + 1, c, 0.5);
    const arm = fresh ? 4 : tw > 0.7 ? 3 : 2;
    for (let k = 1; k <= arm; k++) {
      const a = (fresh ? 0.9 : tw) * (1 - k / (arm + 1));
      put(p.x + 1 + k, p.y, c, a); put(p.x - k, p.y, c, a); put(p.x, p.y + 1 + k, c, a); put(p.x, p.y - k, c, a);
    }
    if (fresh) for (let k = 0; k < 12; k++) { const an = k / 12 * Math.PI * 2; put(p.x + Math.cos(an) * 5, p.y + Math.sin(an) * 5, C.gold, 0.35 + 0.25 * Math.sin(t * 0.004)); }
    nodes.push({ kind: 'star', x: p.x, y: p.y, r: 4, g });
  }
  // nebulae: the goals you're working on this month, condensing as they progress
  for (const g of openGoals(state).filter((x) => goalMonth(x) <= monthKey(now))) {
    const p = goalSpot(g, L, taken);
    taken.push(p);
    drawNebula(g, p, t, now, C);
    nodes.push({ kind: 'nebula', x: p.x, y: p.y, r: 19, g });
  }
  // the orbit (back half), month planets behind the star, the star, then the front half and planets
  const months = worldMonths(state, now);
  const cur = monthKey(now);
  const spin = t * 0.000004;
  const placed = months.map((mk) => {
    const slot = Number(mk.slice(5)) - 1; // January at the right, then around like a clock
    const a = (slot / 12) * Math.PI * 2 - Math.PI / 2 + spin;
    return { mk, x: L.cx + Math.cos(a) * L.rx, y: L.cy + Math.sin(a) * L.ry, z: Math.sin(a) };
  });
  // the rest of the year: empty places on the orbit, waiting for their month
  const used = new Set(placed.map((p) => Number(p.mk.slice(5))));
  const empties = [];
  for (let slot = 1; slot <= 12; slot++) {
    if (used.has(slot)) continue;
    const a = ((slot - 1) / 12) * Math.PI * 2 - Math.PI / 2 + spin;
    empties.push({ x: L.cx + Math.cos(a) * L.rx, y: L.cy + Math.sin(a) * L.ry });
  }
  drawOrbit(L, -1);
  for (const e of empties) for (let k = 0; k < 8; k++) { const an = k / 8 * Math.PI * 2; put(e.x + Math.cos(an) * 3, e.y + Math.sin(an) * 3, [150, 140, 200], 0.35); }
  for (const p of placed.filter((q) => q.z < 0)) drawPlanet(p, cur, now, t);
  drawSun(L, t);
  drawOrbit(L, 1);
  for (const p of placed.filter((q) => q.z >= 0)) drawPlanet(p, cur, now, t);
  for (const p of placed) nodes.push({ kind: 'month', x: p.x, y: p.y, r: p.mk === cur ? 9 : 6, mk: p.mk });
  bctx.putImageData(img, 0, 0);
  // the month planets are separate images drawn on top
  for (const p of [...placed].sort((a, b) => a.z - b.z)) {
    const gl = p.mk === cur ? mainGlobe : monthGlobes.get(p.mk).globe;
    bctx.drawImage(gl.buf, Math.round(p.x - gl.res / 2), Math.round(p.y - gl.res / 2));
  }
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(buf, 0, 0, canvas.width, canvas.height);
  placeNodes(placed, cur);
}

function drawPlanet(p, cur, now, t) {
  if (p.mk === cur) {
    mainGlobe.rot += 0.004;
    mainGlobe.cloudRot += 0.002;
    mainGlobe.render(visuals(state, now), t);
    return;
  }
  // a past month is drawn once, unless its goals have changed since
  const key = state.goals.filter((g) => g.done && goalMonth(g) === p.mk).length + '|' + (state.months?.[p.mk] ? 1 : 0);
  const m = monthGlobes.get(p.mk);
  if (m && m.key === key) return;
  const globe = new Globe(null, { res: 26, r: 7 });
  globe.rot = (Number(p.mk.slice(5)) * 1.7) % 6.28;
  globe.render(monthVisuals(state, p.mk, now), 0);
  monthGlobes.set(p.mk, { globe, key });
}

function drawOrbit(L, side) {
  const n = Math.round((L.rx + L.ry) * 3);
  for (let k = 0; k < n; k += 3) {
    const a = k / n * Math.PI * 2;
    if (Math.sign(Math.sin(a) || 1) !== side) continue;
    put(L.cx + Math.cos(a) * L.rx, L.cy + Math.sin(a) * L.ry, [150, 140, 200], side > 0 ? 0.45 : 0.25);
  }
}

function drawSun(L, t) {
  const r = Math.max(4, Math.min(L.w, L.h) * 0.045);
  const SUN = [[255, 255, 236], [255, 236, 170], [255, 196, 110], [240, 140, 80]];
  for (let y = -r * 2.4; y <= r * 2.4; y++) {
    for (let x = -r * 2.4; x <= r * 2.4; x++) {
      const d = Math.hypot(x, y) / r;
      if (d <= 1) put(L.cx + x, L.cy + y, SUN[Math.min(3, Math.floor(d * 3.2 + ((x + y) & 1) * 0.3))], 1);
      else if (d < 2.4) put(L.cx + x, L.cy + y, [255, 200, 120], (2.4 - d) / 1.4 * (0.28 + 0.04 * Math.sin(t * 0.002)));
    }
  }
}

// A goal in progress: a cloud that gathers into a brighter core as its % rises, with a ring of ten dots
// (one per 10%) and a gold dot where the pace says it should be. Warm when on track, cool when behind.
function drawNebula(g, p, t, now, C) {
  const pct = Math.min(100, g.current) / 100;
  const pace = goalPace(g, now);
  const behind = pace.status === 'behind';
  const base = behind ? mix(C[g.cat] || WHITE, COOL, 0.55) : C[g.cat] || WHITE;
  const rad = 13 - pct * 5;
  const seed = strHash(g.id) % 1000;
  for (let y = -16; y <= 16; y++) {
    for (let x = -16; x <= 16; x++) {
      const d = Math.hypot(x, y * 1.25) / rad;
      if (d > 1.3) continue;
      // lumpy cloud: a few drifting blobs
      const n = 0.5 * Math.sin(x * 0.55 + seed + t * 0.0004) * Math.cos(y * 0.6 - seed * 0.7 - t * 0.0003) + 0.5 * hash(x + 20 + (y + 20) * 41, seed);
      const dens = (1 - d) + n * 0.45 - 0.15;
      if (dens <= 0) continue;
      const core = Math.max(0, 1 - Math.hypot(x, y) / (2 + pct * 3));
      put(p.x + x, p.y + y, mix(base, WHITE, core * (0.35 + pct * 0.6)), Math.min(1, dens * (behind ? 0.75 : 0.95) + core * (0.3 + pct)));
    }
  }
  const lit = Math.floor(pct * 10 + 1e-6), want = pace.expected != null ? Math.min(9, Math.floor(pace.expected / 10)) : -1;
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + k / 10 * Math.PI * 2;
    const x = p.x + Math.cos(a) * 18, y = p.y + Math.sin(a) * 16;
    if (k < lit) put(x, y, mix(base, WHITE, 0.5), 1);
    else if (k === want) put(x, y, C.gold, 0.9);
    else put(x, y, [120, 112, 160], 0.45);
  }
}

// ---------- tap targets and labels ----------
const nodeEls = new Map();
function placeNodes(placed, cur) {
  const layer = $('#skyNodes');
  const seen = new Set();
  for (const n of nodes) {
    const id = n.kind === 'month' ? 'm-' + n.mk : n.kind + '-' + n.g.id;
    seen.add(id);
    let el = nodeEls.get(id);
    if (!el) {
      el = document.createElement('button');
      el.type = 'button';
      el.className = 'sky-node ' + n.kind + (n.kind === 'month' && n.mk === cur ? ' cur' : '');
      el.addEventListener('click', (e) => { e.stopPropagation(); tapNode(id); });
      layer.appendChild(el);
      nodeEls.set(id, el);
    }
    el._node = n;
    const size = n.r * 2 * PX + 12;
    el.style.width = el.style.height = size + 'px';
    el.style.left = (n.x * PX - size / 2) + 'px';
    el.style.top = (n.y * PX - size / 2) + 'px';
    if (n.kind === 'month') {
      const label = n.mk === cur ? 'NOW' : monthName(n.mk, 'short').toUpperCase();
      if (el.dataset.label !== label) { el.dataset.label = label; el.innerHTML = `<span class="lbl">${label}</span>`; }
      el.setAttribute('aria-label', `${monthName(n.mk)}${n.mk === cur ? ' (this month)' : ''}: open its summary`);
    } else el.setAttribute('aria-label', n.g.name + (n.kind === 'star' ? ', goal met' : ', goal in progress'));
  }
  for (const [id, el] of nodeEls) if (!seen.has(id)) { el.remove(); nodeEls.delete(id); }
}

function tapNode(id) {
  const n = nodeEls.get(id)?._node;
  if (!n) return;
  if (n.kind === 'month') { openMonth(n.mk); return; }
  const g = n.g, tip = $('#skyTip');
  if (n.kind === 'star') {
    tip.innerHTML = `<span class="k">GOAL MET · ${esc(monthName(goalMonth(g)).toUpperCase())}</span><h3>${esc(g.name)}</h3><p>Met ${fmtDate(g.done)}. Its star stays in your sky.</p>`;
  } else {
    const st = paceStatus(g, goalPace(g, Date.now()));
    tip.innerHTML = `<span class="k">FORMING · ${fmtPct(Math.min(100, g.current))}</span><h3>${esc(g.name)}</h3><p>${st.text}. At 100% it becomes a star.</p>
      <button type="button" class="btn-sm" id="skyGoalOpen">OPEN GOALS</button>`;
    $('#skyGoalOpen').onclick = () => { closeSkyTip(); setSky(false); setView('goals'); };
  }
  tip.style.left = Math.min(sky.clientWidth - 230, Math.max(8, n.x * PX + 14)) + 'px';
  tip.style.top = Math.min(sky.clientHeight - 120, Math.max(8, n.y * PX - 20)) + 'px';
  tip.hidden = false;
}
function closeSkyTip() { $('#skyTip').hidden = true; }
sky.addEventListener('click', (e) => { if (!e.target.closest('.sky-node, .sky-tip')) closeSkyTip(); });

// ---------- a month's summary ----------
export function openMonth(mk) {
  const now = Date.now();
  const s = monthSummary(state, mk, now);
  const d = $('#monthDlg');
  const year = mk.slice(0, 4);
  const met = s.goals.filter((g) => g.done).length;
  const goalRows = s.goals.length ? s.goals.map((g) => {
    const c = CATS[g.cat].color;
    const status = g.done ? `${icon('star')}Met ${fmtDate(g.done)}` : g.missed ? `Reached ${fmtPct(g.pct)}` : `${fmtPct(g.pct)} so far`;
    return `<li style="--c:${c}"><span class="n">${esc(g.name)}</span><span class="meter"><span class="fill" style="width:${g.pct}%"></span></span><span class="s${g.done ? ' met' : ''}">${status}</span></li>`;
  }).join('') : '<li class="none">No goals set this month.</li>';
  const cata = s.cataclysm;
  const cataHtml = cata ? `<div class="label">MONTH'S END · ${esc(CATACLYSMS[cata.type].title.toUpperCase())}</div>
    <p class="hint">Every system lost ${CATACLYSM_HIT * 100}%${Object.values(cata.hit).some((h) => h.blighted) ? ' (more where a blight was active)' : ''}.
    ${cata.msLost.length ? `Lost: ${cata.msLost.map((id) => MILESTONES.find((m) => m.id === id)?.title).filter(Boolean).join(', ')}.` : 'Your milestones held.'}
    ${cata.popBefore >= 1 ? `${Math.round(cata.survival * 100)}% of Pop survived.` : ''}</p>` : '';
  d.querySelector('.dlg-body').innerHTML = `
    <div class="dlg-head"><h2>${esc(monthName(mk).toUpperCase())} ${year}</h2><span class="dlg-sub">${s.current ? 'This month so far' : 'Month summary'}</span>
      <button type="button" class="dlg-x" data-close aria-label="Close">${icon('close')}</button></div>
    <div class="month-tiles">
      <div class="mt"><span class="v">${s.tasksDone}</span><span class="k">TASKS DONE</span></div>
      <div class="mt"><span class="v">${s.consistency == null ? '—' : Math.round(s.consistency * 100) + '%'}</span><span class="k">DAILY TASKS DONE</span></div>
      <div class="mt"><span class="v">${met}/${s.goals.length}</span><span class="k">GOALS MET</span></div>
      <div class="mt"><span class="v">${s.focusMins ? fmtMins(s.focusMins) : '—'}</span><span class="k">FOCUS</span></div>
    </div>
    <div class="month-cats">${Object.entries(CATS).map(([k, c]) => `<span class="chip" style="--chip:${c.color}">${icon(c.sys)}${c.short} ${s.byCat[k]}</span>`).join('')}</div>
    <div class="label">GOALS</div><ul class="month-goals">${goalRows}</ul>
    ${s.reached.length ? `<div class="label">MILESTONES REACHED</div><p class="hint">${s.reached.map(esc).join(', ')}</p>` : ''}
    ${s.lost.length ? `<div class="label">MILESTONES LOST</div><p class="hint">${s.lost.map(esc).join(', ')}</p>` : ''}
    ${s.blights ? `<p class="hint">${s.blights} blight${s.blights === 1 ? '' : 's'} started this month.</p>` : ''}
    ${cataHtml}
    <div class="dlg-actions">${s.current ? '<button type="button" class="btn" id="monthToPlanet">GO TO PLANET</button>' : ''}<button type="button" class="btn-ghost" data-close>CLOSE</button></div>`;
  const go = $('#monthToPlanet');
  if (go) go.onclick = () => { d.close(); setSky(false); };
  d.showModal();
}
