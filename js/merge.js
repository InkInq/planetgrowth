// Merging two saves of the same world, so you can play on two devices and keep the work from both.
// Lists are joined by id. When both saves changed the same thing, the save played most recently wins.
// Something deleted on one device stays deleted (saves remember deletions in state.deleted).
// Tasks finished only on the other device still count: their effect on the planet is added on top,
// goal progress logged on either device adds up, and goals the other device completed pay out here too.
import { CATS, dayKey, replayEffect, goalProgress, expireGoals } from './sim.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const ids = (xs) => new Set((xs || []).map((x) => x.id));
const histKey = (h) => h.taskId + '|' + h.t;
const logKey = (e) => [e.t, e.amt, e.task || '', e.focus || ''].join('|');
const focusKey = (f) => f.t + '|' + (f.goalId || '');

// Saves from the same world share its creation time; a different world can only be replaced.
export const sameWorld = (a, b) => !!a && !!b && a.created === b.created;

// Keeps everything in the newer list; adds what's only in the older one. An item that only one
// side has is dropped if the other side deleted it.
function joinById(newer, older, deletedByNewer, deletedByOlder) {
  const inNewer = ids(newer), inOlder = ids(older);
  return [
    ...(newer || []).filter((x) => inOlder.has(x.id) || !deletedByOlder[x.id]),
    ...(older || []).filter((x) => !inNewer.has(x.id) && !deletedByNewer[x.id]),
  ];
}

// Returns { state, added }: added counts what this device didn't have before.
export function mergeSaves(local, incoming, now) {
  const incomingNewer = (incoming.lastTick || 0) > (local.lastTick || 0);
  const out = clone(incomingNewer ? incoming : local);
  const old = clone(incomingNewer ? local : incoming);
  const delNew = out.deleted || {}, delOld = old.deleted || {};
  out.deleted = { ...delOld, ...delNew };
  const today = dayKey(now);

  // completions: every check-off from both devices
  const have = new Set((out.history || []).map(histKey));
  const extra = (old.history || []).filter((h) => !have.has(histKey(h)));
  out.history = [...(out.history || []), ...extra].sort((a, b) => a.t - b.t);

  // tasks (a one-off already done on an earlier day is archived, as the day rollover does)
  const archived = (x) => !x.recurring && out.history.some((h) => h.taskId === x.id && dayKey(h.t) < today);
  const before = ids(out.tasks);
  out.tasks = joinById(out.tasks, old.tasks, delNew, delOld).filter((x) => before.has(x.id) || !archived(x));

  // the other device's check-offs change the planet here too
  const allTasks = new Map([...(old.tasks || []), ...(out.tasks || [])].map((t) => [t.id, t]));
  for (const h of extra) {
    const task = allTasks.get(h.taskId);
    if (task && CATS[task.cat]) replayEffect(out, task, h.t, now);
  }

  // goals: progress logged on either device adds up
  const oldGoals = new Map((old.goals || []).map((g) => [g.id, g]));
  const goalsBefore = ids(out.goals);
  const dropEvents = new Set();
  out.goals = joinById(out.goals, old.goals, delNew, delOld);
  for (const g of out.goals) {
    const o = oldGoals.get(g.id);
    if (!goalsBefore.has(g.id)) {
      // a goal only the other device had: if it was met there, its reward lands here as well
      if (g.done && g.paid) { const sys = CATS[g.cat].sys; out.res[sys] += g.paid.res; out.gen[sys] += g.paid.gen; }
      continue;
    }
    if (!o) continue;
    const seen = new Set((g.log || []).map(logKey));
    const more = (o.log || []).filter((e) => !seen.has(logKey(e)));
    if (more.length) {
      g.log = [...(g.log || []), ...more].sort((a, b) => a.t - b.t);
      if (!g.done && !g.missed) g.current += more.reduce((n, e) => n + (e.amt || 0), 0);
    }
    if (o.done && !g.done && o.doneEvent) dropEvents.add(o.doneEvent); // paid again below if the target is met
    if (o.missed && !g.missed && !g.done) g.missed = o.missed;
  }

  // planet events (milestones, blights, landmarks)
  out.events = joinById(out.events, old.events, {}, {}).filter((e) => !dropEvents.has(e.id)).sort((a, b) => a.t - b.t);
  // milestones: reached on either device, unless this save lost it after the other reached it
  out.lost = { ...(old.lost || {}), ...(out.lost || {}) };
  for (const [id, t] of Object.entries(old.milestones || {})) {
    if (!out.milestones[id] && (out.lost[id] || 0) > t) continue;
    out.milestones[id] = Math.min(out.milestones[id] || Infinity, t);
  }
  // month's-end cataclysms: one per month; when both devices saw the same one, this save's is kept
  const months = new Set((out.cataclysms || []).map((c) => c.month));
  const dupCata = new Set((old.cataclysms || []).filter((c) => months.has(c.month)).map((c) => c.id));
  out.cataclysms = [...(out.cataclysms || []), ...(old.cataclysms || []).filter((c) => !dupCata.has(c.id))].sort((a, b) => a.t - b.t);
  out.events = out.events.filter((e) => !dupCata.has(e.id));
  if ((old.lastMonth || '') > (out.lastMonth || '')) out.lastMonth = old.lastMonth;

  // a goal that crosses its target with the combined progress is met now
  for (const g of out.goals) goalProgress(out, g, 0, now, []);

  // focus rounds and calendar
  const focusSeen = new Set((out.focusLog || []).map(focusKey));
  out.focusLog = [...(out.focusLog || []), ...(old.focusLog || []).filter((f) => !focusSeen.has(focusKey(f)))].sort((a, b) => a.t - b.t);
  const oldCal = new Map((old.cal || []).map((e) => [e.id, e]));
  out.cal = joinById(out.cal, old.cal, delNew, delOld);
  for (const ev of out.cal) {
    const o = oldCal.get(ev.id);
    if (o && o.skip?.length) ev.skip = [...new Set([...(ev.skip || []), ...o.skip])];
  }

  out.created = Math.min(out.created, old.created);
  if (out.tutorial || old.tutorial) {
    out.tutorial = { ...(old.tutorial || {}), ...(out.tutorial || {}) };
    out.tutorial.rewarded ||= old.tutorial?.rewarded || null;
  }
  expireGoals(out, now);
  const mine = new Set((local.history || []).map(histKey));
  const added = {
    done: out.history.filter((h) => !mine.has(histKey(h))).length,
    tasks: out.tasks.filter((x) => !ids(local.tasks).has(x.id)).length,
    goals: out.goals.filter((g) => !ids(local.goals).has(g.id)).length,
    events: out.cal.filter((e) => !ids(local.cal).has(e.id)).length,
  };
  return { state: out, added };
}
