// The header (world name, era, streak) and the World panel: planet systems and the milestone road.
import {
  CATS, SYSTEMS, MILESTONES, BLIGHTS, HOUR, DAY, rates, nextMilestone, milestoneProgress, forecast, eraOf, stats, fmtDuration,
} from '../sim.js';
import { icon } from '../icons.js';
import { state, save } from './store.js';
import { $, esc, fmtDate } from './util.js';
import { ask } from './feedback.js';

const SYS_FEED = { heat: 'PHYS', atmos: 'MIND', life: 'LIFE' };
const SYS_SCALE = 700; // same full scale the globe visuals use
const sysName = (k) => SYSTEMS[k].label.split(' · ').pop();

function sysModifiers(k, now) {
  const out = [];
  const held = (state.stab[k] || 0) > now;
  for (const s of state.surges) {
    if (s.sys === k && s.until > now) out.push(`<span class="chip streak" title="${esc(s.name)}">${icon('surge')}×${s.mult} · ${fmtDuration((s.until - now) / HOUR)} left</span>`);
  }
  if (held) out.push(`<span class="chip held">${icon('stabilizer')}Held · ${fmtDuration((state.stab[k] - now) / HOUR)} left</span>`);
  if (state.blights[k]) out.push(`<span class="chip blight">${icon('warn')}${BLIGHTS[k].title}${held ? ' · paused' : ' −0.4/h'}</span>`);
  if (state.gen[k] > 0.005) out.push(`<span class="chip muted" title="Boost from Steady tasks. It fades about 5% a day unless held.">${icon(held ? 'steady' : 'drift')}Tasks +${state.gen[k].toFixed(2)}/h${held ? '' : ' · fading'}</span>`);
  if (k === 'life' && !state.milestones.rain) out.push(`<span class="chip muted">${icon('water')}×0.25 until First Rain</span>`);
  return out.join('');
}

function sysCard(k, now, r, next) {
  const s = SYSTEMS[k];
  const locked = k === 'water' && !state.milestones.rain;
  const v = state.res[k], rate = r[k];
  const rateCls = locked ? 'muted' : rate < -0.001 ? 'neg' : rate > 0.001 ? 'pos' : 'muted';
  const rateText = locked ? 'LOCKED' : (rate < 0 ? '−' : '+') + Math.abs(rate).toFixed(2) + '/h';
  const target = next && next.req[k];
  const feed = locked ? 'Unlocks at First Rain' : SYS_FEED[k] ? `Fed by ${CATS[SYS_FEED[k]].short} tasks` : 'Forms from Heat + Atmosphere';
  return `<div class="sys-card${locked ? ' locked' : ''}" style="--c:${s.color}">
    <div class="sys-top">
      <span class="sys-ico">${icon(locked ? 'lock' : k)}</span>
      <span class="sys-title"><span class="name">${s.label}</span><span class="feed">${feed}</span></span>
      <span class="sys-val">${locked ? '' : `<span class="v">${Math.floor(v)}</span>`}<span class="rate ${rateCls}">${rateText}</span></span>
    </div>
    <div class="meter"><span class="fill" style="width:${Math.min(100, v / SYS_SCALE * 100)}%"></span>${target ? `<span class="mark" style="left:${Math.min(100, target / SYS_SCALE * 100)}%"></span>` : ''}</div>
    ${target && v < target ? `<div class="sys-next">${icon('flag')}${esc(next.title)} at ${target}</div>` : ''}
    <div class="chips">${sysModifiers(k, now)}</div>
  </div>`;
}

function renderRoad(now) {
  const next = nextMilestone(state);
  const fc = forecast(state, now);
  $('#road').innerHTML = MILESTONES.map((m) => {
    const at = state.milestones[m.id];
    const need = Object.entries(m.req).map(([k, v]) => sysName(k) + ' ' + v).join(' + ');
    const era = m.id === 'bloom' ? '<span class="era-tag">ERA II</span>' : '';
    if (at) {
      return `<li class="ms done"><span class="ms-node">${icon('check')}</span><span class="ms-body">
        <span class="t">${esc(m.title)}${era}</span><span class="d">Reached ${fmtDate(at)}</span></span></li>`;
    }
    if (m === next) {
      const p = milestoneProgress(state, m);
      const eta = fc.stalled ? `Stalled: ${sysName(fc.stalled)} isn't growing` : fc.hours != null ? `~${fmtDuration(fc.hours)} at this pace` : '';
      return `<li class="ms current"><span class="ms-node">${icon('star')}</span><span class="ms-body">
        <span class="t">${esc(m.title)}${era}<span class="pct">${Math.floor(p * 100)}%</span></span>
        <span class="meter"><span class="fill" style="width:${p * 100}%"></span></span>
        <span class="d">Needs ${need}</span><span class="d eta${fc.stalled ? ' stalled' : ''}">${eta}</span></span></li>`;
    }
    return `<li class="ms"><span class="ms-node">${icon('lock')}</span><span class="ms-body">
      <span class="t">${esc(m.title)}${era}</span><span class="d">Needs ${need}</span></span></li>`;
  }).join('');
}

export function renderSystems() {
  const now = Date.now();
  const r = rates(state, now);
  const next = nextMilestone(state);
  const era = eraOf(state);
  const doneN = MILESTONES.filter((m) => state.milestones[m.id]).length;
  $('#worldSummary').innerHTML = `<span class="era-badge">ERA ${era.n}</span><span class="ws-name">${era.name.toUpperCase()}</span><span class="ws-count" title="Milestones reached">${icon('star')}${doneN}/${MILESTONES.length}</span>`;
  $('#systems').innerHTML = Object.keys(SYSTEMS).map((k) => sysCard(k, now, r, next)).join('');
  renderRoad(now);
}

export function renderHeader() {
  const now = Date.now();
  const era = eraOf(state);
  const m = nextMilestone(state);
  const p = m ? milestoneProgress(state, m) : 1;
  $('#era').textContent = `ERA ${era.n} · ${era.name.toUpperCase()}`;
  $('#eraFill').style.width = (p * 100) + '%';
  $('#eraNext').textContent = m ? `${m.title} ${Math.floor(p * 100)}%` : 'All milestones';
  $('#eraLine').title = m ? `Next milestone: ${m.title}, ${Math.floor(p * 100)}%` : 'All milestones reached';
  $('#worldNameText').textContent = state.name;
  const cycle = Math.floor((now - state.created) / DAY) + 1;
  $('#cycle').textContent = 'CYCLE ' + String(cycle).padStart(3, '0');
  const streak = stats(state, now).streak;
  $('#streak').textContent = streak;
  $('#streakPill').classList.toggle('hot', streak > 0);
  $('#streakPill').setAttribute('aria-label', `Streak: ${streak} day${streak === 1 ? '' : 's'}`);
  $('#forecast').textContent = forecast(state, now).text;
}

$('#worldName').addEventListener('click', async () => {
  const n = await ask({ title: 'NAME YOUR WORLD', ok: 'RENAME', input: state.name });
  if (n && n.trim()) { state.name = n.trim().slice(0, 28); save(); renderHeader(); }
});
