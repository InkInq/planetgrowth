import {
  CATS, SYSTEMS, TYPES, MILESTONES, BLIGHTS, DAY, HOUR,
  newState, advance, rates, completeTask, uncompleteTask, isDoneToday, goalProgress,
  nextMilestone, milestoneProgress, forecast, visuals, eraOf, stats, uid, dayKey, fmtDuration,
  focusAmount, goalFocus, reopenGoal, GOALS_PER_MONTH, GOAL_REWARD, goalReward, goalStarted, monthKey, monthAfter, monthLastDay, monthStart, goalMonth, goalsInMonth, openGoals, expireGoals,
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
state.cal ||= []; // saves from before the calendar existed
state.focusLog ||= []; // ...or before focus sessions
state.focus ||= null;
expireGoals(state, Date.now()); // gives older goals a month, and closes out months that have ended
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

// ---------- themes ----------
// Palettes live in styles.css as [data-palette] blocks; this list names them for the settings screen.
const THEME_KEY = 'planetgrowth-theme';
const THEMES = [
  { id: 'nebula', name: 'Nebula', desc: 'Violet space, cyan glow' },
  { id: 'pocket', name: 'Pocket', desc: 'Handheld console greens' },
  { id: 'amber', name: 'Amber Terminal', desc: 'Warm CRT phosphor' },
  { id: 'deepsea', name: 'Deep Sea', desc: 'Navy and glowing teal' },
  { id: 'reddust', name: 'Red Dust', desc: 'Martian rust and coral' },
  { id: 'synth', name: 'Synthwave', desc: 'Neon pink, electric blue' },
  { id: 'contrast', name: 'High Contrast', desc: 'Pure black, bold colors' },
  { id: 'parchment', name: 'Parchment', desc: 'Light, like an old star chart' },
];
const currentTheme = () => {
  const id = document.documentElement.dataset.palette;
  return THEMES.some((t) => t.id === id) ? id : 'nebula';
};

function applyTheme(id, persist) {
  document.documentElement.dataset.palette = id;
  if (persist) { try { localStorage.setItem(THEME_KEY, id); } catch (e) { /* storage unavailable */ } }
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  document.querySelector('meta[name="theme-color"]').content = v('--bg');
  globe.setTheme(v('--rim'), v('--halo'));
  drawStars();
}
applyTheme(currentTheme(), false);

// Each preview tile carries data-palette, so it draws itself in that theme's colors.
function renderThemes() {
  const cur = currentTheme();
  $('#themeGrid').innerHTML = THEMES.map((t) => `
    <button type="button" class="theme-tile" aria-pressed="${t.id === cur}" data-pick="${t.id}" data-palette="${t.id}">
      <span class="tt-preview" aria-hidden="true">
        <span class="tt-top"><span class="tt-dot"></span><span class="tt-bar"><span></span></span></span>
        <span class="tt-card" style="--c:var(--heat)"><span class="tt-box"></span><span class="tt-lines"><span></span><span class="short"></span></span></span>
        <span class="tt-card" style="--c:var(--atmos)"><span class="tt-box on"></span><span class="tt-lines"><span></span><span class="short"></span></span></span>
        <span class="tt-swatches">${['accent', 'heat', 'atmos', 'life', 'water', 'danger'].map((c) => `<span style="background:var(--${c})"></span>`).join('')}</span>
      </span>
      <span class="tt-name">${t.name.toUpperCase()}${t.id === cur ? icon('check') : ''}</span>
      <span class="tt-desc">${t.desc}</span>
    </button>`).join('');
}
$('#themeGrid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pick]');
  if (!b) return;
  applyTheme(b.dataset.pick, true);
  renderThemes();
  $(`#themeGrid [data-pick="${b.dataset.pick}"]`).focus();
});

// ---------- event nodes ----------
const KIND = {
  milestone: { color: 'var(--gold)', label: 'MILESTONE' },
  goal: { color: 'var(--good)', label: 'GOAL' },
  blight: { color: 'var(--danger)', label: 'BLIGHT' },
  cleared: { color: 'var(--accent)', label: 'RESTORED' },
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
  togglePanel('left', true);
  catFilter = 'ALL';
  renderTasks();
  setView('tasks');
  const li = [...document.querySelectorAll('.task')].find((x) => x.dataset.name === name);
  if (li) {
    li.scrollIntoView({ block: 'nearest' });
    li.animate([{ background: 'color-mix(in srgb, var(--accent) 25%, transparent)' }, { background: 'transparent' }], { duration: 1200, easing: 'steps(6)' });
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

// Badge on a task that feeds a goal: "Run 50 km +5 km"
function goalBadge(t) {
  const g = linkedGoal(t);
  if (!g) return '';
  const later = !goalStarted(g, Date.now());
  return `<span class="chip${later ? ' muted' : ''}" style="--chip:${CATS[g.cat].color}" title="${later ? 'Starts counting ' + monthName(g.month) + ' 1' : 'Each completion adds to this goal'}">${icon('flag')}${esc(g.name)} +${fmtNum(t.goalAmt || 1)} ${esc(g.unit)}</span>`;
}
const linkedGoal = (t) => { const g = t.goalId && state.goals.find((x) => x.id === t.goalId); return g && !g.done && !g.missed ? g : null; };

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
        ${goalBadge(t)}
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
// Monthly goals: each belongs to this month or next, due on that month's last day, max 3 per month.
const fmtNum = (v) => String(+(+v).toFixed(2));
const activeGoals = () => openGoals(state);
const goalDaysLeft = (g, now) => Math.ceil((new Date(g.deadline + 'T23:59:59') - now) / DAY);
const monthName = (mk, style = 'long') => new Date(monthStart(mk)).toLocaleDateString(undefined, { month: style });
const goalMonths = (now = Date.now()) => { const cur = monthKey(now); return [cur, monthAfter(cur)]; };
const monthRoom = (mk, exceptId) => GOALS_PER_MONTH - goalsInMonth(state, mk).filter((g) => g.id !== exceptId).length;
const canAddGoal = () => goalMonths().some((mk) => monthRoom(mk) > 0);

function goalCard(g, now) {
  const c = CATS[g.cat];
  const pct = Math.min(100, g.current / g.target * 100);
  const left = goalDaysLeft(g, now);
  const remain = Math.max(0, g.target - g.current);
  const started = monthStart(g.month) <= now;
  // a goal for next month counts its pace over the whole month
  const days = started ? left : Math.round((new Date(g.deadline + 'T23:59:59') - monthStart(g.month)) / DAY);
  const dueCls = left <= 3 ? 'streak' : 'muted';
  const r = goalReward(g);
  const today = (g.log || []).some((e) => dayKey(e.t) === dayKey(now));
  const feeders = state.tasks.filter((t) => t.goalId === g.id);
  const dueText = !started ? `${monthName(g.month)} · starts in ${Math.ceil((monthStart(g.month) - now) / DAY)}d`
    : left <= 0 ? `${monthName(g.month)} · due today` : `${monthName(g.month)} · ${left}d left`;
  const pace = days > 0 && remain > 0 ? `${fmtNum(remain / days)} ${esc(g.unit)}/day` : '';
  return `<li class="goal" style="--c:${c.color}">
    <button type="button" class="goal-body" data-editgoal="${g.id}">
      <span class="goal-top"><span class="name">${esc(g.name)}</span><span class="cat-ico" aria-hidden="true">${icon(c.sys)}</span></span>
      <span class="goal-nums"><span class="cur">${fmtNum(g.current)}</span><span class="of">/ ${fmtNum(g.target)} ${esc(g.unit)}</span><span class="pct">${Math.floor(pct)}%</span></span>
      <span class="meter"><span class="fill" style="width:${pct}%"></span></span>
      <span class="chips">
        <span class="chip ${dueCls}">${icon('clock')}${dueText}</span>
        ${pace ? `<span class="chip muted" title="Needed per day to finish on time">${icon('steady')}${pace}</span>` : ''}
      </span>
      <span class="goal-pot" title="Paid when you meet the goal. Grows +${GOAL_REWARD.dayRes} for each day you work on it; lost if the month ends first.">
        <span class="pot-head">${icon('star')}<span class="pot-v">+${r.res} ${sysShort(g.cat)} · +${r.gen}/h</span><span class="pot-k">REWARD · ${r.days} DAY${r.days === 1 ? '' : 'S'} WORKED</span></span>
        <span class="pot-today${today ? ' on' : ''}">${today ? icon('check') + `Worked today · reward grew +${GOAL_REWARD.dayRes}` : started ? `Work on it today to grow it +${GOAL_REWARD.dayRes}` : `Starts growing ${monthName(g.month)} 1`}</span>
      </span>
      ${feeders.length ? `<span class="fed-by">Fed by ${feeders.map((t) => `${esc(t.name)} <b>+${fmtNum(t.goalAmt || 1)}</b>`).join(', ')}</span>` : ''}
    </button>
    ${started ? '' : `<div class="goal-later">${icon('clock')}Logging opens ${monthName(g.month)} 1</div>`}
    <div class="goal-log"${started ? '' : ' hidden'}>
      <button type="button" class="step" data-step="-1" data-goal="${g.id}" aria-label="Less">${icon('minus')}</button>
      <input type="number" step="any" min="0" value="1" inputmode="decimal" data-amt="${g.id}" aria-label="Amount to log for ${esc(g.name)}">
      <button type="button" class="step" data-step="1" data-goal="${g.id}" aria-label="More">${icon('plus')}</button>
      <button type="button" class="btn-sm focus-go" data-focus="${g.id}" title="Start a focus session for this goal">${icon('clock')}FOCUS</button>
      <button type="button" class="btn-log" data-log="${g.id}">LOG</button>
    </div>
  </li>`;
}

function renderGoals() {
  const now = Date.now();
  const [cur, next] = goalMonths(now);
  const open = activeGoals();
  const past = state.goals.filter((g) => g.done || g.missed).sort((a, b) => (b.done || b.missed) - (a.done || a.missed));
  const curCount = goalsInMonth(state, cur).length;
  $('#goalCount').textContent = curCount + '/' + GOALS_PER_MONTH;
  $('#addGoalBtn').disabled = !canAddGoal();
  $('#addGoalBtn').textContent = canAddGoal() ? '+ SET GOAL' : 'THIS MONTH AND NEXT ARE FULL';
  const slotRow = (mk, label) => {
    const gs = goalsInMonth(state, mk);
    return `<div class="day-head"><span class="label">${monthName(mk).toUpperCase()} · ${label}</span><span class="day-count">${gs.length} / ${GOALS_PER_MONTH}</span></div>
      <div class="slots">${Array.from({ length: GOALS_PER_MONTH }, (_, i) => {
        const g = gs[i];
        return g ? `<span class="slot used${g.done ? ' done' : ''}" style="--c:${CATS[g.cat].color}" title="${esc(g.name)}">${icon(g.done ? 'star' : 'flag')}</span>` : '<span class="slot"></span>';
      }).join('')}</div>`;
  };
  const left = Math.ceil((new Date(monthLastDay(cur) + 'T23:59:59') - now) / DAY);
  $('#goalSummary').innerHTML = slotRow(cur, left <= 1 ? 'LAST DAY' : left + ' DAYS LEFT')
    + (goalsInMonth(state, next).length || curCount >= GOALS_PER_MONTH ? slotRow(next, 'PLAN AHEAD') : '');
  const ofMonth = (mk) => open.filter((g) => g.month === mk).map((g) => goalCard(g, now)).join('');
  let html = ofMonth(cur);
  if (!open.length) html += `<li class="empty">Set up to ${GOALS_PER_MONTH} goals a month. Each holds a reward that grows every day you work on it, paid when you meet the goal.</li>`;
  if (open.some((g) => g.month === next)) html += `<li class="list-label label">${monthName(next).toUpperCase()}</li>` + ofMonth(next);
  if (past.length) {
    html += `<li class="list-label label">PAST GOALS · ${past.filter((g) => g.done).length} MET · ${past.filter((g) => g.missed).length} MISSED</li>` + past.map((g) => `
      <li class="achieved${g.missed ? ' missed' : ''}" style="--c:${CATS[g.cat].color}">${icon(g.done ? 'star' : 'close')}<span class="name">${esc(g.name)}</span>
        <span class="meta">${g.done ? `paid +${(g.paid || goalReward(g)).res} · ${fmtDate(g.done)}` : `lost +${goalReward(g).res} · ${fmtNum(g.current)}/${fmtNum(g.target)} · ${monthName(g.month, 'short')}`}</span></li>`).join('');
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
  const now = Date.now();
  const era = eraOf(state);
  const m = nextMilestone(state);
  const p = m ? milestoneProgress(state, m) : 1;
  $('#era').textContent = `ERA ${era.n} · ${era.name.toUpperCase()}`;
  $('#eraFill').style.width = (p * 100) + '%';
  $('#eraNext').textContent = m ? `${m.title} ${Math.floor(p * 100)}%` : 'All milestones';
  $('#eraLine').title = m ? `Next milestone: ${m.title}, ${Math.floor(p * 100)}%` : 'All milestones reached';
  $('#worldNameText').textContent = state.name;
  const cycle = Math.floor((now - state.created) / DAY) + 1;
  $('#cycle').textContent = 'CYCLE ' + String(cycle).padStart(3, '0');
  const streak = stats(state, now).streak;
  $('#streak').textContent = streak;
  $('#streakPill').classList.toggle('hot', streak > 0);
  $('#streakPill').setAttribute('aria-label', `Streak: ${streak} day${streak === 1 ? '' : 's'}`);
  $('#forecast').textContent = forecast(state, now).text;
}

// ---------- stats ----------
const EVENT_ICON = { milestone: 'star', goal: 'flag', blight: 'warn', cleared: 'check' };

// Local calendar days ending today, oldest first. Steps by date so DST can't skip a day.
function lastDays(n, now) {
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - (n - 1));
  const out = [];
  for (let i = 0; i < n; i++) { out.push({ key: dayKey(d), date: new Date(d) }); d.setDate(d.getDate() + 1); }
  return out;
}

function bestStreak(perDay, now) {
  const days = Math.min(3650, Math.ceil((now - state.created) / DAY) + 1);
  let best = 0, run = 0;
  for (const { key } of lastDays(days, now)) {
    run = perDay.has(key) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

function heatmap(perDay, now) {
  // up to 18 weeks, fewer for a young world so it isn't mostly empty
  const WEEKS = Math.max(8, Math.min(18, Math.ceil((now - state.created) / DAY / 7) + 1));
  const today = new Date(now);
  const wd = (today.getDay() + 6) % 7; // Monday = 0
  const days = lastDays((WEEKS - 1) * 7 + wd + 1, now);
  const created = dayKey(state.created);
  let total = 0;
  const cells = days.map(({ key, date }) => {
    const n = perDay.get(key) || 0;
    total += n;
    const lvl = n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 5 ? 3 : 4;
    const pre = key < created;
    const label = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ': ' + n + ' done';
    return `<span class="hm l${lvl}${pre ? ' pre' : ''}${key === dayKey(now) ? ' today' : ''}" title="${label}"></span>`;
  });
  for (let i = wd + 1; i < 7; i++) cells.push('<span class="hm future"></span>');
  return `<div class="heatmap" style="--weeks:${WEEKS}">${cells.join('')}</div>
    <div class="hm-foot"><span>${total} done in ${WEEKS} weeks</span>
      <span class="hm-legend">LESS${[0, 1, 2, 3, 4].map((l) => `<span class="hm l${l}"></span>`).join('')}MORE</span></div>`;
}

function focusStats(now) {
  const since = startOfDay(now - 6 * DAY).getTime();
  const rounds = (state.focusLog || []).filter((f) => f.t >= since);
  if (!rounds.length) return '';
  const total = rounds.reduce((n, f) => n + f.mins, 0);
  const byGoal = new Map();
  for (const f of rounds) byGoal.set(f.goalId || '', (byGoal.get(f.goalId || '') || 0) + f.mins);
  const rows = [...byGoal].sort((a, b) => b[1] - a[1]).map(([id, mins]) => {
    const g = state.goals.find((x) => x.id === id);
    return `<div class="rel-row" style="--c:${g ? CATS[g.cat].color : 'var(--muted)'}"><span class="rel-name"><span class="rel-ico">${icon(g ? 'flag' : 'clock')}</span>${g ? esc(g.name) : 'No goal'}</span>
      <span class="focus-bar"><span style="width:${mins / total * 100}%"></span></span><span class="rel-pct">${fmtMins(mins)}</span></div>`;
  }).join('');
  return `<section class="stat-section"><div class="label">FOCUS · LAST 7 DAYS · ${fmtMins(total)} IN ${rounds.length} ROUND${rounds.length === 1 ? '' : 'S'}</div>${rows}</section>`;
}

function renderStats() {
  const now = Date.now();
  const s = stats(state, now);
  const idx = historyIndex();
  const perDay = new Map();
  for (const h of state.history) { const k = dayKey(h.t); perDay.set(k, (perDay.get(k) || 0) + 1); }
  const best = Math.max(bestStreak(perDay, now), s.streak);
  const goalsDone = state.goals.filter((g) => g.done).length;
  const msDone = MILESTONES.filter((m) => state.milestones[m.id]).length;
  const pct = (v) => v == null ? '—' : Math.round(v * 100) + '%';
  const recurring = state.tasks.filter((t) => t.recurring);
  const week = lastDays(7, now), fortnight = lastDays(14, now);
  const today = dayKey(now);

  $('#statsWorld').textContent = state.name;

  const tiles = [
    { ico: 'streak', c: 'var(--gold)', v: s.streak, k: 'DAY STREAK', sub: `Best ${best}` },
    { ico: 'check', c: 'var(--accent)', v: state.history.length, k: 'TASKS DONE', sub: `${perDay.get(today) || 0} today` },
    { ico: 'flag', c: 'var(--good)', v: goalsDone, k: 'GOALS MET', sub: `${goalsInMonth(state, monthKey(now)).length}/${GOALS_PER_MONTH} this month` },
    { ico: 'star', c: 'var(--gold)', v: `${msDone}/${MILESTONES.length}`, k: 'MILESTONES', sub: `Era ${eraOf(state).n}` },
  ];

  // per category: overall 7-day %, plus one bar per day
  const catCards = Object.entries(CATS).map(([cat, c]) => {
    const ts = recurring.filter((t) => t.cat === cat);
    const bars = week.map(({ key, date }) => {
      const live = ts.filter((t) => dayKey(t.created) <= key);
      const r = live.length ? live.filter((t) => idx.has(t.id + '|' + key)).length / live.length : null;
      const wdName = date.toLocaleDateString(undefined, { weekday: 'short' });
      return `<span class="cb${r == null ? ' none' : ''}" title="${wdName}: ${r == null ? 'no tasks' : Math.round(r * 100) + '%'}"><span style="height:${(r || 0) * 100}%"></span></span>`;
    }).join('');
    return `<div class="cat-stat" style="--c:${c.color}">
      <div class="cs-head"><span class="cs-ico">${icon(c.sys)}</span><span class="k">${c.short}</span><span class="v">${pct(s.byCat[cat])}</span></div>
      <div class="cbars">${bars}</div>
      <div class="cs-days">${week.map(({ date }) => `<span>${date.toLocaleDateString(undefined, { weekday: 'narrow' })}</span>`).join('')}</div>
    </div>`;
  }).join('');

  // per task: which of the last 14 days were done
  const rows = recurring.map((t) => {
    const created = dayKey(t.created);
    let done = 0, lived = 0;
    const cells = fortnight.map(({ key }) => {
      if (key < created) return '<span class="d pre"></span>';
      lived++;
      if (idx.has(t.id + '|' + key)) { done++; return '<span class="d on"></span>'; }
      return `<span class="d${key === today ? ' open' : ''}"></span>`;
    }).join('');
    return { t, rel: lived ? done / lived : 0, html: cells };
  }).sort((a, b) => b.rel - a.rel).map(({ t, rel, html }) => `
    <div class="rel-row" style="--c:${CATS[t.cat].color}">
      <span class="rel-name"><span class="rel-ico">${icon(CATS[t.cat].sys)}</span>${esc(t.name)}</span>
      <span class="strip">${html}</span>
      <span class="rel-pct">${Math.round(rel * 100)}%</span>
    </div>`).join('');

  const evs = [...state.events].reverse().slice(0, 40);
  $('#statsBody').innerHTML = `
    <div class="stat-tiles">${tiles.map((x) => `
      <div class="stat-tile" style="--c:${x.c}"><span class="st-ico">${icon(x.ico)}</span>
        <span class="v">${x.v}</span><span class="k">${x.k}</span><span class="sub">${x.sub}</span></div>`).join('')}</div>
    <section class="stat-section">
      <div class="label">ACTIVITY</div>
      ${heatmap(perDay, now)}
    </section>
    ${focusStats(now)}
    <section class="stat-section">
      <div class="label">DAILY TASKS · LAST 7 DAYS</div>
      <div class="cat-stats">${catCards}</div>
    </section>
    <section class="stat-section">
      <div class="label">TASK RELIABILITY · LAST 14 DAYS</div>
      ${rows || '<div class="empty">No daily tasks yet.</div>'}
    </section>
    <section class="stat-section">
      <div class="label">WORLD HISTORY</div>
      <ol class="timeline">${evs.map((e) => `
        <li style="--c:${KIND[e.kind].color}"><span class="tl-ico">${icon(EVENT_ICON[e.kind])}</span>
          <span class="tl-body"><span class="tl-t">${esc(e.title)}</span>${e.body ? `<span class="tl-d">${esc(e.body)}</span>` : ''}</span>
          <span class="tl-date">${fmtDate(e.t)}</span></li>`).join('')}</ol>
    </section>`;
}

function renderAll() {
  renderHeader();
  renderTasks();
  renderGoals();
  renderSystems();
  renderCalendar();
  renderHistory();
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
    const h = state.history[state.history.length - 1];
    const g = h.goal && state.goals.find((x) => x.id === h.goal);
    toast('✓ ' + t.name + ' · ' + (g ? `+${fmtNum(h.goalAmt)} ${g.unit} to ${g.name}` : rewardText(t.cat, t.type)), {
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
  const focus = e.target.closest('[data-focus]');
  if (focus) { openFocus(focus.dataset.focus); return; }
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
  const before = goalReward(g).res;
  const met = goalProgress(state, g, amt, Date.now(), pending);
  const undo = () => {
    if (met && g.done) reopenGoal(state, g);
    goalProgress(state, g, -amt, Date.now(), []);
    save(); renderAll();
  };
  if (met) {
    // our own toast (with undo) stands in for the usual "goal complete" one
    const i = pending.findIndex((e) => e.kind === 'goal');
    if (i >= 0) pending.splice(i, 1);
    toast(`★ ${g.name} complete · +${g.paid.res} ${sysShort(g.cat)}`, { label: 'UNDO', run: undo });
  } else {
    const after = goalReward(g).res;
    toast(`Logged ${fmtNum(amt)} ${g.unit}` + (after > before ? ` · reward grew to +${after}` : ` · ${g.name}`), { label: 'UNDO', run: undo });
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
    if (d.id === 'calDlg') { openEventDlg(null); return; }
    if (d.id === 'statsDlg') renderStats();
    if (d.id === 'settingsDlg') { renderThemes(); saveBox.hidden = true; }
    d.showModal();
  }
  if (e.target.closest('[data-close]')) e.target.closest('dialog').close();
});
document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

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
  const g = state.goals.find((x) => x.id === $('#taskGoal').value);
  $('#taskPreview').innerHTML = `<span class="label">ON COMPLETE</span>
    <span class="chip reward">${icon(type)}${rewardText(cat, type)}</span>
    ${g ? `<span class="chip" style="--chip:${CATS[g.cat].color}">${icon('flag')}+${fmtNum(parseFloat($('#taskGoalAmt').value) || 1)} ${esc(g.unit)} to ${esc(g.name)}</span>` : ''}
    <span class="pv-desc">${esc(TYPES[type].desc)}. ${daily ? 'Repeats every day.' : 'Done once, then archived.'}</span>`;
}
$('#taskGoalAmt').addEventListener('input', updateTaskPreview);
taskForm.addEventListener('change', updateTaskPreview);

// "Counts toward a goal": any open goal, this month's or next month's
function fillGoalLink(task) {
  const goals = state.goals.filter((g) => !g.done && !g.missed);
  const cur = task && linkedGoal(task);
  $('#taskGoal').innerHTML = '<option value="">No goal</option>' + goals.map((g) =>
    `<option value="${g.id}"${cur === g ? ' selected' : ''}>${esc(g.name)} · ${monthName(g.month, 'short')}</option>`).join('');
  $('#taskGoal').disabled = !goals.length;
  $('#taskGoalAmt').value = task?.goalAmt ? fmtNum(task.goalAmt) : 1;
  syncGoalLink();
}
function syncGoalLink() {
  const g = state.goals.find((x) => x.id === $('#taskGoal').value);
  $('#taskGoalAmtRow').hidden = !g;
  $('#taskGoalUnit').textContent = g ? g.unit : '';
  const hint = !state.goals.some((x) => !x.done && !x.missed) ? 'No goals yet. Set one in the Goals tab, then link tasks to it here.'
    : g && !goalStarted(g, Date.now()) ? `Starts counting on ${monthName(g.month)} 1.` : '';
  $('#taskGoalHint').textContent = hint;
  $('#taskGoalHint').hidden = !hint;
}
$('#taskGoal').addEventListener('change', syncGoalLink);

function openTaskDlg(task) {
  taskForm.reset();
  fillGoalLink(task);
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
  const goalId = String(f.get('goalId') || '') || null;
  const link = { goalId, goalAmt: goalId ? Math.max(0.01, parseFloat(f.get('goalAmt')) || 1) : undefined };
  if (task) {
    Object.assign(task, { name, recurring, cat: f.get('cat') || task.cat, type: f.get('type') || task.type }, link);
    toast('Task updated');
  } else {
    state.tasks.push({ id: uid(), name, cat: f.get('cat'), type: f.get('type'), recurring, created: Date.now(), ...link });
  }
  editingId = null;
  save(); renderAll();
});

$('#taskDelete').addEventListener('click', async () => {
  const task = state.tasks.find((x) => x.id === editingId);
  if (!task) return;
  if (!(await ask({ title: 'DELETE TASK?', body: `"${task.name}" leaves your list. Past completions still count in Stats.`, ok: 'DELETE', danger: true }))) return;
  state.tasks = state.tasks.filter((x) => x.id !== editingId);
  editingId = null;
  $('#taskDlg').close();
  save(); renderAll();
});

// goal dialog: add + edit, month picker (this month or next), live preview
let editingGoalId = null;
const goalForm = $('#goalForm');
const gField = (n) => goalForm.elements.namedItem(n);
const pickedMonth = () => goalForm.querySelector('[name="month"]:checked')?.value;

function renderMonthPicker(g) {
  const now = Date.now();
  const want = g ? g.month : goalMonths(now).find((mk) => monthRoom(mk) > 0);
  $('#goalMonthPicker').querySelectorAll('.tile').forEach((t) => t.remove());
  $('#goalMonthPicker').insertAdjacentHTML('beforeend', goalMonths(now).map((mk, i) => {
    const room = monthRoom(mk, g?.id);
    const due = new Date(monthLastDay(mk) + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const left = Math.ceil((new Date(monthLastDay(mk) + 'T23:59:59') - now) / DAY);
    const when = i === 0 ? (left <= 1 ? 'Last day' : `${left} days left`) : `Starts ${new Date(monthStart(mk)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    return `<label class="tile"><input type="radio" name="month" value="${mk}"${mk === want ? ' checked' : ''}${room > 0 ? '' : ' disabled'}>
      <span class="t">${monthName(mk).toUpperCase()}</span><span class="s">${when} · due ${due}</span>
      <span class="s">${room > 0 ? `${GOALS_PER_MONTH - room}/${GOALS_PER_MONTH} set` : 'Full · 3/3 set'}</span></label>`;
  }).join(''));
}

function updateGoalPreview() {
  const cat = goalForm.querySelector('[name="cat"]:checked').value;
  goalForm.style.setProperty('--form-c', CATS[cat].color);
  const target = parseFloat(gField('target').value);
  const current = editingGoalId ? parseFloat(gField('current').value) || 0 : 0;
  const unit = gField('unit').value.trim();
  const mk = pickedMonth();
  const end = mk ? new Date(monthLastDay(mk) + 'T23:59:59').getTime() : 0;
  const days = mk ? Math.max(1, Math.ceil((end - Math.max(Date.now(), monthStart(mk))) / DAY)) : 0;
  const remain = target - current;
  const pace = !(target > 0) || !days ? 'Set a target to see the pace.'
    : remain <= 0 ? 'Target already met.'
    : `About ${fmtNum(remain / days)}${unit ? ' ' + esc(unit) : ''} a day over ${days} days of ${monthName(mk)}.`;
  const g = editingGoalId && state.goals.find((x) => x.id === editingGoalId);
  const r = g ? goalReward(g) : goalReward({});
  $('#goalPreview').innerHTML = `<span class="label">REWARD ${g ? 'SO FAR · ' + r.days + ' DAY' + (r.days === 1 ? '' : 'S') + ' WORKED' : 'TO START'}</span>
    <span class="chip reward">${icon('star')}+${r.res} ${sysShort(cat)}</span>
    <span class="chip reward">${icon('steady')}+${r.gen}/h lasting</span>
    <span class="chip reward">${icon('flag')}Landmark</span>
    <span class="pv-desc">Grows +${GOAL_REWARD.dayRes} and +${GOAL_REWARD.dayGen}/h for every day you work on it. Paid when you meet the goal; lost if the month ends first. ${pace}</span>`;
}
goalForm.addEventListener('input', updateGoalPreview);
goalForm.addEventListener('change', updateGoalPreview);

function openGoalDlg(g) {
  goalForm.reset();
  editingGoalId = g ? g.id : null;
  $('#goalDlgTitle').textContent = g ? 'EDIT GOAL' : 'NEW GOAL';
  $('#goalSubmit').textContent = g ? 'SAVE' : 'SET GOAL';
  $('#goalAbandon').hidden = !g;
  $('#goalProgressRow').hidden = !g;
  renderMonthPicker(g);
  if (g) {
    gField('name').value = g.name;
    gField('target').value = g.target;
    gField('unit').value = g.unit;
    gField('current').value = fmtNum(g.current);
    goalForm.querySelector(`[name="cat"][value="${g.cat}"]`).checked = true;
  }
  updateGoalPreview();
  $('#goalDlg').showModal();
}

goalForm.addEventListener('submit', (e) => {
  const f = new FormData(e.target);
  const g = editingGoalId && state.goals.find((x) => x.id === editingGoalId);
  const data = {
    name: String(f.get('name')).trim(), target: parseFloat(f.get('target')), unit: String(f.get('unit')).trim(),
    cat: f.get('cat'), month: String(f.get('month') || ''),
  };
  // the month must be this month or next, with a free slot (full months are disabled in the picker)
  if (!goalMonths().includes(data.month) || monthRoom(data.month, g?.id) <= 0) { e.preventDefault(); return; }
  data.deadline = monthLastDay(data.month);
  if (g) {
    Object.assign(g, data);
    g.current = Math.max(0, parseFloat(f.get('current')) || 0);
    goalProgress(state, g, 0, Date.now(), pending); // completes it if the target is now met
    if (!g.done) toast('Goal updated');
  } else {
    state.goals.push({ id: uid(), ...data, current: 0, created: Date.now() });
  }
  editingGoalId = null;
  save(); announce(pending); renderAll();
  setView('goals');
});

$('#goalAbandon').addEventListener('click', async () => {
  const g = state.goals.find((x) => x.id === editingGoalId);
  if (!g) return;
  if (!(await ask({ title: 'ABANDON GOAL?', body: `"${g.name}" and its progress (${fmtNum(g.current)} ${g.unit}) will be lost, along with its +${goalReward(g).res} reward. Its ${monthName(g.month)} slot frees up.`, ok: 'ABANDON', danger: true }))) return;
  state.goals = state.goals.filter((x) => x.id !== editingGoalId);
  for (const t of state.tasks) if (t.goalId === editingGoalId) delete t.goalId; // unlink its tasks
  editingGoalId = null;
  $('#goalDlg').close();
  save(); renderAll();
});

// ---------- calendar ----------
// Works like Google Calendar's phone app: day / 3-day / week time grids, a month grid and a list.
// Click or drag empty time to create; drag an event to move it, drag its bottom edge to resize.
const CAL_VIEW_KEY = 'planetgrowth-calview';
const CAL_STEP = { day: 1, '3day': 3, week: 7, list: 30 };
const HOUR_PX = 44;
const SNAP_MIN = 15;
const REPEAT_ORDER = ['none', 'daily', 'weekdays', 'weekly', 'monthly'];
let calView = (() => {
  try { const v = localStorage.getItem(CAL_VIEW_KEY); return ['day', '3day', 'week', 'month', 'list'].includes(v) ? v : '3day'; } catch (e) { return '3day'; }
})();
let calDate = startOfDay(Date.now());
let calScroll = null; // remembered scroll position; null = place it near the current time on next render
let calDrag = null;
let calEditing = null; // { ev, occ } while the event dialog edits an existing event
const occMap = new Map(); // occurrence id -> occurrence, for the current render

function startOfDay(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
const minutesOf = (t) => { const d = new Date(t); return d.getHours() * 60 + d.getMinutes(); };
const hhmm = (t) => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const fmtTime = (t) => new Date(t).toLocaleTimeString([], new Date(t).getMinutes() ? { hour: 'numeric', minute: '2-digit' } : { hour: 'numeric' });
const calColor = (cat) => (cat && CATS[cat] ? CATS[cat].color : 'var(--accent)');
const repeats = (ev) => !!ev.repeat && ev.repeat !== 'none';
const evTitle = (o) => esc(o.title || '(No title)');

function calRange() {
  const a = calDate;
  if (calView === 'day' || calView === '3day') return { start: a, days: CAL_STEP[calView] };
  if (calView === 'week') return { start: addDays(a, -a.getDay()), days: 7 };
  if (calView === 'month') {
    const first = new Date(a.getFullYear(), a.getMonth(), 1);
    const inMonth = new Date(a.getFullYear(), a.getMonth() + 1, 0).getDate();
    return { start: addDays(first, -first.getDay()), days: Math.ceil((first.getDay() + inMonth) / 7) * 7 };
  }
  return { start: a, days: 60 };
}

// Every event instance that overlaps [from, to), with repeating events expanded, plus goal deadlines.
function occurrences(from, to) {
  const out = [];
  for (const ev of state.cal) {
    const dur = ev.end - ev.start;
    const add = (s) => { if (s < to && s + dur > from) out.push({ id: ev.id + '@' + s, ev, start: s, end: s + dur, allDay: ev.allDay, title: ev.title, cat: ev.cat }); };
    if (!repeats(ev)) { add(ev.start); continue; }
    const s0 = new Date(ev.start);
    const until = ev.until ? addDays(new Date(ev.until + 'T00:00'), 1).getTime() : Infinity;
    const skip = new Set(ev.skip || []);
    for (let d = startOfDay(Math.max(ev.start, from - dur)); d.getTime() < to; d = addDays(d, 1)) {
      const s = new Date(d);
      s.setHours(s0.getHours(), s0.getMinutes(), 0, 0);
      const t = s.getTime();
      if (t < ev.start) continue;
      if (t >= until) break;
      const wd = d.getDay();
      const hit = ev.repeat === 'daily' || (ev.repeat === 'weekdays' && wd > 0 && wd < 6)
        || (ev.repeat === 'weekly' && wd === s0.getDay()) || (ev.repeat === 'monthly' && d.getDate() === s0.getDate());
      if (hit && !skip.has(dayKey(t))) add(t);
    }
  }
  for (const g of state.goals) {
    if (g.done || g.missed) continue;
    const s = new Date(g.deadline + 'T00:00').getTime();
    const e = addDays(new Date(s), 1).getTime();
    if (s < to && e > from) out.push({ id: 'goal@' + g.id, goal: g, start: s, end: e, allDay: true, title: g.name + ' · due', cat: g.cat });
  }
  for (const f of state.focusLog || []) {
    const s = f.t - f.mins * 60000;
    if (s >= to || f.t <= from || f.mins < 1) continue;
    const g = f.goalId && state.goals.find((x) => x.id === f.goalId);
    out.push({ id: 'focus@' + f.t, focus: f, start: s, end: f.t, allDay: false, title: 'Focus' + (g ? ' · ' + g.name : ''), cat: g ? g.cat : null });
  }
  out.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  occMap.clear();
  for (const o of out) occMap.set(o.id, o);
  return out;
}

// Side-by-side lanes for overlapping events in one day column.
function layoutLanes(segs) {
  segs.sort((x, y) => x.a - y.a || y.b - x.b);
  let cluster = [], clusterEnd = -Infinity;
  const laneEnds = [];
  const flush = () => { const n = Math.max(...cluster.map((c) => c.lane)) + 1; for (const c of cluster) c.lanes = n; cluster = []; laneEnds.length = 0; };
  for (const seg of segs) {
    if (cluster.length && seg.a >= clusterEnd) { flush(); clusterEnd = -Infinity; }
    let lane = laneEnds.findIndex((end) => end <= seg.a);
    if (lane < 0) { lane = laneEnds.length; laneEnds.push(seg.b); } else laneEnds[lane] = seg.b;
    seg.lane = lane;
    cluster.push(seg);
    clusterEnd = Math.max(clusterEnd, seg.b);
  }
  if (cluster.length) flush();
}

const chip = (o, cls = '') => `<button type="button" class="cal-chip ${cls}${o.goal ? ' goal' : ''}" data-occ="${o.id}" style="--c:${calColor(o.cat)}" title="${evTitle(o)}">${o.goal ? icon('flag') : ''}<span>${evTitle(o)}</span></button>`;

function evBlock(seg, dayEnd) {
  const o = seg.o;
  const top = minutesOf(seg.a) / 60 * HOUR_PX;
  const endMin = seg.b >= dayEnd ? 1440 : minutesOf(seg.b);
  const h = Math.max(18, (endMin - minutesOf(seg.a)) / 60 * HOUR_PX - 1);
  const w = 100 / seg.lanes;
  const tall = h >= 34;
  return `<button type="button" class="cal-ev${o.end < Date.now() ? ' past' : ''}${tall ? '' : ' short'}${o.focus ? ' focus' : ''}" data-occ="${o.id}"
    style="--c:${calColor(o.cat)};top:${top}px;height:${h}px;left:calc(${seg.lane * w}% + 1px);width:calc(${w}% - 3px)">
    <span class="ev-t">${evTitle(o)}</span>${tall ? `<span class="ev-time">${fmtTime(o.start)} – ${fmtTime(o.end)}</span>` : ''}
    ${o.ev && seg.b === o.end ? '<span class="ev-resize" aria-hidden="true"></span>' : ''}</button>`;
}

function renderTimeGrid(range, occ) {
  const days = Array.from({ length: range.days }, (_, i) => addDays(range.start, i));
  const today = dayKey(Date.now());
  const head = days.map((d) => `<button type="button" class="cg-day${dayKey(d) === today ? ' today' : ''}" data-goday="${dayKey(d)}" title="Open this day">
      <span class="wd">${d.toLocaleDateString(undefined, { weekday: range.days > 3 ? 'narrow' : 'short' }).toUpperCase()}</span><span class="dn">${d.getDate()}</span></button>`).join('');
  const allDayOcc = occ.filter((o) => o.allDay);
  const allDay = days.map((d) => {
    const s = d.getTime(), e = addDays(d, 1).getTime();
    return `<div class="ad-cell">${allDayOcc.filter((o) => o.start < e && o.end > s).map((o) => chip(o)).join('')}</div>`;
  }).join('');
  const hours = Array.from({ length: 23 }, (_, i) => `<span class="cg-h" style="top:${(i + 1) * HOUR_PX}px">${new Date(2000, 0, 1, i + 1).toLocaleTimeString([], { hour: 'numeric' })}</span>`).join('');
  const cols = days.map((d) => {
    const s = d.getTime(), e = addDays(d, 1).getTime();
    const segs = occ.filter((o) => !o.allDay && o.start < e && o.end > s).map((o) => ({ o, a: Math.max(o.start, s), b: Math.min(o.end, e) }));
    layoutLanes(segs);
    const isToday = dayKey(d) === today;
    return `<div class="cg-col${isToday ? ' today' : ''}" data-day="${s}">${segs.map((seg) => evBlock(seg, e)).join('')}${isToday ? `<span class="cal-now" style="top:${minutesOf(Date.now()) / 60 * HOUR_PX}px"></span>` : ''}</div>`;
  }).join('');
  return `<div class="cal-scroll" id="calScroll" style="--cols:${range.days}">
    <div class="cg-sticky">
      <div class="cg-head"><span></span>${head}</div>
      ${allDayOcc.length ? `<div class="cg-allday"><span class="cg-adl">ALL DAY</span>${allDay}</div>` : ''}
    </div>
    <div class="cg-body" style="height:${24 * HOUR_PX}px"><div class="cg-hours">${hours}</div>${cols}</div>
  </div>`;
}

function renderMonth(range, occ) {
  const month = calDate.getMonth(), today = dayKey(Date.now());
  const heads = Array.from({ length: 7 }, (_, i) => `<span>${addDays(range.start, i).toLocaleDateString(undefined, { weekday: 'narrow' })}</span>`).join('');
  const cells = Array.from({ length: range.days }, (_, i) => {
    const d = addDays(range.start, i), s = d.getTime(), e = addDays(d, 1).getTime(), k = dayKey(d);
    const items = occ.filter((o) => o.start < e && o.end > s);
    return `<div class="mc${d.getMonth() !== month ? ' other' : ''}${k === today ? ' today' : ''}" data-goday="${k}">
      <span class="mc-n">${d.getDate()}</span>
      ${items.slice(0, 3).map((o) => chip(o, o.allDay ? '' : 'timed')).join('')}
      ${items.length > 3 ? `<span class="mc-more">+${items.length - 3} more</span>` : ''}</div>`;
  }).join('');
  return `<div class="cal-month"><div class="mh">${heads}</div><div class="mg" style="--rows:${range.days / 7}">${cells}</div></div>`;
}

function renderList(range, occ) {
  const today = dayKey(Date.now());
  let html = '';
  for (let i = 0; i < range.days; i++) {
    const d = addDays(range.start, i), s = d.getTime(), e = addDays(d, 1).getTime(), k = dayKey(d);
    const items = occ.filter((o) => o.start < e && o.end > s);
    if (!items.length && k !== today) continue;
    html += `<div class="ld${k === today ? ' today' : ''}">
      <button type="button" class="ld-date" data-goday="${k}" title="Open this day"><span class="dn">${d.getDate()}</span><span class="wd">${d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}</span><span class="wd">${d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase()}</span></button>
      <div class="ld-items">${items.length ? items.map((o) => `<button type="button" class="li-ev" data-occ="${o.id}" style="--c:${calColor(o.cat)}">
        <span class="li-time">${o.allDay ? 'All day' : fmtTime(Math.max(o.start, s)) + ' – ' + fmtTime(Math.min(o.end, e))}${o.ev && repeats(o.ev) ? ' · repeats' : ''}</span>
        <span class="li-t">${o.goal ? icon('flag') : ''}${evTitle(o)}</span></button>`).join('') : '<span class="li-none">Nothing planned today</span>'}</div></div>`;
  }
  if (!html) html = '<div class="empty">Nothing planned in the next 60 days. Add an event with the + button.</div>';
  return `<div class="cal-scroll cal-list" id="calScroll">${html}</div>`;
}

function calTitleText(range) {
  const a = range.start, b = addDays(range.start, range.days - 1);
  const f = (d, o) => d.toLocaleDateString(undefined, o).toUpperCase();
  if (calView === 'month') return f(calDate, { month: 'short', year: 'numeric' });
  if (calView === 'day') return f(a, { weekday: 'short', month: 'short', day: 'numeric' });
  if (calView === 'list') return 'FROM ' + f(a, { month: 'short', day: 'numeric' });
  return a.getMonth() === b.getMonth() ? `${f(a, { month: 'short' })} ${a.getDate()}–${b.getDate()}` : `${f(a, { month: 'short', day: 'numeric' })} – ${f(b, { month: 'short', day: 'numeric' })}`;
}

function renderCalendar() {
  if (document.body.dataset.view !== 'calendar') return;
  const range = calRange();
  const from = range.start.getTime(), to = addDays(range.start, range.days).getTime();
  const occ = occurrences(from, to);
  $('#calTitle').textContent = calTitleText(range);
  document.querySelectorAll('[data-calview]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.calview === calView)));
  $('#calBody').innerHTML = calView === 'month' ? renderMonth(range, occ) : calView === 'list' ? renderList(range, occ) : renderTimeGrid(range, occ);
  const sc = $('#calScroll');
  if (!sc) return;
  if (calScroll != null) sc.scrollTop = calScroll;
  else if (calView !== 'list') {
    const now = Date.now();
    sc.scrollTop = Math.max(0, (now >= from && now < to ? minutesOf(now) / 60 - 1.5 : 7) * HOUR_PX);
  }
  sc.addEventListener('scroll', () => { calScroll = sc.scrollTop; }, { passive: true });
}

function updateNowLine() {
  const line = document.querySelector('.cal-now');
  if (line) line.style.top = (minutesOf(Date.now()) / 60 * HOUR_PX) + 'px';
}

function setCalView(v) {
  calView = v;
  calScroll = null;
  try { localStorage.setItem(CAL_VIEW_KEY, v); } catch (e) { /* storage unavailable */ }
  renderCalendar();
}
function calStep(dir) {
  calDate = calView === 'month' ? new Date(calDate.getFullYear(), calDate.getMonth() + dir, 1) : addDays(calDate, dir * CAL_STEP[calView]);
  renderCalendar();
}
function calGoTo(day, view) {
  calDate = startOfDay(day);
  if (view) calView = view;
  calScroll = null;
  renderCalendar();
}

$('#calToday').addEventListener('click', () => calGoTo(Date.now()));
$('#calPrev').addEventListener('click', () => calStep(-1));
$('#calNext').addEventListener('click', () => calStep(1));
document.querySelectorAll('[data-calview]').forEach((b) => b.addEventListener('click', () => setCalView(b.dataset.calview)));
$('#calTitle').addEventListener('click', () => {
  const j = $('#calJump');
  j.value = dayKey(calDate);
  try { j.showPicker(); } catch (e) { j.focus(); }
});
$('#calJump').addEventListener('change', (e) => { if (e.target.value) calGoTo(new Date(e.target.value + 'T00:00')); });

// --- pointer: click/drag to create, drag to move, drag the bottom edge to resize ---
const calBody = $('#calBody');
const colAt = (x) => [...calBody.querySelectorAll('.cg-col')].find((c) => { const r = c.getBoundingClientRect(); return x >= r.left && x < r.right; });
const minuteAt = (y, col) => Math.max(0, Math.min(1440, Math.round((y - col.getBoundingClientRect().top) / HOUR_PX * 60 / SNAP_MIN) * SNAP_MIN));
const atMinute = (col, min) => { const d = new Date(Number(col.dataset.day)); d.setMinutes(min); return d.getTime(); };

calBody.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const col = e.target.closest('.cg-col');
  if (!col) return;
  const block = e.target.closest('.cal-ev');
  const base = { x0: e.clientX, y0: e.clientY, moved: false, touch: e.pointerType === 'touch', id: e.pointerId };
  if (block) {
    const occ = occMap.get(block.dataset.occ);
    if (!occ || !occ.ev) return;
    calDrag = { ...base, kind: e.target.closest('.ev-resize') ? 'resize' : 'move', occ, block, col, grab: minuteAt(e.clientY, col) - minutesOf(Math.max(occ.start, Number(col.dataset.day))) };
  } else {
    calDrag = { ...base, kind: 'create', col, from: minuteAt(e.clientY, col) };
  }
  if (!calDrag.touch) { calBody.setPointerCapture(e.pointerId); e.preventDefault(); }
});

calBody.addEventListener('pointermove', (e) => {
  const d = calDrag;
  if (!d || e.pointerId !== d.id) return;
  if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > (d.touch ? 8 : 4)) d.moved = true;
  if (!d.moved || d.touch) return; // on touch, movement means scrolling
  if (d.kind === 'create') {
    const to = minuteAt(e.clientY, d.col);
    const a = Math.min(d.from, to), b = Math.max(d.from, to, Math.min(d.from, to) + SNAP_MIN);
    if (!d.ghost) { d.ghost = document.createElement('div'); d.ghost.className = 'cal-ghost'; d.col.appendChild(d.ghost); }
    d.ghost.style.top = a / 60 * HOUR_PX + 'px';
    d.ghost.style.height = (b - a) / 60 * HOUR_PX + 'px';
    d.ghost.textContent = fmtTime(atMinute(d.col, a)) + ' – ' + fmtTime(atMinute(d.col, b));
    d.range = [atMinute(d.col, a), atMinute(d.col, b)];
  } else if (d.kind === 'move') {
    const col = colAt(e.clientX) || d.col;
    const dur = d.occ.end - d.occ.start;
    const startMin = Math.max(0, Math.min(1440 - SNAP_MIN, minuteAt(e.clientY, col) - d.grab));
    if (d.block.parentElement !== col) col.appendChild(d.block);
    d.block.classList.add('dragging');
    Object.assign(d.block.style, { left: '1px', width: 'calc(100% - 3px)', top: startMin / 60 * HOUR_PX + 'px' });
    d.newStart = atMinute(col, startMin);
    d.newEnd = d.newStart + dur;
    const t = d.block.querySelector('.ev-time');
    if (t) t.textContent = fmtTime(d.newStart) + ' – ' + fmtTime(d.newEnd);
  } else {
    const startMin = minutesOf(Math.max(d.occ.start, Number(d.col.dataset.day)));
    const endMin = Math.max(startMin + SNAP_MIN, minuteAt(e.clientY, d.col));
    d.block.classList.add('dragging');
    d.block.style.height = (endMin - startMin) / 60 * HOUR_PX - 1 + 'px';
    d.newStart = d.occ.start;
    d.newEnd = atMinute(d.col, endMin);
    const t = d.block.querySelector('.ev-time');
    if (t) t.textContent = fmtTime(d.newStart) + ' – ' + fmtTime(d.newEnd);
  }
});

calBody.addEventListener('pointerup', (e) => {
  const d = calDrag;
  calDrag = null;
  if (!d || e.pointerId !== d.id) return;
  if (!d.moved) { // a tap
    if (d.kind === 'create') {
      const min = Math.floor(minuteAt(e.clientY, d.col) / 30) * 30;
      const start = atMinute(d.col, Math.min(min, 1410));
      openEventDlg(null, { start, end: start + HOUR });
    } else openEventDlg(d.occ);
    return;
  }
  if (d.touch) return;
  if (d.kind === 'create' && d.range) openEventDlg(null, { start: d.range[0], end: d.range[1] });
  else if (d.newStart != null && (d.newStart !== d.occ.start || d.newEnd !== d.occ.end)) changeTimes(d.occ, d.newStart, d.newEnd);
  if (d.ghost) d.ghost.remove();
  if (d.kind !== 'create') renderCalendar();
});
calBody.addEventListener('pointercancel', () => { if (calDrag?.ghost) calDrag.ghost.remove(); calDrag = null; renderCalendar(); });

calBody.addEventListener('click', (e) => {
  const item = e.target.closest('[data-occ]');
  // time-grid blocks open on pointerup; a click with detail 0 is the keyboard (Enter/Space)
  if (item && (!item.classList.contains('cal-ev') || e.detail === 0 || item.classList.contains('focus'))) { openEventDlg(occMap.get(item.dataset.occ)); return; }
  const day = !item && e.target.closest('[data-goday]');
  if (day) calGoTo(new Date(day.dataset.goday + 'T00:00'), 'day');
});

// --- changing events, with "this event / all events" for repeating ones, and undo ---
function snapshotCal() { const before = JSON.stringify(state.cal); return () => { state.cal = JSON.parse(before); save(); renderCalendar(); }; }

function detach(ev, occ, changes) {
  ev.skip = [...(ev.skip || []), dayKey(occ.start)];
  const copy = { ...ev, id: uid(), repeat: 'none', until: null, skip: [], start: occ.start, end: occ.end, ...changes };
  state.cal.push(copy);
  return copy;
}
function shiftSeries(ev, delta, dur) {
  const days = Math.round(delta / DAY);
  ev.start += delta;
  ev.end = ev.start + dur;
  if (days && ev.skip) ev.skip = ev.skip.map((k) => dayKey(addDays(new Date(k + 'T12:00'), days)));
}
const askScope = (verb, ev) => ask({
  title: verb + ' REPEATING EVENT', body: `"${ev.title || 'Untitled'}" repeats. Change just this one, or every event in the series?`,
  alt: 'THIS EVENT', ok: 'ALL EVENTS',
});

async function changeTimes(occ, start, end) {
  const ev = occ.ev;
  const undo = snapshotCal();
  if (repeats(ev)) {
    const r = await askScope('MOVE', ev);
    if (!r) return renderCalendar();
    if (r === 'alt') detach(ev, occ, { start, end });
    else shiftSeries(ev, start - occ.start, end - start);
  } else { ev.start = start; ev.end = end; }
  save(); renderCalendar();
  toast(`Moved to ${new Date(start).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}, ${fmtTime(start)}`, { label: 'UNDO', run: undo });
}

// --- event dialog ---
const calForm = $('#calForm');
$('#calCat').insertAdjacentHTML('beforeend', [['', 'Default'], ...Object.entries(CATS).map(([k, c]) => [k, c.short])].map(([k, label], i) => `
  <label class="tile tile-row" style="--c:${calColor(k)}"><input type="radio" name="calcat" value="${k}"${i ? '' : ' checked'}><span class="sw"></span><span class="t">${label.toUpperCase()}</span></label>`).join(''));
let calDur = HOUR;

function syncCalForm() {
  const allDay = $('#calAllDay').checked;
  calForm.classList.toggle('all-day', allDay);
  const sd = $('#calSD').value ? new Date($('#calSD').value + 'T00:00') : new Date();
  const cur = $('#calRepeat').value || 'none';
  const labels = {
    none: 'Does not repeat', daily: 'Every day', weekdays: 'Every weekday (Mon–Fri)',
    weekly: 'Weekly on ' + sd.toLocaleDateString(undefined, { weekday: 'long' }), monthly: 'Monthly on day ' + sd.getDate(),
  };
  $('#calRepeat').innerHTML = REPEAT_ORDER.map((k) => `<option value="${k}"${k === cur ? ' selected' : ''}>${labels[k]}</option>`).join('');
  $('#calUntilRow').hidden = $('#calRepeat').value === 'none';
  const cat = calForm.querySelector('[name="calcat"]:checked')?.value;
  calForm.style.setProperty('--form-c', calColor(cat));
}
function readTimes() {
  const sd = $('#calSD').value, ed = $('#calED').value || sd;
  if ($('#calAllDay').checked) {
    const start = new Date(sd + 'T00:00').getTime();
    return { start, end: Math.max(addDays(new Date(ed + 'T00:00'), 1).getTime(), addDays(new Date(start), 1).getTime()) };
  }
  const start = new Date(sd + 'T' + ($('#calST').value || '09:00')).getTime();
  const end = new Date(ed + 'T' + ($('#calET').value || '10:00')).getTime();
  return { start, end: end > start ? end : start + HOUR };
}
function writeTimes(start, end, allDay) {
  $('#calSD').value = dayKey(start);
  $('#calST').value = hhmm(start);
  $('#calED').value = dayKey(allDay ? end - 1 : end);
  $('#calET').value = hhmm(end);
}
// Changing the start keeps the duration, like Google Calendar.
['calSD', 'calST'].forEach((id) => $('#' + id).addEventListener('change', () => {
  const sd = $('#calSD').value;
  if (!sd) return;
  const allDay = $('#calAllDay').checked;
  const start = new Date(sd + 'T' + (allDay ? '00:00' : $('#calST').value || '09:00')).getTime();
  writeTimes(start, start + calDur, allDay);
  syncCalForm();
}));
['calED', 'calET'].forEach((id) => $('#' + id).addEventListener('change', () => { const t = readTimes(); calDur = t.end - t.start; }));
$('#calAllDay').addEventListener('change', () => {
  const t = readTimes();
  calDur = $('#calAllDay').checked ? Math.max(DAY, Math.round((t.end - t.start) / DAY) * DAY) : HOUR;
  syncCalForm();
});
calForm.addEventListener('change', (e) => { if (e.target.name === 'calcat' || e.target.id === 'calRepeat') syncCalForm(); });

function openEventDlg(occ, preset) {
  if (occ && occ.goal) { openGoalDlg(occ.goal); return; }
  if (occ && occ.focus) { // a finished focus round: show its goal, if it had one
    const g = state.goals.find((x) => x.id === occ.focus.goalId);
    if (g && !g.done && !g.missed) openGoalDlg(g);
    else toast(`Focus · ${occ.focus.mins} min · ${fmtTime(occ.start)} – ${fmtTime(occ.end)}`);
    return;
  }
  calForm.reset();
  calEditing = occ ? { ev: occ.ev, occ } : null;
  let src;
  if (occ) {
    src = { ...occ.ev, start: occ.start, end: occ.end };
  } else {
    let start = preset?.start;
    if (start == null) {
      const now = new Date();
      const base = dayKey(calDate) === dayKey(now) ? (now.setMinutes(60, 0, 0), now) : new Date(calDate.getFullYear(), calDate.getMonth(), calDate.getDate(), 9);
      start = base.getTime();
    }
    src = { title: '', allDay: !!preset?.allDay, start, end: preset?.end ?? start + HOUR, repeat: 'none', until: '', cat: '', notes: '' };
  }
  $('#calDlgTitle').textContent = occ ? 'EDIT EVENT' : 'NEW EVENT';
  $('#calDelete').hidden = !occ;
  $('#calTitleInput').value = src.title || '';
  $('#calAllDay').checked = !!src.allDay;
  writeTimes(src.start, src.end, src.allDay);
  calDur = src.end - src.start;
  $('#calRepeat').innerHTML = `<option value="${src.repeat || 'none'}" selected></option>`;
  $('#calUntil').value = src.until || '';
  calForm.querySelector(`[name="calcat"][value="${src.cat || ''}"]`).checked = true;
  $('#calNotes').value = src.notes || '';
  syncCalForm();
  $('#calDlg').showModal();
  if (!occ) $('#calTitleInput').focus();
}

calForm.addEventListener('submit', async (e) => {
  const t = readTimes();
  const repeat = $('#calRepeat').value;
  const data = {
    title: $('#calTitleInput').value.trim(), allDay: $('#calAllDay').checked, start: t.start, end: t.end, repeat,
    until: repeat !== 'none' ? $('#calUntil').value || null : null,
    cat: calForm.querySelector('[name="calcat"]:checked')?.value || null, notes: $('#calNotes').value.trim(),
  };
  if (!calEditing) {
    state.cal.push({ id: uid(), skip: [], ...data });
    toast('Event saved · ' + new Date(data.start).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }));
  } else {
    const { ev, occ } = calEditing;
    if (repeats(ev) && repeat === ev.repeat) {
      e.preventDefault(); // keep the dialog open until the scope is chosen
      const r = await askScope('SAVE', ev);
      if (!r) return;
      if (r === 'alt') detach(ev, occ, { ...data, repeat: 'none', until: null });
      else {
        Object.assign(ev, { title: data.title, allDay: data.allDay, cat: data.cat, notes: data.notes, until: data.until });
        shiftSeries(ev, data.start - occ.start, data.end - data.start);
      }
      $('#calDlg').close();
    } else if (repeats(ev) && repeat !== 'none') {
      // the repeat rule itself changed: that always applies to the whole series
      const delta = data.start - occ.start;
      Object.assign(ev, { ...data, start: ev.start, end: ev.end });
      shiftSeries(ev, delta, data.end - data.start);
    } else {
      Object.assign(ev, data);
    }
  }
  calEditing = null;
  save(); renderCalendar();
});

$('#calDelete').addEventListener('click', async () => {
  if (!calEditing) return;
  const { ev, occ } = calEditing;
  const undo = snapshotCal();
  if (repeats(ev)) {
    const r = await askScope('DELETE', ev);
    if (!r) return;
    if (r === 'alt') ev.skip = [...(ev.skip || []), dayKey(occ.start)];
    else state.cal = state.cal.filter((x) => x !== ev);
  } else {
    state.cal = state.cal.filter((x) => x !== ev);
  }
  calEditing = null;
  $('#calDlg').close();
  save(); renderCalendar();
  toast('Event deleted', { label: 'UNDO', run: undo });
});

// Google Calendar's shortcuts: T today, J/K or N/P next/previous, D X W M A views, C create.
document.addEventListener('keydown', (e) => {
  if (document.body.dataset.view !== 'calendar' || e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.querySelector('dialog[open]') || e.target.closest('input, textarea, select')) return;
  const k = e.key.toLowerCase();
  const views = { d: 'day', x: '3day', w: 'week', m: 'month', a: 'list' };
  if (views[k]) setCalView(views[k]);
  else if (k === 't') calGoTo(Date.now());
  else if (k === 'j' || k === 'n') calStep(1);
  else if (k === 'k' || k === 'p') calStep(-1);
  else if (k === 'c') openEventDlg(null);
  else return;
  e.preventDefault();
});

// ---------- focus (pomodoro) ----------
// A session is 1–4 focus rounds with 5-minute breaks between. It's stored in state with
// timestamps, so it keeps counting through reloads and while the tab is in the background.
// Each finished round is logged to its goal (see goalFocus in sim.js) and to state.focusLog.
const FOCUS_LENGTHS = [15, 25, 30, 45, 60];
const FOCUS_BREAK = 5;
const FOCUS_SOUND_KEY = 'planetgrowth-focus-sound';
const focusSel = { goalId: '', mins: 25, rounds: 1 };
let audioCtx = null;
const baseTitle = document.title;

const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const fmtMins = (m) => (m >= 60 ? Math.floor(m / 60) + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : '') : m + ' min');
const focusGoalsOpen = () => state.goals.filter((g) => !g.done && !g.missed && goalStarted(g, Date.now()));

function focusPlan(f) {
  const focusMs = f.mins * 60000, per = (f.mins + f.breakMins) * 60000;
  return { focusMs, per, total: f.rounds * focusMs + (f.rounds - 1) * f.breakMins * 60000 };
}
function focusPhase(f, now) {
  const p = focusPlan(f);
  const el = Math.max(0, Math.min((f.pausedAt ?? now) - f.startedAt - f.pausedTotal, p.total));
  const round = Math.min(f.rounds - 1, Math.floor(el / p.per));
  const into = el - round * p.per;
  const focusing = into < p.focusMs;
  return {
    ...p, el, round, focusing,
    left: focusing ? p.focusMs - into : p.per - into,
    phaseLen: focusing ? p.focusMs : p.per - p.focusMs,
    roundsDone: el >= p.focusMs ? Math.min(f.rounds, Math.floor((el - p.focusMs) / p.per) + 1) : 0,
    finished: el >= p.total,
  };
}
// What a round does for a goal, in words: "+30 min", "+0.5 hours", "+1 pomodoro", or a day worked
function focusEffect(g, mins) {
  if (!g) return 'Just focus. Nothing is logged to a goal.';
  const amt = focusAmount(g.unit, mins);
  return amt > 0 ? `+${fmtNum(amt)} ${esc(g.unit)} to ${esc(g.name)} per round` : `Counts as a day worked on ${esc(g.name)} (its unit, ${esc(g.unit)}, isn't time)`;
}

function chime(kind) {
  if (!$('#focusSound').checked) return;
  try {
    audioCtx ||= new AudioContext();
    const notes = kind === 'start' ? [523, 784] : [784, 659, 523];
    notes.forEach((hz, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain(), at = audioCtx.currentTime + i * 0.16;
      o.type = 'square'; o.frequency.value = hz;
      g.gain.setValueAtTime(0.05, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.15);
      o.connect(g).connect(audioCtx.destination); o.start(at); o.stop(at + 0.16);
    });
    navigator.vibrate?.(kind === 'start' ? 80 : [120, 60, 120]);
  } catch (e) { /* audio unavailable */ }
}

function logFocusRound(f, mins, t) {
  state.focusLog.push({ t, mins, goalId: f.goalId || null });
  const g = f.goalId && state.goals.find((x) => x.id === f.goalId);
  const before = g ? goalReward(g).res : 0;
  const amt = g ? goalFocus(state, g, mins, t, pending) : null;
  const grew = g && !g.done && goalReward(g).res > before ? ` · reward grew to +${goalReward(g).res}` : '';
  toast(`Focus round done · ${mins} min` + (g ? (amt > 0 ? ` · +${fmtNum(amt)} ${g.unit} to ${g.name}` : ` on ${g.name}`) : '') + grew);
}

// Called every frame-ish: logs rounds that have ended, plays chimes, ends the session.
function focusTick(now = Date.now()) {
  const f = state.focus;
  if (f) {
    const ph = focusPhase(f, now);
    let changed = false;
    while (f.logged < ph.roundsDone) {
      logFocusRound(f, f.mins, Math.min(now, f.startedAt + f.pausedTotal + f.logged * ph.per + ph.focusMs));
      f.logged++;
      changed = true;
      if (!ph.finished) chime('end');
    }
    const key = ph.round + (ph.focusing ? 'f' : 'b');
    if (f.phaseKey && f.phaseKey !== key && ph.focusing && !changed) chime('start');
    f.phaseKey = key;
    if (ph.finished) {
      state.focus = null;
      chime('end');
      toast(`Focus session complete · ${fmtMins(f.rounds * f.mins)}`);
      changed = true;
    }
    if (changed) { save(); announce(pending); renderAll(); }
  }
  renderFocus(now);
}

function renderFocus(now = Date.now()) {
  const f = state.focus;
  const pill = $('#focusPill');
  if (!f) {
    if ($('#focusPillText').textContent !== 'FOCUS') $('#focusPillText').textContent = 'FOCUS';
    if (pill.className !== 'pill focus-pill') pill.className = 'pill focus-pill';
    if (document.title !== baseTitle) document.title = baseTitle;
    if ($('#focusDlg').open && !$('#focusRun').hidden) showFocusSetup();
    return;
  }
  const ph = focusPhase(f, now);
  const paused = f.pausedAt != null;
  $('#focusPillText').textContent = (ph.focusing ? '' : 'BREAK ') + mmss(ph.left);
  pill.className = 'pill focus-pill running' + (ph.focusing ? '' : ' break') + (paused ? ' paused' : '');
  document.title = `${mmss(ph.left)} ${paused ? 'paused' : ph.focusing ? 'focus' : 'break'} · ${baseTitle}`;
  if (!$('#focusDlg').open || $('#focusRun').hidden) return;
  const g = f.goalId && state.goals.find((x) => x.id === f.goalId);
  $('#focusPhase').textContent = (paused ? 'PAUSED · ' : '') + (ph.focusing ? `FOCUS · ROUND ${ph.round + 1} OF ${f.rounds}` : `BREAK · ROUND ${ph.round + 2} NEXT`);
  $('#focusClock').textContent = mmss(ph.left);
  $('#focusRun').classList.toggle('break', !ph.focusing);
  $('#focusMeter .fill').style.width = (100 - ph.left / ph.phaseLen * 100) + '%';
  $('#focusDots').innerHTML = Array.from({ length: f.rounds }, (_, i) => `<span class="${i < f.logged ? 'done' : i === ph.round && ph.focusing ? 'now' : ''}"></span>`).join('');
  $('#focusGoalLine').innerHTML = g ? `<span style="--c:${CATS[g.cat].color}">${icon('flag')}</span>${focusEffect(g, f.mins)}` : 'No goal tagged';
  $('#focusPause').textContent = paused ? 'RESUME' : 'PAUSE';
  $('#focusSub').textContent = `${f.rounds} × ${f.mins} min`;
}

function showFocusSetup() {
  $('#focusSetup').hidden = false;
  $('#focusRun').hidden = true;
  $('#focusSub').textContent = '';
  const goals = focusGoalsOpen();
  if (focusSel.goalId && !goals.some((g) => g.id === focusSel.goalId)) focusSel.goalId = '';
  $('#focusGoals').querySelectorAll('.tile, .empty').forEach((el) => el.remove());
  $('#focusGoals').insertAdjacentHTML('beforeend', [{ id: '', name: 'No goal', cat: null }, ...goals].map((g) => `
    <label class="tile tile-row" style="--c:${g.cat ? CATS[g.cat].color : 'var(--muted)'}"><input type="radio" name="focusGoal" value="${g.id}"${g.id === focusSel.goalId ? ' checked' : ''}>
      <span class="ico">${icon(g.cat ? 'flag' : 'clock')}</span><span class="fg-text"><span class="t">${esc(g.name)}</span><span class="s" data-effect="${g.id}"></span></span></label>`).join('')
    + (goals.length ? '' : '<p class="hint empty">No goals running this month. Set one to log focus time toward it.</p>'));
  $('#focusLengths').innerHTML = FOCUS_LENGTHS.map((m) => `<button type="button" class="fchip" data-len="${m}" aria-pressed="${m === focusSel.mins}">${m} MIN</button>`).join('');
  $('#focusRounds').innerHTML = [1, 2, 3, 4].map((n) => `<button type="button" class="fchip" data-rounds="${n}" aria-pressed="${n === focusSel.rounds}">${n}×</button>`).join('');
  updateFocusPreview();
}
function updateFocusPreview() {
  const g = state.goals.find((x) => x.id === focusSel.goalId);
  $('#focusDlg').style.setProperty('--form-c', g ? CATS[g.cat].color : 'var(--accent)');
  $('#focusGoals').querySelectorAll('[data-effect]').forEach((el) => {
    const gg = state.goals.find((x) => x.id === el.dataset.effect);
    el.textContent = gg ? (focusAmount(gg.unit, focusSel.mins) > 0 ? `+${fmtNum(focusAmount(gg.unit, focusSel.mins))} ${gg.unit} per round` : 'Counts as a day worked') : 'Focus without logging';
  });
  const total = focusSel.rounds * focusSel.mins + (focusSel.rounds - 1) * FOCUS_BREAK;
  const ends = new Date(Date.now() + total * 60000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  $('#focusPreview').innerHTML = `<span class="label">${focusSel.rounds} × ${focusSel.mins} MIN · ${fmtMins(focusSel.rounds * focusSel.mins)} OF FOCUS · DONE AROUND ${ends.toUpperCase()}</span>
    <span class="pv-desc">${focusEffect(g, focusSel.mins)}.</span>`;
}

function openFocus(goalId) {
  if (goalId !== undefined && !state.focus) focusSel.goalId = goalId;
  if (state.focus) { $('#focusSetup').hidden = true; $('#focusRun').hidden = false; } else showFocusSetup();
  $('#focusDlg').showModal();
  renderFocus();
}

$('#focusPill').addEventListener('click', () => openFocus());
$('#focusDlg').addEventListener('click', (e) => {
  const len = e.target.closest('[data-len]'), rounds = e.target.closest('[data-rounds]');
  if (len) focusSel.mins = Number(len.dataset.len);
  if (rounds) focusSel.rounds = Number(rounds.dataset.rounds);
  if (len || rounds) {
    $('#focusDlg').querySelectorAll('[data-len]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.len) === focusSel.mins)));
    $('#focusDlg').querySelectorAll('[data-rounds]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.rounds) === focusSel.rounds)));
    updateFocusPreview();
  }
});
$('#focusGoals').addEventListener('change', (e) => { focusSel.goalId = e.target.value; updateFocusPreview(); });
try { $('#focusSound').checked = localStorage.getItem(FOCUS_SOUND_KEY) !== 'off'; } catch (e) { /* storage unavailable */ }
$('#focusSound').addEventListener('change', (e) => { try { localStorage.setItem(FOCUS_SOUND_KEY, e.target.checked ? 'on' : 'off'); } catch (err) { /* ignore */ } });

$('#focusStart').addEventListener('click', () => {
  try { audioCtx ||= new AudioContext(); audioCtx.resume?.(); } catch (e) { /* audio unavailable */ }
  state.focus = { goalId: focusSel.goalId || null, mins: focusSel.mins, breakMins: FOCUS_BREAK, rounds: focusSel.rounds, startedAt: Date.now(), pausedAt: null, pausedTotal: 0, logged: 0 };
  save();
  $('#focusSetup').hidden = true;
  $('#focusRun').hidden = false;
  chime('start');
  renderFocus();
});
$('#focusPause').addEventListener('click', () => {
  const f = state.focus;
  if (!f) return;
  if (f.pausedAt != null) { f.pausedTotal += Date.now() - f.pausedAt; f.pausedAt = null; } else f.pausedAt = Date.now();
  save(); renderFocus();
});
$('#focusStop').addEventListener('click', async () => {
  const f = state.focus;
  if (!f) return;
  const ph = focusPhase(f, Date.now());
  const partial = ph.focusing ? Math.floor((ph.focusMs - ph.left) / 60000) : 0;
  let r;
  if (partial >= 1) r = await ask({ title: 'END SESSION?', body: `You've focused ${partial} min of this round. Log those minutes, or let the round go?`, ok: `LOG ${partial} MIN`, alt: 'DON’T LOG' });
  else r = (await ask({ title: 'END SESSION?', body: f.logged ? `The ${f.logged} finished round${f.logged === 1 ? ' is' : 's are'} already logged.` : 'Nothing has been logged yet.', ok: 'END SESSION' })) ? 'alt' : false;
  if (!r || !state.focus) return;
  if (r === true) logFocusRound(f, partial, Date.now());
  else toast('Focus session ended');
  state.focus = null;
  $('#focusDlg').close();
  save(); announce(pending); renderAll(); renderFocus();
});

$('#worldName').addEventListener('click', async () => {
  const n = await ask({ title: 'NAME YOUR WORLD', ok: 'RENAME', input: state.name });
  if (n && n.trim()) { state.name = n.trim().slice(0, 28); save(); renderHeader(); }
});

// In-app replacement for confirm()/prompt(), which embedded viewers block.
// Resolves true/false ('alt' when the optional second choice is picked),
// or the typed text (null on cancel) when `input` is given.
function ask({ title, body = '', ok = 'OK', alt = null, danger = false, input = null }) {
  const d = $('#askDlg');
  $('#askTitle').textContent = title;
  $('#askBody').textContent = body;
  $('#askBody').hidden = !body;
  $('#askOk').textContent = ok;
  $('#askOk').classList.toggle('btn-danger', danger);
  $('#askAlt').hidden = !alt;
  $('#askAlt').textContent = alt || '';
  $('#askInputRow').hidden = input == null;
  if (input != null) $('#askInput').value = input;
  d.returnValue = '';
  d.showModal();
  if (input != null) $('#askInput').select();
  return new Promise((resolve) => {
    d.addEventListener('close', () => {
      const rv = d.returnValue;
      if (input != null) resolve(rv === 'ok' ? $('#askInput').value : null);
      else resolve(rv === 'ok' ? true : rv === 'alt' ? 'alt' : false); // 'alt' = the second choice
    }, { once: true });
  });
}

// save data: export as text (copy works everywhere) or a file; import from a file or pasted text
const saveBox = $('#saveBox'), saveText = $('#saveText'), saveMsg = $('#saveMsg');
function showSaveBox(mode) {
  saveBox.hidden = false;
  saveBox.dataset.mode = mode;
  saveMsg.textContent = '';
  if (mode === 'export') {
    saveText.readOnly = true;
    saveText.value = JSON.stringify(state);
    $('#saveBoxLabel').textContent = 'YOUR SAVE · COPY IT SOMEWHERE SAFE';
  } else {
    saveText.readOnly = false;
    saveText.value = '';
    saveText.placeholder = 'Paste a save here, or choose a file';
    $('#saveBoxLabel').textContent = 'IMPORT · REPLACES THIS WORLD';
    saveText.focus();
  }
}
$('#exportBtn').addEventListener('click', () => showSaveBox('export'));
$('#importBtn').addEventListener('click', () => showSaveBox('import'));
$('#copySave').addEventListener('click', () => {
  navigator.clipboard.writeText(saveText.value)
    .then(() => { saveMsg.textContent = 'Copied.'; })
    .catch(() => { saveText.select(); saveMsg.textContent = 'Selected. Press Ctrl+C (or ⌘C) to copy.'; });
});
$('#downloadSave').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'planetgrowth-' + dayKey(Date.now()) + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  saveMsg.textContent = 'If no file appeared, use Copy instead.';
});
async function importSave(text) {
  let data;
  try { data = JSON.parse(text); } catch (err) { data = null; }
  if (data && !data.cal) data.cal = [];
  if (data && !data.focusLog) data.focusLog = [];
  if (!data || data.v !== 1 || !data.res) { saveMsg.textContent = "That isn't a Planet Growth save. Check you copied all of it."; return; }
  if (!(await ask({ title: 'REPLACE THIS WORLD?', body: `Loads "${data.name}". Your current world is replaced.`, ok: 'LOAD SAVE', danger: true }))) return;
  expireGoals(data, Date.now());
  state = data; save(); renderAll(); renderStats();
  saveBox.hidden = true;
  toast('Save loaded');
}
$('#loadSave').addEventListener('click', () => importSave(saveText.value));
$('#importInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (file) importSave(await file.text());
});
$('#resetBtn').addEventListener('click', async () => {
  if (!(await ask({ title: 'RESET WORLD?', body: 'This erases every task, goal and milestone and seeds a new world. Export a save first if you might want it back.', ok: 'RESET', danger: true }))) return;
  state = newState(Date.now());
  for (const [, el] of nodeEls) el.remove();
  nodeEls.clear();
  save(); renderAll(); renderStats(); closeTip();
  $('#settingsDlg').close();
  toast('New world seeded');
});

// desktop tabs + mobile views
function setView(v) {
  document.body.dataset.view = v;
  document.querySelectorAll('.tabbar [data-view]').forEach((b) => b.toggleAttribute('aria-current', b.dataset.view === v));
  if (v === 'tasks' || v === 'goals' || v === 'calendar') {
    $('#paneTasks').hidden = v !== 'tasks';
    $('#paneGoals').hidden = v !== 'goals';
    $('#paneCalendar').hidden = v !== 'calendar';
    $('#tabDaily').setAttribute('aria-selected', v === 'tasks');
    $('#tabGoals').setAttribute('aria-selected', v === 'goals');
    $('#tabCal').setAttribute('aria-selected', v === 'calendar');
  }
  if (v === 'calendar') renderCalendar();
  syncFab();
}

// The phone add button follows the open tab, and hides when goal slots are full.
function syncFab() {
  const fab = $('.fab');
  const view = document.body.dataset.view;
  const goals = view === 'goals';
  fab.dataset.open = goals ? 'goalDlg' : view === 'calendar' ? 'calDlg' : 'taskDlg';
  fab.setAttribute('aria-label', goals ? 'New goal' : view === 'calendar' ? 'New event' : 'New task');
  fab.hidden = goals && !canAddGoal();
}
document.querySelectorAll('.tab[data-tab]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.tab)));
document.querySelectorAll('.tabbar [data-view]').forEach((b) => b.addEventListener('click', () => {
  // tapping the active tab collapses the sheet to show the whole globe
  setView(document.body.dataset.view === b.dataset.view ? 'none' : b.dataset.view);
}));

// ---------- panels: collapsible on desktop; right panel tabs (Systems / History) ----------
const PANELS_KEY = 'planetgrowth-panels';
const collapsed = (() => {
  try { return { left: false, right: false, ...JSON.parse(localStorage.getItem(PANELS_KEY) || '{}') }; } catch (e) { return { left: false, right: false }; }
})();
function applyPanels() {
  $('.layout').classList.toggle('left-collapsed', !!collapsed.left);
  $('.layout').classList.toggle('right-collapsed', !!collapsed.right);
  $('.rail-left').hidden = !collapsed.left;
  $('.rail-right').hidden = !collapsed.right;
  try { localStorage.setItem(PANELS_KEY, JSON.stringify(collapsed)); } catch (e) { /* storage unavailable */ }
}
function togglePanel(side, open) {
  collapsed[side] = open === undefined ? !collapsed[side] : !open;
  applyPanels();
  if (side === 'right' && !collapsed.right) renderHistory();
}
document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-collapse]');
  if (c) { togglePanel(c.dataset.collapse); return; }
  if (e.target.closest('[data-sheet-close]')) setView('none'); // phone: the grab bar closes the sheet
});
// [ and ] toggle the panels on desktop
document.addEventListener('keydown', (e) => {
  if ((e.key !== '[' && e.key !== ']') || e.metaKey || e.ctrlKey || e.altKey || !matchMedia('(min-width: 861px)').matches) return;
  if (document.querySelector('dialog[open]') || e.target.closest('input, textarea, select')) return;
  togglePanel(e.key === '[' ? 'left' : 'right');
  e.preventDefault();
});
applyPanels();
new ResizeObserver(() => sizeCanvas()).observe(canvas); // the globe grows into the space a collapsed panel frees

let rightTab = 'systems';
function setRightTab(tab) {
  rightTab = tab;
  $('#paneSystems').hidden = tab !== 'systems';
  $('#paneHistory').hidden = tab !== 'history';
  $('#tabSystems').setAttribute('aria-selected', String(tab === 'systems'));
  $('#tabHistory').setAttribute('aria-selected', String(tab === 'history'));
  if (tab === 'history') renderHistory();
}
document.querySelectorAll('[data-rtab]').forEach((b) => b.addEventListener('click', () => setRightTab(b.dataset.rtab)));

// History: everything that happened, newest first, grouped by day.
const HIST_FILTERS = { all: 'ALL', task: 'TASKS', goal: 'GOALS', planet: 'PLANET', focus: 'FOCUS' };
let histFilter = 'all';
let histDays = 14;

function historyItems() {
  const out = [];
  const taskById = new Map(state.tasks.map((t) => [t.id, t]));
  const goalById = new Map(state.goals.map((g) => [g.id, g]));
  for (const h of state.history) {
    const t = taskById.get(h.taskId), g = h.goal && goalById.get(h.goal);
    out.push({ t: h.t, kind: 'task', ico: 'check', c: CATS[h.cat].color, title: h.name,
      detail: (t ? rewardText(h.cat, t.type) : CATS[h.cat].label) + (g ? ` · +${fmtNum(h.goalAmt)} ${g.unit} to ${g.name}` : ''), task: h.name });
  }
  for (const e of state.events) {
    out.push({ t: e.t, kind: e.kind === 'goal' ? 'goal' : 'planet', ico: EVENT_ICON[e.kind] || 'star', c: KIND[e.kind].color, title: e.title, detail: e.body || '', event: e.id });
  }
  const focusKeys = new Set((state.focusLog || []).map((f) => f.goalId + '|' + f.t));
  for (const g of state.goals) {
    const c = CATS[g.cat].color;
    out.push({ t: g.created, kind: 'goal', ico: 'flag', c, title: 'Goal set', detail: `${g.name} · ${fmtNum(g.target)} ${g.unit} by the end of ${monthName(goalMonth(g))}`, goal: g.id });
    for (const l of g.log || []) {
      if (l.task || !(l.amt > 0) || focusKeys.has(g.id + '|' + l.t)) continue; // tasks and focus rounds are listed on their own
      out.push({ t: l.t, kind: 'goal', ico: 'plus', c, title: `Logged +${fmtNum(l.amt)} ${g.unit}`, detail: g.name, goal: g.id });
    }
    if (g.missed) out.push({ t: g.missed, kind: 'goal', ico: 'close', c: 'var(--danger)', title: 'Goal missed', detail: `${g.name} · ${fmtNum(g.current)}/${fmtNum(g.target)} ${g.unit} · reward lost`, goal: g.id });
  }
  for (const f of state.focusLog || []) {
    const g = f.goalId && goalById.get(f.goalId);
    const amt = g ? focusAmount(g.unit, f.mins) : 0;
    out.push({ t: f.t, kind: 'focus', ico: 'clock', c: g ? CATS[g.cat].color : 'var(--accent)', title: `Focus · ${f.mins} min`,
      detail: g ? (amt > 0 ? `+${fmtNum(amt)} ${g.unit} to ${g.name}` : `A day worked on ${g.name}`) : 'No goal tagged', goal: g ? g.id : null });
  }
  return out.sort((a, b) => b.t - a.t);
}

function renderHistory() {
  if (rightTab !== 'history') return;
  const now = Date.now();
  const all = historyItems();
  const since = startOfDay(now - (histDays - 1) * DAY).getTime();
  const inRange = all.filter((i) => i.t >= since);
  const items = inRange.filter((i) => histFilter === 'all' || i.kind === histFilter);
  const n = (k) => inRange.filter((i) => i.kind === k).length;
  const focusMins = (state.focusLog || []).filter((f) => f.t >= since).reduce((s, f) => s + f.mins, 0);
  $('#histSummary').innerHTML = `<div class="day-head"><span class="label">LAST ${histDays} DAYS</span></div>
    <div class="hist-stats">
      <span style="--c:var(--good)"><b>${n('task')}</b>tasks</span>
      <span style="--c:var(--gold)"><b>${inRange.filter((i) => i.kind === 'planet' && /milestone|cleared/.test(KIND_OF(i))).length}</b>world events</span>
      <span style="--c:var(--accent)"><b>${focusMins ? fmtMins(focusMins) : 0}</b>focus</span>
    </div>`;
  $('#histFilter').innerHTML = Object.entries(HIST_FILTERS).map(([k, label]) => `<button type="button" class="fchip" data-hfilter="${k}" aria-pressed="${histFilter === k}">${label}<span class="n">${k === 'all' ? inRange.length : n(k)}</span></button>`).join('');
  const today = dayKey(now), yesterday = dayKey(now - DAY);
  let html = '', day = '';
  for (const i of items) {
    const k = dayKey(i.t);
    if (k !== day) {
      day = k;
      const dayItems = items.filter((x) => dayKey(x.t) === k);
      const tasksDone = dayItems.filter((x) => x.kind === 'task').length;
      const label = k === today ? 'TODAY' : k === yesterday ? 'YESTERDAY' : new Date(i.t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
      html += `<li class="hd"><span class="label">${label}</span><span class="hd-sum">${tasksDone ? tasksDone + ' task' + (tasksDone === 1 ? '' : 's') : ''}</span></li>`;
    }
    const act = i.event ? `data-hevent="${i.event}"` : i.task ? `data-htask="${esc(i.task)}"` : i.goal ? `data-hgoal="${i.goal}"` : '';
    html += `<li><button type="button" class="hi hi-${i.kind}" ${act} style="--c:${i.c}">
      <span class="hi-ico">${icon(i.ico)}</span>
      <span class="hi-body"><span class="hi-t">${esc(i.title)}</span>${i.detail ? `<span class="hist-d">${esc(i.detail)}</span>` : ''}</span>
      <span class="hi-time">${fmtTime(i.t)}</span></button></li>`;
  }
  $('#histList').innerHTML = html || `<li class="empty">Nothing ${histFilter === 'all' ? '' : 'of this kind '}in the last ${histDays} days.</li>`;
  $('#histMore').hidden = !all.some((i) => i.t < since);
}
const KIND_OF = (i) => (state.events.find((e) => e.id === i.event) || {}).kind || '';

$('#histFilter').addEventListener('click', (e) => {
  const b = e.target.closest('[data-hfilter]');
  if (b) { histFilter = b.dataset.hfilter; renderHistory(); }
});
$('#histMore').addEventListener('click', () => { histDays += 14; renderHistory(); });
$('#histList').addEventListener('click', (e) => {
  const b = e.target.closest('.hi');
  if (!b) return;
  if (b.dataset.htask) { jumpToTask(b.dataset.htask); return; }
  if (b.dataset.hgoal) {
    const g = state.goals.find((x) => x.id === b.dataset.hgoal);
    if (g && !g.done && !g.missed) openGoalDlg(g);
    else { togglePanel('left', true); setView('goals'); }
    return;
  }
  if (b.dataset.hevent) { // turn the globe to face the event, then open its marker if it has one
    const ev = state.events.find((x) => x.id === b.dataset.hevent);
    if (!ev) return;
    globe.rot = ev.lon;
    autoSpin = false; spinResume = performance.now() + 6000;
    if (matchMedia('(max-width: 860px)').matches) setView('none'); // phone: show the globe
    setTimeout(() => { if (nodeEls.has(ev.id)) openTip(ev.id); }, 80);
  }
});

// ---------- game words: bold and colored ----------
// Words that affect the game are wrapped in <b class="kw kw-…"> wherever descriptive text appears.
// One observer handles every render, so text builders stay plain strings. Names the player typed are never touched.
const KW_RULES = [
  ['ms', /Polar Frost Melts|Haze Thickens|First Rain|First Sea|First Green|Biomes Spread|Era II\b|Era I\b/],
  ['bad', /Deep Cooling|Dust Storm|Withering|−\d+(?:\.\d+)?(?:\/h)?|\b(?:[Bb]lights?|[Dd]rain(?:s|ing)?|[Mm]issed|[Ll]ost|[Ss]talled|[Oo]verdue|[Ff]ading)\b/],
  ['num', /[+×]\s?\d+(?:\.\d+)?(?:\/h|%)?|\b[Dd]oubles\b/],
  ['heat', /\b(?:Crust · Heat|Heat|heat|Physical|PHYS)\b/],
  ['atmos', /\b(?:Atmosphere|atmosphere|[Hh]aze|Mental|MIND)\b/],
  ['water', /\b(?:Water|water)\b/],
  ['life', /\b(?:Social \/ Creative|Life|life|LIFE)\b/],
  ['fx', /\b(?:Steady|Surge|Catalyst|Stabilizer)\b/],
  ['gold', /\b(?:[Rr]ewards?|[Ss]treaks?|days? worked|[Ll]andmarks?|[Mm]ilestones?)\b/],
];
const KW_RE = new RegExp(KW_RULES.map(([, r]) => `(${r.source})`).join('|'), 'g');
// where it applies: descriptive text, not chips, buttons, headings or names
const KW_SCOPE = '.hist-d, .hint, .pv-desc, .tile .s, .sys-title .feed, .sys-next, .ms .d, #forecast, #eraNext, .tip p, .tl-d, .pot-today, .goal-later, #askBody, .toast-msg, .focus-goal, .empty, .li-none';

const typedNames = () => [state.name, ...state.tasks.map((t) => t.name), ...state.goals.map((g) => g.name), ...state.cal.map((e) => e.title)]
  .filter((n) => n && n.length > 1).sort((a, b) => b.length - a.length);

function markWords(node, names) {
  const text = node.nodeValue;
  KW_RE.lastIndex = 0;
  if (!KW_RE.test(text)) return;
  const shield = []; // spans of text that are a player-typed name
  for (const n of names) for (let i = text.indexOf(n); i >= 0; i = text.indexOf(n, i + n.length)) shield.push([i, i + n.length]);
  const frag = document.createDocumentFragment();
  let last = 0, m;
  KW_RE.lastIndex = 0;
  while ((m = KW_RE.exec(text))) {
    const a = m.index, b = a + m[0].length;
    if (shield.some(([s, e]) => a < e && b > s)) continue;
    const el = document.createElement('b');
    el.className = 'kw kw-' + KW_RULES[m.slice(1).findIndex((g) => g !== undefined)][0];
    el.textContent = m[0];
    frag.append(text.slice(last, a), el);
    last = b;
  }
  if (!last) return;
  frag.append(text.slice(last));
  node.replaceWith(frag);
}
function markGameWords(root) {
  if (!root || root.nodeType !== 1) return;
  const scopes = root.matches(KW_SCOPE) ? [root] : root.closest(KW_SCOPE) ? [root.closest(KW_SCOPE)] : [...root.querySelectorAll(KW_SCOPE)];
  if (!scopes.length) return;
  const names = typedNames();
  for (const scope of scopes) {
    const walk = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement.closest('.kw, .chip, b') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    const nodes = [];
    while (walk.nextNode()) nodes.push(walk.currentNode);
    for (const n of nodes) markWords(n, names);
  }
}
new MutationObserver((muts) => {
  const seen = new Set();
  for (const m of muts) {
    const el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
    if (el && !seen.has(el)) { seen.add(el); markGameWords(el); }
  }
}).observe(document.body, { childList: true, subtree: true, characterData: true });
markGameWords(document.body);

// ---------- loop ----------
if (!document.body.dataset.view) setView('tasks');
renderAll();
announce(pending);

let lastSim = 0, lastUi = 0, lastFrame = performance.now();
let lastMini = -1e9, lastFocus = 0;
const miniCtx = $('#miniGlobe').getContext('2d');
miniCtx.imageSmoothingEnabled = false;
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
  if (t - lastUi > 5000) { renderHeader(); renderSystems(); updateNowLine(); save(); lastUi = t; }
  if (t - lastFocus > 250) { focusTick(); lastFocus = t; }
  globe.render(visuals(state, Date.now()), t);
  if (t - lastMini > 250) { miniCtx.clearRect(0, 0, 56, 56); miniCtx.drawImage(globe.buf, 0, 0, 56, 56); lastMini = t; }
  placeNodes();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { advance(state, Date.now(), pending); focusTick(); announce(pending); renderAll(); }
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
