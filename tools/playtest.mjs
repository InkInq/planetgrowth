// Playtest simulation: simulated players use the real game rules (js/sim.js) for a year, to check pacing.
//
//   node tools/playtest.mjs                      three players, 40 runs each, 12 months
//   node tools/playtest.mjs --runs 100 --months 6
//   node tools/playtest.mjs --set CATACLYSM_HIT=0.15 --set STEADY_GAIN=0.08
//   node tools/playtest.mjs --sim /path/to/changed-sim.js
//
// --set changes a `const NAME = number` in sim.js for this run only (the file itself is untouched).
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const RUNS = +opt('runs', 40), MONTHS = +opt('months', 12);
const sets = args.flatMap((a, i) => (a === '--set' ? [args[i + 1]] : []));

// load sim.js, with any --set overrides applied to a temporary copy
const simPath = opt('sim', join(dirname(fileURLToPath(import.meta.url)), '..', 'js', 'sim.js')); // --sim: try a changed copy
let src = readFileSync(simPath, 'utf8');
for (const s of sets) {
  const [name, val] = s.split('=');
  const re = new RegExp(`((?:export )?const ${name} = )[\\d.]+`);
  if (!re.test(src)) throw new Error('No numeric const ' + name + ' in sim.js');
  src = src.replace(re, `$1${val}`);
}
const tmp = join(mkdtempSync(join(tmpdir(), 'pg-')), 'sim.js');
writeFileSync(tmp, src);
const sim = await import(pathToFileURL(tmp).href);
const { HOUR, DAY, MILESTONES, newState, advance, completeTask, monthKey, monthLastDay, uid } = sim;

// a small seeded random generator, so runs are repeatable
function rng(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
}

// What each player does. active: chance they open the app on a given day. done: chance each task
// gets done on a day they're active. goals: monthly goals set, each linked to one daily task, with a
// target of `aim` × the days left in the month (people size goals to their own pace).
const T = (name, cat, type) => ({ name, cat, type });
const PLAYERS = {
  casual: {
    active: 0.6, done: 0.65, goals: 1, aim: 0.3,
    tasks: [T('Walk', 'PHYS', 'steady'), T('Read', 'MIND', 'steady'), T('Call someone', 'LIFE', 'steady'), T('Plan the day', 'MIND', 'surge')],
  },
  steady: {
    active: 0.85, done: 0.82, goals: 2, aim: 0.6,
    tasks: [T('Stretch', 'PHYS', 'steady'), T('Walk outside', 'PHYS', 'catalyst'), T('Deep work', 'MIND', 'steady'), T('Read', 'MIND', 'surge'),
      T('Call a friend', 'LIFE', 'steady'), T('Sketch', 'LIFE', 'catalyst')],
  },
  dedicated: {
    active: 0.97, done: 0.93, goals: 3, aim: 0.8,
    tasks: [T('Stretch', 'PHYS', 'steady'), T('Run', 'PHYS', 'catalyst'), T('Deep work', 'MIND', 'steady'), T('Read', 'MIND', 'surge'),
      T('Journal', 'MIND', 'stabilizer'), T('Call a friend', 'LIFE', 'steady'), T('Practice guitar', 'LIFE', 'catalyst')],
  },
};
// the steady player, but away for two weeks in month 3 without opening the app
PLAYERS['steady, 2-week break'] = { ...PLAYERS.steady, away: [60, 74] };
const FINISH_GAIN = 20; // First Steps reward (ui/tutorial.js), assumed finished on day one

function playYear(player, seed) {
  const rand = rng(seed);
  const start = new Date(2026, 10, 1 + Math.floor(rand() * 28), 9).getTime(); // a random day in November
  const s = newState(start);
  s.tutorial = { welcome: false, rewarded: start };
  for (const k in s.res) s.res[k] += FINISH_GAIN;
  s.tasks = player.tasks.map((t) => ({ id: uid(), ...t, recurring: true, created: start }));
  const ev = [];
  const out = { firstAt: {}, lostTo: { cataclysm: 0, blight: 0 }, blightDays: 0, blights: 0, months: [], goalsSet: 0, goalsMet: 0, done: 0, due: 0 };
  const end = start + MONTHS * 30.44 * DAY;
  let goalMonth = null;

  for (let day = new Date(start); day.getTime() < end; day.setDate(day.getDate() + 1)) {
    const d0 = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
    const dayN = Math.round((d0 - start) / DAY);
    if (player.away && dayN >= player.away[0] && dayN < player.away[1]) continue; // app closed: nothing runs
    advance(s, d0 + 1, ev); // midnight: day rollover, blights, month's end
    // a new month: set this month's goals, each linked to a daily task
    const mk = monthKey(d0);
    if (mk !== goalMonth) {
      goalMonth = mk;
      const daysLeft = +monthLastDay(mk).slice(8) - day.getDate() + 1;
      const linkable = [...s.tasks].sort(() => rand() - 0.5).slice(0, player.goals);
      for (const t of linkable) {
        // goals are in %: each completion of the linked task adds 100 / (the times they aim for)
        const times = Math.max(3, Math.round(daysLeft * player.aim));
        const g = { id: uid(), name: 'Goal ' + t.name, target: 100, unit: '%', cat: t.cat, month: mk, deadline: monthLastDay(mk), current: 0, created: d0 };
        s.goals.push(g);
        t.goalId = g.id; t.goalAmt = 100 / times;
        out.goalsSet++;
      }
    }
    // the day: if they open the app, they do some of their tasks at random times
    const active = rand() < player.active;
    const times = s.tasks.map(() => d0 + (8 + rand() * 14) * HOUR).sort((a, b) => a - b);
    s.tasks.forEach((t, i) => {
      out.due++;
      if (!active || rand() >= player.done) return;
      advance(s, times[i], ev);
      completeTask(s, t, times[i], ev);
      out.done++;
    });
    advance(s, d0 + 23.9 * HOUR, ev);
    if (Object.keys(s.blights).length) out.blightDays++;
    for (const e of ev) {
      if (e.kind === 'milestone' && MILESTONES.some((m) => m.title === e.title)) {
        const m = MILESTONES.find((x) => x.title === e.title);
        out.firstAt[m.id] ??= (e.t - start) / DAY;
      }
      if (e.kind === 'blight') out.blights++;
      if (e.kind === 'lost') out.lostTo[ev.some((x) => x.kind === 'cataclysm' && x.t === e.t) ? 'cataclysm' : 'blight']++;
      if (e.kind === 'goal') out.goalsMet++;
    }
    ev.length = 0;
  }
  out.cataclysms = s.cataclysms;
  out.final = { res: s.res, pop: s.pop, held: Object.keys(s.milestones).length };
  return out;
}

const median = (xs) => { const a = xs.filter((x) => x != null).sort((p, q) => p - q); return a.length ? a[Math.floor(a.length / 2)] : null; };
const pct = (x) => Math.round(x * 100) + '%';
const days = (x) => (x == null ? '—' : x < 14 ? x.toFixed(1) + 'd' : (x / 7).toFixed(1) + 'wk');

console.log(`Playtest: ${RUNS} runs per player, ${MONTHS} months${sets.length ? ', with ' + sets.join(', ') : ''}\n`);
for (const [name, player] of Object.entries(PLAYERS)) {
  const runs = Array.from({ length: RUNS }, (_, i) => playYear(player, i * 7919 + 13));
  const n = runs.length;
  console.log(`== ${name.toUpperCase()}  (tasks done ${pct(runs.reduce((a, r) => a + r.done / r.due, 0) / n)}, goals met ${pct(runs.reduce((a, r) => a + r.goalsMet, 0) / Math.max(1, runs.reduce((a, r) => a + r.goalsSet, 0)))})`);
  console.log('  first reached (median, and share of runs that got there):');
  for (const m of MILESTONES) {
    const got = runs.filter((r) => r.firstAt[m.id] != null);
    console.log(`    ${m.title.padEnd(18)} ${days(median(got.map((r) => r.firstAt[m.id]))).padStart(7)}   ${pct(got.length / n)}`);
  }
  const cats = runs.flatMap((r) => r.cataclysms);
  const lostC = runs.reduce((a, r) => a + r.lostTo.cataclysm, 0) / n, lostB = runs.reduce((a, r) => a + r.lostTo.blight, 0) / n;
  console.log(`  month's ends: ${(cats.length / n).toFixed(1)} a run; milestones lost per run: ${lostC.toFixed(1)} to cataclysms, ${lostB.toFixed(1)} to blights; ${pct(cats.filter((c) => c.msLost.length).length / Math.max(1, cats.length))} of month's ends took one`);
  console.log(`  blights: ${(runs.reduce((a, r) => a + r.blights, 0) / n / MONTHS).toFixed(1)} a month; a blight was active on ${pct(runs.reduce((a, r) => a + r.blightDays, 0) / n / (MONTHS * 30.44))} of days`);
  console.log(`  Pop survival at month's end: median ${pct(median(cats.map((c) => c.survival)) || 0)}`);
  // month by month: milestones held and Pop just after each month's end (median across runs)
  const byMonth = [];
  for (let i = 0; i < MONTHS; i++) {
    const at = runs.map((r) => r.cataclysms[i]).filter(Boolean);
    if (!at.length) break;
    byMonth.push(`m${i + 1}: Pop ${Math.round(median(at.map((c) => c.popBefore)))}→${Math.round(median(at.map((c) => c.popAfter)))}, lost ${(at.reduce((a, c) => a + c.msLost.length, 0) / at.length).toFixed(2)}`);
  }
  console.log('  each month\'s end (median Pop before→after, avg milestones lost):');
  for (let i = 0; i < byMonth.length; i += 3) console.log('    ' + byMonth.slice(i, i + 3).join('   '));
  const lv = (i) => { const at = runs.map((r) => r.cataclysms[i]).filter(Boolean); return at.length ? `m${i + 1} ` + Object.keys(at[0].hit).map((k) => Math.round(median(at.map((c) => c.hit[k].before)))).join('/') : ''; };
  console.log('  levels just before month\'s end, heat/atmos/water/life (median): ' + [0, 1, 2, 5, 11].map(lv).filter(Boolean).join('   '));
  const fr = runs.map((r) => r.final);
  console.log(`  after ${MONTHS} months: milestones held ${median(fr.map((f) => f.held))}/${MILESTONES.length}, Pop ${Math.round(median(fr.map((f) => f.pop)))}, ` +
    Object.keys(fr[0].res).map((k) => `${k} ${Math.round(median(fr.map((f) => f.res[k])))}`).join(', '));
  console.log('');
}
