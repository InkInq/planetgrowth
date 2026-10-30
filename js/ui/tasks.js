// The Daily tab: the task list, checking tasks off, and the new/edit task dialog.
import { CATS, TYPES, BLIGHTS, DAY, completeTask, uncompleteTask, isDoneToday, uid, dayKey, goalStarted } from '../sim.js';
import { icon } from '../icons.js';
import { state, save, pending, markDeleted } from './store.js';
import { $, esc, fmtNum, monthName, rewardText, catTiles } from './util.js';
import { toast, announce, floatReward, ask } from './feedback.js';
import { renderAll } from './render.js';
import { setView, togglePanel } from './layout.js';
import { setDialogTip } from './tutorial.js';

let catFilter = 'ALL';

const FLOAT_TEXT = { steady: '+0.06/h', surge: '×2', catalyst: '+15', stabilizer: 'HOLD' };

// "taskId|day" for every completion, so per-day lookups are cheap.
export function historyIndex() {
  const s = new Set();
  for (const h of state.history) s.add(h.taskId + '|' + dayKey(h.t));
  return s;
}

// Badge on a task that feeds a goal: "Run 50 km +5 km"
function goalBadge(t) {
  const g = linkedGoal(t);
  if (!g) return '';
  const later = !goalStarted(g, Date.now());
  return `<span class="chip${later ? ' muted' : ''}" style="--chip:${CATS[g.cat].color}" title="${later ? 'Starts counting ' + monthName(g.month) + ' 1' : 'Each completion adds to this goal'}">${icon('flag')}${esc(g.name)} +${fmtNum(t.goalAmt || 1)} ${esc(g.unit)}</span>`;
}
const linkedGoal = (t) => { const g = t.goalId && state.goals.find((x) => x.id === t.goalId); return g && !g.done && !g.missed ? g : null; };

function taskCard(t, done) {
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
        ${blight ? `<span class="chip blight">${icon('warn')}${BLIGHTS[c.sys].title}</span>` : ''}
        ${goalBadge(t)}
      </span>
    </button>
    <span class="cat-ico" aria-hidden="true">${icon(c.sys)}</span>
  </li>`;
}

export function renderTasks() {
  const now = Date.now();
  const idx = historyIndex();
  const today = dayKey(now);
  const isDone = (t) => idx.has(t.id + '|' + today);
  const all = state.tasks.filter((t) => !t.tut); // First Steps tasks show in their own group
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
  let html = open.map((t) => taskCard(t, false)).join('');
  if (!open.length) html += `<li class="empty">${shown.length ? 'All done here today. The planet thanks you.' : 'No ' + CATS[catFilter].label + ' tasks yet.'}</li>`;
  if (done.length) html += `<li class="list-label label">DONE TODAY · ${done.length}</li>` + done.map((t) => taskCard(t, true)).join('');
  ul.innerHTML = html;
}

// Shows a task in the list and flashes it (from a globe marker or the History tab).
export function jumpToTask(text) {
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

// ---------- checking off, filtering ----------
// Checking or unchecking any task box (also used by the First Steps group).
export function onTaskCheck(e) {
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
}
$('#taskList').addEventListener('change', onTaskCheck);
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

// ---------- task dialog: tile pickers, live reward preview, add + edit ----------
const TYPE_SHORT = { steady: '+0.06/h, lasting', surge: '×2 for 12h', catalyst: '+15 right now', stabilizer: 'No drain for 24h' };
$('#catPicker').insertAdjacentHTML('beforeend', catTiles());
$('#typePicker').insertAdjacentHTML('beforeend', Object.entries(TYPES).map(([k, t], i) => `
  <label class="tile"><input type="radio" name="type" value="${k}"${i ? '' : ' checked'}>
    <span class="ico">${icon(k)}</span><span class="t">${t.label.toUpperCase()}</span><span class="s">${TYPE_SHORT[k]}</span></label>`).join(''));

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

export function openTaskDlg(task) {
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
  setDialogTip(taskForm, 'taskDlg', !task);
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
  markDeleted(editingId);
  editingId = null;
  $('#taskDlg').close();
  save(); renderAll();
});
