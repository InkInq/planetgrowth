// Month's end: when a new month starts, the cataclysm plays out on the globe, then a report shows
// what it took. The rules (the 25% setback, lost milestones, Pop that survives) live in sim.js.
import { CATACLYSMS, CATACLYSM_HIT, CATACLYSM_HIT_BLIGHTED, MILESTONES, MILESTONE_KEEP, POP_SURVIVE, SYSTEMS } from '../sim.js';
import { icon } from '../icons.js';
import { state, save } from './store.js';
import { $, esc, monthName, reducedMotion } from './util.js';
import { turnTo, setGlobeFx } from './world.js';
import { setView } from './layout.js';
import { renderAll } from './render.js';

const PLAY_MS = 6500;
const sysName = (k) => SYSTEMS[k].label.split(' · ').pop();
export const fmtPop = (n) => Math.floor(n || 0).toLocaleString();
const pct = (x) => Math.round(x * 100) + '%';

let playing = false;

// Called from the game loop: plays the newest cataclysm you haven't seen yet, once nothing else is on screen.
export function checkCataclysm() {
  if (playing || document.visibilityState !== 'visible') return;
  const list = state.cataclysms || [];
  const c = [...list].reverse().find((x) => !x.seen);
  if (!c) return;
  if (document.querySelector('dialog[open]') || !$('#coach').hidden) return;
  play(c);
}

function play(c) {
  playing = true;
  const ev = state.events.find((e) => e.id === c.id);
  if (ev) turnTo(ev);
  if (innerWidth <= 860) setView('none'); // phones: show the planet, not a panel
  const banner = $('#cataBanner');
  banner.innerHTML = `<span class="k">MONTH'S END</span><span class="t">${esc(CATACLYSMS[c.type].title.toUpperCase())}</span>`;
  banner.hidden = false;
  const calm = reducedMotion.matches;
  const dur = calm ? 2500 : PLAY_MS;
  const start = performance.now();
  // rises over the first third, holds, then recedes onto the planet as it is now
  setGlobeFx((t) => {
    const p = (t - start) / dur;
    if (calm) return { type: c.type, s: 0.7 };
    const s = p < 0.35 ? p / 0.35 : p < 0.7 ? 1 : Math.max(0, 1 - (p - 0.7) / 0.3);
    return { type: c.type, s: s * s * (3 - 2 * s) };
  });
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    banner.hidden = true;
    banner.onclick = null;
    setGlobeFx(() => null);
    report(c);
  };
  const timer = setTimeout(finish, dur);
  banner.onclick = finish; // tap to skip
}

function report(c) {
  const d = $('#cataDlg');
  const info = CATACLYSMS[c.type];
  const sysRows = Object.entries(c.hit).filter(([, h]) => h.before >= 0.5).map(([k, h]) => `
    <li style="--c:${SYSTEMS[k].color}"><span class="ico">${icon(k)}</span><span class="n">${sysName(k)}</span>
      <span class="v">${Math.floor(h.before)} → <b>${Math.floor(h.after)}</b></span>
      <span class="chip ${h.blighted ? 'blight' : 'muted'}">−${Math.round(h.rate * 100)}%${h.blighted ? ' · blight' : ''}</span></li>`).join('');
  const lost = c.msLost.map((id) => MILESTONES.find((m) => m.id === id)).filter(Boolean);
  const kept = MILESTONES.filter((m) => state.milestones[m.id]).length;
  const msHtml = lost.length
    ? `<ul class="cata-lost">${lost.map((m) => `<li>${icon('warn')}<span><b>${esc(m.title)}</b> lost. Earn it back at ${Object.entries(m.req).map(([k, v]) => sysName(k) + ' ' + v).join(' + ')}.</span></li>`).join('')}</ul>`
    : kept ? `<p class="hint">${icon('check')} Your milestones held: every system stayed above ${MILESTONE_KEEP * 100}% of what they need.</p>`
    : '';
  const why = [
    `${pct(POP_SURVIVE.base)} always survive`,
    c.consistency == null ? 'no daily tasks to count' : `daily tasks ${pct(c.consistency)} done`,
    `${c.goalsMet} goal${c.goalsMet === 1 ? '' : 's'} met`,
  ].join(' · ');
  const popHtml = c.popBefore >= 1 ? `
    <div class="cata-pop"><span class="ico">${icon('pop')}</span><span class="n">Pop</span>
      <span class="v">${fmtPop(c.popBefore)} → <b>${fmtPop(c.popAfter)}</b></span><span class="chip good">${pct(c.survival)} survived</span></div>
    <p class="hint">${why}. A more consistent month saves more.</p>` : '';
  d.querySelector('form').innerHTML = `
    <div class="cata-k">${icon('meteor')} MONTH'S END · ${esc(monthName(c.month).toUpperCase())}</div>
    <h2>${esc(info.title.toUpperCase())}</h2>
    <p class="hint">${esc(info.body)} Every system lost ${CATACLYSM_HIT * 100}%${Object.values(c.hit).some((h) => h.blighted) ? `, and ${CATACLYSM_HIT_BLIGHTED * 100}% where a blight was active` : ''}.</p>
    <ul class="cata-sys">${sysRows}</ul>
    ${msHtml}${popHtml}
    <p class="hint">A new month begins. Set this month's goals and keep your daily tasks going.</p>
    <div class="dlg-actions"><button type="submit" class="btn" value="ok">CONTINUE</button></div>`;
  d.addEventListener('close', () => {
    for (const x of state.cataclysms) x.seen = true; // older ones from a long absence are folded into this one
    playing = false;
    save();
    renderAll();
  }, { once: true });
  d.showModal();
}
