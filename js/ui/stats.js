// The Stats dialog: activity heatmap, focus time, and how reliably each daily task gets done.
import { CATS, MILESTONES, DAY, dayKey, stats, eraOf, goalsInMonth, monthKey, GOALS_PER_MONTH, popCap } from '../sim.js';
import { icon } from '../icons.js';
import { state } from './store.js';
import { $, esc, fmtMins, lastDays, RANGE, rangeStart } from './util.js';
import { historyIndex } from './tasks.js';

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
  const since = rangeStart(RANGE.focus, now);
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

export function renderStats() {
  const now = Date.now();
  const s = stats(state, now);
  const idx = historyIndex();
  const perDay = new Map();
  for (const h of state.history) { const k = dayKey(h.t); perDay.set(k, (perDay.get(k) || 0) + 1); }
  const goalsDone = state.goals.filter((g) => g.done).length;
  const msDone = MILESTONES.filter((m) => state.milestones[m.id]).length;
  const pct = (v) => v == null ? '—' : Math.round(v * 100) + '%';
  const recurring = state.tasks.filter((t) => t.recurring);
  const week = lastDays(7, now), fortnight = lastDays(14, now);
  const today = dayKey(now);

  $('#statsWorld').textContent = state.name;

  const tiles = [
    { ico: 'pop', c: 'var(--gold)', v: Math.floor(state.pop || 0).toLocaleString(), k: 'POP', sub: popCap(state) ? `Ceiling ${popCap(state).toLocaleString()}` : 'Grows from First Rain' },
    { ico: 'check', c: 'var(--accent)', v: state.history.filter((h) => h.t >= rangeStart(RANGE.tasks, now)).length, k: `TASKS · ${RANGE.tasks} DAYS`, sub: `${state.history.length} all time` },
    { ico: 'flag', c: 'var(--good)', v: goalsDone, k: 'GOALS MET · ALL TIME', sub: `${goalsInMonth(state, monthKey(now)).length}/${GOALS_PER_MONTH} set this month` },
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
    <section class="stat-section see-history">
      <div class="label">HISTORY</div>
      <p class="hint">Every task, goal, focus round and planet event, day by day, lives in the History tab.</p>
      <button type="button" class="btn-ghost" id="seeHistory">SEE FULL HISTORY ${icon('right')}</button>
    </section>`;
}
