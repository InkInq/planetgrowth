// The save: loaded once into `state`, and written back to this device's storage with save().
import { newState, advance, expireGoals } from '../sim.js';

const SAVE_KEY = 'planetgrowth-save-v1';

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* storage unavailable or corrupt */ }
  return newState(Date.now());
}
export function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
}

export let state = load();
state.cal ||= []; // saves from before the calendar existed
state.focusLog ||= []; // ...or before focus sessions
state.focus ||= null;
expireGoals(state, Date.now()); // gives older goals a month, and closes out months that have ended

// Planet events (milestones, blights, ...) waiting to be announced with a toast.
export const pending = [];
advance(state, Date.now(), pending);
save();

// Remembers that something was deleted, so merging in a save from another device doesn't bring it back.
export function markDeleted(id) { (state.deleted ||= {})[id] = Date.now(); }

// Swaps in a whole new world (an imported save, or a reset).
export function setState(next) { state = next; expireGoals(state, Date.now()); }
