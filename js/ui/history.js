// The right panel's tabs (Systems / History), and History: everything that happened, newest first, by day.
import { CATS, MILESTONES, DAY, dayKey, focusAmount, goalMonth } from '../sim.js';
import { icon } from '../icons.js';
import { state } from './store.js';
import { $, esc, fmtNum, fmtPct, fmtTime, fmtMins, monthName, plural, startOfDay, RANGE, rangeStart, rewardText } from './util.js';
import { KIND, turnTo, hasNode, openTip } from './world.js';
import { jumpToTask } from './tasks.js';
import { openGoalDlg } from './goals.js';
import { setView, togglePanel } from './layout.js';

const EVENT_ICON = { milestone: 'star', goal: 'flag', blight: 'warn', cleared: 'check', lost: 'warn', cataclysm: 'meteor' };
const isMilestoneEvent = (e) => e.kind === 'milestone' && MILESTONES.some((m) => m.title === e.title);

let rightTab = 'systems';
export function setRightTab(tab) {
  rightTab = tab;
  $('#paneSystems').hidden = tab !== 'systems';
  $('#paneHistory').hidden = tab !== 'history';
  $('#tabSystems').setAttribute('aria-selected', String(tab === 'systems'));
  $('#tabHistory').setAttribute('aria-selected', String(tab === 'history'));
  if (tab === 'history') renderHistory();
}
document.querySelectorAll('[data-rtab]').forEach((b) => b.addEventListener('click', () => setRightTab(b.dataset.rtab)));

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
      detail: (t ? rewardText(h.cat, t.type) : CATS[h.cat].label) + (g ? ` · +${fmtPct(h.goalAmt)} to ${g.name}` : ''), task: h.name });
  }
  for (const e of state.events) {
    out.push({ t: e.t, kind: e.kind === 'goal' ? 'goal' : 'planet', ico: EVENT_ICON[e.kind] || 'star', c: KIND[e.kind].color, title: e.title, detail: e.body || '', event: e.id });
  }
  const focusKeys = new Set((state.focusLog || []).map((f) => f.goalId + '|' + f.t));
  for (const g of state.goals) {
    const c = CATS[g.cat].color;
    out.push({ t: g.created, kind: 'goal', ico: 'flag', c, title: 'Goal set', detail: `${g.name} · by the end of ${monthName(goalMonth(g))}`, goal: g.id });
    for (const l of g.log || []) {
      if (l.task || !(l.amt > 0) || focusKeys.has(g.id + '|' + l.t)) continue; // tasks and focus rounds are listed on their own
      out.push({ t: l.t, kind: 'goal', ico: 'plus', c, title: `Logged +${fmtPct(l.amt)}`, detail: g.name, goal: g.id });
    }
    if (g.missed) out.push({ t: g.missed, kind: 'goal', ico: 'close', c: 'var(--danger)', title: 'Goal missed', detail: `${g.name} · reached ${fmtPct(Math.min(100, g.current))}`, goal: g.id });
  }
  for (const f of state.focusLog || []) {
    const g = f.goalId && goalById.get(f.goalId);
    const amt = g ? focusAmount(g, f.mins) : 0;
    out.push({ t: f.t, kind: 'focus', ico: 'clock', c: g ? CATS[g.cat].color : 'var(--accent)', title: `Focus · ${f.mins} min`,
      detail: g ? (amt > 0 ? `+${fmtPct(amt)} to ${g.name}` : `A day worked on ${g.name}`) : 'No goal tagged', goal: g ? g.id : null });
  }
  return out.sort((a, b) => b.t - a.t);
}

export function renderHistory() {
  if (rightTab !== 'history') return;
  const now = Date.now();
  const all = historyItems();
  const since = startOfDay(now - (histDays - 1) * DAY).getTime();
  const inRange = all.filter((i) => i.t >= since);
  const items = inRange.filter((i) => histFilter === 'all' || i.kind === histFilter);
  const n = (k) => inRange.filter((i) => i.kind === k).length;
  const tasksN = state.history.filter((h) => h.t >= rangeStart(RANGE.tasks, now)).length;
  const focusMins = (state.focusLog || []).filter((f) => f.t >= rangeStart(RANGE.focus, now)).reduce((sum, f) => sum + f.mins, 0);
  const recent = state.events.filter((e) => e.t >= rangeStart(RANGE.tasks, now));
  const msN = recent.filter(isMilestoneEvent).length, recN = recent.filter((e) => e.kind === 'cleared').length;
  $('#histSummary').innerHTML = `<div class="hist-stats">
      <span style="--c:var(--accent)"><b>${tasksN}</b>${plural(tasksN, 'task')} · ${RANGE.tasks} days</span>
      <span style="--c:var(--accent)"><b>${focusMins ? fmtMins(focusMins) : 0}</b>focus · ${RANGE.focus} days</span>
      <span style="--c:var(--gold)"><b>${msN}</b>${plural(msN, 'milestone')} · ${RANGE.tasks} days</span>
      <span style="--c:var(--good)"><b>${recN}</b>${plural(recN, 'recovery', 'recoveries')} · ${RANGE.tasks} days</span>
    </div>
    <div class="day-head"><span class="label">TIMELINE · LAST ${histDays} DAYS</span></div>`;
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

document.addEventListener('click', (e) => {
  if (!e.target.closest('#seeHistory')) return;
  $('#statsDlg').close();
  togglePanel('right', true);
  setRightTab('history');
  if (matchMedia('(max-width: 860px)').matches) setView('systems');
});
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
    turnTo(ev);
    if (matchMedia('(max-width: 860px)').matches) setView('none'); // phone: show the globe
    setTimeout(() => { if (hasNode(ev.id)) openTip(ev.id); }, 80);
  }
});
