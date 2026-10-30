// Focus sessions (pomodoro). A session is 1–4 focus rounds with 5-minute breaks between. It's stored in state with
// timestamps, so it keeps counting through reloads and while the tab is in the background.
// Each finished round is logged to its goal (see goalFocus in sim.js) and to state.focusLog.
import { CATS, focusAmount, goalFocus, goalReward, goalStarted } from '../sim.js';
import { icon } from '../icons.js';
import { state, save, pending } from './store.js';
import { $, esc, fmtNum, fmtPct, fmtMins } from './util.js';
import { toast, announce, ask } from './feedback.js';
import { renderAll } from './render.js';
import { remindFocus } from './reminders.js';

const FOCUS_LENGTHS = [15, 25, 30, 45, 60];
const FOCUS_BREAK = 5;
const FOCUS_SOUND_KEY = 'planetgrowth-focus-sound';
const focusSel = { goalId: '', mins: 25, rounds: 1 };
let audioCtx = null;
const baseTitle = document.title;

const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const focusGoalsOpen = () => state.goals.filter((g) => !g.done && !g.missed && goalStarted(g, Date.now()));

function focusPlan(f) {
  const focusMs = f.mins * 60000, per = (f.mins + f.breakMins) * 60000;
  return { focusMs, per, total: f.rounds * focusMs + (f.rounds - 1) * f.breakMins * 60000 };
}
function focusPhase(f, now) {
  const p = focusPlan(f);
  const el = Math.max(0, Math.min((f.pausedAt ?? now) - f.startedAt - f.pausedTotal, p.total));
  const round = Math.min(f.rounds - 1, Math.floor(el / p.per));
  const into = el - round * p.per;
  const focusing = into < p.focusMs;
  return {
    ...p, el, round, focusing,
    left: focusing ? p.focusMs - into : p.per - into,
    phaseLen: focusing ? p.focusMs : p.per - p.focusMs,
    roundsDone: el >= p.focusMs ? Math.min(f.rounds, Math.floor((el - p.focusMs) / p.per) + 1) : 0,
    finished: el >= p.total,
  };
}
// What a round does for a goal, in words: "+5% to Run 40 km per round", or a day worked
function focusEffect(g, mins) {
  if (!g) return 'Just focus. Nothing is logged to a goal.';
  const amt = focusAmount(g, mins);
  return amt > 0 ? `+${fmtPct(amt)} to ${esc(g.name)} per round` : `Counts as a day worked on ${esc(g.name)}. To add progress too, set "Focus time adds" on the goal.`;
}

function chime(kind) {
  if (!$('#focusSound').checked) return;
  try {
    audioCtx ||= new AudioContext();
    const notes = kind === 'start' ? [523, 784] : [784, 659, 523];
    notes.forEach((hz, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain(), at = audioCtx.currentTime + i * 0.16;
      o.type = 'square'; o.frequency.value = hz;
      g.gain.setValueAtTime(0.05, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.15);
      o.connect(g).connect(audioCtx.destination); o.start(at); o.stop(at + 0.16);
    });
    navigator.vibrate?.(kind === 'start' ? 80 : [120, 60, 120]);
  } catch (e) { /* audio unavailable */ }
}

function logFocusRound(f, mins, t) {
  state.focusLog.push({ t, mins, goalId: f.goalId || null });
  const g = f.goalId && state.goals.find((x) => x.id === f.goalId);
  const before = g ? goalReward(g).res : 0;
  const amt = g ? goalFocus(state, g, mins, t, pending) : null;
  const grew = g && !g.done && goalReward(g).res > before ? ` · reward grew to +${goalReward(g).res}` : '';
  toast(`Focus round done · ${mins} min` + (g ? (amt > 0 ? ` · +${fmtPct(amt)} to ${g.name}` : ` on ${g.name}`) : '') + grew);
}

// Called every frame-ish: logs rounds that have ended, plays chimes, ends the session.
export function focusTick(now = Date.now()) {
  const f = state.focus;
  if (f) {
    const ph = focusPhase(f, now);
    let changed = false;
    while (f.logged < ph.roundsDone) {
      logFocusRound(f, f.mins, Math.min(now, f.startedAt + f.pausedTotal + f.logged * ph.per + ph.focusMs));
      f.logged++;
      changed = true;
      if (!ph.finished) { chime('end'); remindFocus(`Round ${f.logged} done. Take a ${f.breakMins}-minute break.`); }
    }
    const key = ph.round + (ph.focusing ? 'f' : 'b');
    if (f.phaseKey && f.phaseKey !== key && ph.focusing && !changed) { chime('start'); remindFocus(`Break's over. Round ${ph.round + 1} of ${f.rounds} has started.`); }
    f.phaseKey = key;
    if (ph.finished) {
      state.focus = null;
      chime('end');
      remindFocus(`Session complete · ${fmtMins(f.rounds * f.mins)} of focus.`);
      toast(`Focus session complete · ${fmtMins(f.rounds * f.mins)}`);
      changed = true;
    }
    if (changed) { save(); announce(pending); renderAll(); }
  }
  renderFocus(now);
}

export function renderFocus(now = Date.now()) {
  const f = state.focus;
  const pill = $('#focusPill');
  if (!f) {
    if ($('#focusPillText').textContent !== 'FOCUS') $('#focusPillText').textContent = 'FOCUS';
    if (pill.className !== 'pill focus-pill') pill.className = 'pill focus-pill';
    if (document.title !== baseTitle) document.title = baseTitle;
    if ($('#focusDlg').open && !$('#focusRun').hidden) showFocusSetup();
    return;
  }
  const ph = focusPhase(f, now);
  const paused = f.pausedAt != null;
  $('#focusPillText').textContent = (ph.focusing ? '' : 'BREAK ') + mmss(ph.left);
  pill.className = 'pill focus-pill running' + (ph.focusing ? '' : ' break') + (paused ? ' paused' : '');
  document.title = `${mmss(ph.left)} ${paused ? 'paused' : ph.focusing ? 'focus' : 'break'} · ${baseTitle}`;
  if (!$('#focusDlg').open || $('#focusRun').hidden) return;
  const g = f.goalId && state.goals.find((x) => x.id === f.goalId);
  $('#focusPhase').textContent = (paused ? 'PAUSED · ' : '') + (ph.focusing ? `FOCUS · ROUND ${ph.round + 1} OF ${f.rounds}` : `BREAK · ROUND ${ph.round + 2} NEXT`);
  $('#focusClock').textContent = mmss(ph.left);
  $('#focusRun').classList.toggle('break', !ph.focusing);
  $('#focusMeter .fill').style.width = (100 - ph.left / ph.phaseLen * 100) + '%';
  $('#focusDots').innerHTML = Array.from({ length: f.rounds }, (_, i) => `<span class="${i < f.logged ? 'done' : i === ph.round && ph.focusing ? 'now' : ''}"></span>`).join('');
  $('#focusGoalLine').innerHTML = g ? `<span style="--c:${CATS[g.cat].color}">${icon('flag')}</span>${focusEffect(g, f.mins)}` : 'No goal tagged';
  $('#focusPause').textContent = paused ? 'RESUME' : 'PAUSE';
  $('#focusSub').textContent = `${f.rounds} × ${f.mins} min`;
}

function showFocusSetup() {
  $('#focusSetup').hidden = false;
  $('#focusRun').hidden = true;
  $('#focusSub').textContent = '';
  const goals = focusGoalsOpen();
  if (focusSel.goalId && !goals.some((g) => g.id === focusSel.goalId)) focusSel.goalId = '';
  $('#focusGoals').querySelectorAll('.tile, .empty').forEach((el) => el.remove());
  $('#focusGoals').insertAdjacentHTML('beforeend', [{ id: '', name: 'No goal', cat: null }, ...goals].map((g) => `
    <label class="tile tile-row" style="--c:${g.cat ? CATS[g.cat].color : 'var(--muted)'}"><input type="radio" name="focusGoal" value="${g.id}"${g.id === focusSel.goalId ? ' checked' : ''}>
      <span class="ico">${icon(g.cat ? 'flag' : 'clock')}</span><span class="fg-text"><span class="t">${esc(g.name)}</span><span class="s" data-effect="${g.id}"></span></span></label>`).join('')
    + (goals.length ? '' : '<p class="hint empty">No goals running this month. Set one to log focus time toward it.</p>'));
  $('#focusLengths').innerHTML = FOCUS_LENGTHS.map((m) => `<button type="button" class="fchip" data-len="${m}" aria-pressed="${m === focusSel.mins}">${m} MIN</button>`).join('');
  $('#focusRounds').innerHTML = [1, 2, 3, 4].map((n) => `<button type="button" class="fchip" data-rounds="${n}" aria-pressed="${n === focusSel.rounds}">${n}×</button>`).join('');
  updateFocusPreview();
}
function updateFocusPreview() {
  const g = state.goals.find((x) => x.id === focusSel.goalId);
  $('#focusDlg').style.setProperty('--form-c', g ? CATS[g.cat].color : 'var(--accent)');
  $('#focusGoals').querySelectorAll('[data-effect]').forEach((el) => {
    const gg = state.goals.find((x) => x.id === el.dataset.effect);
    el.textContent = gg ? (focusAmount(gg, focusSel.mins) > 0 ? `+${fmtPct(focusAmount(gg, focusSel.mins))} per round` : 'Counts as a day worked') : 'Focus without logging';
  });
  const total = focusSel.rounds * focusSel.mins + (focusSel.rounds - 1) * FOCUS_BREAK;
  const ends = new Date(Date.now() + total * 60000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  $('#focusPreview').innerHTML = `<span class="label">${focusSel.rounds} × ${focusSel.mins} MIN · ${fmtMins(focusSel.rounds * focusSel.mins)} OF FOCUS · DONE AROUND ${ends.toUpperCase()}</span>
    <span class="pv-desc">${focusEffect(g, focusSel.mins)}.</span>`;
}

export function openFocus(goalId) {
  if (goalId !== undefined && !state.focus) focusSel.goalId = goalId;
  if (state.focus) { $('#focusSetup').hidden = true; $('#focusRun').hidden = false; } else showFocusSetup();
  $('#focusDlg').showModal();
  renderFocus();
}

$('#focusPill').addEventListener('click', () => openFocus());
$('#focusDlg').addEventListener('click', (e) => {
  const len = e.target.closest('[data-len]'), rounds = e.target.closest('[data-rounds]');
  if (len) focusSel.mins = Number(len.dataset.len);
  if (rounds) focusSel.rounds = Number(rounds.dataset.rounds);
  if (len || rounds) {
    $('#focusDlg').querySelectorAll('[data-len]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.len) === focusSel.mins)));
    $('#focusDlg').querySelectorAll('[data-rounds]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.rounds) === focusSel.rounds)));
    updateFocusPreview();
  }
});
$('#focusGoals').addEventListener('change', (e) => { focusSel.goalId = e.target.value; updateFocusPreview(); });
try { $('#focusSound').checked = localStorage.getItem(FOCUS_SOUND_KEY) !== 'off'; } catch (e) { /* storage unavailable */ }
$('#focusSound').addEventListener('change', (e) => { try { localStorage.setItem(FOCUS_SOUND_KEY, e.target.checked ? 'on' : 'off'); } catch (err) { /* ignore */ } });

$('#focusStart').addEventListener('click', () => {
  try { audioCtx ||= new AudioContext(); audioCtx.resume?.(); } catch (e) { /* audio unavailable */ }
  state.focus = { goalId: focusSel.goalId || null, mins: focusSel.mins, breakMins: FOCUS_BREAK, rounds: focusSel.rounds, startedAt: Date.now(), pausedAt: null, pausedTotal: 0, logged: 0 };
  save();
  $('#focusSetup').hidden = true;
  $('#focusRun').hidden = false;
  chime('start');
  renderFocus();
});
$('#focusPause').addEventListener('click', () => {
  const f = state.focus;
  if (!f) return;
  if (f.pausedAt != null) { f.pausedTotal += Date.now() - f.pausedAt; f.pausedAt = null; } else f.pausedAt = Date.now();
  save(); renderFocus();
});
$('#focusStop').addEventListener('click', async () => {
  const f = state.focus;
  if (!f) return;
  const ph = focusPhase(f, Date.now());
  const partial = ph.focusing ? Math.floor((ph.focusMs - ph.left) / 60000) : 0;
  let r;
  if (partial >= 1) r = await ask({ title: 'END SESSION?', body: `You've focused ${partial} min of this round. Log those minutes, or let the round go?`, ok: `LOG ${partial} MIN`, alt: 'DON’T LOG' });
  else r = (await ask({ title: 'END SESSION?', body: f.logged ? `The ${f.logged} finished round${f.logged === 1 ? ' is' : 's are'} already logged.` : 'Nothing has been logged yet.', ok: 'END SESSION' })) ? 'alt' : false;
  if (!r || !state.focus) return;
  if (r === true) logFocusRound(f, partial, Date.now());
  else toast('Focus session ended');
  state.focus = null;
  $('#focusDlg').close();
  save(); announce(pending); renderAll(); renderFocus();
});
