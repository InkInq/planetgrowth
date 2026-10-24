import {
  CATS, SYSTEMS, TYPES, MILESTONES, DAY, HOUR,
  newState, advance, rates, completeTask, uncompleteTask, isDoneToday, goalProgress,
  nextMilestone, milestoneProgress, forecast, visuals, eraOf, stats, uid, dayKey, fmtDuration,
} from './sim.js';
import { Globe } from './globe.js';

const SAVE_KEY = 'planetgrowth-save-v1';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- state ----------
function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* storage unavailable or corrupt */ }
  return newState(Date.now());
}
function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
}

let state = load();
let selected = null; // selected event id
const pending = [];
advance(state, Date.now(), pending);
save();

// ---------- toast ----------
let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
function announce(evs) {
  for (const e of evs) {
    if (e.kind === 'milestone') toast('★ ' + e.title);
    else if (e.kind === 'blight') toast('⚠ ' + e.title + ' — tap it on the globe');
    else if (e.kind === 'cleared') toast('✓ ' + e.title);
    else if (e.kind === 'goal') toast('★ ' + e.title + ' complete');
  }
  evs.length = 0;
}

// ---------- stars background ----------
function drawStars() {
  const c = $('#stars');
  const w = Math.ceil(innerWidth / 3), h = Math.ceil(innerHeight / 3);
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const n = Math.round(w * h / 900);
  for (let i = 0; i < n; i++) {
    const r = rnd();
    ctx.fillStyle = r > 0.92 ? '#5ef2e6' : r > 0.8 ? '#ff9fc8' : '#4a3f78';
    ctx.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h), 1, 1);
  }
}
drawStars();
addEventListener('resize', drawStars);

// ---------- globe ----------
const canvas = $('#globe');
const globe = new Globe(canvas);
function sizeCanvas() {
  const px = Math.max(1, Math.round(canvas.clientWidth / 112)) * 112;
  canvas.width = px; canvas.height = px;
}
sizeCanvas();
addEventListener('resize', sizeCanvas);

let dragging = false, lastX = 0, autoSpin = true, spinResume = 0;
const wrap = $('#globeWrap');
wrap.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.node, .tip')) return;
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

// ---------- event nodes ----------
const KIND = {
  milestone: { color: '#ffb347', label: 'MILESTONE' },
  goal: { color: '#8ef07a', label: 'GOAL' },
  blight: { color: '#ff5fa2', label: 'BLIGHT' },
  cleared: { color: '#5ef2e6', label: 'RESTORED' },
};
const nodeEls = new Map();

function visibleEvents() {
  const active = state.events.filter((e) => e.kind === 'blight' && e.active);
  const past = state.events.filter((e) => !(e.kind === 'blight' && e.active) && e.kind !== 'blight').slice(-8);
  return [...past, ...active];
}

function syncNodes() {
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

function fmtDate(t) { return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }

function openTip(id) {
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
function closeTip() {
  selected = null;
  $('#tip').hidden = true;
  spinResume = performance.now() + 1500;
}
function catOfSys(sys) { return Object.keys(CATS).find((c) => CATS[c].sys === sys); }

function jumpToTask(text) {
  const name = text.replace(/ ×\d+$/, '');
  setView('tasks');
  const li = [...document.querySelectorAll('.task')].find((x) => x.dataset.name === name);
  if (li) {
    li.scrollIntoView({ block: 'nearest' });
    li.animate([{ background: 'rgba(94,242,230,0.25)' }, { background: 'transparent' }], { duration: 1200, easing: 'steps(6)' });
  }
}

// ---------- panels ----------
function effectText(t) {
  const sys = SYSTEMS[CATS[t.cat].sys].label.split(' · ').pop();
  return {
    steady: `Steady · ${sys} +0.06/h`,
    surge: `Surge · ${sys} ×2 for 12h`,
    catalyst: `Catalyst · ${sys} +15 now`,
    stabilizer: `Stabilizer · holds ${sys} 24h`,
  }[t.type] + (t.recurring ? '' : ' · once');
}

function renderTasks() {
  const now = Date.now();
  const ul = $('#taskList');
  if (!state.tasks.length) { ul.innerHTML = '<li class="empty">No tasks yet. Add one to start feeding your world.</li>'; return; }
  ul.innerHTML = state.tasks.map((t) => {
    const done = isDoneToday(state, t, now);
    return `<li class="task${done ? ' done' : ''}" data-name="${esc(t.name)}">
      <input type="checkbox" id="t-${t.id}" data-task="${t.id}" ${done ? 'checked' : ''}>
      <label for="t-${t.id}"><span class="name">${esc(t.name)}</span><span class="effect">${effectText(t)}</span></label>
      <span class="tag" style="background:${CATS[t.cat].color}">${CATS[t.cat].short}</span>
      <button type="button" class="icon-btn" data-del="${t.id}" aria-label="Delete ${esc(t.name)}">×</button>
    </li>`;
  }).join('');
}

function renderGoals() {
  const now = Date.now();
  const active = state.goals.filter((g) => !g.done || now - g.done < DAY);
  $('#goalCount').textContent = state.goals.filter((g) => !g.done).length + '/3';
  $('#addGoalBtn').disabled = state.goals.filter((g) => !g.done).length >= 3;
  const ul = $('#goalList');
  if (!active.length) { ul.innerHTML = '<li class="empty">Goals unlock the biggest changes to your world.</li>'; return; }
  ul.innerHTML = active.map((g) => {
    const pct = Math.min(100, g.current / g.target * 100);
    const daysLeft = Math.ceil((new Date(g.deadline + 'T23:59:59') - now) / DAY);
    return `<li class="goal${g.done ? ' done' : ''}">
      <div class="goal-head"><span>${esc(g.name)}</span><span class="due">${g.done ? 'DONE' : daysLeft >= 0 ? daysLeft + 'd left' : 'overdue'}</span></div>
      <div class="bar"><div style="width:${pct}%;background:${CATS[g.cat].color}"></div></div>
      <div class="meta">${+g.current.toFixed(2)} / ${g.target} ${esc(g.unit)}</div>
      ${g.done ? '' : `<div class="goal-actions">
        <input type="number" step="any" value="1" aria-label="Amount" data-amt="${g.id}">
        <button type="button" class="btn-sm" data-log="${g.id}">LOG</button>
        <button type="button" class="icon-btn" data-delgoal="${g.id}" aria-label="Abandon goal">×</button>
      </div>`}
    </li>`;
  }).join('');
}

function segs(v, color) {
  const filled = Math.max(0, Math.min(12, Math.round(v * 12)));
  return '<div class="segs">' + Array.from({ length: 12 }, (_, i) => `<div style="${i < filled ? 'background:' + color : ''}"></div>`).join('') + '</div>';
}

function renderSystems() {
  const now = Date.now();
  const r = rates(state, now);
  const notes = {
    heat: state.blights.heat ? 'Deep cooling draining −0.4/h' : state.gen.heat > 0.05 ? 'Surface warming' : 'Feed with Physical tasks',
    atmos: state.blights.atmos ? 'Dust storm draining −0.4/h' : state.gen.atmos > 0.05 ? 'Haze building' : 'Feed with Mental tasks',
    water: state.milestones.rain ? 'Forms from Heat and Atmosphere together' : 'Locked until First Rain',
    life: state.milestones.rain ? (state.blights.life ? 'Withering −0.4/h' : 'Spreading along shores') : 'Struggles without water (×0.25)',
  };
  $('#systems').innerHTML = Object.keys(SYSTEMS).map((k) => {
    const s = SYSTEMS[k];
    const locked = k === 'water' && !state.milestones.rain;
    const rate = locked ? 'LOCKED' : (r[k] >= 0 ? '+' : '') + r[k].toFixed(2) + '/h';
    const rc = locked ? 'var(--muted)' : r[k] < 0 ? 'var(--magenta)' : s.color;
    return `<div class="sys${locked ? ' locked' : ''}">
      <div class="sys-head"><span>${s.label}</span><span style="color:${rc}">${rate}</span></div>
      ${segs(Math.min(1, state.res[k] / 700), s.color)}
      <div class="note">${Math.floor(state.res[k])} · ${notes[k]}</div>
    </div>`;
  }).join('');

  const m = nextMilestone(state);
  const done = MILESTONES.filter((x) => state.milestones[x.id]);
  $('#processes').innerHTML = (m ? `<div>
      <div class="sys-head"><span>${esc(m.title)}</span><span style="color:var(--cyan)">${Math.floor(milestoneProgress(state, m) * 100)}%</span></div>
      <div class="bar"><div style="width:${milestoneProgress(state, m) * 100}%;background:var(--cyan)"></div></div>
      <div class="note" style="font-size:16px;color:var(--muted);margin-top:4px">Needs ${Object.entries(m.req).map(([k, v]) => SYSTEMS[k].label.split(' · ').pop() + ' ' + v).join(' + ')}</div>
    </div>` : '<div class="note">All milestones reached.</div>')
    + `<div class="note" style="font-size:16px;color:var(--muted)">${done.length} / ${MILESTONES.length} milestones</div>`;

  const cards = [];
  for (const s of state.surges) cards.push(`<div class="effect-card"><div class="t" style="color:var(--amber)">SURGE · ${fmtDuration((s.until - now) / HOUR)} LEFT</div><div class="d">${esc(s.name)}: ${SYSTEMS[s.sys].label} ×${s.mult}</div></div>`);
  for (const k in state.stab) if (state.stab[k] > now) cards.push(`<div class="effect-card" style="border-color:var(--cyan)"><div class="t" style="color:var(--cyan)">STABILIZED · ${fmtDuration((state.stab[k] - now) / HOUR)} LEFT</div><div class="d">${SYSTEMS[k].label} holds steady</div></div>`);
  $('#effects').innerHTML = cards.join('');
}

function renderHeader() {
  const era = eraOf(state);
  $('#era').textContent = `ERA ${era.n} · ${era.name.toUpperCase()}`;
  $('#worldName').textContent = state.name;
  const cycle = Math.floor((Date.now() - state.created) / DAY) + 1;
  $('#cycle').textContent = 'CYCLE ' + String(cycle).padStart(3, '0');
  $('#streak').textContent = 'STREAK ' + stats(state, Date.now()).streak;
  $('#forecast').textContent = forecast(state, Date.now()).text;
}

function renderStats() {
  const s = stats(state, Date.now());
  const pct = (v) => v == null ? '—' : Math.round(v * 100) + '%';
  const evs = [...state.events].reverse();
  $('#statsBody').innerHTML = `
    <div class="label">LAST 7 DAYS · COMPLETION</div>
    <div class="stat-grid">${Object.keys(CATS).map((c) => `<div class="stat" style="border-color:${CATS[c].color}"><div class="v">${pct(s.byCat[c])}</div><div class="k">${CATS[c].short}</div></div>`).join('')}</div>
    <div class="stat-section">
      <div class="label">TASK RELIABILITY · 14 DAYS</div>
      ${s.tasks.map((t) => `<div class="rel-row"><span>${esc(t.name)}</span><div class="bar"><div style="width:${t.rel * 100}%;background:${CATS[t.cat].color}"></div></div><span>${Math.round(t.rel * 100)}%</span></div>`).join('') || '<div class="empty">No daily tasks yet.</div>'}
    </div>
    <div class="stat-section">
      <div class="label">WORLD HISTORY</div>
      <ul class="timeline">${evs.map((e) => `<li><span class="d">${fmtDate(e.t)}</span><span style="color:${KIND[e.kind].color}">${esc(e.title)}</span></li>`).join('')}</ul>
    </div>`;
}

function renderAll() {
  renderHeader();
  renderTasks();
  renderGoals();
  renderSystems();
  syncNodes();
}

// ---------- interactions ----------
$('#taskList').addEventListener('change', (e) => {
  const id = e.target.dataset.task;
  if (!id) return;
  const t = state.tasks.find((x) => x.id === id);
  const now = Date.now();
  if (e.target.checked) completeTask(state, t, now, pending);
  else uncompleteTask(state, t, now);
  save(); announce(pending); renderAll();
});
$('#taskList').addEventListener('click', (e) => {
  const id = e.target.dataset.del;
  if (!id) return;
  const t = state.tasks.find((x) => x.id === id);
  if (!confirm('Delete "' + t.name + '"?')) return;
  state.tasks = state.tasks.filter((x) => x.id !== id);
  save(); renderAll();
});
$('#goalList').addEventListener('click', (e) => {
  const logId = e.target.dataset.log, delId = e.target.dataset.delgoal;
  if (logId) {
    const g = state.goals.find((x) => x.id === logId);
    const amt = parseFloat(document.querySelector(`[data-amt="${logId}"]`).value) || 0;
    goalProgress(state, g, amt, Date.now(), pending);
    save(); announce(pending); renderAll();
  }
  if (delId) {
    const g = state.goals.find((x) => x.id === delId);
    if (!confirm('Abandon "' + g.name + '"?')) return;
    state.goals = state.goals.filter((x) => x.id !== delId);
    save(); renderAll();
  }
});

// dialogs
document.addEventListener('click', (e) => {
  const open = e.target.closest('[data-open]');
  if (open) {
    const d = document.getElementById(open.dataset.open);
    if (d.id === 'statsDlg') renderStats();
    if (d.id === 'goalDlg') {
      const min = dayKey(Date.now() + 7 * DAY);
      $('#goalDeadline').min = min;
      $('#goalDeadline').value = dayKey(Date.now() + 14 * DAY);
    }
    d.showModal();
  }
  if (e.target.closest('[data-close]')) e.target.closest('dialog').close();
});

const typeHint = () => { $('#typeHint').textContent = TYPES[$('#typeSelect').value].desc; };
$('#typeSelect').addEventListener('change', typeHint);
typeHint();

$('#taskForm').addEventListener('submit', (e) => {
  const f = new FormData(e.target);
  const name = String(f.get('name')).trim();
  if (!name) return;
  state.tasks.push({ id: uid(), name, cat: f.get('cat'), type: f.get('type'), recurring: !!f.get('recurring'), created: Date.now() });
  e.target.reset(); typeHint();
  save(); renderAll();
});

$('#goalForm').addEventListener('submit', (e) => {
  const f = new FormData(e.target);
  if (state.goals.filter((g) => !g.done).length >= 3) { e.preventDefault(); toast('Only 3 goals at once'); return; }
  const deadline = String(f.get('deadline'));
  if (deadline < dayKey(Date.now() + 7 * DAY)) { e.preventDefault(); toast('Deadline must be at least 7 days out'); return; }
  state.goals.push({ id: uid(), name: String(f.get('name')).trim(), target: parseFloat(f.get('target')), unit: String(f.get('unit')).trim(), cat: f.get('cat'), deadline, current: 0, created: Date.now() });
  e.target.reset();
  save(); renderAll();
  setView('goals');
});

$('#worldName').addEventListener('click', () => {
  const n = prompt('Name your world', state.name);
  if (n && n.trim()) { state.name = n.trim().slice(0, 28); save(); renderHeader(); }
});

$('#exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'planetgrowth-' + dayKey(Date.now()) + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('#importInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || data.v !== 1 || !data.res) throw new Error('bad');
    state = data; save(); renderAll(); renderStats(); toast('Save imported');
  } catch (err) { toast('That file is not a Planet Growth save'); }
  e.target.value = '';
});
$('#resetBtn').addEventListener('click', () => {
  if (!confirm('Reset your world? This erases all progress.')) return;
  state = newState(Date.now());
  for (const [, el] of nodeEls) el.remove();
  nodeEls.clear();
  save(); renderAll(); renderStats(); closeTip();
});

// desktop tabs + mobile views
function setView(v) {
  document.body.dataset.view = v;
  document.querySelectorAll('.tabbar [data-view]').forEach((b) => b.toggleAttribute('aria-current', b.dataset.view === v));
  if (v === 'tasks' || v === 'goals') {
    $('#paneTasks').hidden = v !== 'tasks';
    $('#paneGoals').hidden = v !== 'goals';
    $('#tabDaily').setAttribute('aria-selected', v === 'tasks');
    $('#tabGoals').setAttribute('aria-selected', v === 'goals');
  }
}
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => setView(b.dataset.tab)));
document.querySelectorAll('.tabbar [data-view]').forEach((b) => b.addEventListener('click', () => {
  // tapping the active tab collapses the sheet to show the whole globe
  setView(document.body.dataset.view === b.dataset.view ? 'none' : b.dataset.view);
}));

// ---------- loop ----------
renderAll();
announce(pending);

let lastSim = 0, lastUi = 0, lastFrame = performance.now();
function frame(t) {
  const dt = t - lastFrame; lastFrame = t;
  if (!autoSpin && !dragging && !selected && t > spinResume) autoSpin = true;
  if (autoSpin && !matchMedia('(prefers-reduced-motion: reduce)').matches) globe.rot += dt * 0.00009;
  globe.cloudRot += dt * 0.00004;
  if (t - lastSim > 1000) {
    advance(state, Date.now(), pending);
    if (pending.length) { announce(pending); renderAll(); }
    lastSim = t;
  }
  if (t - lastUi > 5000) { renderHeader(); renderSystems(); save(); lastUi = t; }
  globe.render(visuals(state, Date.now()), t);
  placeNodes();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { advance(state, Date.now(), pending); announce(pending); renderAll(); }
  else save();
});

// ---------- PWA ----------
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// debug hook for testing: window.__pg.fastForward(hours)
window.__pg = {
  get state() { return state; },
  fastForward(h) { state.lastTick -= h * HOUR; state.created -= h * HOUR; advance(state, Date.now(), pending); announce(pending); renderAll(); save(); },
};
