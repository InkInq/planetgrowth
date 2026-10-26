// Settings: the theme picker (see themes.js) and save data — export, import, reset.
import { newState, expireGoals, dayKey } from '../sim.js';
import { mergeSaves, sameWorld } from '../merge.js';
import { state, save, setState } from './store.js';
import { $ } from './util.js';
import { toast, ask } from './feedback.js';
import { renderAll } from './render.js';
import { renderStats } from './stats.js';
import { renderThemes } from './themes.js';
import { clearNodes, closeTip } from './world.js';
import { setDialogTip, startTutorial, tutorialOn, maybeWelcome } from './tutorial.js';
import { renderReminderSettings } from './reminders.js';

// save data: export as text (copy works everywhere) or a file; import from a file or pasted text
const saveBox = $('#saveBox'), saveText = $('#saveText'), saveMsg = $('#saveMsg');

export function openSettings() {
  renderThemes();
  renderReminderSettings();
  saveBox.hidden = true;
  $('#tutReplay').textContent = tutorialOn() ? 'RESTART FIRST STEPS' : state.tutorial?.finished ? 'REPLAY FIRST STEPS' : 'START FIRST STEPS';
  setDialogTip($('#settingsDlg .dlg-body'), 'settings');
}
$('#tutReplay').addEventListener('click', () => { $('#settingsDlg').close(); startTutorial(); });

function showSaveBox(mode) {
  saveBox.hidden = false;
  saveBox.dataset.mode = mode;
  saveMsg.textContent = '';
  if (mode === 'export') {
    saveText.readOnly = true;
    saveText.value = JSON.stringify(state);
    $('#saveBoxLabel').textContent = 'YOUR SAVE · COPY IT SOMEWHERE SAFE';
  } else {
    saveText.readOnly = false;
    saveText.value = '';
    saveText.placeholder = 'Paste a save here, or choose a file';
    $('#saveBoxLabel').textContent = 'IMPORT · PASTE A SAVE OR CHOOSE A FILE';
    saveText.focus();
  }
}
$('#exportBtn').addEventListener('click', () => showSaveBox('export'));
$('#importBtn').addEventListener('click', () => showSaveBox('import'));
$('#copySave').addEventListener('click', () => {
  navigator.clipboard.writeText(saveText.value)
    .then(() => { saveMsg.textContent = 'Copied.'; })
    .catch(() => { saveText.select(); saveMsg.textContent = 'Selected. Press Ctrl+C (or ⌘C) to copy.'; });
});
$('#downloadSave').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'planetgrowth-' + dayKey(Date.now()) + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  saveMsg.textContent = 'If no file appeared, use Copy instead.';
});
async function importSave(text) {
  let data;
  try { data = JSON.parse(text); } catch (err) { data = null; }
  if (data && !data.cal) data.cal = [];
  if (data && !data.focusLog) data.focusLog = [];
  if (!data || data.v !== 1 || !data.res) { saveMsg.textContent = "That isn't a Planet Growth save. Check you copied all of it."; return; }
  // the same world from another device can be merged; a different world can only replace this one
  const same = sameWorld(state, data);
  const choice = same
    ? await ask({ title: 'IMPORT SAVE', body: `This is "${data.name}" from another device. Merge keeps the work from both devices. Replace throws away what's on this one.`, ok: 'MERGE', alt: 'REPLACE' })
    : await ask({ title: 'REPLACE THIS WORLD?', body: `Loads "${data.name}". It's a different world from this one, so it can't be merged: your current world is replaced.`, ok: 'LOAD SAVE', danger: true });
  if (!choice) return;
  const now = Date.now();
  if (same && choice === true) {
    const { state: merged, added } = mergeSaves(state, data, now);
    setState(merged);
    const parts = [[added.done, 'check-off'], [added.tasks, 'task'], [added.goals, 'goal'], [added.events, 'event']]
      .filter(([n]) => n).map(([n, w]) => `${n} ${w}${n === 1 ? '' : 's'}`);
    toast(parts.length ? 'Merged · ' + parts.join(', ') + ' from the other device' : 'Merged · nothing new on the other device');
  } else {
    expireGoals(data, now);
    setState(data);
    toast('Save loaded');
  }
  clearNodes();
  save(); renderAll(); renderStats();
  saveBox.hidden = true;
}
$('#loadSave').addEventListener('click', () => importSave(saveText.value));
$('#importInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (file) importSave(await file.text());
});
$('#resetBtn').addEventListener('click', async () => {
  if (!(await ask({ title: 'RESET WORLD?', body: 'This erases every task, goal and milestone and seeds a new world. Export a save first if you might want it back.', ok: 'RESET', danger: true }))) return;
  setState(newState(Date.now()));
  clearNodes();
  save(); renderAll(); renderStats(); closeTip();
  $('#settingsDlg').close();
  toast('New world seeded');
  maybeWelcome();
});
