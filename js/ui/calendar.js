// The Calendar tab. Works like Google Calendar's phone app: day / 3-day / week time grids, a month grid and a list.
// Click or drag empty time to create; drag an event to move it, drag its bottom edge to resize.
import { CATS, HOUR, DAY, dayKey, uid } from '../sim.js';
import { icon } from '../icons.js';
import { state, save, markDeleted } from './store.js';
import { $, esc, fmtTime, startOfDay, addDays } from './util.js';
import { toast, ask } from './feedback.js';
import { openGoalDlg } from './goals.js';

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

const minutesOf = (t) => { const d = new Date(t); return d.getHours() * 60 + d.getMinutes(); };
const hhmm = (t) => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
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

export function renderCalendar() {
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

export function updateNowLine() {
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

export function openEventDlg(occ, preset) {
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
    else { state.cal = state.cal.filter((x) => x !== ev); markDeleted(ev.id); }
  } else {
    state.cal = state.cal.filter((x) => x !== ev);
    markDeleted(ev.id);
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
