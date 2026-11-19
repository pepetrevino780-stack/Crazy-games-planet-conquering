# Junk Magnet

Top-down survivors-like for CrazyGames: you are a magnet, broken robots drop junk that orbits
you, and the growing junk ball is your weapon and armour. Design spec: [SPEC.md](SPEC.md).

Phaser 3 + TypeScript + Vite. Every sprite, sound and music track is generated in code,
so the whole build is about **0.4 MB gzipped** (1.3 MB JS + 40 KB fonts).

```bash
npm install
npm run dev          # play locally at http://localhost:5173
npm run build        # type-check + static build in dist/ (relative paths)
npm run zip          # build + junk-magnet.zip ready to upload to CrazyGames
npm run build:play   # copy the build to play/ (for GitHub Pages)
```

## What's in the game

| Area | Status |
| --- | --- |
| Core loop | Move, junk attaches and orbits in rings, contact damage = mass × speed |
| Growth | Junk capacity starts at 60 and rises 10 per level (up to 250). A full ball fuses new junk into its lightest piece (bolt → gear → can → pipe → cube), so it keeps getting heavier. A bar under the counter shows it filling |
| Pulse | Space / button. Hits harder the fuller the ball is, **Overcharged** (bigger, gold) when full; catching 6+ robots refunds half the cooldown and pays scrap |
| Difficulty | Robots that reach your junk ball now hit you through it (junk cuts damage by up to 35%; less if you keep moving), Drillers bore through the ball from 2:00, and Crusher slams and Bomber blasts rip 35–45% of your junk off. Hard and Nightmare unlock after wins |
| Health | 100 HP bar (flashes under 30%, heartbeat under 15%). Every hit costs HP; a full ball cuts damage by up to 40% and some junk gets knocked loose. No passive healing: rare health packs (~1 per 45 s), Spare Plating / Patch Up cards, Black Hole eating junk |
| Aggression phases | Calm (0:00, wander) → Hunting (1:00, Sprinters lunge) → Swarming (2:30, flanking, leading shots, junk ripped off) → Frenzy (4:00, Bomber rushes, spawns ahead of you) → Overdrive (6:00). Speed, damage (4 → 12 HP) and robots on screen ramp per phase, with a warning banner and heavier music |
| Aimed attacks | Left-click Fireball (auto-aims on touch, 0.6 s). Cards add Junk Shotgun (right-click / special button / E, spends 8 junk), Magnet Mine, Chain Lightning (every 5th fireball), Meteor Drop (hold left-click), Inferno evolution (lava trails). Cooldown icons sit next to Pulse; burning robots panic and spread fire |
| Enemies | Tin Bot, Sprinter, Spitter, Shield Bot, Anti-Mag, Scrap Thief (1:00), Splitter (1:30), Burrower (2:00), Magnet Bot (2:30), Bomber (3:00), Repair Drone (3:30); mixed squads; glowing elites after 4:00; one map-only enemy per map (Tyre Roller, Press Bot, Gravity Mine) |
| Bosses | Crusher at 2:30, Magnetron at 4:30 (rips junk off, fires bolt rings, calls minions, drops a chest), The Compactor at 6:00 (30,000 HP). Old note: Crusher mini-boss at 2:45 (6,500 HP, ~45 s fight: ground slam, then junk can't hurt it for 3.5 s; charge along a red line for 25 HP; drops a gold rare upgrade); The Compactor at 6:00 (charges, crushes junk into cubes, slams) |
| Upgrades | 24 cards + 5 evolutions (Molten Core, Buzzsaw, Fire Ring, Mega Magnet, Inferno); cards show their combo partner; rare cards are gold, glow and chime |
| Content | Slot-machine treasure chests (1, 3 or 5 upgrades; the first of each run gives 3) from elites, the Magnetron and Golden Robots; battery, fuel, spring and gold junk with powers; Fire / Storm / Tank / Shredder build paths that lock out their opposite and give a perk at 6 levels; Black Hole Pulse evolution; a junk shop between phases; car crushers and electric fences; kill-streak calls (SCRAP FRENZY! = damage boost) |
| Ads | Optional rewarded ads only when an ad can play: revive once per run (after 1:00), reroll cards once per run, daily bonus chest, "need scrap?" in the Garage (100 → 50 → 25 a day), double scrap. Midgame ad only on Play again, max one per 3 min, and never right after a rewarded ad. Input is blocked during ads; nothing is given on ad errors. `?fakeads` simulates ads in `npm run dev` |
| Replay | Daily free chest; Daily Seed modifiers (Everything Explodes, Double Speed, Only Sprinters, Glass Cannon, Gold Rush); 12 achievements with titles; Mega Magnet and Repulsor magnets. Results show the next unlock ("120 more scrap for the Fridge Magnet"); 3 active challenges pay scrap and are shown on the title and results |
| First 30 s | Title over live arena → magnet drops in → one slow bot pops into 3 bolts → pack of 6 → Pulse hint + cluster → first level-up, no text popups |
| Meta | Scrap coins, Garage with 4 magnets and 3 maps, Daily Seed, saves in localStorage / CrazyGames data |
| Juice | Hit flash, hit-stop, capped shake (toggle), squash & stretch, zoom punch, sparks / dust / confetti, slow-mo on death and boss kill, rolling numbers, batched damage numbers |
| Clarity | Flat floors, bright rim on every robot, thick XP bar, telegraph circles and beams for every attack |
| Audio | Synthesised SFX with the rising clink ladder, chiptune music (menu / run / boss), music + SFX sliders |
| Mobile | Floating joystick, Pulse button, pause icon; portrait and landscape layouts |
| CrazyGames SDK v3 | Wrapper loads only when embedded; loading / gameplay events, midgame ad on Play again (≥ 3 min apart), rewarded "Double scrap", mutes during ads |

## Tuning

All balance lives in `src/data/*.json` (`enemies.json` has waves and the boss, `junk.json`
has damage, knockback and the coin economy, `magnets.json`, `maps.json`, `upgrades.json`).

`npm run playtest` runs a kiting bot (target: dies before 5:00) through a full run at 4× speed, and `npm run playtest:idle`
is the AFK test: an idle player must die before 1:30 (and `--fullball`, with a full junk ball, before 2:00) or it exits with an error (both need
`npm run dev` on port 5173, or `URL=...`). Currently: idle ≈ 0:37, idle with a full ball ≈ 1:50, bot ≈ 3:00. With the current numbers the bot beats the Crusher in about
45 s and dies at about 6:00 when The Compactor arrives, which matches the target that most
players die between 3:00 and 6:00. The bot is a decent player, so
humans will find it harder; playtest with real people before trusting the numbers.

## Before submitting (needs a human)

- [ ] Playtest with 2–3 people who haven't seen it; watch where they hesitate
- [ ] Check 60 FPS on a low-end Chromebook and a phone (headless testing can't measure real GPU speed)
- [ ] Check SDK events in the CrazyGames QA tool (local runs skip the SDK entirely)
- [x] Record the 15–20 s gameplay preview video (`store/preview-*.mp4`, rebuild with `tools/make-previews.sh`)
- [ ] Daily Seed "leaderboard" is your own best for the day on this device; a shared board needs a backend
