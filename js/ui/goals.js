// The Goals tab: monthly goals, logging progress, and the new/edit goal dialog.
// Each goal belongs to this month or next, is due on that month's last day, max 3 per month.
import {
  CATS, DAY, dayKey, uid, goalProgress, reopenGoal, GOALS_PER_MONTH, GOAL_REWARD, goalReward,
  monthKey, monthAfter, monthLastDay, monthStart, goalsInMonth, openGoals,
} from '../sim.js';
import { icon } from '../icons.js';
import { state, save, pending, markDeleted } from './store.js';
import { $, esc, fmtNum, fmtDate, monthName, sysShort, catTiles } from './util.js';
import { toast, announce, floatReward, ask } from './feedback.js';
import { renderAll } from './render.js';
import { setView, syncFab } from './layout.js';
import { openFocus } from './focus.js';
import { setDialogTip } from './tutorial.js';

const activeGoals = () => openGoals(state);
const goalDaysLeft = (g, now) => Math.ceil((new Date(g.deadline + 'T23:59:59') - now) / DAY);
const goalMonths = (now = Date.now()) => { const cur = monthKey(now); return [cur, monthAfter(cur)]; };
const monthRoom = (mk, exceptId) => GOALS_PER_MONTH - goalsInMonth(state, mk).filter((g) => g.id !== exceptId).length;
export const canAddGoal = () => goalMonths().some((mk) => monthRoom(mk) > 0);

function goalCard(g, now) {
  const c = CATS[g.cat];
  const pct = Math.min(100, g.current / g.target * 100);
  const left = goalDaysLeft(g, now);
  const remain = Math.max(0, g.target - g.current);
  const started = monthStart(g.month) <= now;
  // a goal for next month counts its pace over the whole month
  const days = started ? left : Math.round((new Date(g.deadline + 'T23:59:59') - monthStart(g.month)) / DAY);
  const dueCls = left <= 3 ? 'streak' : 'muted';
  const r = goalReward(g);
  const today = (g.log || []).some((e) => dayKey(e.t) === dayKey(now));
  const feeders = state.tasks.filter((t) => t.goalId === g.id);
  const dueText = !started ? `${monthName(g.month)} · starts in ${Math.ceil((monthStart(g.month) - now) / DAY)}d`
    : left <= 0 ? `${monthName(g.month)} · due today` : `${monthName(g.month)} · ${left}d left`;
  const pace = days > 0 && remain > 0 ? `${fmtNum(remain / days)} ${esc(g.unit)}/day` : '';
  return `<li class="goal" style="--c:${c.color}">
    <button type="button" class="goal-body" data-editgoal="${g.id}">
      <span class="goal-top"><span class="name">${esc(g.name)}</span><span class="cat-ico" aria-hidden="true">${icon(c.sys)}</span></span>
      <span class="goal-nums"><span class="cur">${fmtNum(g.current)}</span><span class="of">/ ${fmtNum(g.target)} ${esc(g.unit)}</span><span class="pct">${Math.floor(pct)}%</span></span>
      <span class="meter"><span class="fill" style="width:${pct}%"></span></span>
      <span class="chips">
        <span class="chip ${dueCls}">${icon('clock')}${dueText}</span>
        ${pace ? `<span class="chip muted" title="Needed per day to finish on time">${icon('steady')}${pace}</span>` : ''}
      </span>
      <span class="goal-pot" title="Paid when you meet the goal. Grows +${GOAL_REWARD.dayRes} for each day you work on it; lost if the month ends first.">
        <span class="pot-head">${icon('star')}<span class="pot-v">+${r.res} ${sysShort(g.cat)} · +${r.gen}/h</span><span class="pot-k">REWARD · ${r.days} DAY${r.days === 1 ? '' : 'S'} WORKED</span></span>
        <span class="pot-today${today ? ' on' : ''}">${today ? icon('check') + `Worked today · reward grew +${GOAL_REWARD.dayRes}` : started ? `Work on it today to grow it +${GOAL_REWARD.dayRes}` : `Starts growing ${monthName(g.month)} 1`}</span>
      </span>
      ${feeders.length ? `<span class="fed-by">Fed by ${feeders.map((t) => `${esc(t.name)} <b>+${fmtNum(t.goalAmt || 1)}</b>`).join(', ')}</span>` : ''}
    </button>
    ${started ? '' : `<div class="goal-later">${icon('clock')}Logging opens ${monthName(g.month)} 1</div>`}
    <div class="goal-log"${started ? '' : ' hidden'}>
      <button type="button" class="step" data-step="-1" data-goal="${g.id}" aria-label="Less">${icon('minus')}</button>
      <input type="number" step="any" min="0" value="1" inputmode="decimal" data-amt="${g.id}" aria-label="Amount to log for ${esc(g.name)}">
      <button type="button" class="step" data-step="1" data-goal="${g.id}" aria-label="More">${icon('plus')}</button>
      <button type="button" class="btn-sm focus-go" data-focus="${g.id}" title="Start a focus session for this goal">${icon('clock')}FOCUS</button>
      <button type="button" class="btn-log" data-log="${g.id}">LOG</button>
    </div>
  </li>`;
}

export function renderGoals() {
  const now = Date.now();
  const [cur, next] = goalMonths(now);
  const open = activeGoals();
  const past = state.goals.filter((g) => g.done || g.missed).sort((a, b) => (b.done || b.missed) - (a.done || a.missed));
  const curCount = goalsInMonth(state, cur).length;
  $('#goalCount').textContent = curCount + '/' + GOALS_PER_MONTH;
  $('#addGoalBtn').disabled = !canAddGoal();
  $('#addGoalBtn').textContent = canAddGoal() ? '+ SET GOAL' : 'THIS MONTH AND NEXT ARE FULL';
  const slotRow = (mk, label) => {
    const gs = goalsInMonth(state, mk);
    return `<div class="day-head"><span class="label">${monthName(mk).toUpperCase()} · ${label}</span><span class="day-count">${gs.length} / ${GOALS_PER_MONTH}</span></div>
      <div class="slots">${Array.from({ length: GOALS_PER_MONTH }, (_, i) => {
        const g = gs[i];
        return g ? `<span class="slot used${g.done ? ' done' : ''}" style="--c:${CATS[g.cat].color}" title="${esc(g.name)}">${icon(g.done ? 'star' : 'flag')}</span>` : '<span class="slot"></span>';
      }).join('')}</div>`;
  };
  const left = Math.ceil((new Date(monthLastDay(cur) + 'T23:59:59') - now) / DAY);
  $('#goalSummary').innerHTML = slotRow(cur, left <= 1 ? 'LAST DAY' : left + ' DAYS LEFT')
    + (goalsInMonth(state, next).length || curCount >= GOALS_PER_MONTH ? slotRow(next, 'PLAN AHEAD') : '');
  const ofMonth = (mk) => open.filter((g) => g.month === mk).map((g) => goalCard(g, now)).join('');
  let html = ofMonth(cur);
  if (!open.length) html += `<li class="empty">Set up to ${GOALS_PER_MONTH} goals a month. Each holds a reward that grows every day you work on it, paid when you meet the goal.</li>`;
  if (open.some((g) => g.month === next)) html += `<li class="list-label label">${monthName(next).toUpperCase()}</li>` + ofMonth(next);
  if (past.length) {
    html += `<li class="list-label label">PAST GOALS · ${past.filter((g) => g.done).length} MET · ${past.filter((g) => g.missed).length} MISSED</li>` + past.map((g) => `
      <li class="achieved${g.missed ? ' missed' : ''}" style="--c:${CATS[g.cat].color}">${icon(g.done ? 'star' : 'close')}<span class="name">${esc(g.name)}</span>
        <span class="meta">${g.done ? `paid +${(g.paid || goalReward(g)).res} · ${fmtDate(g.done)}` : `lost +${goalReward(g).res} · ${fmtNum(g.current)}/${fmtNum(g.target)} · ${monthName(g.month, 'short')}`}</span></li>`).join('');
  }
  $('#goalList').innerHTML = html;
  syncFab();
}

// ---------- logging progress ----------
$('#goalList').addEventListener('click', (e) => {
  const step = e.target.closest('[data-step]');
  if (step) {
    const inp = document.querySelector(`[data-amt="${step.dataset.goal}"]`);
    inp.value = fmtNum(Math.max(0, (parseFloat(inp.value) || 0) + Number(step.dataset.step)));
    return;
  }
  const log = e.target.closest('[data-log]');
  if (log) { logGoal(log); return; }
  const focus = e.target.closest('[data-focus]');
  if (focus) { openFocus(focus.dataset.focus); return; }
  const edit = e.target.closest('[data-editgoal]');
  if (edit) openGoalDlg(state.goals.find((x) => x.id === edit.dataset.editgoal));
});
$('#goalList').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.dataset.amt) document.querySelector(`[data-log="${e.target.dataset.amt}"]`).click();
});

function logGoal(btn) {
  const g = state.goals.find((x) => x.id === btn.dataset.log);
  const amt = parseFloat(document.querySelector(`[data-amt="${g.id}"]`).value) || 0;
  if (amt <= 0) { toast('Enter an amount to log'); return; }
  floatReward(btn, '+' + fmtNum(amt) + ' ' + g.unit, CATS[g.cat].color);
  const before = goalReward(g).res;
  const met = goalProgress(state, g, amt, Date.now(), pending);
  const undo = () => {
    if (met && g.done) reopenGoal(state, g);
    goalProgress(state, g, -amt, Date.now(), []);
    save(); renderAll();
  };
  if (met) {
    // our own toast (with undo) stands in for the usual "goal complete" one
    const i = pending.findIndex((e) => e.kind === 'goal');
    if (i >= 0) pending.splice(i, 1);
    toast(`★ ${g.name} complete · +${g.paid.res} ${sysShort(g.cat)}`, { label: 'UNDO', run: undo });
  } else {
    const after = goalReward(g).res;
    toast(`Logged ${fmtNum(amt)} ${g.unit}` + (after > before ? ` · reward grew to +${after}` : ` · ${g.name}`), { label: 'UNDO', run: undo });
  }
  save(); announce(pending); renderAll();
}

// ---------- goal dialog: add + edit, month picker (this month or next), live preview ----------
$('#goalCatPicker').insertAdjacentHTML('beforeend', catTiles());

let editingGoalId = null;
const goalForm = $('#goalForm');
const gField = (n) => goalForm.elements.namedItem(n);
const pickedMonth = () => goalForm.querySelector('[name="month"]:checked')?.value;

function renderMonthPicker(g) {
  const now = Date.now();
  const want = g ? g.month : goalMonths(now).find((mk) => monthRoom(mk) > 0);
  $('#goalMonthPicker').querySelectorAll('.tile').forEach((t) => t.remove());
  $('#goalMonthPicker').insertAdjacentHTML('beforeend', goalMonths(now).map((mk, i) => {
    const room = monthRoom(mk, g?.id);
    const due = new Date(monthLastDay(mk) + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const left = Math.ceil((new Date(monthLastDay(mk) + 'T23:59:59') - now) / DAY);
    const when = i === 0 ? (left <= 1 ? 'Last day' : `${left} days left`) : `Starts ${new Date(monthStart(mk)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    return `<label class="tile"><input type="radio" name="month" value="${mk}"${mk === want ? ' checked' : ''}${room > 0 ? '' : ' disabled'}>
      <span class="t">${monthName(mk).toUpperCase()}</span><span class="s">${when} · due ${due}</span>
      <span class="s">${room > 0 ? `${GOALS_PER_MONTH - room}/${GOALS_PER_MONTH} set` : 'Full · 3/3 set'}</span></label>`;
  }).join(''));
}

function updateGoalPreview() {
  const cat = goalForm.querySelector('[name="cat"]:checked').value;
  goalForm.style.setProperty('--form-c', CATS[cat].color);
  const target = parseFloat(gField('target').value);
  const current = editingGoalId ? parseFloat(gField('current').value) || 0 : 0;
  const unit = gField('unit').value.trim();
  const mk = pickedMonth();
  const end = mk ? new Date(monthLastDay(mk) + 'T23:59:59').getTime() : 0;
  const days = mk ? Math.max(1, Math.ceil((end - Math.max(Date.now(), monthStart(mk))) / DAY)) : 0;
  const remain = target - current;
  const pace = !(target > 0) || !days ? 'Set a target to see the pace.'
    : remain <= 0 ? 'Target already met.'
    : `About ${fmtNum(remain / days)}${unit ? ' ' + esc(unit) : ''} a day over ${days} days of ${monthName(mk)}.`;
  const g = editingGoalId && state.goals.find((x) => x.id === editingGoalId);
  const r = g ? goalReward(g) : goalReward({});
  $('#goalPreview').innerHTML = `<span class="label">REWARD ${g ? 'SO FAR · ' + r.days + ' DAY' + (r.days === 1 ? '' : 'S') + ' WORKED' : 'TO START'}</span>
    <span class="chip reward">${icon('star')}+${r.res} ${sysShort(cat)}</span>
    <span class="chip reward">${icon('steady')}+${r.gen}/h lasting</span>
    <span class="chip reward">${icon('flag')}Landmark</span>
    <span class="pv-desc">Grows +${GOAL_REWARD.dayRes} and +${GOAL_REWARD.dayGen}/h for every day you work on it. Paid when you meet the goal; lost if the month ends first. ${pace}</span>`;
}
goalForm.addEventListener('input', updateGoalPreview);
goalForm.addEventListener('change', updateGoalPreview);

export function openGoalDlg(g) {
  goalForm.reset();
  editingGoalId = g ? g.id : null;
  $('#goalDlgTitle').textContent = g ? 'EDIT GOAL' : 'NEW GOAL';
  $('#goalSubmit').textContent = g ? 'SAVE' : 'SET GOAL';
  $('#goalAbandon').hidden = !g;
  $('#goalProgressRow').hidden = !g;
  renderMonthPicker(g);
  if (g) {
    gField('name').value = g.name;
    gField('target').value = g.target;
    gField('unit').value = g.unit;
    gField('current').value = fmtNum(g.current);
    goalForm.querySelector(`[name="cat"][value="${g.cat}"]`).checked = true;
  }
  setDialogTip(goalForm, g ? '' : 'goal');
  updateGoalPreview();
  $('#goalDlg').showModal();
}

goalForm.addEventListener('submit', (e) => {
  const f = new FormData(e.target);
  const g = editingGoalId && state.goals.find((x) => x.id === editingGoalId);
  const data = {
    name: String(f.get('name')).trim(), target: parseFloat(f.get('target')), unit: String(f.get('unit')).trim(),
    cat: f.get('cat'), month: String(f.get('month') || ''),
  };
  // the month must be this month or next, with a free slot (full months are disabled in the picker)
  if (!goalMonths().includes(data.month) || monthRoom(data.month, g?.id) <= 0) { e.preventDefault(); return; }
  data.deadline = monthLastDay(data.month);
  if (g) {
    Object.assign(g, data);
    g.current = Math.max(0, parseFloat(f.get('current')) || 0);
    goalProgress(state, g, 0, Date.now(), pending); // completes it if the target is now met
    if (!g.done) toast('Goal updated');
  } else {
    state.goals.push({ id: uid(), ...data, current: 0, created: Date.now() });
  }
  editingGoalId = null;
  save(); announce(pending); renderAll();
  setView('goals');
});

$('#goalAbandon').addEventListener('click', async () => {
  const g = state.goals.find((x) => x.id === editingGoalId);
  if (!g) return;
  if (!(await ask({ title: 'ABANDON GOAL?', body: `"${g.name}" and its progress (${fmtNum(g.current)} ${g.unit}) will be lost, along with its +${goalReward(g).res} reward. Its ${monthName(g.month)} slot frees up.`, ok: 'ABANDON', danger: true }))) return;
  state.goals = state.goals.filter((x) => x.id !== editingGoalId);
  markDeleted(editingGoalId);
  for (const t of state.tasks) if (t.goalId === editingGoalId) delete t.goalId; // unlink its tasks
  editingGoalId = null;
  $('#goalDlg').close();
  save(); renderAll();
});
