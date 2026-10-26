// Moving around: opening dialogs, the phone tab bar and add button, and the collapsible side panels.
import { $ } from './util.js';
import { canvas, sizeCanvas } from './world.js';
import { openTaskDlg } from './tasks.js';
import { openGoalDlg, canAddGoal } from './goals.js';
import { openEventDlg, renderCalendar } from './calendar.js';
import { renderStats } from './stats.js';
import { openSettings } from './settings.js';
import { renderHistory } from './history.js';

// dialogs
document.addEventListener('click', (e) => {
  const open = e.target.closest('[data-open]');
  if (open) {
    const d = document.getElementById(open.dataset.open);
    if (d.id === 'taskDlg') { openTaskDlg(null); return; }
    if (d.id === 'goalDlg') { openGoalDlg(null); return; }
    if (d.id === 'calDlg') { openEventDlg(null); return; }
    if (d.id === 'statsDlg') renderStats();
    if (d.id === 'settingsDlg') openSettings();
    d.showModal();
  }
  if (e.target.closest('[data-close]')) e.target.closest('dialog').close();
});
document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

// desktop tabs + mobile views
export function setView(v) {
  document.body.dataset.view = v;
  document.querySelectorAll('.tabbar [data-view]').forEach((b) => b.toggleAttribute('aria-current', b.dataset.view === v));
  if (v === 'tasks' || v === 'goals' || v === 'calendar') {
    $('#paneTasks').hidden = v !== 'tasks';
    $('#paneGoals').hidden = v !== 'goals';
    $('#paneCalendar').hidden = v !== 'calendar';
    $('#tabDaily').setAttribute('aria-selected', v === 'tasks');
    $('#tabGoals').setAttribute('aria-selected', v === 'goals');
    $('#tabCal').setAttribute('aria-selected', v === 'calendar');
  }
  if (v === 'calendar') renderCalendar();
  syncFab();
}

// The phone add button follows the open tab, and hides when goal slots are full.
export function syncFab() {
  const fab = $('.fab');
  const view = document.body.dataset.view;
  const goals = view === 'goals';
  fab.dataset.open = goals ? 'goalDlg' : view === 'calendar' ? 'calDlg' : 'taskDlg';
  fab.setAttribute('aria-label', goals ? 'New goal' : view === 'calendar' ? 'New event' : 'New task');
  fab.hidden = goals && !canAddGoal();
}
document.querySelectorAll('.tab[data-tab]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.tab)));
document.querySelectorAll('.tabbar [data-view]').forEach((b) => b.addEventListener('click', () => {
  // tapping the active tab collapses the sheet to show the whole globe
  setView(document.body.dataset.view === b.dataset.view ? 'none' : b.dataset.view);
}));

// ---------- panels: collapsible on desktop; right panel tabs (Systems / History) ----------
const PANELS_KEY = 'planetgrowth-panels';
const collapsed = (() => {
  try { return { left: false, right: false, ...JSON.parse(localStorage.getItem(PANELS_KEY) || '{}') }; } catch (e) { return { left: false, right: false }; }
})();
function applyPanels() {
  $('.layout').classList.toggle('left-collapsed', !!collapsed.left);
  $('.layout').classList.toggle('right-collapsed', !!collapsed.right);
  $('.rail-left').hidden = !collapsed.left;
  $('.rail-right').hidden = !collapsed.right;
  try { localStorage.setItem(PANELS_KEY, JSON.stringify(collapsed)); } catch (e) { /* storage unavailable */ }
}
export function togglePanel(side, open) {
  collapsed[side] = open === undefined ? !collapsed[side] : !open;
  applyPanels();
  if (side === 'right' && !collapsed.right) renderHistory();
}
document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-collapse]');
  if (c) { togglePanel(c.dataset.collapse); return; }
  if (e.target.closest('[data-sheet-close]')) setView('none'); // phone: the grab bar closes the sheet
});
// [ and ] toggle the panels on desktop
document.addEventListener('keydown', (e) => {
  if ((e.key !== '[' && e.key !== ']') || e.metaKey || e.ctrlKey || e.altKey || !matchMedia('(min-width: 861px)').matches) return;
  if (document.querySelector('dialog[open]') || e.target.closest('input, textarea, select')) return;
  togglePanel(e.key === '[' ? 'left' : 'right');
  e.preventDefault();
});

export function initLayout() {
  applyPanels();
  new ResizeObserver(() => sizeCanvas()).observe(canvas); // the globe grows into the space a collapsed panel frees
}
