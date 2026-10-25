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
- Goals are monthly: each belongs to a calendar month (this month or next) and is due on its last day. At most 3 per month; met goals keep their slot, abandoned ones free it. Unfinished goals are marked missed when the month ends. Each needs a measurable target.
- Each goal holds a reward that grows: +30 to its system and +0.1/h to start, plus +4 and +0.01/h for every day you work on it (a manual log or a linked task). It's paid when you meet the goal and lost if the month ends first, so steady work pays more than a last-minute push. Meeting a goal also leaves a landmark on the globe.
- A task can count toward a goal: link it in the task editor and set how much each completion adds (e.g. Evening run → +5 km). Checking the task off logs that amount; unchecking takes it back. Next month's goals start counting when their month begins.

**Decay**

Missing two or more daily tasks in a category spawns a **blight** (Deep Cooling, Dust Storm, Withering) that drains that system until you complete two tasks of that category.

**Focus sessions (pomodoro)**

Start a focus session from the FOCUS button in the top bar, or from a goal card to tag it to that goal. Pick a round length (15–60 min) and 1–4 rounds with 5-minute breaks between.

- Each finished round logs to its tagged goal: goals measured in minutes or hours get the time, goals counted in pomodoros or sessions get +1, and any other unit counts it as a day worked (so the reward still grows).
- The countdown shows in the top bar and the tab title, survives reloads, and chimes between rounds (can be turned off). Pause anytime; ending early asks whether to log the minutes done.
- Finished rounds show as blocks on the calendar and are summed up in Stats.

**Calendar**

A Calendar tab in the left column works like Google Calendar's phone app:

- Day, 3-day, week, month and list views, with Today and previous/next.
- Click empty time to add a 1-hour event, or drag across time to pick the range.
- Drag an event to move it (across days too) and drag its bottom edge to resize. Moves and deletes can be undone.
- All-day events, and repeats: daily, every weekday, weekly or monthly, with an optional end date. Changing one event in a series asks whether to change only that one or all of them.
- Events can take a category color. Goal deadlines show up automatically.
- Shortcuts: T today, J/K next/previous, D/X/W/M/A for day/3-day/week/month/list, C to create.

On touch screens, tap to create or edit; dragging scrolls the grid.

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
