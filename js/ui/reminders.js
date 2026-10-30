// Reminders: daily tasks, blight warnings, goal deadlines and focus rounds. Each kind can be turned on or off.
// A web app can only remind you while it's open (a background tab counts), so the app checks every so often.
// When it's in front, reminders show as toasts instead, which also covers what came due while it was closed.
// Nothing is shown until notifications are allowed. Settings live on this device only, like the theme.
import { CATS, BLIGHTS, DAY, dayKey, monthKey, goalStarted } from '../sim.js';
import { state } from './store.js';
import { $, fmtNum, fmtPct } from './util.js';
import { toast } from './feedback.js';

const KEY = 'planetgrowth-reminders';
const BLIGHT_WARN_HOUR = 21; // evening check: would a blight spawn overnight?
const GOAL_REMIND_HOUR = 9;
const DEFAULTS = { daily: true, dailyTime: '20:00', blight: true, goals: false, goalDays: 3, focus: true, sent: {} };

function loadPrefs() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { return { ...DEFAULTS }; }
}
const prefs = loadPrefs();
function savePrefs() { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) { /* storage unavailable */ } }

const supported = () => 'Notification' in window;
const allowed = () => supported() && Notification.permission === 'granted';

// Shows one reminder: a toast when the app is in front, a system notification otherwise.
async function deliver(title, body, tag) {
  if (document.visibilityState === 'visible' && document.hasFocus()) { toast(title + ' · ' + body); return; }
  const opts = { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) { await reg.showNotification(title, opts); return; }
  } catch (e) { /* fall back below */ }
  try { new Notification(title, opts); } catch (e) { toast(title + ' · ' + body); } // Android needs the service worker
}

// Sends each reminder at most once per day (or once per blight), however often this runs.
function once(key, day, fn) {
  if (prefs.sent[key] === day) return;
  prefs.sent[key] = day;
  fn();
}

const minutesNow = (d) => d.getHours() * 60 + d.getMinutes();
const toMinutes = (hhmm) => { const [h, m] = String(hhmm || '20:00').split(':').map(Number); return (h || 0) * 60 + (m || 0); };

export function checkReminders(now = Date.now()) {
  if (!allowed()) return;
  const d = new Date(now), today = dayKey(now), mins = minutesNow(d);
  const doneToday = new Set(state.history.filter((h) => dayKey(h.t) === today).map((h) => h.taskId));
  const daily = state.tasks.filter((t) => t.recurring && !t.tut && dayKey(t.created) <= today);
  const left = daily.filter((t) => !doneToday.has(t.id));
  const queue = [];

  if (prefs.daily && mins >= toMinutes(prefs.dailyTime) && left.length) {
    once('daily', today, () => queue.push(['Daily tasks', `${left.length} left today: ${left.slice(0, 3).map((t) => t.name).join(', ')}${left.length > 3 ? '…' : ''}`, 'daily']));
  }

  if (prefs.blight) {
    // a blight draining right now (once per blight)
    for (const [sys, b] of Object.entries(state.blights)) {
      const cat = Object.keys(CATS).find((c) => CATS[c].sys === sys);
      once('blight-' + sys + '-' + b.since, 'sent', () => queue.push([BLIGHTS[sys].title, `It's draining ${sys === 'heat' ? 'Heat' : sys === 'atmos' ? 'Atmosphere' : 'Life'}. ${b.need} ${CATS[cat].label} task${b.need === 1 ? '' : 's'} will clear it.`, 'blight-' + sys]));
    }
    // in the evening: would missing today's tasks spawn one overnight? (same rule as the day rollover)
    if (d.getHours() >= BLIGHT_WARN_HOUR) {
      for (const [cat, c] of Object.entries(CATS)) {
        if (state.blights[c.sys]) continue;
        const ofCat = daily.filter((t) => t.cat === cat);
        const missed = ofCat.filter((t) => !doneToday.has(t.id));
        const threshold = Math.min(2, ofCat.length);
        if (threshold > 0 && missed.length >= threshold) {
          once('warn-' + cat, today, () => queue.push([`${BLIGHTS[c.sys].title} tonight?`, `${missed.length} ${c.label} task${missed.length === 1 ? '' : 's'} left. Finish ${missed.length - threshold + 1} to stop a blight spawning overnight.`, 'warn-' + cat]));
        }
      }
    }
  }

  if (prefs.goals && d.getHours() >= GOAL_REMIND_HOUR) {
    for (const g of state.goals) {
      if (g.done || g.missed || g.month !== monthKey(now) || !goalStarted(g, now)) continue;
      const daysLeft = Math.ceil((new Date(g.deadline + 'T23:59:59') - now) / DAY);
      if (daysLeft > prefs.goalDays) continue;
      const remain = Math.max(0, 100 - g.current);
      once('goal-' + g.id, today, () => queue.push([g.name, `${fmtPct(g.current)} done, ${daysLeft <= 1 ? 'last day' : daysLeft + ' days left'}. About ${fmtPct(remain / Math.max(1, daysLeft))} a day to make it.`, 'goal-' + g.id]));
    }
  }

  if (!queue.length) return;
  savePrefs();
  queue.forEach(([title, body, tag], i) => setTimeout(() => deliver(title, body, tag), i * 3200));
}

// Called by the focus timer when a round or break ends. Only while you're looking elsewhere: in front, the chime does it.
export function remindFocus(text) {
  if (!allowed() || !prefs.focus || document.visibilityState === 'visible' && document.hasFocus()) return;
  deliver('Focus', text, 'focus');
}

// ---------- the Reminders section in Settings ----------
export function renderReminderSettings() {
  const st = !supported() ? "This browser can't show notifications."
    : Notification.permission === 'granted' ? 'Notifications are allowed.'
    : Notification.permission === 'denied' ? 'Notifications are blocked. Allow them for this site in your browser settings.'
    : 'Not allowed yet. Reminders stay off until you allow them.';
  $('#notifyStatus').textContent = st;
  $('#notifyAllow').hidden = !supported() || Notification.permission !== 'default';
  $('#remDaily').checked = prefs.daily;
  $('#remDailyTime').value = prefs.dailyTime;
  $('#remBlight').checked = prefs.blight;
  $('#remGoals').checked = prefs.goals;
  $('#remGoalDays').value = prefs.goalDays;
  $('#remFocus').checked = prefs.focus;
  $('#remList').classList.toggle('off', !allowed());
}

$('#notifyAllow').addEventListener('click', async () => {
  try { await Notification.requestPermission(); } catch (e) { /* older browsers */ }
  renderReminderSettings();
  if (allowed()) { toast('Notifications allowed'); checkReminders(); }
});
$('#remList').addEventListener('change', () => {
  prefs.daily = $('#remDaily').checked;
  prefs.dailyTime = $('#remDailyTime').value || DEFAULTS.dailyTime;
  prefs.blight = $('#remBlight').checked;
  prefs.goals = $('#remGoals').checked;
  prefs.goalDays = Math.max(1, Math.min(10, parseInt($('#remGoalDays').value, 10) || DEFAULTS.goalDays));
  prefs.focus = $('#remFocus').checked;
  savePrefs();
});
