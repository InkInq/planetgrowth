// Small shared helpers: DOM lookup, escaping, number and date formatting, game wording.
import { CATS, SYSTEMS, DAY, dayKey, monthStart } from '../sim.js';
import { icon } from '../icons.js';

export const $ = (s) => document.querySelector(s);
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// ---------- numbers, dates, times ----------
export const fmtNum = (v) => String(+(+v).toFixed(2));
export function fmtDate(t) { return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
export const fmtTime = (t) => new Date(t).toLocaleTimeString([], new Date(t).getMinutes() ? { hour: 'numeric', minute: '2-digit' } : { hour: 'numeric' });
export const fmtMins = (m) => (m >= 60 ? Math.floor(m / 60) + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : '') : m + ' min');
export const plural = (n, one, many = one + 's') => (n === 1 ? one : many);
export const monthName = (mk, style = 'long') => new Date(monthStart(mk)).toLocaleDateString(undefined, { month: style });
export function startOfDay(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d; }
export function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

// Time ranges shared by Stats and History, so the same number means the same thing on both.
export const RANGE = { focus: 7, week: 7, tasks: 14 };
export const rangeStart = (days, now = Date.now()) => startOfDay(now - (days - 1) * DAY).getTime();

// Local calendar days ending today, oldest first. Steps by date so DST can't skip a day.
export function lastDays(n, now) {
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - (n - 1));
  const out = [];
  for (let i = 0; i < n; i++) { out.push({ key: dayKey(d), date: new Date(d) }); d.setDate(d.getDate() + 1); }
  return out;
}

// ---------- game wording ----------
export const sysShort = (cat) => SYSTEMS[CATS[cat].sys].label.split(' · ').pop();

export function rewardText(cat, type) {
  const s = sysShort(cat);
  return { steady: `${s} +0.06/h`, surge: `${s} ×2 · 12h`, catalyst: `${s} +15`, stabilizer: `Hold ${s} 24h` }[type];
}

// Category tiles for the task and goal dialogs.
export const catTiles = () => Object.entries(CATS).map(([k, c], i) => `
  <label class="tile" style="--c:${c.color}"><input type="radio" name="cat" value="${k}"${i ? '' : ' checked'}>
    <span class="ico">${icon(c.sys)}</span><span class="t">${c.short}</span><span class="s">${c.label}</span></label>`).join('');
