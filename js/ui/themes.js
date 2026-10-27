// Color themes. Palettes live in styles.css as [data-palette] blocks; this list names them for Settings.
import { icon } from '../icons.js';
import { $ } from './util.js';
import { globe, drawStars } from './world.js';

const THEME_KEY = 'planetgrowth-theme';
const THEMES = [
  { id: 'nebula', name: 'Nebula', desc: 'Violet space, cyan glow' },
  { id: 'pocket', name: 'Pocket', desc: 'Handheld console greens' },
  { id: 'amber', name: 'Amber Terminal', desc: 'Warm CRT phosphor' },
  { id: 'deepsea', name: 'Deep Sea', desc: 'Navy and glowing teal' },
  { id: 'reddust', name: 'Red Dust', desc: 'Martian rust and coral' },
  { id: 'synth', name: 'Synthwave', desc: 'Neon pink, electric blue' },
  { id: 'contrast', name: 'High Contrast', desc: 'Pure black, bold colors' },
  { id: 'parchment', name: 'Parchment', desc: 'Light, like an old star chart' },
];
export const currentTheme = () => {
  const id = document.documentElement.dataset.palette;
  return THEMES.some((t) => t.id === id) ? id : 'nebula';
};

export function applyTheme(id, persist) {
  document.documentElement.dataset.palette = id;
  if (persist) { try { localStorage.setItem(THEME_KEY, id); } catch (e) { /* storage unavailable */ } }
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  const meta = document.querySelector('meta[name="theme-color"]'); // a host page may not carry it
  if (meta) meta.content = v('--bg');
  globe.setTheme(v('--rim'), v('--halo'));
  drawStars();
}

// Each preview tile carries data-palette, so it draws itself in that theme's colors.
export function renderThemes() {
  const cur = currentTheme();
  $('#themeGrid').innerHTML = THEMES.map((t) => `
    <button type="button" class="theme-tile" aria-pressed="${t.id === cur}" data-pick="${t.id}" data-palette="${t.id}">
      <span class="tt-preview" aria-hidden="true">
        <span class="tt-top"><span class="tt-dot"></span><span class="tt-bar"><span></span></span></span>
        <span class="tt-card" style="--c:var(--heat)"><span class="tt-box"></span><span class="tt-lines"><span></span><span class="short"></span></span></span>
        <span class="tt-card" style="--c:var(--atmos)"><span class="tt-box on"></span><span class="tt-lines"><span></span><span class="short"></span></span></span>
        <span class="tt-swatches">${['accent', 'heat', 'atmos', 'life', 'water', 'danger'].map((c) => `<span style="background:var(--${c})"></span>`).join('')}</span>
      </span>
      <span class="tt-name">${t.name.toUpperCase()}${t.id === cur ? icon('check') : ''}</span>
      <span class="tt-desc">${t.desc}</span>
    </button>`).join('');
}
$('#themeGrid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pick]');
  if (!b) return;
  applyTheme(b.dataset.pick, true);
  renderThemes();
  $(`#themeGrid [data-pick="${b.dataset.pick}"]`).focus();
});
