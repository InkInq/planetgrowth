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

**First Steps**

A new world opens with a welcome card and six First Steps: wake the crust, make a daily task, set a goal, link a task to it, visit the World panel, and check Settings. Each one is done by actually doing it, with a short note on what it changed. Finishing pays +20 to every system and leaves a landmark. Older worlds get a one-time offer above the task list; Settings can start or replay it.

**Task categories feed planetary systems**

| Category | System | What you see |
| --- | --- | --- |
| Physical | Crust · Heat | Ice caps melt, terrain warms |
| Mental | Atmosphere | Haze, then cloud bands |
| Social / Creative | Life | Green spreads, then forests, herds and cities |

Water isn't a category. It forms on its own once Heat and Atmosphere are balanced enough to bring the First Rain.

**Task effects**

- **Steady:** permanent +0.06/h to its system. Generators drift down about 5% a day if neglected.
- **Surge:** doubles its system for 12 hours.
- **Catalyst:** instant +15 to its system.
- **Stabilizer:** stops drift and blight drain on its system for 24 hours.

**Daily vs goals**

- Daily tasks repeat and keep your baseline rates healthy.
- Goals are monthly: each belongs to a calendar month (this month or next) and is due on its last day. At most 3 per month; met goals keep their slot, abandoned ones free it. Goals not at 100% when the month ends are marked missed.
- Each goal holds a reward that grows: +30 to its system and +0.1/h to start, plus +4 and +0.01/h for every day you work on it (a manual log or a linked task). It's paid when you meet the goal and lost if the month ends first, so steady work pays more than a last-minute push. Meeting a goal also leaves a landmark on the globe.
- Goals are tracked in percent. A task can count toward a goal: link it in the task editor and set the share each completion adds. The editor suggests one (a daily task: 100 ÷ the days in the month, so doing it every day reaches 100%; a one-off: 10%). Checking the task off logs that share; unchecking takes it back. Next month's goals start counting when their month begins.
- Each goal card shows its pace: a marker on the bar for where it would be today if spread evenly over the month, a status (On track within 5%, Ahead, or Behind by some %), where it's heading at this pace (from day 3), and what finishes it ("4.7% a day · about 6 more Run").
- Saves from before goals were in percent convert on load: progress, linked tasks and past logs are rescaled, and the old target is kept for reference.

**Decay**

Missing two or more daily tasks in a category spawns a **blight** (Deep Cooling, Dust Storm, Withering) that drains that system until you complete two tasks of that category.

**Month's end: the cataclysm**

When a month ends, a cataclysm strikes: an Ice Age, Dust Age, Great Flood or Plague, picked at random. It plays out on the globe, then a report shows what it took.

- It takes 25% of every system, and 40% from a system with an active blight.
- A milestone is lost when a system falls below 75% of what it needs, from a cataclysm or a blight. It's earned back at the full amount. What it unlocked (Water forming, Life at full speed) stays unlocked, and the era can drop.
- The World panel's Month's End card shows the days left, which milestones would be lost if it struck today, and the level each system needs to keep them.
- A new world is spared if it's less than 14 days old when its first month ends.

**Pop**

Pop is a number for how alive the planet is. It grows slowly toward a ceiling set by the milestones you hold (First Rain 200, First Sea +500, First Green +1,500, Biomes Spread +4,000) and shrinks if the ceiling drops. At month's end, 60% survives, plus up to 30% for the share of daily tasks done that month and 5% per goal met (95% at most).

**Focus sessions (pomodoro)**

Start a focus session from the FOCUS button in the top bar, or from a goal card to tag it to that goal. Pick a round length (15–60 min) and 1–4 rounds with 5-minute breaks between.

- Each finished round logs to its tagged goal at the rate set on that goal ("Focus time adds 10% per hour"). A goal with no rate counts the round as a day worked, so its reward still grows.
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

**Reminders**

Settings → Reminders turns each kind on or off: daily tasks (at a time you pick, if any are left), blight warnings (in the evening if one would spawn overnight, and when one starts draining), goal deadlines (a set number of days before the month ends) and focus rounds. Nothing is sent until notifications are allowed. As a web app, reminders fire only while Planet Growth is open (a background tab is fine); anything that came due while it was closed shows when you're back.

**Playing on two devices**

Saves stay on the device. Export the world on one device and Import it on the other. The first time, Import replaces the new device's empty world; after that both copies are the same world, and Import offers to merge: tasks, goals, calendar events, history and focus rounds from both are kept, deletions stick, goal progress adds up, and check-offs made only on the other device still count toward the planet. No account or server is involved.

**Panels**

- Both side panels collapse with the arrow button in their header (or `[` and `]`). A collapsed panel leaves a slim tab at the screen edge to bring it back, and the globe grows into the space. The choice is remembered. On phones, tap the bar at the top of a sheet to close it.
- The right panel has two tabs: **Systems** (planet systems and milestones) and **History**, a day-by-day timeline of tasks done, goal progress, focus rounds and planet events, with filters. Tapping a planet event turns the globe to it; a task jumps to it in the list; a goal opens it.

**Events on the globe**

Milestones, goals, blights, recoveries, lost milestones and cataclysms appear as nodes on the planet. Tap one to see when it happened and which tasks caused it or can fix it.

**Milestones and eras**

Seventeen milestones, earned in order. Each one changes how the planet looks, and goes away if the milestone is lost.

| Era | Milestones | On the globe |
| --- | --- | --- |
| I · Cold Desert | Polar Frost Melts, Haze Thickens, First Rain, First Sea, First Green | Ice melts, haze and clouds, the sea fills, green on the shores |
| II · Living World | Biomes Spread, Rivers Run, Forests Rise, Weather Cycles, First Creatures | Grasslands, rivers, dark forests, turning storms, grazing herds |
| III · Awakened World | First Settlements, Cities Glow, Orbital Station, Ships Cross the Seas, Space Elevator, First Satellite, Reach for the Stars | Lights at dusk and night, cities by day, a crewed station, ships, a cable from the equator to orbit, satellites, rocket launches |

Era III milestones also need monthly goals met (5 to 13, counted over the planet's life). In Era III, ships, planes and satellites grow in number with Pop, and an active blight distorts its region of the globe: the ground ripples and red scan lines flicker through it.

A forecast under the globe estimates when the next milestone lands at your current pace, and how many more goals it needs.

**Goals on the planet and in the sky**

- Each goal met this month puts a moon around the planet (two at most); meeting all three adds a ring. They reset when the month ends and stay with that month's planet in the sky.
- **SKY** (top right of the planet, or scroll out) zooms out to the sky: a star with a planet for each month the world has lived through, placed around the orbit like a clock (up to 12). Your planet is this month's; the others show how it looked when their month ended, with the moons and ring their goals earned. Empty places on the orbit are the months still to come. Tap a month for its summary: tasks done, daily-task %, goals and how far each got, focus time, milestones reached or lost, blights, and what its month's end took.
- Each goal you're working on is a nebula in the sky, condensing into a star as its % rises. A ring of ten dots lights one per 10%, a gold dot marks where the pace says it should be, and it glows warm when on track and cool when behind. At 100% it becomes a twinkling star that stays in your sky for good (new ones glow for a few days). A goal that ends short simply fades; it's still in that month's summary.

## Files

- `js/sim.js`: simulation (rates, generators, blights, milestones, stats). Pure logic, no DOM.
- `js/merge.js`: merging two saves of the same world (Import in Settings). Pure logic, no DOM.
- `js/globe.js`: pixel globe renderer (a 112 px buffer scaled up crisply).
- `js/main.js`: starts the app and runs the game loop.
- `js/ui/`: the interface, one file per part of the screen: `tasks`, `goals`, `calendar`, `focus`, `systems` (header and World panel), `history`, `stats`, `settings`, `themes`, `world` (globe and its markers), `cataclysm` (month's end and its report), `layout` (dialogs, phone tabs, side panels), `tutorial` (First Steps), `reminders`, plus `store` (the save), `render` (redraw everything), `feedback` (toasts), `keywords` and `util`.
- `js/icons.js`: 8×8 pixel icons drawn as inline SVG.
- `sw.js`, `manifest.webmanifest`, `icons/`: PWA install and offline support.

Tuning numbers live at the top of `js/sim.js` and in `MILESTONES`.

`node tools/playtest.mjs` simulates casual, steady and dedicated players for a year on the real rules and reports pacing (see DESIGN.md for results).

For testing in the browser console: `__pg.fastForward(24)` advances the world by 24 hours, and `__pg.cataclysm('ice')` plays a month's end now (`ice`, `dust`, `flood` or `plague`). On `localhost` the offline cache is skipped, so edits show on reload.

## Roadmap ideas

Decided direction and pinned ideas live in [DESIGN.md](DESIGN.md).


- Rhythm detection: suggest scheduling tasks you reliably do on certain weekdays
- Era II and beyond: civilization, orbit, moons
- Task-mix shaping the planet's look (volcanic vs ocean worlds)
