// First Steps: a short tour where every step is something you do in the real app, like LifeUp's starter tasks.
// A new world opens with a welcome card; older worlds get a one-time offer at the top of the task list.
// Progress lives in state.tutorial: { on, started, done: { stepId: time }, crust, offered, welcome, finished, rewarded }.
import { uid } from '../sim.js';
import { icon } from '../icons.js';
import { state, save } from './store.js';
import { $, esc, fmtPct, rewardText } from './util.js';
import { toast, ask } from './feedback.js';
import { renderAll } from './render.js';
import { setView, togglePanel } from './layout.js';
import { openTaskDlg, onTaskCheck } from './tasks.js';
import { openGoalDlg, canAddGoal } from './goals.js';
import { openSettings } from './settings.js';
import { setRightTab } from './history.js';

const FINISH_GAIN = 20; // added to every system the first time First Steps is finished
const phone = () => matchMedia('(max-width: 860px)').matches;

const STEPS = [
  { id: 'crust', name: 'Wake the crust', how: 'Check it off' },
  { id: 'task', name: 'Make a daily task', how: 'Done when you add one of your own', go: () => openTaskDlg(null) },
  { id: 'goal', name: 'Set a goal for this month', how: 'Done when you set one', go: goGoal },
  { id: 'link', name: 'Link a task to your goal', how: 'Done when a task counts toward a goal', go: goLink },
  { id: 'world', name: 'Visit the World panel', how: 'Systems, milestones and the forecast', go: goWorld },
  { id: 'settings', name: 'Check Settings', how: 'Reminders, and moving your world between devices', go: goSettings },
];

// The gold notes shown at the top of a dialog while its step is open.
const TIPS = {
  task: "Pick something you'd like to do every day. Its category decides which part of the planet it feeds. Its effect decides how: Steady builds slowly and lasts, Surge doubles for 12h, Catalyst is an instant boost, Stabilizer protects.",
  link: 'Under "Counts toward a goal", pick your goal and how much each check-off adds, like +2 km.',
  goal: 'Goals are monthly, and progress is a percentage. Name what you\'re working toward, like "Run 40 km". Every day you work on it, its reward grows.',
  settings: "Turn on the reminders you want. To play on another device, Export your world here and Import it there: work from both is kept. Close Settings when you're done.",
};

const LEARNED = [
  'Tasks feed Heat, Atmosphere and Life',
  'Four effects: Steady, Surge, Catalyst, Stabilizer',
  'Monthly goals, whose reward grows each day you work on them',
  'Tasks that count toward a goal',
  'The World panel: systems, milestones, forecast',
  'Settings: reminders, and moving your world between devices',
];

const tut = () => state.tutorial;
const current = () => STEPS.find((s) => !tut().done[s.id]);
export const tutorialOn = () => !!tut()?.on;

// ---------- starting, skipping, finishing ----------
export function startTutorial() {
  const now = Date.now();
  settingsTip = false; // closing Settings to restart doesn't count as the Settings step
  let crust = state.tasks.find((t) => t.tut && !state.history.some((h) => h.taskId === t.id));
  if (!crust) {
    crust = { id: uid(), name: 'Wake the crust', cat: 'PHYS', type: 'catalyst', recurring: false, created: now, tut: true };
    state.tasks.unshift(crust);
  }
  state.tutorial = { on: true, started: now, done: {}, crust: crust.id, offered: true, rewarded: tut()?.rewarded || null };
  // steps that are already true (say, a task already linked to a goal) tick quietly
  for (const s of STEPS) if (DONE_WHEN[s.id]?.(state.tutorial)) state.tutorial.done[s.id] = now;
  save();
  togglePanel('left', true);
  setView('tasks');
  renderAll();
  setTimeout(() => {
    showCoach({
      target: () => document.querySelector('#firstSteps .fs-now .check'), k: `FIRST STEPS · 1 OF ${STEPS.length}`,
      text: 'Tap the box to finish your first task. Physical tasks feed Heat. This one is a Catalyst: +15 right now.',
      actions: [{ label: 'SKIP TUTORIAL', run: confirmSkip }],
    });
  }, 60);
}

async function confirmSkip() {
  hideCoach();
  if (!(await ask({ title: 'SKIP FIRST STEPS?', body: 'You can start them again any time from Settings.', ok: 'SKIP' }))) return;
  const t = tut();
  Object.assign(t, { on: false, skipped: Date.now(), offered: true });
  // the starter task goes too, unless it was already checked off
  state.tasks = state.tasks.filter((x) => !x.tut || state.history.some((h) => h.taskId === x.id));
  save(); renderAll();
}

function finish() {
  const t = tut();
  if (!t?.on) return;
  t.on = false;
  t.finished = Date.now();
  const reward = !t.rewarded;
  if (reward) {
    for (const k of Object.keys(state.res)) state.res[k] += FINISH_GAIN;
    state.events.push({ id: uid(), kind: 'milestone', title: 'First Steps Taken', body: 'You learned how your world works.', t: Date.now(), lat: 0.8, lon: 5.6, links: [] });
    t.rewarded = Date.now();
  }
  hideCoach();
  save(); renderAll();
  $('#tutForm').innerHTML = `<h2 class="tut-done">${icon('star')} FIRST STEPS DONE</h2>
    <ul class="learned">${LEARNED.map((l) => `<li>${icon('check')}<span>${l}</span></li>`).join('')}</ul>
    <p class="hint">Also try the FOCUS timer at the top: focus rounds log time to a goal. And one more thing: miss two daily tasks in a category and a blight spawns and drains it. Two tasks of that kind clear it.</p>
    ${reward ? `<div class="chips"><span class="chip reward" style="--chip:var(--gold)">${icon('star')}+${FINISH_GAIN} to every system</span><span class="chip reward" style="--chip:var(--gold)">${icon('flag')}Landmark on the globe</span></div>` : ''}
    <div class="dlg-actions"><span class="spacer"></span><button type="submit" class="btn" value="ok">TO MY WORLD</button></div>`;
  $('#tutDlg').showModal();
}

// A brand-new world: name it, then begin First Steps or skip.
export function maybeWelcome() {
  if (!tut()?.welcome) return;
  const d = $('#tutDlg');
  $('#tutForm').innerHTML = `<h2>A COLD DESERT ROCK</h2>
    <p class="tut-p">This is your world. Every task you finish warms it, waters it and slowly wakes it up.</p>
    <label>Name your world<input id="tutName" maxlength="28" autocomplete="off" placeholder="Unnamed World" value="${state.name === 'Unnamed World' ? '' : esc(state.name)}"></label>
    <p class="hint">First Steps: six short tasks that teach the game by playing it. About five minutes.</p>
    <div class="dlg-actions"><button type="button" class="btn-ghost" id="tutSkip">SKIP</button><span class="spacer"></span><button type="submit" class="btn" value="begin">BEGIN</button></div>`;
  $('#tutSkip').addEventListener('click', () => d.close('skip'));
  d.returnValue = '';
  d.showModal();
  d.addEventListener('close', () => {
    const name = $('#tutName').value.trim();
    if (name) state.name = name.slice(0, 28);
    // closed without choosing: offer First Steps later with the banner
    state.tutorial = { offered: d.returnValue !== '' };
    if (d.returnValue === 'begin') startTutorial();
    else { save(); renderAll(); }
  }, { once: true });
}

// ---------- progress ----------
// Steps 1–4 tick themselves when their thing exists; World and Settings tick when you've looked.
const DONE_WHEN = {
  crust: (t) => state.history.some((h) => h.taskId === t.crust && h.t >= t.started),
  task: (t) => state.tasks.some((x) => !x.tut && x.created >= t.started),
  goal: (t) => state.goals.some((g) => g.created >= t.started),
  link: () => state.tasks.some((x) => !x.tut && x.goalId && state.goals.some((g) => g.id === x.goalId && !g.done && !g.missed)),
};

// Called by renderAll, so every change to the world is checked.
export function checkTutorial() {
  const t = tut();
  if (!t?.on) return;
  let last = null;
  for (const s of STEPS) if (!t.done[s.id] && DONE_WHEN[s.id]?.(t)) { t.done[s.id] = Date.now(); last = s.id; }
  if (!last) return;
  save();
  if (STEPS.every((s) => t.done[s.id])) setTimeout(finish, 400);
  else setTimeout(() => afterStep(last), 150);
}

function markDone(id) {
  const t = tut();
  if (!t?.on || t.done[id]) return;
  t.done[id] = Date.now();
  save();
  if (STEPS.every((s) => t.done[s.id])) { finish(); return; }
  if (phone()) setView('tasks');
  renderAll();
}

// One short note on what the finished step just did, pointing at it.
function afterStep(id) {
  const taskLi = (name) => [...document.querySelectorAll('#taskList .task')].find((li) => li.dataset.name === name);
  const k = 'NICE · STEP DONE';
  if (id === 'crust') {
    showCoach({ target: $('#globeWrap'), k: 'NICE · YOUR PLANET CHANGED', text: `Heat is now ${Math.floor(state.res.heat)}. At 120 the Polar Frost Melts, your first milestone. Everything you get done shows up out here.` });
  } else if (id === 'task') {
    const x = state.tasks.filter((t) => !t.tut).sort((a, b) => b.created - a.created)[0];
    setView('tasks');
    renderAll();
    showCoach({ target: () => taskLi(x.name), k, text: `"${x.name}" is on your list. Check it off whenever you do it, and the planet grows a little each time.` });
  } else if (id === 'goal') {
    setView('goals');
    showCoach({ target: () => document.querySelector('#goalList .goal'), k, text: 'The bar shows its %, and the line marks where it would be today if spread evenly over the month. Add progress with LOG, or let linked tasks do it.' });
  } else if (id === 'link') {
    const x = state.tasks.find((t) => !t.tut && t.goalId);
    const g = state.goals.find((y) => y.id === x.goalId);
    setView('tasks');
    renderAll();
    showCoach({ target: () => taskLi(x.name), k, text: `Now checking off "${x.name}" also adds +${fmtPct(x.goalAmt || 1)} to "${g.name}".` });
  }
}

// ---------- GO buttons ----------
function goGoal() {
  if (!canAddGoal()) { toast('Your goal slots are full, so this step counts as done'); markDone('goal'); return; }
  setView('goals');
  openGoalDlg(null);
}
function goLink() {
  if (!state.goals.some((g) => !g.done && !g.missed)) { toast('Set a goal first'); goGoal(); return; }
  const mine = state.tasks.filter((t) => !t.tut).sort((a, b) => b.created - a.created);
  openTaskDlg(mine.find((t) => !t.goalId) || mine[0] || null);
}
function goWorld() {
  if (phone()) setView('systems'); else togglePanel('right', true);
  setRightTab('systems');
  setTimeout(() => showCoach({
    target: $('#paneSystems'), k: `FIRST STEPS · ${STEPS.findIndex((s) => s.id === 'world') + 1} OF ${STEPS.length}`,
    text: 'Each system shows its level and how fast it grows. Tasks feed Heat, Atmosphere and Life; Water forms on its own after First Rain. Reach the numbers on the milestone road to change the planet. The forecast under the globe says when the next one lands.',
    actions: [{ label: 'GOT IT', primary: true, run: () => { hideCoach(); markDone('world'); } }],
  }), 80);
}
function goSettings() {
  openSettings();
  $('#settingsDlg').showModal();
}

let settingsTip = false;
$('#settingsDlg').addEventListener('close', () => {
  if (!settingsTip) return;
  settingsTip = false;
  markDone('settings');
});

// Puts the step's gold note at the top of a dialog (or removes it). For the task dialog,
// kind 'taskDlg' picks the Make or Link note; isNew says whether it's a new task.
export function setDialogTip(container, kind, isNew) {
  container.querySelector('.inline-coach')?.remove();
  const t = tut();
  if (!t?.on) return;
  if (kind === 'taskDlg') kind = isNew && !t.done.task ? 'task' : 'link';
  if (t.done[kind] || !TIPS[kind]) return;
  const el = document.createElement('div');
  el.className = 'inline-coach';
  el.innerHTML = `<span class="k">FIRST STEPS · ${STEPS.findIndex((s) => s.id === kind) + 1} OF ${STEPS.length}</span><p>${esc(TIPS[kind])}</p>`;
  (container.querySelector('.dlg-head') || container.querySelector('h2')).after(el);
  if (kind === 'settings') settingsTip = true;
}

// ---------- the First Steps group above the task list ----------
export function renderFirstSteps() {
  const box = $('#firstSteps');
  const t = tut();
  if (!t || (!t.on && !t.offered && !t.finished && !t.welcome)) {
    box.hidden = false;
    box.innerHTML = `<div class="fs-offer">
      <span class="fs-offer-t">${icon('star')}<span><b>FIRST STEPS</b><span class="how">A six-step tour of how the game works, with a small reward at the end.</span></span></span>
      <span class="fs-offer-acts"><button type="button" class="btn-sm" data-fs-no>NO THANKS</button><button type="button" class="go" data-fs-start>START</button></span></div>`;
    return;
  }
  if (!t.on) { box.hidden = true; box.innerHTML = ''; return; }
  const doneN = STEPS.filter((s) => t.done[s.id]).length;
  const open = STEPS.filter((s) => !t.done[s.id]);
  const now = current();
  const card = (s) => {
    const cls = s === now ? ' fs-now' : '';
    if (s.id === 'crust') {
      const task = state.tasks.find((x) => x.id === t.crust);
      if (!task) return '';
      return `<li class="task${cls}" style="--c:var(--heat)">
        <label class="check"><input type="checkbox" data-task="${task.id}" aria-label="Complete: ${esc(task.name)}"><span class="box">${icon('check')}</span></label>
        <span class="task-body"><span class="name">${esc(task.name)}</span>
          <span class="chips"><span class="chip reward">${icon('catalyst')}${rewardText('PHYS', 'catalyst')}</span><span class="chip tut">${icon('star')}First Steps</span></span></span>
        <span class="cat-ico" aria-hidden="true">${icon('heat')}</span></li>`;
    }
    return `<li class="task fs-step${cls}" style="--c:var(--gold)">
      <span class="task-body"><span class="name">${esc(s.name)}</span><span class="how">${esc(s.how)}</span></span>
      <button type="button" class="go" data-go="${s.id}">GO</button></li>`;
  };
  box.hidden = false;
  box.innerHTML = `<div class="fs-head">${icon('star')}<span class="label">FIRST STEPS</span><span class="n">${doneN} / ${STEPS.length}</span><button type="button" class="fs-skip" data-fs-skip>SKIP</button></div>
    <div class="fs-bar">${STEPS.map((s) => `<span${t.done[s.id] ? ' class="on"' : ''}></span>`).join('')}</div>
    <ul class="task-list">${open.slice(0, 3).map(card).join('')}</ul>
    ${open.length > 3 ? `<span class="more">+ ${open.length - 3} more step${open.length - 3 === 1 ? '' : 's'}</span>` : ''}`;
}

$('#firstSteps').addEventListener('change', onTaskCheck);
$('#firstSteps').addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) { hideCoach(); STEPS.find((s) => s.id === go.dataset.go).go(); return; }
  if (e.target.closest('[data-fs-skip]')) { confirmSkip(); return; }
  if (e.target.closest('[data-fs-start]')) { startTutorial(); return; }
  if (e.target.closest('[data-fs-no]')) { state.tutorial = { offered: true }; save(); renderFirstSteps(); }
});

// ---------- the coach bubble ----------
// A note pointing at one thing on screen, with everything else dimmed. Clicks still reach the app.
// The target can be a function that finds the element, since lists are redrawn and replace their elements.
let coachTarget = null;
const coachEl = () => (typeof coachTarget === 'function' ? coachTarget() : coachTarget);
function showCoach({ target, k, text, actions = [{ label: 'OK', primary: true, run: hideCoach }] }) {
  coachTarget = target || null;
  coachEl()?.scrollIntoView({ block: 'nearest' });
  $('#coachK').textContent = k;
  $('#coachText').textContent = text;
  $('#coachActs').innerHTML = actions.map((a, i) => `<button type="button" class="${a.primary ? 'btn' : 'btn-ghost'}" data-coach="${i}">${a.label}</button>`).join('');
  $('#coachActs').onclick = (e) => { const b = e.target.closest('[data-coach]'); if (b) actions[Number(b.dataset.coach)].run(); };
  $('#coach').hidden = false;
  placeCoach();
}
export function hideCoach() {
  coachTarget = null;
  $('#coach').hidden = true;
  $('#coachRing').hidden = true;
}

// Runs every frame while the bubble is up, so it follows its target through scrolling and resizing.
export function placeCoach() {
  const c = $('#coach');
  if (c.hidden) return;
  const ring = $('#coachRing');
  const vw = innerWidth, vh = innerHeight;
  const el = coachEl();
  const r = el?.isConnected ? el.getBoundingClientRect() : null;
  const visible = !!r && r.width > 0 && r.height > 0;
  ring.hidden = !visible;
  const w = Math.min(340, vw - 24);
  c.style.width = w + 'px';
  const h = c.offsetHeight;
  let left = (vw - w) / 2, top = (vh - h) / 2, dir = '';
  if (visible) {
    const pad = 4;
    Object.assign(ring.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    const cx = r.left + Math.min(r.width / 2, 60);
    left = Math.max(12, Math.min(vw - w - 12, r.left));
    if (r.bottom + 16 + h <= vh - 8) { top = r.bottom + 16; dir = 'up'; }
    else if (r.top - 16 - h >= 8) { top = r.top - 16 - h; dir = 'down'; }
    else top = vh - h - 12;
    c.style.setProperty('--ax', Math.max(12, Math.min(w - 26, cx - left - 6)) + 'px');
  }
  c.style.left = left + 'px';
  c.style.top = top + 'px';
  c.classList.toggle('up', dir === 'up');
  c.classList.toggle('down', dir === 'down');
}
