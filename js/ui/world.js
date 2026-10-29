// The planet view: star background, the spinning globe, and the event markers on it.
import { CATS, visuals } from '../sim.js';
import { Globe, GLOBE_RES, GLOBE_VIEW } from '../globe.js';
import { state } from './store.js';
import { $, esc, fmtDate, reducedMotion } from './util.js';
import { jumpToTask } from './tasks.js';

// ---------- stars background ----------
export function drawStars() {
  const c = $('#stars');
  const w = Math.ceil(innerWidth / 3), h = Math.ceil(innerHeight / 3);
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const css = getComputedStyle(document.documentElement);
  const [starA, starB, starC] = ['--star-a', '--star-b', '--star-c'].map((v) => css.getPropertyValue(v).trim());
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const n = Math.round(w * h / 900);
  for (let i = 0; i < n; i++) {
    const r = rnd();
    ctx.fillStyle = r > 0.92 ? starA : r > 0.8 ? starB : starC;
    ctx.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h), 1, 1);
  }
}
drawStars();
addEventListener('resize', drawStars);

// ---------- globe ----------
export const canvas = $('#globe');
export const globe = new Globe(canvas);
// The canvas is larger than the globe's frame (see #globe in styles.css), leaving room for a ring and moon.
export function sizeCanvas() {
  const px = Math.max(1, Math.round(canvas.clientWidth / GLOBE_RES)) * GLOBE_RES;
  canvas.width = px; canvas.height = px;
}
sizeCanvas();
addEventListener('resize', sizeCanvas);

let selected = null; // selected event id
let dragging = false, lastX = 0, autoSpin = true, spinResume = 0;
const wrap = $('#globeWrap');
wrap.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.node, .tip, .cata-banner')) return;
  dragging = true; lastX = e.clientX; wrap.classList.add('dragging');
  wrap.setPointerCapture(e.pointerId);
  closeTip();
});
wrap.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  globe.rot -= (e.clientX - lastX) / wrap.clientWidth * Math.PI * 1.4;
  lastX = e.clientX;
  autoSpin = false; spinResume = performance.now() + 3000;
});
const endDrag = () => { dragging = false; wrap.classList.remove('dragging'); };
wrap.addEventListener('pointerup', endDrag);
wrap.addEventListener('pointercancel', endDrag);

// Turns the globe to face an event and holds it there for a few seconds.
export function turnTo(ev) {
  globe.rot = ev.lon;
  autoSpin = false; spinResume = performance.now() + 6000;
}

// Called every frame before the simulation step: auto-spin and drifting clouds.
export function spinGlobe(dt, t) {
  if (!autoSpin && !dragging && !selected && t > spinResume) autoSpin = true;
  // one turn every ~70s; with reduced motion, a gentle drift (~6 min a turn) instead of stopping
  if (autoSpin) globe.rot += dt * (reducedMotion.matches ? 0.000017 : 0.00009);
  globe.cloudRot += dt * 0.00004;
}

// Called every frame after the simulation step: draws the planet, the header's mini globe and the markers.
let lastMini = -1e9;
const miniCtx = $('#miniGlobe').getContext('2d');
miniCtx.imageSmoothingEnabled = false;
// An effect layered on the planet for a moment, such as a cataclysm playing out (see cataclysm.js).
let globeFx = () => null;
export const setGlobeFx = (fn) => { globeFx = fn; };
export function drawGlobe(t) {
  const vis = visuals(state, Date.now());
  const fx = globeFx(t);
  if (fx) vis.cata = fx;
  globe.render(vis, t);
  if (t - lastMini > 250) { const m = (GLOBE_RES - GLOBE_VIEW) / 2; miniCtx.clearRect(0, 0, 56, 56); miniCtx.drawImage(globe.buf, m, m, GLOBE_VIEW, GLOBE_VIEW, 0, 0, 56, 56); lastMini = t; }
  placeNodes();
}

// ---------- event nodes ----------
export const KIND = {
  milestone: { color: 'var(--gold)', label: 'MILESTONE' },
  goal: { color: 'var(--good)', label: 'GOAL' },
  blight: { color: 'var(--danger)', label: 'BLIGHT' },
  cleared: { color: 'var(--accent)', label: 'RESTORED' },
  lost: { color: 'var(--danger)', label: 'LOST' },
  cataclysm: { color: 'var(--danger)', label: 'CATACLYSM' },
};
const nodeEls = new Map();
export const hasNode = (id) => nodeEls.has(id);

function visibleEvents() {
  const active = state.events.filter((e) => e.kind === 'blight' && e.active);
  const past = state.events.filter((e) => !(e.kind === 'blight' && e.active) && e.kind !== 'blight').slice(-8);
  return [...past, ...active];
}

export function syncNodes() {
  const evs = visibleEvents();
  const ids = new Set(evs.map((e) => e.id));
  for (const [id, el] of nodeEls) if (!ids.has(id)) { el.remove(); nodeEls.delete(id); }
  for (const e of evs) {
    if (nodeEls.has(e.id)) continue;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'node' + (e.kind === 'blight' ? '' : ' past');
    b.style.color = KIND[e.kind].color;
    b.setAttribute('aria-label', e.title);
    b.addEventListener('click', (ev) => { ev.stopPropagation(); openTip(e.id); });
    $('#nodes').appendChild(b);
    nodeEls.set(e.id, b);
  }
}

// Removes every marker, for when a whole new world is loaded.
export function clearNodes() {
  for (const [, el] of nodeEls) el.remove();
  nodeEls.clear();
}

function placeNodes() {
  const s = wrap.clientWidth;
  for (const e of visibleEvents()) {
    const el = nodeEls.get(e.id);
    if (!el) continue;
    const p = globe.project(e.lat, e.lon);
    const vis = p.z > 0.12;
    el.style.display = vis ? '' : 'none';
    if (vis) { el.style.left = (p.x * s) + 'px'; el.style.top = (p.y * s) + 'px'; }
    if (e.id === selected && !vis) closeTip();
  }
}

export function openTip(id) {
  const e = state.events.find((x) => x.id === id);
  if (!e) return;
  selected = id;
  autoSpin = false;
  const k = KIND[e.kind];
  const tip = $('#tip');
  const linkLabel = e.kind === 'blight' ? 'CLEAR IT WITH ' + CATS[catOfSys(e.sys)].short + ' TASKS · ' + (state.blights[e.sys]?.need ?? 0) + ' LEFT' : e.links.length ? 'CAUSED BY' : '';
  const links = e.kind === 'blight'
    ? state.tasks.filter((t) => CATS[t.cat].sys === e.sys).map((t) => t.name)
    : e.links;
  tip.style.borderColor = k.color;
  tip.innerHTML = `
    <button type="button" class="tip-close" aria-label="Close">×</button>
    <div class="tip-head"><span class="kind" style="background:${k.color}">${k.label}</span><span class="date">${fmtDate(e.t)}</span></div>
    <h3>${esc(e.title)}</h3>
    <p>${esc(e.body)}</p>
    ${linkLabel ? `<div class="label">${esc(linkLabel)}</div>` : ''}
    <div class="links">${links.map((l) => `<button type="button" data-link="${esc(l)}" style="color:${k.color}">› ${esc(l)}</button>`).join('')}</div>`;
  tip.hidden = false;
  const el = nodeEls.get(id);
  const s = wrap.clientWidth;
  const nx = parseFloat(el.style.left), ny = parseFloat(el.style.top);
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  let left = nx + 18, top = ny - 20;
  if (left + tw > s + 60) left = nx - tw - 18;
  left = Math.max(-40, left);
  top = Math.max(-10, Math.min(top, s - th + 10));
  tip.style.left = left + 'px';
  tip.style.top = top + 'px';
  tip.querySelector('.tip-close').addEventListener('click', closeTip);
  tip.querySelectorAll('[data-link]').forEach((b) => b.addEventListener('click', () => jumpToTask(b.dataset.link)));
}
export function closeTip() {
  selected = null;
  $('#tip').hidden = true;
  spinResume = performance.now() + 1500;
}
function catOfSys(sys) { return Object.keys(CATS).find((c) => CATS[c].sys === sys); }
