# Planet Growth

A task manager that is also an incremental game. Completing tasks powers generators that slowly evolve a pixel planet, from a cold desert rock to a living world, viewed from orbit.

Installable PWA: vanilla HTML, CSS and JavaScript, no build step, works offline, saves on the device.

## Run it

Serve the folder over HTTP (service workers don't run from `file://`):

```bash
npx serve .
# or
python3 -m http.server 8000
```

Open it on your phone over the same network, or deploy it to GitHub Pages (Settings → Pages → deploy from `main`, root folder). Then use **Add to Home Screen** to install it.

## How it plays

**Task categories feed planetary systems**

| Category | System | What you see |
| --- | --- | --- |
| Physical | Crust · Heat | Ice caps melt, terrain warms |
| Mental | Atmosphere | Haze, then cloud bands |
| Social / Creative | Life | Green spreads, then city lights |

Water isn't a category. It forms on its own once Heat and Atmosphere are balanced enough to bring the First Rain.

**Task effects**

- **Steady:** permanent +0.06/h to its system. Generators drift down about 5% a day if neglected.
- **Surge:** doubles its system for 12 hours.
- **Catalyst:** instant +15 to its system.
- **Stabilizer:** stops drift and blight drain on its system for 24 hours.

**Daily vs goals**

- Daily tasks repeat and keep your baseline rates healthy.
- Goals are scarce: at most 3 at once, a deadline at least 7 days out, and a measurable target. Completing one gives a large boost and leaves a mark on the globe.

**Decay**

Missing two or more daily tasks in a category spawns a **blight** (Deep Cooling, Dust Storm, Withering) that drains that system until you complete two tasks of that category.

**Events on the globe**

Milestones, goals, blights and recoveries appear as nodes on the planet. Tap one to see when it happened and which tasks caused it or can fix it.

**Milestones (Era I → II)**

Polar Frost Melts → Haze Thickens → First Rain → First Sea → First Green → Biomes Spread (Era II)

A forecast under the globe estimates when the next milestone lands at your current pace.

## Files

- `js/sim.js`: simulation (rates, generators, blights, milestones, stats). Pure logic, no DOM.
- `js/globe.js`: pixel globe renderer (a 112 px buffer scaled up crisply).
- `js/main.js`: UI, input, save/load, game loop.
- `js/icons.js`: 8×8 pixel icons drawn as inline SVG.
- `sw.js`, `manifest.webmanifest`, `icons/`: PWA install and offline support.

Tuning numbers live at the top of `js/sim.js` and in `MILESTONES`.

For testing in the browser console: `__pg.fastForward(24)` advances the world by 24 hours.

## Roadmap ideas

- Rhythm detection: suggest scheduling tasks you reliably do on certain weekdays
- Reminder notifications (push) for daily tasks and active blights
- Era II and beyond: civilization, orbit, moons
- Task-mix shaping the planet's look (volcanic vs ocean worlds)
- Optional sync across devices
