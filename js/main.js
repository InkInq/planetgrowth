import {
  CATS, SYSTEMS, TYPES, MILESTONES, BLIGHTS, DAY, HOUR,
  newState, advance, rates, completeTask, uncompleteTask, isDoneToday, goalProgress,
  nextMilestone, milestoneProgress, forecast, visuals, eraOf, stats, uid, dayKey, fmtDuration,
} from './sim.js';
import { Globe } from './globe.js';
import { icon } from './icons.js';

const SAVE_KEY = 'planetgrowth-save-v1';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
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
function toast(msg, action) {
  const t = $('#toast');
  const btn = t.querySelector('.toast-act');
  t.querySelector('.toast-msg').textContent = msg;
  btn.hidden = !action;
  btn.onclick = null;
  if (action) {
    btn.textContent = action.label;
    btn.onclick = () => { t.classList.remove('show'); action.run(); };
  }
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), action ? 4500 : 2600);
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
  catFilter = 'ALL';
  renderTasks();
  setView('tasks');
  const li = [...document.querySelectorAll('.task')].find((x) => x.dataset.name === name);
  if (li) {
    li.scrollIntoView({ block: 'nearest' });
    li.animate([{ background: 'rgba(94,242,230,0.25)' }, { background: 'transparent' }], { duration: 1200, easing: 'steps(6)' });
  }
}

// ---------- tasks ----------
let catFilter = 'ALL';

const sysShort = (cat) => SYSTEMS[CATS[cat].sys].label.split(' · ').pop();

function rewardText(cat, type) {
  const s = sysShort(cat);
  return { steady: `${s} +0.06/h`, surge: `${s} ×2 · 12h`, catalyst: `${s} +15`, stabilizer: `Hold ${s} 24h` }[type];
}
const FLOAT_TEXT = { steady: '+0.06/h', surge: '×2', catalyst: '+15', stabilizer: 'HOLD' };

// "taskId|day" for every completion, so per-day lookups are cheap.
function historyIndex() {
  const s = new Set();
  for (const h of state.history) s.add(h.taskId + '|' + dayKey(h.t));
  return s;
}

// Consecutive days done, ending today (or yesterday if not done yet today).
function taskStreak(idx, t, now) {
  let d = idx.has(t.id + '|' + dayKey(now)) ? 0 : 1, n = 0;
  while (idx.has(t.id + '|' + dayKey(now - d * DAY))) { n++; d++; }
  return n;
}

function taskCard(t, done, streak) {
  const c = CATS[t.cat];
  const blight = !done && state.blights[c.sys];
  return `<li class="task${done ? ' done' : ''}" style="--c:${c.color}" data-name="${esc(t.name)}">
    <label class="check">
      <input type="checkbox" data-task="${t.id}" ${done ? 'checked' : ''} aria-label="${done ? 'Mark not done' : 'Complete'}: ${esc(t.name)}">
      <span class="box">${icon('check')}</span>
    </label>
    <button type="button" class="task-body" data-edit="${t.id}">
      <span class="name">${esc(t.name)}</span>
      <span class="chips">
        <span class="chip reward">${icon(t.type)}${rewardText(t.cat, t.type)}</span>
        <span class="chip muted">${icon(t.recurring ? 'repeat' : 'once')}${t.recurring ? 'Daily' : 'Once'}</span>
        ${streak >= 2 ? `<span class="chip streak">${icon('streak')}${streak}d streak</span>` : ''}
        ${blight ? `<span class="chip blight">${icon('warn')}${BLIGHTS[c.sys].title}</span>` : ''}
      </span>
    </button>
    <span class="cat-ico" aria-hidden="true">${icon(c.sys)}</span>
  </li>`;
}

function renderTasks() {
  const now = Date.now();
  const idx = historyIndex();
  const today = dayKey(now);
  const isDone = (t) => idx.has(t.id + '|' + today);
  const all = state.tasks;
  const doneN = all.filter(isDone).length;

  const date = new Date(now).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
  const allClear = all.length && doneN === all.length;
  $('#daySummary').innerHTML = `
    <div class="day-head"><span class="label">TODAY · ${esc(date)}</span><span class="day-count${allClear ? ' clear' : ''}">${allClear ? '★ ALL CLEAR' : doneN + ' / ' + all.length}</span></div>
    ${all.length ? `<div class="day-bar">${all.map((t) => `<span${isDone(t) ? ` style="background:${CATS[t.cat].color}"` : ''}></span>`).join('')}</div>` : ''}`;

  $('#catFilter').innerHTML = ['ALL', ...Object.keys(CATS)].map((k) => {
    const ts = k === 'ALL' ? all : all.filter((t) => t.cat === k);
    const left = ts.filter((t) => !isDone(t)).length;
    const c = CATS[k];
    return `<button type="button" class="fchip" data-filter="${k}" aria-pressed="${catFilter === k}"${c ? ` style="--c:${c.color}"` : ''}>${c ? icon(c.sys) : ''}${c ? c.short : 'ALL'}<span class="n">${left}</span></button>`;
  }).join('');

  const ul = $('#taskList');
  if (!all.length) { ul.innerHTML = '<li class="empty">No tasks yet. Add one to start feeding your world.</li>'; return; }
  const shown = catFilter === 'ALL' ? all : all.filter((t) => t.cat === catFilter);
  const open = shown.filter((t) => !isDone(t)), done = shown.filter(isDone);
  let html = open.map((t) => taskCard(t, false, taskStreak(idx, t, now))).join('');
  if (!open.length) html += `<li class="empty">${shown.length ? 'All done here today. The planet thanks you.' : 'No ' + CATS[catFilter].label + ' tasks yet.'}</li>`;
  if (done.length) html += `<li class="list-label label">DONE TODAY · ${done.length}</li>` + done.map((t) => taskCard(t, true, taskStreak(idx, t, now))).join('');
  ul.innerHTML = html;
}

function floatReward(el, text, color) {
  if (reducedMotion.matches) return;
  const r = el.getBoundingClientRect();
  const f = document.createElement('div');
  f.className = 'float-reward';
  f.textContent = text;
  f.style.color = color;
  f.style.left = (r.left + r.width / 2) + 'px';
  f.style.top = r.top + 'px';
  document.body.appendChild(f);
  f.addEventListener('animationend', () => f.remove());
}

// ---------- goals ----------
const MAX_GOALS = 3;
const GOAL_RES = 60, GOAL_GEN = 0.3; // mirrors goalProgress in sim.js
const fmtNum = (v) => String(+(+v).toFixed(2));
const activeGoals = () => state.goals.filter((g) => !g.done);
const goalDaysLeft = (g, now) => Math.ceil((new Date(g.deadline + 'T23:59:59') - now) / DAY);

function goalCard(g, now) {
  const c = CATS[g.cat];
  const pct = Math.min(100, g.current / g.target * 100);
  const left = goalDaysLeft(g, now);
  const remain = Math.max(0, g.target - g.current);
  const due = new Date(g.deadline + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const dueCls = left < 0 ? 'blight' : left <= 3 ? 'streak' : 'muted';
  const dueText = left < 0 ? 'Overdue · ' + due : left === 0 ? 'Due today' : `${left}d left · ${due}`;
  const pace = left > 0 && remain > 0 ? `${fmtNum(remain / left)} ${esc(g.unit)}/day` : '';
  return `<li class="goal" style="--c:${c.color}">
    <button type="button" class="goal-body" data-editgoal="${g.id}">
      <span class="goal-top"><span class="name">${esc(g.name)}</span><span class="cat-ico" aria-hidden="true">${icon(c.sys)}</span></span>
      <span class="goal-nums"><span class="cur">${fmtNum(g.current)}</span><span class="of">/ ${fmtNum(g.target)} ${esc(g.unit)}</span><span class="pct">${Math.floor(pct)}%</span></span>
      <span class="meter"><span class="fill" style="width:${pct}%"></span></span>
      <span class="chips">
        <span class="chip ${dueCls}">${icon('clock')}${dueText}</span>
        ${pace ? `<span class="chip muted" title="Needed per day to finish on time">${icon('steady')}${pace}</span>` : ''}
        <span class="chip reward">${icon('star')}+${GOAL_RES} ${sysShort(g.cat)}</span>
      </span>
    </button>
    <div class="goal-log">
      <button type="button" class="step" data-step="-1" data-goal="${g.id}" aria-label="Less">${icon('minus')}</button>
      <input type="number" step="any" min="0" value="1" inputmode="decimal" data-amt="${g.id}" aria-label="Amount to log for ${esc(g.name)}">
      <button type="button" class="step" data-step="1" data-goal="${g.id}" aria-label="More">${icon('plus')}</button>
      <button type="button" class="btn-log" data-log="${g.id}">LOG</button>
    </div>
  </li>`;
}

function renderGoals() {
  const now = Date.now();
  const open = activeGoals();
  const achieved = state.goals.filter((g) => g.done).sort((a, b) => b.done - a.done);
  const full = open.length >= MAX_GOALS;
  $('#goalCount').textContent = open.length + '/' + MAX_GOALS;
  $('#addGoalBtn').disabled = full;
  $('#addGoalBtn').textContent = full ? 'ALL 3 GOAL SLOTS IN USE' : '+ SET GOAL';
  $('#goalSummary').innerHTML = `
    <div class="day-head"><span class="label">GOAL SLOTS · MIN 7 DAYS OUT</span><span class="day-count">${open.length} / ${MAX_GOALS}</span></div>
    <div class="slots">${Array.from({ length: MAX_GOALS }, (_, i) => {
      const g = open[i];
      return g ? `<span class="slot used" style="--c:${CATS[g.cat].color}">${icon('flag')}</span>` : '<span class="slot"></span>';
    }).join('')}</div>`;
  let html = open.map((g) => goalCard(g, now)).join('');
  if (!open.length) html += `<li class="empty">Goals make the biggest changes to your world: +${GOAL_RES} to a system, a lasting +${GOAL_GEN}/h, and a landmark on the globe.</li>`;
  if (achieved.length) {
    html += `<li class="list-label label">ACHIEVED · ${achieved.length}</li>` + achieved.map((g) => `
      <li class="achieved" style="--c:${CATS[g.cat].color}">${icon('star')}<span class="name">${esc(g.name)}</span><span class="meta">${fmtNum(g.target)} ${esc(g.unit)} · ${fmtDate(g.done)}</span></li>`).join('');
  }
  $('#goalList').innerHTML = html;
  syncFab();
}

// ---------- world: systems + milestone road ----------
const SYS_FEED = { heat: 'PHYS', atmos: 'MIND', life: 'LIFE' };
const SYS_SCALE = 700; // same full scale the globe visuals use
const sysName = (k) => SYSTEMS[k].label.split(' · ').pop();

function sysModifiers(k, now) {
  const out = [];
  const held = (state.stab[k] || 0) > now;
  for (const s of state.surges) {
    if (s.sys === k && s.until > now) out.push(`<span class="chip streak" title="${esc(s.name)}">${icon('surge')}×${s.mult} · ${fmtDuration((s.until - now) / HOUR)} left</span>`);
  }
  if (held) out.push(`<span class="chip held">${icon('stabilizer')}Held · ${fmtDuration((state.stab[k] - now) / HOUR)} left</span>`);
  if (state.blights[k]) out.push(`<span class="chip blight">${icon('warn')}${BLIGHTS[k].title}${held ? ' · paused' : ' −0.4/h'}</span>`);
  if (state.gen[k] > 0.005) out.push(`<span class="chip muted" title="Boost from Steady tasks. It fades about 5% a day unless held.">${icon(held ? 'steady' : 'drift')}Tasks +${state.gen[k].toFixed(2)}/h${held ? '' : ' · fading'}</span>`);
  if (k === 'life' && !state.milestones.rain) out.push(`<span class="chip muted">${icon('water')}×0.25 until First Rain</span>`);
  return out.join('');
}

function sysCard(k, now, r, next) {
  const s = SYSTEMS[k];
  const locked = k === 'water' && !state.milestones.rain;
  const v = state.res[k], rate = r[k];
  const rateCls = locked ? 'muted' : rate < -0.001 ? 'neg' : rate > 0.001 ? 'pos' : 'muted';
  const rateText = locked ? 'LOCKED' : (rate < 0 ? '−' : '+') + Math.abs(rate).toFixed(2) + '/h';
  const target = next && next.req[k];
  const feed = locked ? 'Unlocks at First Rain' : SYS_FEED[k] ? `Fed by ${CATS[SYS_FEED[k]].short} tasks` : 'Forms from Heat + Atmosphere';
  return `<div class="sys-card${locked ? ' locked' : ''}" style="--c:${s.color}">
    <div class="sys-top">
      <span class="sys-ico">${icon(locked ? 'lock' : k)}</span>
      <span class="sys-title"><span class="name">${s.label}</span><span class="feed">${feed}</span></span>
      <span class="sys-val">${locked ? '' : `<span class="v">${Math.floor(v)}</span>`}<span class="rate ${rateCls}">${rateText}</span></span>
    </div>
    <div class="meter"><span class="fill" style="width:${Math.min(100, v / SYS_SCALE * 100)}%"></span>${target ? `<span class="mark" style="left:${Math.min(100, target / SYS_SCALE * 100)}%"></span>` : ''}</div>
    ${target && v < target ? `<div class="sys-next">${icon('flag')}${esc(next.title)} at ${target}</div>` : ''}
    <div class="chips">${sysModifiers(k, now)}</div>
  </div>`;
}

function renderRoad(now) {
  const next = nextMilestone(state);
  const fc = forecast(state, now);
  $('#road').innerHTML = MILESTONES.map((m) => {
    const at = state.milestones[m.id];
    const need = Object.entries(m.req).map(([k, v]) => sysName(k) + ' ' + v).join(' + ');
    const era = m.id === 'bloom' ? '<span class="era-tag">ERA II</span>' : '';
    if (at) {
      return `<li class="ms done"><span class="ms-node">${icon('check')}</span><span class="ms-body">
        <span class="t">${esc(m.title)}${era}</span><span class="d">Reached ${fmtDate(at)}</span></span></li>`;
    }
    if (m === next) {
      const p = milestoneProgress(state, m);
      const eta = fc.stalled ? `Stalled: ${sysName(fc.stalled)} isn't growing` : fc.hours != null ? `~${fmtDuration(fc.hours)} at this pace` : '';
      return `<li class="ms current"><span class="ms-node">${icon('star')}</span><span class="ms-body">
        <span class="t">${esc(m.title)}${era}<span class="pct">${Math.floor(p * 100)}%</span></span>
        <span class="meter"><span class="fill" style="width:${p * 100}%"></span></span>
        <span class="d">Needs ${need}</span><span class="d eta${fc.stalled ? ' stalled' : ''}">${eta}</span></span></li>`;
    }
    return `<li class="ms"><span class="ms-node">${icon('lock')}</span><span class="ms-body">
      <span class="t">${esc(m.title)}${era}</span><span class="d">Needs ${need}</span></span></li>`;
  }).join('');
}

function renderSystems() {
  const now = Date.now();
  const r = rates(state, now);
  const next = nextMilestone(state);
  const era = eraOf(state);
  const doneN = MILESTONES.filter((m) => state.milestones[m.id]).length;
  $('#worldSummary').innerHTML = `<span class="era-badge">ERA ${era.n}</span><span class="ws-name">${era.name.toUpperCase()}</span><span class="ws-count" title="Milestones reached">${icon('star')}${doneN}/${MILESTONES.length}</span>`;
  $('#systems').innerHTML = Object.keys(SYSTEMS).map((k) => sysCard(k, now, r, next)).join('');
  renderRoad(now);
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
  if (e.target.checked) {
    completeTask(state, t, now, pending);
    floatReward(e.target.closest('.check'), FLOAT_TEXT[t.type], CATS[t.cat].color);
    toast('✓ ' + t.name + ' · ' + rewardText(t.cat, t.type), {
      label: 'UNDO',
      run: () => { uncompleteTask(state, t, Date.now()); save(); renderAll(); },
    });
  } else uncompleteTask(state, t, now);
  save(); announce(pending); renderAll();
});
$('#taskList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-edit]');
  if (b) openTaskDlg(state.tasks.find((x) => x.id === b.dataset.edit));
});
$('#catFilter').addEventListener('click', (e) => {
  const b = e.target.closest('[data-filter]');
  if (!b) return;
  catFilter = b.dataset.filter;
  renderTasks();
});
$('#goalList').addEventListener('click', (e) => {
  const step = e.target.closest('[data-step]');
  if (step) {
    const inp = document.querySelector(`[data-amt="${step.dataset.goal}"]`);
    inp.value = fmtNum(Math.max(0, (parseFloat(inp.value) || 0) + Number(step.dataset.step)));
    return;
  }
  const log = e.target.closest('[data-log]');
  if (log) { logGoal(log); return; }
  const edit = e.target.closest('[data-editgoal]');
  if (edit) openGoalDlg(state.goals.find((x) => x.id === edit.dataset.editgoal));
});
$('#goalList').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.dataset.amt) document.querySelector(`[data-log="${e.target.dataset.amt}"]`).click();
});

function logGoal(btn) {
  const g = state.goals.find((x) => x.id === btn.dataset.log);
  const amt = parseFloat(document.querySelector(`[data-amt="${g.id}"]`).value) || 0;
  if (amt <= 0) { toast('Enter an amount to log'); return; }
  floatReward(btn, '+' + fmtNum(amt) + ' ' + g.unit, CATS[g.cat].color);
  goalProgress(state, g, amt, Date.now(), pending);
  if (!g.done) {
    toast(`Logged ${fmtNum(amt)} ${g.unit} · ${g.name}`, {
      label: 'UNDO',
      run: () => { if (!g.done) { goalProgress(state, g, -amt, Date.now(), []); save(); renderAll(); } },
    });
  }
  save(); announce(pending); renderAll();
}

// dialogs
document.addEventListener('click', (e) => {
  const open = e.target.closest('[data-open]');
  if (open) {
    const d = document.getElementById(open.dataset.open);
    if (d.id === 'taskDlg') { openTaskDlg(null); return; }
    if (d.id === 'goalDlg') { openGoalDlg(null); return; }
    if (d.id === 'statsDlg') renderStats();
    d.showModal();
  }
  if (e.target.closest('[data-close]')) e.target.closest('dialog').close();
});

// task dialog: tile pickers, live reward preview, add + edit
const TYPE_SHORT = { steady: '+0.06/h, lasting', surge: '×2 for 12h', catalyst: '+15 right now', stabilizer: 'No drain for 24h' };
const catTiles = () => Object.entries(CATS).map(([k, c], i) => `
  <label class="tile" style="--c:${c.color}"><input type="radio" name="cat" value="${k}"${i ? '' : ' checked'}>
    <span class="ico">${icon(c.sys)}</span><span class="t">${c.short}</span><span class="s">${c.label}</span></label>`).join('');
$('#catPicker').insertAdjacentHTML('beforeend', catTiles());
$('#goalCatPicker').insertAdjacentHTML('beforeend', catTiles());
$('#typePicker').insertAdjacentHTML('beforeend', Object.entries(TYPES).map(([k, t], i) => `
  <label class="tile"><input type="radio" name="type" value="${k}"${i ? '' : ' checked'}>
    <span class="ico">${icon(k)}</span><span class="t">${t.label.toUpperCase()}</span><span class="s">${TYPE_SHORT[k]}</span></label>`).join(''));
document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); });
$('.fab').innerHTML = icon('plus');

let editingId = null;
const taskForm = $('#taskForm');
const picked = (name) => taskForm.querySelector(`[name="${name}"]:checked`)?.value;

function updateTaskPreview() {
  const cat = picked('cat'), type = picked('type'), daily = picked('recurring') === '1';
  taskForm.style.setProperty('--form-c', CATS[cat].color);
  $('#taskPreview').innerHTML = `<span class="label">ON COMPLETE</span>
    <span class="chip reward">${icon(type)}${rewardText(cat, type)}</span>
    <span class="pv-desc">${esc(TYPES[type].desc)}. ${daily ? 'Repeats every day.' : 'Done once, then archived.'}</span>`;
}
taskForm.addEventListener('change', updateTaskPreview);

function openTaskDlg(task) {
  taskForm.reset();
  editingId = task ? task.id : null;
  $('#taskDlgTitle').textContent = task ? 'EDIT TASK' : 'NEW TASK';
  $('#taskSubmit').textContent = task ? 'SAVE' : 'ADD';
  $('#taskDelete').hidden = !task;
  if (task) {
    taskForm.elements.namedItem('name').value = task.name;
    taskForm.querySelector(`[name="cat"][value="${task.cat}"]`).checked = true;
    taskForm.querySelector(`[name="type"][value="${task.type}"]`).checked = true;
    taskForm.querySelector(`[name="recurring"][value="${task.recurring ? 1 : 0}"]`).checked = true;
  }
  // effects already applied today would be undone with the wrong type, so lock these
  const locked = !!task && isDoneToday(state, task, Date.now());
  taskForm.querySelectorAll('[name="cat"], [name="type"]').forEach((i) => { i.disabled = locked; });
  $('#lockHint').hidden = !locked;
  updateTaskPreview();
  $('#taskDlg').showModal();
}

taskForm.addEventListener('submit', (e) => {
  const f = new FormData(e.target);
  const name = String(f.get('name')).trim();
  if (!name) return;
  const recurring = f.get('recurring') === '1';
  const task = editingId && state.tasks.find((x) => x.id === editingId);
  if (task) {
    Object.assign(task, { name, recurring, cat: f.get('cat') || task.cat, type: f.get('type') || task.type });
    toast('Task updated');
  } else {
    state.tasks.push({ id: uid(), name, cat: f.get('cat'), type: f.get('type'), recurring, created: Date.now() });
  }
  editingId = null;
  save(); renderAll();
});

$('#taskDelete').addEventListener('click', () => {
  const task = state.tasks.find((x) => x.id === editingId);
  if (!task || !confirm('Delete "' + task.name + '"?')) return;
  state.tasks = state.tasks.filter((x) => x.id !== editingId);
  editingId = null;
  $('#taskDlg').close();
  save(); renderAll();
});

// goal dialog: add + edit, quick deadlines, live preview
let editingGoalId = null;
const goalForm = $('#goalForm');
const gField = (n) => goalForm.elements.namedItem(n);
const goalMinDate = (g) => dayKey((g ? g.created : Date.now()) + 7 * DAY);

function updateGoalPreview() {
  const cat = goalForm.querySelector('[name="cat"]:checked').value;
  goalForm.style.setProperty('--form-c', CATS[cat].color);
  const target = parseFloat(gField('target').value);
  const current = editingGoalId ? parseFloat(gField('current').value) || 0 : 0;
  const unit = gField('unit').value.trim();
  const dl = gField('deadline').value;
  const days = dl ? Math.max(1, Math.ceil((new Date(dl + 'T23:59:59') - Date.now()) / DAY)) : 0;
  const remain = target - current;
  const pace = !(target > 0) || !days ? 'Set a target and deadline to see the pace.'
    : remain <= 0 ? 'Target already met.'
    : `About ${fmtNum(remain / days)}${unit ? ' ' + esc(unit) : ''} a day over ${days} days.`;
  $('#goalPreview').innerHTML = `<span class="label">ON COMPLETE</span>
    <span class="chip reward">${icon('star')}+${GOAL_RES} ${sysShort(cat)}</span>
    <span class="chip reward">${icon('steady')}+${GOAL_GEN}/h lasting</span>
    <span class="chip reward">${icon('flag')}Landmark</span>
    <span class="pv-desc">${pace}</span>`;
  goalForm.querySelectorAll('[data-days]').forEach((b) => {
    b.setAttribute('aria-pressed', String(dl === quickDate(b.dataset.days)));
  });
}
const quickDate = (days) => {
  const d = dayKey(Date.now() + Number(days) * DAY), min = gField('deadline').min;
  return d < min ? min : d;
};
goalForm.addEventListener('input', updateGoalPreview);
goalForm.addEventListener('change', updateGoalPreview);
goalForm.addEventListener('click', (e) => {
  const b = e.target.closest('[data-days]');
  if (!b) return;
  gField('deadline').value = quickDate(b.dataset.days);
  updateGoalPreview();
});

function openGoalDlg(g) {
  goalForm.reset();
  editingGoalId = g ? g.id : null;
  $('#goalDlgTitle').textContent = g ? 'EDIT GOAL' : 'NEW GOAL';
  $('#goalSubmit').textContent = g ? 'SAVE' : 'SET GOAL';
  $('#goalAbandon').hidden = !g;
  $('#goalProgressRow').hidden = !g;
  gField('deadline').min = goalMinDate(g);
  if (g) {
    gField('name').value = g.name;
    gField('target').value = g.target;
    gField('unit').value = g.unit;
    gField('current').value = fmtNum(g.current);
    gField('deadline').value = g.deadline;
    goalForm.querySelector(`[name="cat"][value="${g.cat}"]`).checked = true;
  } else {
    gField('deadline').value = dayKey(Date.now() + 14 * DAY);
  }
  updateGoalPreview();
  $('#goalDlg').showModal();
}

goalForm.addEventListener('submit', (e) => {
  const f = new FormData(e.target);
  const g = editingGoalId && state.goals.find((x) => x.id === editingGoalId);
  const data = {
    name: String(f.get('name')).trim(), target: parseFloat(f.get('target')), unit: String(f.get('unit')).trim(),
    cat: f.get('cat'), deadline: String(f.get('deadline')),
  };
  if (data.deadline < goalMinDate(g)) { e.preventDefault(); return; } // the date input's min already blocks this
  if (g) {
    Object.assign(g, data);
    g.current = Math.max(0, parseFloat(f.get('current')) || 0);
    goalProgress(state, g, 0, Date.now(), pending); // completes it if the target is now met
    if (!g.done) toast('Goal updated');
  } else {
    if (activeGoals().length >= MAX_GOALS) { e.preventDefault(); return; }
    state.goals.push({ id: uid(), ...data, current: 0, created: Date.now() });
  }
  editingGoalId = null;
  save(); announce(pending); renderAll();
  setView('goals');
});

$('#goalAbandon').addEventListener('click', () => {
  const g = state.goals.find((x) => x.id === editingGoalId);
  if (!g || !confirm('Abandon "' + g.name + '"? Progress is lost.')) return;
  state.goals = state.goals.filter((x) => x.id !== editingGoalId);
  editingGoalId = null;
  $('#goalDlg').close();
  save(); renderAll();
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
  syncFab();
}

// The phone add button follows the open tab, and hides when goal slots are full.
function syncFab() {
  const fab = $('.fab');
  const goals = document.body.dataset.view === 'goals';
  fab.dataset.open = goals ? 'goalDlg' : 'taskDlg';
  fab.setAttribute('aria-label', goals ? 'New goal' : 'New task');
  fab.hidden = goals && activeGoals().length >= MAX_GOALS;
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
  const dt = Math.min(100, t - lastFrame); lastFrame = t; // clamp so returning to the tab doesn't jump
  if (!autoSpin && !dragging && !selected && t > spinResume) autoSpin = true;
  // one turn every ~70s; with reduced motion, a gentle drift (~6 min a turn) instead of stopping
  if (autoSpin) globe.rot += dt * (reducedMotion.matches ? 0.000017 : 0.00009);
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
