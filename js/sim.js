// Simulation: resources, generators, surges, blights, milestones.
// Colors are CSS variable names so the active theme decides them.
// All rates are per hour. Time is real time (ms timestamps).

export const HOUR = 3600 * 1000;
export const DAY = 24 * HOUR;

export const CATS = {
  PHYS: { sys: 'heat', label: 'Physical', short: 'PHYS', color: 'var(--heat)' },
  MIND: { sys: 'atmos', label: 'Mental', short: 'MIND', color: 'var(--atmos)' },
  LIFE: { sys: 'life', label: 'Social / Creative', short: 'LIFE', color: 'var(--life)' },
};

export const SYSTEMS = {
  heat: { label: 'Crust · Heat', color: 'var(--heat)', base: 0.2 },
  atmos: { label: 'Atmosphere', color: 'var(--atmos)', base: 0.05 },
  water: { label: 'Water', color: 'var(--water)', base: 0 },
  life: { label: 'Life', color: 'var(--life)', base: 0 },
};

export const TYPES = {
  steady: { label: 'Steady', desc: 'Permanent +0.06/h to its system (drifts slowly if neglected)' },
  surge: { label: 'Surge', desc: 'Doubles its system for 12 hours' },
  catalyst: { label: 'Catalyst', desc: 'Instant +15 to its system' },
  stabilizer: { label: 'Stabilizer', desc: 'Stops drift and blight drain on its system for 24h' },
};

const STEADY_GAIN = 0.06;
const SURGE_MULT = 2;
const SURGE_HOURS = 12;
const CATALYST_GAIN = 15;
const DRIFT_PER_DAY = 0.05; // fraction of generator lost per day
const BLIGHT_DRAIN = 0.4;
const BLIGHT_CLEAR = 2;

export const BLIGHTS = {
  heat: { title: 'Deep Cooling', body: 'Missed Physical tasks. The crust is losing heat.', lat: 0.55, lon: 2.4 },
  atmos: { title: 'Dust Storm', body: 'Missed Mental tasks. Haze is thinning as the storm spreads.', lat: 0.12, lon: 0.6 },
  life: { title: 'Withering', body: 'Missed Social / Creative tasks. Fragile life is fading.', lat: -0.3, lon: 4.1 },
};

// Milestones in order. req: resource thresholds.
export const MILESTONES = [
  { id: 'frost', title: 'Polar Frost Melts', body: 'Heat has begun to melt the polar caps.', req: { heat: 120 }, lat: 1.25, lon: 0.3 },
  { id: 'haze', title: 'Haze Thickens', body: 'The first thin clouds drift over the dunes.', req: { atmos: 80 }, lat: 0.4, lon: 3.3 },
  { id: 'rain', title: 'First Rain', body: 'Warm air and thick haze meet. Water falls for the first time.', req: { heat: 300, atmos: 200 }, lat: -0.2, lon: 1.6 },
  { id: 'sea', title: 'First Sea', body: 'Rain pools in the great crater basin.', req: { water: 120 }, lat: -0.15, lon: 5.2 },
  { id: 'green', title: 'First Green', body: 'Life takes hold along the new shoreline.', req: { water: 260, life: 60 }, lat: 0.05, lon: 4.6 },
  { id: 'bloom', title: 'Biomes Spread', body: 'Grasslands and forests cover the lowlands. Era II begins.', req: { life: 450, water: 600 }, lat: -0.5, lon: 2.9 },
];

export function eraOf(state) {
  return state.milestones.bloom ? { n: 'II', name: 'Living World' }
    : state.milestones.rain ? { n: 'I', name: 'Thawing World' }
    : { n: 'I', name: 'Cold Desert' };
}

export function dayKey(t) {
  const d = new Date(t);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function uid() { return Math.random().toString(36).slice(2, 10); }

export function newState(now) {
  const mk = (name, cat, type) => ({ id: uid(), name, cat, type, recurring: true, created: now });
  return {
    v: 1,
    name: 'Unnamed World',
    created: now,
    lastTick: now,
    lastDay: dayKey(now),
    res: { heat: 0, atmos: 0, water: 0, life: 0 },
    gen: { heat: 0, atmos: 0, life: 0 },
    surges: [],
    stab: {},
    blights: {},
    milestones: {},
    tasks: [
      mk('Morning stretch', 'PHYS', 'steady'),
      mk('Deep work block', 'MIND', 'surge'),
      mk('Clear inbox', 'MIND', 'steady'),
      mk('Walk outside', 'PHYS', 'stabilizer'),
      mk('Message a friend', 'LIFE', 'steady'),
    ],
    goals: [],
    cal: [], // calendar events: {id, title, start, end, allDay, repeat, until, skip[], cat, notes}
    history: [], // {taskId, name, cat, t}
    events: [
      { id: uid(), kind: 'milestone', title: 'World Seeded', body: 'A cold desert rock, waiting.', t: now, lat: -0.1, lon: 1.0, links: [] },
    ],
  };
}

function surgeMult(state, sys, now) {
  let m = 1;
  for (const s of state.surges) if (s.sys === sys && s.until > now) m *= s.mult;
  return m;
}

function stabilized(state, sys, now) { return (state.stab[sys] || 0) > now; }

export function rates(state, now) {
  const r = {};
  for (const sys of ['heat', 'atmos', 'life']) {
    let v = (SYSTEMS[sys].base + state.gen[sys]) * surgeMult(state, sys, now);
    if (sys === 'life' && !state.milestones.rain) v *= 0.25; // life struggles before water
    if (state.blights[sys] && !stabilized(state, sys, now)) v -= BLIGHT_DRAIN;
    r[sys] = v;
  }
  if (state.milestones.rain) {
    r.water = 0.15 + 0.8 * Math.min(state.gen.heat + 0.2, state.gen.atmos + 0.05);
  } else r.water = 0;
  return r;
}

// Advance continuous sim by dt (ms), in steps so thresholds trigger in order.
export function advance(state, now, events) {
  let t = state.lastTick;
  const end = now;
  if (now - t > 14 * DAY) t = now - 14 * DAY; // cap offline catch-up at 14 days
  const step = HOUR / 4;
  while (t < end) {
    const dtMs = Math.min(step, end - t);
    const dtH = dtMs / HOUR;
    const r = rates(state, t);
    for (const k in r) state.res[k] = Math.max(0, state.res[k] + r[k] * dtH);
    for (const sys in state.gen) {
      if (!stabilized(state, sys, t)) state.gen[sys] *= Math.exp(-DRIFT_PER_DAY / 24 * dtH);
    }
    t += dtMs;
    checkMilestones(state, t, events);
  }
  state.surges = state.surges.filter((s) => s.until > now);
  state.lastTick = now;
  rollDays(state, now, events);
}

function checkMilestones(state, t, events) {
  for (const m of MILESTONES) {
    if (state.milestones[m.id]) continue;
    const ok = Object.keys(m.req).every((k) => state.res[k] >= m.req[k]);
    if (!ok) break; // strictly in order
    state.milestones[m.id] = t;
    const ev = { id: uid(), kind: 'milestone', title: m.title, body: m.body, t, lat: m.lat, lon: m.lon, links: topContributors(state, t) };
    state.events.push(ev);
    events.push(ev);
  }
}

export function topContributors(state, t) {
  const since = t - 7 * DAY;
  const counts = {};
  for (const h of state.history) if (h.t >= since) counts[h.name] = (counts[h.name] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, c]) => n + ' ×' + c);
}

// At each day boundary, look at the day that ended: missed recurring tasks spawn blights.
function rollDays(state, now, events) {
  const today = dayKey(now);
  if (state.lastDay === today) return;
  // evaluate the last recorded day only (keeps it gentle after long absence)
  const ended = state.lastDay;
  const missed = { PHYS: [], MIND: [], LIFE: [] };
  for (const task of state.tasks) {
    if (!task.recurring || dayKey(task.created) > ended) continue;
    const done = state.history.some((h) => h.taskId === task.id && dayKey(h.t) === ended);
    if (!done) missed[task.cat].push(task.name);
  }
  for (const cat in missed) {
    const sys = CATS[cat].sys;
    const total = state.tasks.filter((x) => x.recurring && x.cat === cat).length;
    const threshold = Math.min(2, total);
    if (threshold > 0 && missed[cat].length >= threshold && !state.blights[sys]) {
      const b = BLIGHTS[sys];
      state.blights[sys] = { since: now, need: BLIGHT_CLEAR };
      const ev = { id: uid(), kind: 'blight', sys, title: b.title, body: b.body, t: now, lat: b.lat, lon: b.lon, links: missed[cat].slice(0, 3), active: true };
      state.events.push(ev);
      events.push(ev);
    }
  }
  expireGoals(state, now);
  // one-off tasks completed on earlier days are archived
  state.tasks = state.tasks.filter((x) => x.recurring || !state.history.some((h) => h.taskId === x.id && dayKey(h.t) < today));
  state.lastDay = today;
}

// Goals are monthly: each belongs to one calendar month and is due on its last day.
// Up to 3 per month; achieved goals keep their slot, abandoned ones free it.
export const GOALS_PER_MONTH = 3;
export const monthKey = (t) => dayKey(t).slice(0, 7); // "2026-10"
const ym = (mk) => mk.split('-').map(Number);
export const monthAfter = (mk) => { const [y, m] = ym(mk); return monthKey(new Date(y, m, 1)); };
export const monthLastDay = (mk) => { const [y, m] = ym(mk); return dayKey(new Date(y, m, 0)); };
export const monthStart = (mk) => { const [y, m] = ym(mk); return new Date(y, m - 1, 1).getTime(); };
// older saves have only a deadline; their month is the deadline's month
export const goalMonth = (g) => g.month || String(g.deadline || dayKey(g.created)).slice(0, 7);
export const goalsInMonth = (state, mk) => state.goals.filter((g) => !g.missed && goalMonth(g) === mk);
export const openGoals = (state) => state.goals.filter((g) => !g.done && !g.missed);

// Unfinished goals from a month that has ended are marked missed.
export function expireGoals(state, now) {
  const cur = monthKey(now);
  for (const g of state.goals) {
    g.month = goalMonth(g);
    g.deadline = monthLastDay(g.month);
    if (!g.done && !g.missed && g.month < cur) g.missed = now;
  }
}

export function isDoneToday(state, task, now) {
  const k = dayKey(now);
  return state.history.some((h) => h.taskId === task.id && dayKey(h.t) === k);
}

export function completeTask(state, task, now, events) {
  const sys = CATS[task.cat].sys;
  const h = { taskId: task.id, name: task.name, cat: task.cat, t: now };
  state.history.push(h);
  // a task linked to a goal adds its amount to that goal (once the goal's month has started)
  const goal = task.goalId && state.goals.find((g) => g.id === task.goalId);
  if (goalOpen(goal) && goalStarted(goal, now)) {
    h.goal = goal.id;
    h.goalAmt = task.goalAmt || 1;
    goalProgress(state, goal, h.goalAmt, now, events, task.id);
  }
  if (task.type === 'steady') state.gen[sys] += STEADY_GAIN;
  if (task.type === 'surge') state.surges.push({ sys, mult: SURGE_MULT, until: now + SURGE_HOURS * HOUR, name: task.name });
  if (task.type === 'catalyst') state.res[sys] += CATALYST_GAIN;
  if (task.type === 'stabilizer') state.stab[sys] = now + DAY;
  const b = state.blights[sys];
  if (b) {
    b.need -= 1;
    if (b.need <= 0) {
      delete state.blights[sys];
      for (const e of state.events) if (e.kind === 'blight' && e.sys === sys && e.active) e.active = false;
      const ev = { id: uid(), kind: 'cleared', title: BLIGHTS[sys].title + ' Cleared', body: 'Restored by ' + task.name + '.', t: now, lat: BLIGHTS[sys].lat, lon: BLIGHTS[sys].lon, links: [task.name] };
      state.events.push(ev);
      events.push(ev);
    }
  }
}

export function uncompleteTask(state, task, now) {
  const k = dayKey(now);
  const i = state.history.findIndex((h) => h.taskId === task.id && dayKey(h.t) === k);
  if (i < 0) return;
  const [h] = state.history.splice(i, 1);
  if (h.goal) goalProgress(state, state.goals.find((g) => g.id === h.goal), -h.goalAmt, now, [], task.id);
  const sys = CATS[task.cat].sys;
  if (task.type === 'steady') state.gen[sys] = Math.max(0, state.gen[sys] - STEADY_GAIN);
  if (task.type === 'surge') {
    const j = state.surges.findIndex((s) => s.name === task.name && s.sys === sys);
    if (j >= 0) state.surges.splice(j, 1);
  }
  if (task.type === 'catalyst') state.res[sys] = Math.max(0, state.res[sys] - CATALYST_GAIN);
}

// A goal's reward grows: a base amount, plus more for every day you work on it.
// It's paid only when the goal is met; a missed goal loses it.
export const GOAL_REWARD = { baseRes: 30, dayRes: 4, baseGen: 0.1, dayGen: 0.01 };
export const goalDaysWorked = (g) => new Set((g.log || []).map((e) => dayKey(e.t))).size;
export function goalReward(g) {
  const days = goalDaysWorked(g);
  return { days, res: GOAL_REWARD.baseRes + GOAL_REWARD.dayRes * days, gen: +(GOAL_REWARD.baseGen + GOAL_REWARD.dayGen * days).toFixed(2) };
}
export const goalStarted = (g, now) => goalMonth(g) <= monthKey(now);
const goalOpen = (g) => !!g && !g.done && !g.missed;

// amount > 0 records a contribution (from a log, or from the linked task taskId);
// amount < 0 takes back today's matching contribution; 0 only re-checks the target.
export function goalProgress(state, goal, amount, now, events, taskId = null) {
  if (!goalOpen(goal)) return;
  goal.log ||= [];
  if (amount > 0) goal.log.push(taskId ? { t: now, amt: amount, task: taskId } : { t: now, amt: amount });
  if (amount < 0) {
    const k = dayKey(now);
    for (let i = goal.log.length - 1; i >= 0; i--) {
      const e = goal.log[i];
      if (dayKey(e.t) === k && e.amt === -amount && (e.task || null) === taskId) { goal.log.splice(i, 1); break; }
    }
  }
  goal.current = Math.max(0, goal.current + amount);
  if (goal.current >= goal.target) {
    goal.done = now;
    const sys = CATS[goal.cat].sys;
    const r = goalReward(goal);
    goal.paid = r;
    state.res[sys] += r.res;
    state.gen[sys] += r.gen;
    const ev = { id: uid(), kind: 'goal', title: 'Goal: ' + goal.name, body: `A landmark achievement reshapes the world. +${r.res} ${SYSTEMS[sys].label}, +${r.gen}/h for good.`, t: now, lat: (Math.random() - 0.5) * 1.4, lon: Math.random() * Math.PI * 2, links: [goal.current + ' / ' + goal.target + ' ' + goal.unit, r.days + ' day' + (r.days === 1 ? '' : 's') + ' of work'] };
    state.events.push(ev);
    events.push(ev);
  }
}

export function nextMilestone(state) {
  return MILESTONES.find((m) => !state.milestones[m.id]) || null;
}

export function milestoneProgress(state, m) {
  let p = 1;
  for (const k in m.req) p = Math.min(p, state.res[k] / m.req[k]);
  return Math.max(0, Math.min(1, p));
}

export function forecast(state, now) {
  const m = nextMilestone(state);
  if (!m) return { text: 'The world flourishes. More eras to come.' };
  const r = rates(state, now);
  let hours = 0;
  for (const k in m.req) {
    const need = m.req[k] - state.res[k];
    if (need <= 0) continue;
    if (r[k] <= 0.001) return { text: m.title + ' is stalled — ' + SYSTEMS[k].label + ' is not growing', m, stalled: k };
    hours = Math.max(hours, need / r[k]);
  }
  return { text: m.title + ' in ~' + fmtDuration(hours) + ' at current pace', m, hours };
}

export function fmtDuration(h) {
  if (h < 1) return Math.max(1, Math.round(h * 60)) + ' min';
  if (h < 48) return Math.round(h) + ' h';
  return Math.round(h / 24) + ' days';
}

// Visual parameters for the globe, 0..1
export function visuals(state, now) {
  const c = (v) => Math.max(0, Math.min(1, v));
  return {
    ice: c(1 - state.res.heat / 420),
    clouds: c(state.res.atmos / 420),
    sea: c(state.res.water / 700),
    green: state.milestones.green ? c(state.res.life / 700) : 0,
    dust: !!state.blights.atmos,
    cooling: !!state.blights.heat,
    wither: !!state.blights.life,
    lights: state.milestones.bloom ? c((state.res.life - 450) / 800) : 0,
  };
}

export function stats(state, now) {
  const days = 7;
  const out = { byCat: {}, streak: 0, tasks: [] };
  for (const cat in CATS) {
    const ts = state.tasks.filter((t) => t.recurring && t.cat === cat);
    let sched = 0, done = 0;
    for (let d = 0; d < days; d++) {
      const k = dayKey(now - d * DAY);
      for (const t of ts) {
        if (dayKey(t.created) > k) continue;
        sched++;
        if (state.history.some((h) => h.taskId === t.id && dayKey(h.t) === k)) done++;
      }
    }
    out.byCat[cat] = sched ? done / sched : null;
  }
  // streak: consecutive days (ending yesterday or today) with at least one completion
  let d = isAnyDone(state, dayKey(now)) ? 0 : 1;
  while (isAnyDone(state, dayKey(now - d * DAY))) { out.streak++; d++; }
  for (const t of state.tasks.filter((x) => x.recurring)) {
    const age = Math.min(14, Math.max(1, Math.ceil((now - t.created) / DAY)));
    let c = 0;
    for (let i = 0; i < age; i++) {
      const k = dayKey(now - i * DAY);
      if (state.history.some((h) => h.taskId === t.id && dayKey(h.t) === k)) c++;
    }
    out.tasks.push({ name: t.name, cat: t.cat, rel: c / age });
  }
  out.tasks.sort((a, b) => b.rel - a.rel);
  return out;
}

function isAnyDone(state, k) { return state.history.some((h) => dayKey(h.t) === k); }
