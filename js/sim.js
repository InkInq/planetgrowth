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

// Milestones in order. req: system levels, plus `goals` (monthly goals met, counted over the planet's life).
// era: the era a milestone belongs to; the first milestone of an era starts it.
export const MILESTONES = [
  { id: 'frost', era: 'I', title: 'Polar Frost Melts', body: 'Heat has begun to melt the polar caps.', req: { heat: 120 }, lat: 1.25, lon: 0.3 },
  { id: 'haze', era: 'I', title: 'Haze Thickens', body: 'The first thin clouds drift over the dunes.', req: { atmos: 80 }, lat: 0.4, lon: 3.3 },
  { id: 'rain', era: 'I', title: 'First Rain', body: 'Warm air and thick haze meet. Water falls for the first time.', req: { heat: 300, atmos: 200 }, lat: -0.2, lon: 1.6 },
  { id: 'sea', era: 'I', title: 'First Sea', body: 'Rain pools in the great crater basin.', req: { water: 120 }, lat: -0.15, lon: 5.2 },
  { id: 'green', era: 'I', title: 'First Green', body: 'Life takes hold along the new shoreline.', req: { water: 260, life: 60 }, lat: 0.05, lon: 4.6 },
  { id: 'bloom', era: 'II', title: 'Biomes Spread', body: 'Grasslands and forests cover the lowlands. Era II begins.', req: { life: 350, water: 450 }, lat: -0.5, lon: 2.9 },
  { id: 'rivers', era: 'II', title: 'Rivers Run', body: 'Rain finds its way downhill, and rivers carve the lowlands.', req: { water: 650 }, lat: 0.3, lon: 0.9 },
  { id: 'forests', era: 'II', title: 'Forests Rise', body: 'Dense forests grow along the rivers.', req: { life: 1000, water: 850 }, lat: -0.35, lon: 4.1 },
  { id: 'weather', era: 'II', title: 'Weather Cycles', body: 'Storms and seasons settle into steady cycles.', req: { heat: 1700, atmos: 1300 }, lat: 0.6, lon: 2.2 },
  { id: 'creatures', era: 'II', title: 'First Creatures', body: 'The first creatures roam the plains.', req: { life: 1600, water: 1100 }, lat: -0.1, lon: 3.6 },
  { id: 'settle', era: 'III', title: 'First Settlements', body: 'Small settlements light up by the water. Era III begins.', req: { heat: 2000, atmos: 1600, water: 1300, life: 1900 }, lat: 0.15, lon: 5.8 },
  { id: 'cities', era: 'III', title: 'Cities Glow', body: 'Cities spread, and the night side glows.', req: { life: 2200, goals: 5 }, lat: 0.35, lon: 1.3 },
  { id: 'moon', era: 'III', title: 'Orbital Station', body: 'A crewed station circles the world.', req: { heat: 2700, goals: 7 }, lat: 0.9, lon: 4.9 },
  { id: 'voyages', era: 'III', title: 'Ships Cross the Seas', body: 'Ships sail between the continents.', req: { water: 1900, goals: 8 }, lat: -0.3, lon: 5.4 },
  { id: 'ring', era: 'III', title: 'Space Elevator', body: 'A cable rises from the equator all the way to orbit.', req: { atmos: 2400, goals: 10 }, lat: -0.8, lon: 0.4 },
  { id: 'sat', era: 'III', title: 'First Satellite', body: 'The first satellite blinks into orbit.', req: { water: 2050, life: 2600, goals: 11 }, lat: 0.5, lon: 3.0 },
  { id: 'stars', era: 'III', title: 'Reach for the Stars', body: 'Rockets rise toward the stars.', req: { heat: 3000, atmos: 2600, water: 2200, life: 2800, goals: 13 }, lat: -0.05, lon: 1.9 },
];

export const goalsMet = (state) => state.goals.filter((g) => g.done).length;
// how much of one requirement you have: a system's level, or goals met
export const reqHave = (state, k) => (k === 'goals' ? goalsMet(state) : state.res[k]);
const sysWord = { heat: 'Heat', atmos: 'Atmosphere', water: 'Water', life: 'Life' };
export const reqLabel = (k, v) => (k === 'goals' ? `${v} goal${v === 1 ? '' : 's'} met` : `${sysWord[k]} ${v}`);
export const reqText = (m) => Object.entries(m.req).map(([k, v]) => reqLabel(k, v)).join(' + ');
// only system levels can fall; goals met are never taken back
const levelKeys = (m) => Object.keys(m.req).filter((k) => k !== 'goals');

export const ERAS = { I: 'Cold Desert', II: 'Living World', III: 'Awakened World' };
export function eraOf(state) {
  return state.milestones.settle ? { n: 'III', name: ERAS.III }
    : state.milestones.bloom ? { n: 'II', name: ERAS.II }
    : state.milestones.rain ? { n: 'I', name: 'Thawing World' }
    : { n: 'I', name: ERAS.I };
}

export function dayKey(t) {
  const d = new Date(t);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function uid() { return Math.random().toString(36).slice(2, 10); }

export function newState(now) {
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
    lost: {}, // milestone id -> when it was last lost (to a cataclysm or a blight)
    pop: 0, // how alive the planet is; grows toward popCap()
    lastMonth: monthKey(now), // the month the world is in; changing it brings the cataclysm
    cataclysms: [], // month's-end records, newest last
    tasks: [], // a new world starts with First Steps (see ui/tutorial.js), not sample tasks
    tutorial: { welcome: true },
    goals: [],
    focus: null, // the running focus session, if any
    focusLog: [], // finished focus rounds: {t (end), mins, goalId}
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

// What a milestone unlocks stays unlocked after the milestone is lost, so one setback can't snowball
// (losing First Rain doesn't stop Water forming).
export const unlocked = (state, id) => !!(state.milestones[id] || state.lost?.[id]);

function stabilized(state, sys, now) { return (state.stab[sys] || 0) > now; }

export function rates(state, now) {
  const r = {};
  for (const sys of ['heat', 'atmos', 'life']) {
    let v = (SYSTEMS[sys].base + state.gen[sys]) * surgeMult(state, sys, now);
    if (sys === 'life' && !unlocked(state, 'rain')) v *= 0.25; // life struggles before water
    if (state.blights[sys] && !stabilized(state, sys, now)) v -= BLIGHT_DRAIN;
    r[sys] = v;
  }
  if (unlocked(state, 'rain')) {
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
    growPop(state, dtH);
    t += dtMs;
    checkMilestones(state, t, events);
  }
  state.surges = state.surges.filter((s) => s.until > now);
  state.lastTick = now;
  rollDays(state, now, events);
  state.lastMonth ||= monthKey(now); // saves from before cataclysms start counting from now
  if (monthKey(now) !== state.lastMonth) {
    snapshotMonth(state, state.lastMonth);
    if (now - state.created < GRACE_DAYS * DAY) state.lastMonth = monthKey(now); // a new world's first month ends quietly
    else cataclysm(state, now, events);
  }
}

function checkMilestones(state, t, events) {
  loseMilestones(state, t, events);
  for (const m of MILESTONES) {
    if (state.milestones[m.id]) continue;
    const ok = Object.keys(m.req).every((k) => reqHave(state, k) >= m.req[k]);
    if (!ok) break; // strictly in order
    state.milestones[m.id] = t;
    const back = !!state.lost?.[m.id];
    if (back) delete state.lost[m.id];
    const ev = { id: uid(), kind: 'milestone', title: m.title, body: back ? m.body + ' Earned back after it was lost.' : m.body, t, lat: m.lat, lon: m.lon, links: topContributors(state, t) };
    state.events.push(ev);
    events.push(ev);
  }
}

// A milestone is lost when a system it needs falls below MILESTONE_KEEP of its requirement. Each is checked
// on its own (they depend on different systems); earning stays in order, so a lost one is the next to earn back,
// and that needs the full requirement. At 75%, a month's-end cataclysm (−25%) only takes a milestone if that
// system was already below it, or had a blight.
export const MILESTONE_KEEP = 0.75;
function loseMilestones(state, t, events) {
  for (let i = MILESTONES.length - 1; i >= 0; i--) {
    const m = MILESTONES[i];
    if (!state.milestones[m.id]) continue;
    const short = levelKeys(m).filter((k) => state.res[k] < m.req[k] * MILESTONE_KEEP);
    if (!short.length) continue;
    delete state.milestones[m.id];
    (state.lost ||= {})[m.id] = t;
    const ev = { id: uid(), kind: 'lost', title: m.title + ' Lost', body: `${short.map((k) => sysWord[k]).join(' and ')} fell below ${MILESTONE_KEEP * 100}% of what it needs. Earn it back at ${reqText(m)}.`, t, lat: m.lat, lon: m.lon, links: [] };
    state.events.push(ev);
    events.push(ev);
  }
}

// ---------- the monthly cataclysm and Pop ----------
// At month's end every system loses CATACLYSM_HIT of its level (more if a blight is active on it),
// which can cost milestones. Its type is random and only changes how it looks and reads.
export const CATACLYSM_HIT = 0.25;
export const GRACE_DAYS = 14; // a world younger than this when its month ends is spared
export const CATACLYSM_HIT_BLIGHTED = 0.4;
export const CATACLYSMS = {
  ice: { title: 'Ice Age', body: 'Glaciers crept down from the poles and the planet froze over.', lat: 1.0, lon: 0.8 },
  dust: { title: 'Dust Age', body: 'Storms of dust blotted out the sun for weeks.', lat: 0.1, lon: 0.6 },
  flood: { title: 'Great Flood', body: 'The seas rose and swallowed the lowlands.', lat: -0.2, lon: 5.0 },
  plague: { title: 'Plague', body: 'A sickness swept the planet and much of its life withered.', lat: 0.0, lon: 4.2 },
};
export const cataclysmHit = (state, k) => (state.blights[k] ? CATACLYSM_HIT_BLIGHTED : CATACLYSM_HIT);

// Pop: how alive the planet is. Each milestone raises how many it can hold; it grows a few % a day toward that,
// and shrinks slowly if a lost milestone lowers it.
export const POP_CAP = {
  rain: 200, sea: 500, green: 1500, bloom: 4000,
  rivers: 1000, forests: 1500, weather: 1500, creatures: 2500,
  settle: 3500, cities: 5000, moon: 4000, voyages: 4000, ring: 4000, sat: 5000, stars: 7000,
};
const POP_GROW = 0.04, POP_SHRINK = 0.05; // per day
export const popCap = (state) => Object.entries(POP_CAP).reduce((n, [id, c]) => n + (state.milestones[id] ? c : 0), 0);
function growPop(state, dtH) {
  const cap = popCap(state), pop = state.pop || 0;
  state.pop = cap + (pop - cap) * Math.exp(-(pop < cap ? POP_GROW : POP_SHRINK) * dtH / 24);
}
// The share that survives a cataclysm: a base, plus more for a consistent month and for each goal met.
export const POP_SURVIVE = { base: 0.6, consistency: 0.3, goal: 0.05, max: 0.95 };
export const popSurvival = (consistency, goalsMet) => Math.min(POP_SURVIVE.max, POP_SURVIVE.base + POP_SURVIVE.consistency * consistency + POP_SURVIVE.goal * goalsMet);

// Share of daily tasks done in a month (up to `now`), counting only days each task existed. Null if there were none.
export function monthConsistency(state, mk, now) {
  const [y, m] = mk.split('-').map(Number);
  const done = new Set(state.history.map((h) => h.taskId + '|' + dayKey(h.t)));
  const daily = state.tasks.filter((x) => x.recurring && !x.tut);
  let due = 0, did = 0;
  for (const d = new Date(y, m - 1, 1, 12); monthKey(d) === mk && d.getTime() <= now; d.setDate(d.getDate() + 1)) {
    const k = dayKey(d);
    if (k < dayKey(state.created)) continue;
    for (const x of daily) if (dayKey(x.created) <= k) { due++; if (done.has(x.id + '|' + k)) did++; }
  }
  return due ? did / due : null;
}
export const goalsMetIn = (state, mk) => state.goals.filter((g) => g.done && goalMonth(g) === mk).length;

// ---------- months: each month's planet, kept for the sky view ----------
// When a month ends, how the planet looked is saved (before the month's-end cataclysm).
export function snapshotMonth(state, mk) {
  (state.months ||= {})[mk] = { res: { ...state.res }, milestones: Object.keys(state.milestones), pop: state.pop || 0 };
}
export const monthEnd = (mk) => new Date(monthLastDay(mk) + 'T23:59:59').getTime();
// The months this world has lived through, oldest first, the current one last (at most `max`).
export function worldMonths(state, now, max = 12) {
  const out = [];
  for (let mk = monthKey(state.created); mk <= monthKey(now); mk = monthAfter(mk)) out.push(mk);
  return out.slice(-max);
}
// How a month's planet looked at its end. Months from before snapshots were kept are rebuilt from the
// milestones reached by then.
export function monthVisuals(state, mk, now) {
  if (mk === monthKey(now)) return visuals(state, now);
  let snap = state.months?.[mk];
  if (!snap) {
    const end = monthEnd(mk);
    const ms = MILESTONES.filter((m) => state.milestones[m.id] && state.milestones[m.id] <= end);
    const res = { heat: 20, atmos: 10, water: 0, life: 0 };
    for (const m of ms) for (const k of levelKeys(m)) res[k] = Math.max(res[k], m.req[k] * 1.1);
    snap = { res, milestones: ms.map((m) => m.id), pop: 0 };
  }
  const fake = { res: snap.res, milestones: Object.fromEntries(snap.milestones.map((id) => [id, 1])), pop: snap.pop, blights: {}, goals: state.goals };
  return visuals(fake, monthEnd(mk) - 1000);
}

// What happened in a month, for its summary in the sky view.
export function monthSummary(state, mk, now) {
  const start = monthStart(mk), end = monthEnd(mk);
  const inMonth = (t) => t >= start && t <= end;
  const done = state.history.filter((h) => inMonth(h.t));
  const byCat = {};
  for (const cat in CATS) byCat[cat] = done.filter((h) => h.cat === cat).length;
  const goals = state.goals.filter((g) => goalMonth(g) === mk).map((g) => ({ id: g.id, name: g.name, cat: g.cat, pct: Math.min(100, g.current), done: g.done || null, missed: g.missed || null }));
  const ev = state.events.filter((e) => inMonth(e.t));
  return {
    mk, current: mk === monthKey(now),
    tasksDone: done.length, byCat,
    consistency: monthConsistency(state, mk, Math.min(now, end)),
    goals,
    reached: ev.filter((e) => e.kind === 'milestone' && MILESTONES.some((m) => m.title === e.title)).map((e) => e.title),
    lost: ev.filter((e) => e.kind === 'lost').map((e) => e.title.replace(/ Lost$/, '')),
    blights: ev.filter((e) => e.kind === 'blight').length,
    focusMins: (state.focusLog || []).filter((f) => inMonth(f.t)).reduce((n, f) => n + f.mins, 0),
    cataclysm: (state.cataclysms || []).find((c) => c.month === mk) || null,
  };
}

export function cataclysm(state, now, events, type) {
  const ended = state.lastMonth || monthKey(now);
  state.lastMonth = monthKey(now);
  type = CATACLYSMS[type] ? type : Object.keys(CATACLYSMS)[Math.floor(Math.random() * 4)];
  const c = CATACLYSMS[type];
  const id = uid();
  const blighted = Object.keys(state.blights);
  const ev = { id, kind: 'cataclysm', title: c.title, body: `${c.body} Every system lost ${CATACLYSM_HIT * 100}%${blighted.length ? `, and ${CATACLYSM_HIT_BLIGHTED * 100}% where a blight was active` : ''}.`, t: now, lat: c.lat, lon: c.lon, links: [] };
  state.events.push(ev);
  events.push(ev);
  const hit = {};
  for (const k in state.res) {
    const rate = cataclysmHit(state, k);
    hit[k] = { before: state.res[k], after: state.res[k] * (1 - rate), rate, blighted: !!state.blights[k] };
    state.res[k] = hit[k].after;
  }
  const had = new Set(Object.keys(state.milestones));
  loseMilestones(state, now, events);
  const msLost = MILESTONES.filter((m) => had.has(m.id) && !state.milestones[m.id]).map((m) => m.id);
  ev.links = msLost.map((mid) => MILESTONES.find((m) => m.id === mid).title + ' lost');
  const consistency = monthConsistency(state, ended, now);
  const goalsMet = goalsMetIn(state, ended);
  const survival = popSurvival(consistency || 0, goalsMet);
  const popBefore = state.pop || 0;
  state.pop = popBefore * survival;
  (state.cataclysms ||= []).push({ id, t: now, month: ended, type, hit, msLost, consistency, goalsMet, survival, popBefore, popAfter: state.pop, seen: false });
}

// What the coming cataclysm would do if the month ended now: milestones at risk, the level each
// system needs to keep them, and how much Pop would survive.
export function cataclysmPreview(state, now) {
  const res = {};
  for (const k in state.res) res[k] = state.res[k] * (1 - cataclysmHit(state, k));
  const risks = [];
  for (let i = MILESTONES.length - 1; i >= 0; i--) {
    const m = MILESTONES[i];
    if (!state.milestones[m.id]) continue;
    const short = levelKeys(m).filter((k) => res[k] < m.req[k] * MILESTONE_KEEP);
    if (!short.length) continue;
    risks.push({ m, needs: short.map((k) => ({ k, have: state.res[k], need: Math.ceil(m.req[k] * MILESTONE_KEEP / (1 - cataclysmHit(state, k))) })) });
  }
  const mk = monthKey(now);
  const [y, mo] = mk.split('-').map(Number);
  const ends = new Date(y, mo, 1).getTime();
  const daysLeft = Math.ceil((ends - now) / DAY);
  const grace = ends - state.created < GRACE_DAYS * DAY;
  const consistency = monthConsistency(state, mk, now);
  const goalsMet = goalsMetIn(state, mk);
  return { daysLeft, grace, risks, consistency, goalsMet, survival: popSurvival(consistency || 0, goalsMet) };
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

// Goals are tracked in percent: 0 to 100. Saves from when goals had their own target and unit
// ("40 km") are converted once: progress, logged amounts, linked tasks and past check-offs are
// rescaled, focus time keeps counting at the same rate, and the old target is kept as `was`.
const r2 = (n) => Math.round(n * 100) / 100;
const OLD_FOCUS_PER_HOUR = [[/^(m|min|mins|minute|minutes)$/i, 60], [/^(h|hr|hrs|hour|hours)$/i, 1], [/^(pomodoros?|poms?|sessions?|rounds?)$/i, 60 / 25]];
export function percentGoals(state) {
  for (const g of state.goals || []) {
    if (g.unit === '%' && g.target === 100) continue;
    const k = 100 / (g.target > 0 ? g.target : 100);
    const per = OLD_FOCUS_PER_HOUR.find(([re]) => re.test(String(g.unit || '').trim()));
    g.focusPerHour = per ? r2(per[1] * k) : 0;
    g.was = `${r2(g.target)} ${g.unit || ''}`.trim();
    g.current = r2(g.current * k);
    for (const e of g.log || []) e.amt = r2((e.amt || 0) * k);
    for (const t of state.tasks || []) if (t.goalId === g.id) t.goalAmt = r2((t.goalAmt || 1) * k);
    for (const h of state.history || []) if (h.goal === g.id) h.goalAmt = r2((h.goalAmt || 0) * k);
    g.target = 100;
    g.unit = '%';
  }
}

// Where a goal should be by now if you spread it evenly over its month, and where it's heading.
// status: 'later' (its month hasn't started), 'done', 'ahead', 'on' (within 5% of the line) or 'behind'.
export const PACE_SLACK = 5;
export function goalPace(g, now) {
  const start = monthStart(goalMonth(g));
  const end = new Date(monthLastDay(goalMonth(g)) + 'T23:59:59').getTime();
  const daysIn = Math.round((end - start) / DAY);
  if (g.done) return { status: 'done', daysIn };
  if (now < start) return { status: 'later', daysIn, expected: 0, perDay: 100 / daysIn };
  const elapsed = Math.min(daysIn, Math.max(1, Math.ceil((now - start) / DAY))); // today counts
  const daysLeft = Math.max(1, daysIn - elapsed + 1);
  const expected = 100 * elapsed / daysIn;
  const diff = g.current - expected;
  const status = diff >= 10 ? 'ahead' : diff >= -PACE_SLACK ? 'on' : 'behind';
  // a projection needs a few days of history to mean anything
  const projected = elapsed >= 3 ? g.current / elapsed * daysIn : null;
  return { status, daysIn, elapsed, daysLeft, expected, diff, projected, perDay: Math.max(0, 100 - g.current) / daysLeft };
}

// Unfinished goals from a month that has ended are marked missed.
export function expireGoals(state, now) {
  percentGoals(state);
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

// Each history entry records what its completion changed, so unchecking can reverse exactly that.
export function completeTask(state, task, now, events) {
  const sys = CATS[task.cat].sys;
  const h = { taskId: task.id, name: task.name, cat: task.cat, t: now };
  state.history.push(h);
  // a task linked to a goal adds its amount to that goal (once the goal's month has started)
  const goal = task.goalId && state.goals.find((g) => g.id === task.goalId);
  if (goalOpen(goal) && goalStarted(goal, now)) {
    h.goal = goal.id;
    h.goalAmt = task.goalAmt || 1;
    h.goalMet = goalProgress(state, goal, h.goalAmt, now, events, task.id);
  }
  if (task.type === 'steady') state.gen[sys] += STEADY_GAIN;
  if (task.type === 'surge') {
    h.surge = uid();
    state.surges.push({ id: h.surge, sys, mult: SURGE_MULT, until: now + SURGE_HOURS * HOUR, name: task.name });
  }
  if (task.type === 'catalyst') state.res[sys] += CATALYST_GAIN;
  if (task.type === 'stabilizer') {
    h.stab = { prev: state.stab[sys] ?? null, set: now + DAY };
    state.stab[sys] = h.stab.set;
  }
  const b = state.blights[sys];
  if (b) {
    h.blight = { since: b.since, need: b.need };
    b.need -= 1;
    if (b.need <= 0) {
      delete state.blights[sys];
      h.blight.closed = [];
      for (const e of state.events) if (e.kind === 'blight' && e.sys === sys && e.active) { e.active = false; h.blight.closed.push(e.id); }
      const ev = { id: uid(), kind: 'cleared', title: BLIGHTS[sys].title + ' Cleared', body: 'Restored by ' + task.name + '.', t: now, lat: BLIGHTS[sys].lat, lon: BLIGHTS[sys].lon, links: [task.name] };
      h.blight.cleared = ev.id;
      state.events.push(ev);
      events.push(ev);
    }
  }
}

// Adds a task's effect on the planet for a completion made on another device (see merge.js).
// Close to what completeTask did there: Steady boosts are faded by the days since, expired surges are skipped.
export function replayEffect(state, task, t, now) {
  const sys = CATS[task.cat].sys;
  if (task.type === 'steady') state.gen[sys] += STEADY_GAIN * Math.exp(-DRIFT_PER_DAY * Math.max(0, now - t) / DAY);
  if (task.type === 'surge' && t + SURGE_HOURS * HOUR > now) state.surges.push({ id: uid(), sys, mult: SURGE_MULT, until: t + SURGE_HOURS * HOUR, name: task.name });
  if (task.type === 'catalyst') state.res[sys] += CATALYST_GAIN;
  if (task.type === 'stabilizer') state.stab[sys] = Math.max(state.stab[sys] || 0, t + DAY);
  const b = state.blights[sys];
  if (b && t >= b.since) {
    b.need -= 1;
    if (b.need <= 0) {
      delete state.blights[sys];
      for (const e of state.events) if (e.kind === 'blight' && e.sys === sys) e.active = false;
    }
  }
}

export function uncompleteTask(state, task, now) {
  const k = dayKey(now);
  const i = state.history.findLastIndex((h) => h.taskId === task.id && dayKey(h.t) === k);
  if (i < 0) return;
  const [h] = state.history.splice(i, 1);
  if (h.goal) {
    const goal = state.goals.find((g) => g.id === h.goal);
    if (goal && h.goalMet && goal.done) reopenGoal(state, goal);
    goalProgress(state, goal, -h.goalAmt, now, [], task.id);
  }
  const sys = CATS[task.cat].sys;
  if (task.type === 'steady') state.gen[sys] = Math.max(0, state.gen[sys] - STEADY_GAIN);
  if (task.type === 'surge') {
    // entries from older saves have no id: fall back to the newest surge by this task
    const j = h.surge ? state.surges.findIndex((x) => x.id === h.surge) : state.surges.findLastIndex((x) => x.name === task.name && x.sys === sys);
    if (j >= 0) state.surges.splice(j, 1);
  }
  if (task.type === 'catalyst') state.res[sys] = Math.max(0, state.res[sys] - CATALYST_GAIN);
  if (h.stab && state.stab[sys] === h.stab.set) { // only if nothing has replaced it since
    if (h.stab.prev == null) delete state.stab[sys]; else state.stab[sys] = h.stab.prev;
  }
  if (h.blight) {
    if (h.blight.cleared && !state.blights[sys]) {
      state.blights[sys] = { since: h.blight.since, need: h.blight.need };
      state.events = state.events.filter((e) => e.id !== h.blight.cleared);
      for (const e of state.events) if (h.blight.closed.includes(e.id)) e.active = true;
    } else if (state.blights[sys]) {
      state.blights[sys].need = Math.min(state.blights[sys].need + 1, BLIGHT_CLEAR);
    }
  }
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

// Focus sessions (pomodoros) add to a goal at the rate set on it (% per hour of focus). A goal with no
// rate still counts the round as a day worked, which grows its reward.
export function focusAmount(goal, mins) {
  return goal && goal.focusPerHour > 0 ? r2(goal.focusPerHour * mins / 60) : 0;
}
export function goalFocus(state, goal, mins, t, events) {
  if (!goalOpen(goal) || !goalStarted(goal, t)) return null;
  const amt = focusAmount(goal, mins);
  if (amt > 0) goalProgress(state, goal, amt, t, events);
  else (goal.log ||= []).push({ t, amt: 0, focus: mins });
  return amt;
}

// amount > 0 records a contribution (from a log, or from the linked task taskId);
// amount < 0 takes back today's matching contribution; 0 only re-checks the target.
// Returns true when this call meets the goal.
export function goalProgress(state, goal, amount, now, events, taskId = null) {
  if (!goalOpen(goal)) return false;
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
    goal.doneEvent = ev.id;
    state.events.push(ev);
    events.push(ev);
    return true;
  }
  return false;
}

// Undo a goal's completion: take back its reward and its landmark.
export function reopenGoal(state, goal) {
  if (!goal || !goal.done) return;
  const sys = CATS[goal.cat].sys;
  const r = goal.paid || goalReward(goal);
  state.res[sys] = Math.max(0, state.res[sys] - r.res);
  state.gen[sys] = Math.max(0, state.gen[sys] - r.gen);
  if (goal.doneEvent) state.events = state.events.filter((e) => e.id !== goal.doneEvent);
  delete goal.done; delete goal.paid; delete goal.doneEvent;
}

export function nextMilestone(state) {
  return MILESTONES.find((m) => !state.milestones[m.id]) || null;
}

export function milestoneProgress(state, m) {
  let p = 1;
  for (const k in m.req) p = Math.min(p, reqHave(state, k) / m.req[k]);
  return Math.max(0, Math.min(1, p));
}

export function forecast(state, now) {
  const m = nextMilestone(state);
  if (!m) return { text: 'The world flourishes. More eras to come.' };
  const r = rates(state, now);
  let hours = 0;
  for (const k of levelKeys(m)) {
    const need = m.req[k] - state.res[k];
    if (need <= 0) continue;
    if (r[k] <= 0.001) return { text: m.title + ' is stalled — ' + SYSTEMS[k].label + ' is not growing', m, stalled: k };
    hours = Math.max(hours, need / r[k]);
  }
  // goals can't be forecast: they're met when you meet them
  const goalsLeft = (m.req.goals || 0) - goalsMet(state);
  if (goalsLeft > 0) {
    const g = `${goalsLeft} more goal${goalsLeft === 1 ? '' : 's'} met`;
    return { text: hours > 0 ? `${m.title} in ~${fmtDuration(hours)}, and ${g}` : `${m.title} needs ${g}`, m, hours, goalsLeft };
  }
  return { text: m.title + ' in ~' + fmtDuration(hours) + ' at current pace', m, hours };
}

export function fmtDuration(h) {
  if (h < 1) return Math.max(1, Math.round(h * 60)) + ' min';
  if (h < 48) return Math.round(h) + ' h';
  return Math.round(h / 24) + ' days';
}

// What the globe shows. Each milestone adds something you can see; it goes away if the milestone is lost.
// In Era III, traffic (ships, planes, satellites) grows with Pop, and active blights distort their region.
export function visuals(state, now) {
  const c = (v) => Math.max(0, Math.min(1, v));
  const has = (id) => !!state.milestones[id];
  const r = state.res, pop = state.pop || 0;
  return {
    // Era I
    ice: c(1 - r.heat / 420),
    clouds: c(r.atmos / 420),
    sea: c(r.water / 700),
    green: has('green') ? c(r.life / 700) : 0,
    // Era II
    biomes: has('bloom'), // grasslands on the higher ground
    rivers: has('rivers') ? 0.5 + 0.5 * c((r.water - 650) / 1200) : 0,
    forest: has('forests') ? 0.45 + 0.55 * c((r.life - 1000) / 1500) : 0,
    weather: has('weather'), // turning storm systems
    creatures: has('creatures') ? Math.round(5 + 9 * c((r.life - 1600) / 1500)) : 0, // herds on the plains
    // Era III
    lights: has('settle') ? (has('cities') ? 0.55 + 0.45 * c((r.life - 2200) / 1500) : 0.25) : 0,
    cities: has('cities'),
    station: has('moon'), // Orbital Station
    elevator: has('ring'), // Space Elevator
    launches: has('stars'),
    // goals met this month: a moon each (two at most), and a ring for all three
    goalMoons: Math.min(2, goalsMetIn(state, monthKey(now))),
    goalRing: goalsMetIn(state, monthKey(now)) >= GOALS_PER_MONTH,
    ships: has('voyages') ? Math.round(Math.min(16, 3 + pop / 3000)) : 0,
    planes: has('cities') ? Math.round(Math.min(12, 1 + pop / 4000)) : 0,
    satellites: has('sat') ? Math.min(5, 1 + Math.floor(pop / 10000)) : 0,
    // blights
    dust: !!state.blights.atmos,
    cooling: !!state.blights.heat,
    wither: !!state.blights.life,
    blightAt: Object.keys(state.blights).map((k) => ({ lat: BLIGHTS[k].lat, lon: BLIGHTS[k].lon })),
  };
}

export function stats(state, now) {
  const days = 7;
  const out = { byCat: {}, tasks: [] };
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

