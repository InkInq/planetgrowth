# Planet Growth design notes

Decisions about where the game is going, and ideas pinned for later. The README describes what's built; this file records what's decided and why.

**The test for every feature:** it should help you manage your life, not give you a game to manage. If a feature adds decisions that have nothing to do with your real habits, it doesn't belong.

## Decided

### One planet, through the eras
You keep a single planet and evolve it through the eras. There are no new planets each month.

### Monthly cataclysm: a setback, not a reset (built)
- At the end of every month a cataclysm strikes. Its type (ice age, dust storm, flood, plague) is random and only changes how it looks and reads.
- **It takes 25% of every system's level.** This is a simple, fixed amount, so you can plan around it rather than manage it.
- **Active blights make it worse:** a system with a blight on it at that moment loses more.
- **Setbacks can undo milestones.** Cataclysms and blights can drop a system below what a milestone needs, and the milestone is lost until it's earned again. Keeping a buffer above your milestones before the month ends protects them.
- Numbers: 25%, or 40% with an active blight. A milestone is lost below 80% of its requirement (each one checked on its own) and earned back at 100%. Eras can drop.
- What a milestone unlocked stays unlocked after it's lost, so one setback can't snowball (losing First Rain doesn't stop Water forming).
- A world younger than 14 days at its first month's end is spared, so nobody's first week ends in a cataclysm.
- It plays on the globe (ice sweeping down, dust storms, the sea surging, land withering), then a report shows each system before and after, milestones lost, and Pop that survived. It's also kept in History.

### Pop (population) (built)
- A number that shows how alive the planet is. For now it has no other use: no unlocks are bought with it.
- It grows slowly on its own, toward a ceiling set by the milestones reached.
- Part of it survives each cataclysm: more after a consistent month (daily tasks done, goals met).
- Numbers: ceilings First Rain 200, First Sea +500, First Green +1,500, Biomes Spread +4,000. Grows 4% of the gap a day, shrinks 5% a day when over the ceiling. Survival = 60% + 30% × share of daily tasks done that month + 5% per goal met, at most 95%.

### Pacing (to be measured by simulation)
The eras span months, not weeks. Targets for a steady player (about 70% of daily tasks, goals mostly met):

| Era | Time |
| --- | --- |
| Era I | 4–6 weeks |
| Era II | 2–3 months |
| Era III | 3 months or more |

There should be a milestone to reach every week or two, so Eras II and III each need about 5–6.

### Playtest results (October 2026)
Measured with `node tools/playtest.mjs`: simulated players on the real rules for 12 months, 40 runs each.
Casual does about 40% of daily tasks (4 tasks, 1 goal a month), steady about 70% (6 tasks, 2 goals), dedicated about 90% (7 tasks including a Stabilizer, 3 goals).

| | Casual | Steady | Dedicated |
| --- | --- | --- | --- |
| First milestone (Polar Frost) | 4.2 weeks | 5 days | 4 days |
| Era II (Biomes Spread) | 29 weeks, 83% of runs | 7.3 weeks | 5.4 weeks |
| Days with a blight active | 81% | 16% | 1% |
| Blights a month | 15 | 12.6 | 3.1 |
| Milestones lost in a year | 2.5 | 0.1 | 0.1 |
| Pop surviving a month's end | 77% | 91% | 95% |
| System levels before month's end (month 3 → 12) | ~500 → ~1,000 | ~2,000 → ~3,500 | ~3,000 → ~5,500 |

What it shows:
- **Steady pacing is close.** A milestone lands every 4–12 days, but Era I takes 7.3 weeks against the 4–6 week target. Lowering Biomes Spread to Life 350 + Water 450 brings it to 6.1 weeks (dedicated 4.6). **Applied.**
- **Blights are too frequent.** One day off blights every category, so a steady player gets one every 2–3 days, and a category with a single task blights every time it's missed. Casual players live under a blight. Decided: blights stay as they are (one per category, started by a missed task). The tested alternative was a blight starting only when a category misses 2+ tasks two days in a row. Steady drops to 2.4 a month (3% of days), and casual to 20% of days, with Era II in 12 weeks instead of 29.
- **The cataclysm sets a natural ceiling.** Losing 25% a month while gaining a steady amount makes each system level off at about 4× what you add in a month. Each consistency level gets its own plateau, so Era II and III requirements can be pitched at those plateaus: a milestone held only while you stay that consistent.
- **The cataclysm only bites early for now.** After month 2 steady players are far above every Era I requirement, so they lose nothing; it's Era II content that will give it teeth (requirements around 1,000–3,500).
- **Pop stops growing around month 3**, when it reaches the Era I ceiling (6,200). Era II needs its own ceilings.
- **A daily Stabilizer makes a system grow without limit** (dedicated Atmosphere reaches 28,000 versus about 5,000 for the others), because its Steady boosts never fade. Tested fix: a Stabilizer halves the fade instead of stopping it (8,600). Decided: the Stabilizer stays as it is.
- **A two-week break costs nothing** once past Era I: with the app closed nothing runs, and the planet picks up where it was.

## Pinned for later

### Unlocks bought with Pop
Possible abilities, each one simple and rewarding consistency:

| Unlock | Ability |
| --- | --- |
| Moon | Once a week, a missed day doesn't start a blight |
| Ring | Steady boosts fade half as fast |
| Satellite (Era III only) | Warns a day ahead which category is close to a blight; sharper forecast |
| Task effect: Seed | Grows +1% for each day in a row you complete it |
| Task effect: Echo | Repeats half its effect the next day if you complete it again |

Open questions: whether they survive a cataclysm (new task effects probably should), and what they cost.

### Cosmological events
Rare events such as a solar storm or a meteor shower. Open: a gamble you choose to make with Pop, or things that happen to you that tasks can answer. The second fits the test above better.

### Planet types
The same milestone ladder, with different starting conditions, milestone names and visuals per type. A cataclysm could change the planet's type (an ice age leaves a frozen world).

### Era II and III content
- **Era II (Living World):** a balance rule, where systems far out of balance cause droughts, floods or storms. Possible milestones: Forests Rise, Weather Cycles, First Creatures, Rivers, First Settlements.
- **Era III:** gated by things the game already tracks: goals met, focus time, streaks, balance. The moon, ring and satellite could be Era III milestones on the globe if they aren't unlocks.

## Dropped
- A new planet every month, and a universe of planets.
- A central star that banks resources.
- The UFO that carried Pop between planets (survivors replace it).
- Signal, a new resource for Era III. It wasn't tied to anything the game already tracks.
