// The header (world name, era, Pop) and the World panel: planet systems and the milestone road.
import {
  CATS, SYSTEMS, MILESTONES, BLIGHTS, HOUR, DAY, rates, nextMilestone, milestoneProgress, forecast, eraOf, stats, fmtDuration,
  cataclysmPreview, popCap, unlocked, reqLabel, goalsMet, ERAS, CATACLYSM_HIT, CATACLYSM_HIT_BLIGHTED,
} from '../sim.js';
import { icon } from '../icons.js';
import { state, save } from './store.js';
import { $, esc, fmtDate } from './util.js';
import { ask } from './feedback.js';
import { fmtPop } from './cataclysm.js';

const SYS_FEED = { heat: 'PHYS', atmos: 'MIND', life: 'LIFE' };
const SYS_SCALE = 700; // same full scale the globe visuals use
const sysName = (k) => SYSTEMS[k].label.split(' · ').pop();

function sysModifiers(k, now, risk) {
  const out = [];
  if (risk) out.push(`<span class="chip blight" title="The month's-end cataclysm would drop ${esc(risk.m.title)}">${icon('warn')}At risk · keep ${risk.need}+</span>`);
  const held = (state.stab[k] || 0) > now;
  for (const s of state.surges) {
    if (s.sys === k && s.until > now) out.push(`<span class="chip streak" title="${esc(s.name)}">${icon('surge')}×${s.mult} · ${fmtDuration((s.until - now) / HOUR)} left</span>`);
  }
  if (held) out.push(`<span class="chip held">${icon('stabilizer')}Held · ${fmtDuration((state.stab[k] - now) / HOUR)} left</span>`);
  if (state.blights[k]) out.push(`<span class="chip blight">${icon('warn')}${BLIGHTS[k].title}${held ? ' · paused' : ' −0.4/h'}</span>`);
  if (state.gen[k] > 0.005) out.push(`<span class="chip muted" title="Boost from Steady tasks. It fades about 5% a day unless held.">${icon(held ? 'steady' : 'drift')}Tasks +${state.gen[k].toFixed(2)}/h${held ? '' : ' · fading'}</span>`);
  if (k === 'life' && !unlocked(state, 'rain')) out.push(`<span class="chip muted">${icon('water')}×0.25 until First Rain</span>`);
  return out.join('');
}

function sysCard(k, now, r, next, risk) {
  const s = SYSTEMS[k];
  const locked = k === 'water' && !unlocked(state, 'rain');
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
    <div class="chips">${sysModifiers(k, now, risk)}</div>
  </div>`;
}

// Eras fold in the milestone list. By default only the era you're in is open; tapping an era's heading
// opens or folds it, and that choice is remembered on this device.
const ROAD_KEY = 'planetgrowth-road';
const roadOpen = (() => { try { return JSON.parse(localStorage.getItem(ROAD_KEY)) || {}; } catch (e) { return {}; } })();

function renderRoad(now) {
  const next = nextMilestone(state);
  const fc = forecast(state, now);
  const gm = goalsMet(state);
  const curEra = (next || MILESTONES[MILESTONES.length - 1]).era;
  const isOpen = (era) => roadOpen[era] ?? era === curEra;
  $('#road').innerHTML = MILESTONES.map((m, i) => {
    const at = state.milestones[m.id];
    // goals show how many you have so far: "5 goals met (3/5)"
    const need = Object.entries(m.req).map(([k, v]) => reqLabel(k, v) + (k === 'goals' && !at && gm < v ? ` (${gm}/${v})` : '')).join(' + ');
    let head = '';
    if (i === 0 || MILESTONES[i - 1].era !== m.era) {
      const inEra = MILESTONES.filter((x) => x.era === m.era);
      const done = inEra.filter((x) => state.milestones[x.id]).length;
      const open = isOpen(m.era);
      head = `<li class="road-era"><button type="button" data-era="${m.era}" aria-expanded="${open}"${m.era === curEra ? ' class="cur"' : ''}>`
        + `<span class="chev">${icon('right')}</span><span class="tag">ERA ${m.era}</span><span class="nm">${ERAS[m.era].toUpperCase()}</span>`
        + `<span class="n">${done}/${inEra.length}</span></button></li>`;
    }
    if (!isOpen(m.era)) return head;
    const lostAt = !at && state.lost?.[m.id];
    const lostLine = lostAt ? `<span class="d lost">Lost ${fmtDate(lostAt)}</span>` : '';
    if (at) {
      return head + `<li class="ms done"><span class="ms-node">${icon('check')}</span><span class="ms-body">
        <span class="t">${esc(m.title)}</span><span class="d">Reached ${fmtDate(at)}</span></span></li>`;
    }
    if (m === next) {
      const p = milestoneProgress(state, m);
      const goalsLeft = fc.goalsLeft ? `${fc.goalsLeft} more goal${fc.goalsLeft === 1 ? '' : 's'} met` : '';
      const eta = fc.stalled ? `Stalled: ${sysName(fc.stalled)} isn't growing`
        : goalsLeft ? (fc.hours > 0 ? `~${fmtDuration(fc.hours)} at this pace, and ${goalsLeft}` : `Needs ${goalsLeft}`)
        : fc.hours != null ? `~${fmtDuration(fc.hours)} at this pace` : '';
      return head + `<li class="ms current"><span class="ms-node">${icon('star')}</span><span class="ms-body">
        <span class="t">${esc(m.title)}<span class="pct">${Math.floor(p * 100)}%</span></span>
        <span class="meter"><span class="fill" style="width:${p * 100}%"></span></span>
        ${lostLine}<span class="d">Needs ${need}</span><span class="d eta${fc.stalled ? ' stalled' : ''}">${eta}</span></span></li>`;
    }
    return head + `<li class="ms"><span class="ms-node">${icon('lock')}</span><span class="ms-body">
      <span class="t">${esc(m.title)}</span>${lostLine}<span class="d">Needs ${need}</span></span></li>`;
  }).join('');
}

$('#road').addEventListener('click', (e) => {
  const b = e.target.closest('[data-era]');
  if (!b) return;
  roadOpen[b.dataset.era] = b.getAttribute('aria-expanded') !== 'true';
  try { localStorage.setItem(ROAD_KEY, JSON.stringify(roadOpen)); } catch (err) { /* storage unavailable */ }
  renderRoad(Date.now());
});

export function renderSystems() {
  const now = Date.now();
  const r = rates(state, now);
  const next = nextMilestone(state);
  const era = eraOf(state);
  const doneN = MILESTONES.filter((m) => state.milestones[m.id]).length;
  $('#worldSummary').innerHTML = `<span class="era-badge">ERA ${era.n}</span><span class="ws-name">${era.name.toUpperCase()}</span>`
    + `<span class="ws-count ws-pop" title="${popTitle()}">${icon('pop')}${fmtPop(state.pop)}</span>`
    + `<span class="ws-count" title="Milestones reached">${icon('star')}${doneN}/${MILESTONES.length}</span>`;
  const pv = cataclysmPreview(state, now);
  $('#monthEnd').innerHTML = monthEnd(pv);
  // in the last week, each system that needs more to keep a milestone says so on its card
  const riskBy = {};
  if (pv.daysLeft <= 7) for (const rk of pv.risks) for (const n of rk.needs) if (!riskBy[n.k] || n.need > riskBy[n.k].need) riskBy[n.k] = { m: rk.m, need: n.need };
  $('#systems').innerHTML = Object.keys(SYSTEMS).map((k) => sysCard(k, now, r, next, riskBy[k])).join('');
  renderRoad(now);
}

// Pop's tooltip: what it is and how far it can grow right now
const popTitle = () => {
  const cap = popCap(state);
  return 'Pop: how alive your planet is. ' + (cap ? `It grows toward ${fmtPop(cap)}, a ceiling set by the milestones you hold.` : 'Life starts growing at First Rain.');
};

// The card that warns about the month's-end cataclysm: what it takes, what's at risk, and how much Pop survives.
function monthEnd(pv) {
  const when = pv.daysLeft <= 1 ? 'tonight' : `in ${pv.daysLeft} days`;
  if (pv.grace) {
    return `<div class="me-head">${icon('meteor')}<span>MONTH'S END</span><span class="me-when">${when}</span></div>`
      + `<p class="me-line"><span>Your world is new, so this month ends quietly. From next month on, each month ends with a cataclysm that takes ${CATACLYSM_HIT * 100}% of every system.</span></p>`;
  }
  const blighted = Object.keys(state.blights);
  const lines = [`A cataclysm takes ${CATACLYSM_HIT * 100}% of every system${blighted.length ? `, ${CATACLYSM_HIT_BLIGHTED * 100}% from ${blighted.map(sysName).join(' and ')} while its blight lasts` : ''}.`];
  if (pv.risks.length) {
    lines.push(`If it struck today, you'd lose ${pv.risks.length === 1 ? 'a milestone' : pv.risks.length + ' milestones'}. To keep ${pv.risks.length === 1 ? 'it' : 'them'}:`);
    for (const rk of pv.risks) lines.push(`${icon('warn')} <span>${esc(rk.m.title)}: ${rk.needs.map((n) => `${sysName(n.k)} ${n.need} (now ${Math.floor(n.have)})`).join(', ')}</span>`);
  } else if (Object.keys(state.milestones).length) {
    lines.push(`${icon('check')} <span>Your milestones have enough buffer to survive it.</span>`);
  }
  if (state.pop >= 1) {
    const how = pv.consistency == null ? 'add daily tasks to save more' : `daily tasks ${Math.round(pv.consistency * 100)}% done, ${pv.goalsMet} goal${pv.goalsMet === 1 ? '' : 's'} met`;
    lines.push(`${icon('pop')} <span>About ${Math.round(pv.survival * 100)}% of Pop would survive (${how}).</span>`);
  }
  return `<div class="me-head">${icon('meteor')}<span>MONTH'S END</span><span class="me-when${pv.daysLeft <= 3 ? ' soon' : ''}">${when}</span></div>`
    + lines.map((l) => `<p class="me-line">${l}</p>`).join('');
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
  $('#forecast').textContent = forecast(state, now).text;
  $('#pop').textContent = fmtPop(state.pop);
  $('#popPill').title = popTitle();
}

$('#worldName').addEventListener('click', async () => {
  const n = await ask({ title: 'NAME YOUR WORLD', ok: 'RENAME', input: state.name });
  if (n && n.trim()) { state.name = n.trim().slice(0, 28); save(); renderHeader(); }
});
