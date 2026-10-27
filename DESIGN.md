# Planet Growth design notes

Decisions about where the game is going, and ideas pinned for later. The README describes what's built; this file records what's decided and why.

**The test for every feature:** it should help you manage your life, not give you a game to manage. If a feature adds decisions that have nothing to do with your real habits, it doesn't belong.

## Decided

### One planet, through the eras
You keep a single planet and evolve it through the eras. There are no new planets each month.

### Monthly cataclysm: a setback, not a reset
- At the end of every month a cataclysm strikes. Its type (ice age, dust storm, flood, plague) is random and only changes how it looks and reads.
- **It takes 25% of every system's level.** This is a simple, fixed amount, so you can plan around it rather than manage it.
- **Active blights make it worse:** a system with a blight on it at that moment loses more.
- **Setbacks can undo milestones.** Cataclysms and blights can drop a system below what a milestone needs, and the milestone is lost until it's earned again. Keeping a buffer above your milestones before the month ends protects them.

### Pop (population)
- A number that shows how alive the planet is. For now it has no other use: no unlocks are bought with it.
- It grows slowly on its own, toward a ceiling set by the milestones reached.
- Part of it survives each cataclysm: more after a consistent month (daily tasks done, goals met).

### Pacing (to be measured by simulation)
The eras span months, not weeks. Targets for a steady player (about 70% of daily tasks, goals mostly met):

| Era | Time |
| --- | --- |
| Era I | 4–6 weeks |
| Era II | 2–3 months |
| Era III | 3 months or more |

There should be a milestone to reach every week or two, so Eras II and III each need about 5–6.

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
