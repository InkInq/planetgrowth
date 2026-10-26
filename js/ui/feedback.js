// Telling the player what happened: toasts, floating reward numbers, and the in-app ask dialog.
import { $, reducedMotion } from './util.js';

let toastTimer = 0;
export function toast(msg, action) {
  const t = $('#toast');
  const btn = t.querySelector('.toast-act');
  t.querySelector('.toast-msg').textContent = msg;
  btn.hidden = !action;
  btn.onclick = null;
  if (action) {
    btn.textContent = action.label;
    btn.onclick = () => { t.classList.remove('show'); action.run(); };
  }
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), action ? 4500 : 2600);
}

export function announce(evs) {
  for (const e of evs) {
    if (e.kind === 'milestone') toast('★ ' + e.title);
    else if (e.kind === 'blight') toast('⚠ ' + e.title + ' — tap it on the globe');
    else if (e.kind === 'cleared') toast('✓ ' + e.title);
    else if (e.kind === 'goal') toast('★ ' + e.title + ' complete');
  }
  evs.length = 0;
}

export function floatReward(el, text, color) {
  if (reducedMotion.matches) return;
  const r = el.getBoundingClientRect();
  const f = document.createElement('div');
  f.className = 'float-reward';
  f.textContent = text;
  f.style.color = color;
  f.style.left = (r.left + r.width / 2) + 'px';
  f.style.top = r.top + 'px';
  document.body.appendChild(f);
  f.addEventListener('animationend', () => f.remove());
}

// In-app replacement for confirm()/prompt(), which embedded viewers block.
// Resolves true/false ('alt' when the optional second choice is picked),
// or the typed text (null on cancel) when `input` is given.
export function ask({ title, body = '', ok = 'OK', alt = null, danger = false, input = null }) {
  const d = $('#askDlg');
  $('#askTitle').textContent = title;
  $('#askBody').textContent = body;
  $('#askBody').hidden = !body;
  $('#askOk').textContent = ok;
  $('#askOk').classList.toggle('btn-danger', danger);
  $('#askAlt').hidden = !alt;
  $('#askAlt').textContent = alt || '';
  $('#askInputRow').hidden = input == null;
  if (input != null) $('#askInput').value = input;
  d.returnValue = '';
  d.showModal();
  if (input != null) $('#askInput').select();
  return new Promise((resolve) => {
    d.addEventListener('close', () => {
      const rv = d.returnValue;
      if (input != null) resolve(rv === 'ok' ? $('#askInput').value : null);
      else resolve(rv === 'ok' ? true : rv === 'alt' ? 'alt' : false); // 'alt' = the second choice
    }, { once: true });
  });
}
