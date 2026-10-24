import {
  CATS, SYSTEMS, TYPES, MILESTONES, BLIGHTS, DAY, HOUR,
  newState, advance, rates, completeTask, uncompleteTask, isDoneToday, goalProgress,
  nextMilestone, milestoneProgress, forecast, visuals, eraOf, stats, uid, dayKey, fmtDuration,
} from './sim.js';
import { Globe } from './globe.js';
import { icon } from './icons.js';

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
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
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
    if (d.id === 'taskDlg') { openTaskDlg(null); return; }
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

// task dialog: tile pickers, live reward preview, add + edit
const TYPE_SHORT = { steady: '+0.06/h, lasting', surge: '×2 for 12h', catalyst: '+15 right now', stabilizer: 'No drain for 24h' };
$('#catPicker').insertAdjacentHTML('beforeend', Object.entries(CATS).map(([k, c], i) => `
  <label class="tile" style="--c:${c.color}"><input type="radio" name="cat" value="${k}"${i ? '' : ' checked'}>
    <span class="ico">${icon(c.sys)}</span><span class="t">${c.short}</span><span class="s">${c.label}</span></label>`).join(''));
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
