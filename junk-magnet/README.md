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
| Core loop | Move, junk attaches and orbits in rings, contact damage = mass × speed, caps 150 attached / 200 loose |
| Pulse | Space / button, 4 s cooldown, junk flies out and snaps back + shockwave; shorts out Anti-Mag auras |
| Hits | Knock 20% of junk loose (some shatters); at zero junk you lose hearts (3) |
| Enemies | Tin Bot, Sprinter packs, Spitter (bolts fly over junk: dodge, 3-shot volleys later), Shield Bot (hit its side), Anti-Mag (aura repels junk) |
| Boss | The Compactor at 6:00: charges, crushes junk into heavy cubes, slam attack, enrages at 8:00 |
| Waves | Every 30 s with a growing budget, calm 10 s gap every 2 min followed by a surge |
| Upgrades | 10 cards + 2 evolutions (Molten Core, Buzzsaw), pick 1 of 3, all numbers in `src/data/upgrades.json` |
| First 30 s | Title over live arena → magnet drops in → one slow bot pops into 3 bolts → pack of 6 → Pulse hint + cluster → first level-up, no text popups |
| Meta | Scrap coins, Garage with 4 magnets and 3 maps, Daily Seed (same map and spawns for everyone), saves in localStorage / CrazyGames data |
| Juice | Hit flash, hit-stop, capped shake (toggle), squash & stretch, spinning junk, zoom punch when junk doubles, sparks / dust / confetti, slow-mo on death and boss kill, rolling numbers, batched damage numbers |
| Audio | Synthesised SFX with the rising clink ladder, chiptune music (menu / run / boss), music + SFX sliders |
| Mobile | Floating joystick, Pulse button, pause icon; portrait and landscape layouts |
| CrazyGames SDK v3 | Wrapper loads only when embedded; loading / gameplay events, midgame ad on Play again (≥ 3 min apart), rewarded "Double scrap", mutes during ads |

## Tuning

All balance lives in `src/data/*.json` (`enemies.json` has waves and the boss, `junk.json`
has damage, knockback and the coin economy, `magnets.json`, `maps.json`, `upgrades.json`).

`npm run playtest -- shots 4 520` runs a bot through a full run at 4× speed (needs `npm run dev`
on port 5173, or `URL=...`). With the current numbers it reaches the boss at 6:00, takes 80+
hits, swings between 90 and 150 junk, and finishes around 7:30–8:00. The bot is a decent player, so
humans will find it harder; playtest with real people before trusting the numbers.

## Before submitting (needs a human)

- [ ] Playtest with 2–3 people who haven't seen it; watch where they hesitate
- [ ] Check 60 FPS on a low-end Chromebook and a phone (headless testing can't measure real GPU speed)
- [ ] Check SDK events in the CrazyGames QA tool (local runs skip the SDK entirely)
- [x] Record the 15–20 s gameplay preview video (`store/preview-*.mp4`, rebuild with `tools/make-previews.sh`)
- [ ] Daily Seed "leaderboard" is your own best for the day on this device; a shared board needs a backend
