// Planet Growth starts here: this file sets up the screen and runs the game loop.
// The game rules live in sim.js; each part of the interface has its own file in js/ui/:
//   store     the save (state), loading and saving
//   world     the globe, its spin and the event markers on it
//   tasks     the Daily tab and task dialog          goals     the Goals tab and goal dialog
//   calendar  the Calendar tab                       focus     focus sessions (pomodoro)
//   systems   the header and the World panel         history   the History tab
//   stats     the Stats dialog                       settings  save data (export, import, reset)
//   themes    color themes                           layout    dialogs, phone tabs, side panels
//   keywords  bold, colored game words               feedback  toasts, floating numbers, ask dialog
//   render    renderAll(), redraws everything        util      small shared helpers
//   tutorial  First Steps, the guided first tasks     reminders notifications and their settings
//   cataclysm the month's-end cataclysm and its report
// merge.js combines two saves of the same world (Import in Settings).
import { HOUR, advance } from './sim.js';
import { icon } from './icons.js';
import { state, save, pending } from './ui/store.js';
import { $ } from './ui/util.js';
import { announce } from './ui/feedback.js';
import { spinGlobe, drawGlobe } from './ui/world.js';
import { applyTheme, currentTheme } from './ui/themes.js';
import { setView, initLayout } from './ui/layout.js';
import { renderAll } from './ui/render.js';
import { renderHeader, renderSystems } from './ui/systems.js';
import { updateNowLine } from './ui/calendar.js';
import { focusTick } from './ui/focus.js';
import { initKeywords } from './ui/keywords.js';
import { maybeWelcome, placeCoach } from './ui/tutorial.js';
import { checkReminders } from './ui/reminders.js';
import { checkCataclysm } from './ui/cataclysm.js';
import { cataclysm } from './sim.js';

applyTheme(currentTheme(), false);
// the pixel icons written into index.html as data-icon="name"
document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); });
$('.fab').innerHTML = icon('plus');
initLayout();
initKeywords();

if (!document.body.dataset.view) setView('tasks');
renderAll();
announce(pending);
maybeWelcome();
setTimeout(checkReminders, 1500); // anything that came due while the app was closed

// ---------- loop ----------
let lastSim = 0, lastUi = 0, lastFrame = performance.now(), lastFocus = 0, lastRemind = performance.now();
function frame(t) {
  const dt = Math.min(100, t - lastFrame); lastFrame = t; // clamp so returning to the tab doesn't jump
  spinGlobe(dt, t);
  if (t - lastSim > 1000) {
    advance(state, Date.now(), pending);
    if (pending.length) { announce(pending); renderAll(); }
    lastSim = t;
  }
  if (t - lastUi > 5000) { renderHeader(); renderSystems(); updateNowLine(); save(); lastUi = t; }
  if (t - lastFocus > 250) { focusTick(); lastFocus = t; }
  if (t - lastRemind > 30000) { checkReminders(); lastRemind = t; }
  if (t - lastSim < 20) checkCataclysm(); // right after each simulation step
  drawGlobe(t);
  placeCoach();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { advance(state, Date.now(), pending); focusTick(); announce(pending); renderAll(); setTimeout(checkReminders, 800); }
  else save();
});

// ---------- PWA ----------
// Offline support. Skipped on localhost so a page you're editing never comes from an old cached copy.
const devHost = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !devHost) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// debug hook for testing: window.__pg.fastForward(hours)
window.__pg = {
  get state() { return state; },
  // plays a month's-end cataclysm now (type: ice, dust, flood or plague; random if left out)
  cataclysm(type) { cataclysm(state, Date.now(), pending, type); announce(pending); renderAll(); save(); },
  fastForward(h) { state.lastTick -= h * HOUR; state.created -= h * HOUR; advance(state, Date.now(), pending); announce(pending); renderAll(); save(); },
};
