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
| Hits | Knock 20% of junk loose (some shatters); at zero junk you lose hearts (3) |
| Enemies | Tin Bot, Sprinter, Spitter, Shield Bot, Anti-Mag, Scrap Thief (1:00), Splitter (1:30), Burrower (2:00), Magnet Bot (2:30), Bomber (3:00), Repair Drone (3:30); mixed squads; glowing elites after 4:00; one map-only enemy per map (Tyre Roller, Press Bot, Gravity Mine) |
| Bosses | Crusher mini-boss at 2:45 (armoured, stomps, drops a rare upgrade); The Compactor at 6:00 (charges, crushes junk into cubes, slams) |
| Upgrades | 19 cards + 4 evolutions (Molten Core, Buzzsaw, Fire Ring, Mega Magnet); cards show their combo partner |
| Replay | Results show the next unlock ("120 more scrap for the Fridge Magnet"); 3 active challenges pay scrap and are shown on the title and results |
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

`npm run playtest -- shots 4 520` runs a bot through a full run at 4× speed (needs `npm run dev`
on port 5173, or `URL=...`). With the current numbers its ball follows the rising cap
(60 → 250 pieces, total mass still climbing from fused pieces), it beats the Crusher at about
3:00, takes ~40 hits and finishes around 7:50. The bot is a decent player, so
humans will find it harder; playtest with real people before trusting the numbers.

## Before submitting (needs a human)

- [ ] Playtest with 2–3 people who haven't seen it; watch where they hesitate
- [ ] Check 60 FPS on a low-end Chromebook and a phone (headless testing can't measure real GPU speed)
- [ ] Check SDK events in the CrazyGames QA tool (local runs skip the SDK entirely)
- [x] Record the 15–20 s gameplay preview video (`store/preview-*.mp4`, rebuild with `tools/make-previews.sh`)
- [ ] Daily Seed "leaderboard" is your own best for the day on this device; a shared board needs a backend
