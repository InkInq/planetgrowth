// Game words, bold and colored: words that affect the game are wrapped in <b class="kw kw-…"> wherever
// descriptive text appears. One observer handles every render, so text builders stay plain strings.
// Names the player typed are never touched.
import { state } from './store.js';

const KW_RULES = [
  ['ms', /Polar Frost Melts|Haze Thickens|First Rain|First Sea|First Green|Biomes Spread|Era II\b|Era I\b/],
  ['bad', /Deep Cooling|Dust Storm|Withering|−\d+(?:\.\d+)?(?:\/h)?|\b(?:[Bb]lights?|[Dd]rain(?:s|ing)?|[Mm]issed|[Ll]ost|[Ss]talled|[Oo]verdue|[Ff]ading)\b/],
  ['num', /[+×]\s?\d+(?:\.\d+)?(?:\/h|%)?|\b[Dd]oubles\b/],
  ['heat', /\b(?:Crust · Heat|Heat|heat|Physical|PHYS)\b/],
  ['atmos', /\b(?:Atmosphere|atmosphere|[Hh]aze|Mental|MIND)\b/],
  ['water', /\b(?:Water|water)\b/],
  ['life', /\b(?:Social \/ Creative|Life|life|LIFE)\b/],
  ['fx', /\b(?:Steady|Surge|Catalyst|Stabilizer)\b/],
  ['gold', /\b(?:[Rr]ewards?|[Ss]treaks?|days? worked|[Ll]andmarks?|[Mm]ilestones?)\b/],
];
const KW_RE = new RegExp(KW_RULES.map(([, r]) => `(${r.source})`).join('|'), 'g');
// where it applies: descriptive text, not chips, buttons, headings or names
const KW_SCOPE = '.coach p, .inline-coach p, .learned span, .fs .how, .tut-p, .hist-d, .hint, .pv-desc, .tile .s, .sys-title .feed, .sys-next, .ms .d, #forecast, #eraNext, .tip p, .pot-today, .goal-later, #askBody, .toast-msg, .focus-goal, .empty, .li-none';

const typedNames = () => [state.name, ...state.tasks.map((t) => t.name), ...state.goals.map((g) => g.name), ...state.cal.map((e) => e.title)]
  .filter((n) => n && n.length > 1).sort((a, b) => b.length - a.length);

function markWords(node, names) {
  const text = node.nodeValue;
  KW_RE.lastIndex = 0;
  if (!KW_RE.test(text)) return;
  const shield = []; // spans of text that are a player-typed name
  for (const n of names) for (let i = text.indexOf(n); i >= 0; i = text.indexOf(n, i + n.length)) shield.push([i, i + n.length]);
  const frag = document.createDocumentFragment();
  let last = 0, m;
  KW_RE.lastIndex = 0;
  while ((m = KW_RE.exec(text))) {
    const a = m.index, b = a + m[0].length;
    if (shield.some(([s, e]) => a < e && b > s)) continue;
    const el = document.createElement('b');
    el.className = 'kw kw-' + KW_RULES[m.slice(1).findIndex((g) => g !== undefined)][0];
    el.textContent = m[0];
    frag.append(text.slice(last, a), el);
    last = b;
  }
  if (!last) return;
  frag.append(text.slice(last));
  node.replaceWith(frag);
}
function markGameWords(root) {
  if (!root || root.nodeType !== 1) return;
  const scopes = root.matches(KW_SCOPE) ? [root] : root.closest(KW_SCOPE) ? [root.closest(KW_SCOPE)] : [...root.querySelectorAll(KW_SCOPE)];
  if (!scopes.length) return;
  const names = typedNames();
  for (const scope of scopes) {
    const walk = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement.closest('.kw, .chip, b') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    const nodes = [];
    while (walk.nextNode()) nodes.push(walk.currentNode);
    for (const n of nodes) markWords(n, names);
  }
}

export function initKeywords() {
  new MutationObserver((muts) => {
    const seen = new Set();
    for (const m of muts) {
      const el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      if (el && !seen.has(el)) { seen.add(el); markGameWords(el); }
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  markGameWords(document.body);
}
