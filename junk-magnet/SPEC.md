# Junk Magnet — Game Design Spec

Nov 16, 2026 · @pepe

## Overview

**Junk Magnet** is a top-down survivors-like where you are a living magnet: every enemy you break drops scrap that sticks to you, and the growing, spinning ball of junk *is* your weapon. A run lasts 5–8 minutes, starts in one click, and ends in a satisfying explosion of everything you collected.

**One-line pitch (for the store page):** *Smash robots, steal their scrap, become a planet-sized junk ball.*

### Design pillars

1. **Instantly readable.** One input (move). The magnet idea is understood in 3 seconds without text.
2. **Growth you can see.** Your power is literally on screen: the bigger the junk ball, the stronger you are.
3. **Crunchy chaos.** Every hit clinks, flashes and shakes. Physics creates funny, clip-worthy moments.
4. **One more run.** Short runs, pick-1-of-3 upgrades, and unlocks that add *variety*, not just stats.

### Audience and targets

| Item | Target |
| --- | --- |
| Players | CrazyGames audience, 13+, desktop first, mobile touch supported |
| Run length | 5–8 min (boss at 6:00) |
| Time to first fun | Under 5 s from page load to moving |
| Avg. playtime goal | 10+ min (≈2 runs) |
| Day-1 retention goal | 10–15% |
| Initial download | Under 20 MB (mobile homepage eligible) |
| Rating | PEGI 12-safe: robots and junk, no blood |

## Core loop and mechanics

The loop runs on three timescales: **seconds** (steer the junk ball into robots), **minutes** (pick upgrades, survive waves, beat the boss), **meta** (spend scrap on new magnets and maps).

### Controls

| Input | Desktop | Mobile |
| --- | --- | --- |
| Move | WASD / arrow keys (AZERTY ZQSD supported) | Floating virtual joystick |
| Pulse (the only button) | Space | Tap button, bottom-right |
| Pause | P (never Esc, the browser uses it) | Pause icon |

**Pulse** repels all junk outward for 0.5 s, then it snaps back. It is a shockwave attack with a 4 s cooldown and the game's one skill moment.

### The junk system (the twist)

- Broken robots drop 2–5 **junk pieces** (bolts, gears, cans, pipes, a rare TV).
- Junk within the **magnet radius** flies to you and orbits in rings. Your magnet slowly spins the ring.
- Each piece does contact damage = its **mass × speed**. More junk = a bigger, faster-hitting cloud.
- **Taking a hit knocks 20% of your junk loose** instead of dealing HP damage first. Junk is your armour *and* your weapon. At zero junk, hits cost hearts (3 hearts).
- A **cap of 150 attached pieces** keeps performance safe; extra junk converts to scrap coins.

### Enemies (robots, waves every 30 s)

| Enemy | Behaviour | Teaches |
| --- | --- | --- |
| Tin Bot | Walks at you | Basics |
| Sprinter | Fast, fragile, comes in packs | Keep junk spinning |
| Shield Bot | Front shield, hit from the side | Positioning |
| Anti-Mag | Its aura pushes your junk away | Use Pulse |
| Spitter | Shoots slow bolts from range | Dodge |
| Boss: The Compactor (6:00) | Crushes junk into cubes, charges | Everything |

Difficulty rises with a spawn budget that grows each wave, with a calm 10 s gap every 2 minutes (dominance, then surge).

### In-run upgrades (pick 1 of 3, every level-up)

Killing robots fills an XP bar; each level offers 3 cards with at most 20 words each.

- **Stronger Field:** +25% magnet radius.
- **Spin Cycle:** junk orbits 30% faster.
- **Polarity Flip:** Pulse also pulls distant junk.
- **Hot Scrap:** junk sets robots on fire.
- **Explosive Cans:** cans explode on impact.
- **Heavy Metal:** junk is 50% heavier, you are 15% slower.
- **Second Ring:** junk forms two counter-rotating rings.
- **Scrap Shield:** first hit each wave loses no junk.

Rare **evolutions** combine two maxed cards (e.g. Hot Scrap + Explosive Cans = *Molten Core*).

### Meta-progression (between runs)

- **Scrap coins** carry over, so no run is wasted.
- Unlock **magnets** that change play, not just stats: Horseshoe (starter), Fridge Magnet (junk sticks in a flat line), Electromagnet (Pulse every 2 s, shorter range), Black Hole (eats junk for HP).
- Unlock **maps**: Junkyard → Factory (conveyor belts) → Space Station (low gravity, junk drifts).
- **Daily Seed:** same map and spawns for everyone, one leaderboard per day.
- **No** loot boxes, energy timers or punishing streaks.

## First 30 seconds

The player is moving within 5 seconds and has a junk ball and an upgrade choice by 25 seconds, with zero text popups. Tutorials are shown by the world, not explained.

| Time | What happens | What it teaches |
| --- | --- | --- |
| 0–2 s | Title screen: big **PLAY** button over the live arena. One click starts (and unlocks audio). | Nothing to read |
| 2–5 s | Magnet drops in with a *thunk*. A pulsing WASD / joystick glyph fades after first move. | Movement |
| 5–10 s | One slow Tin Bot walks in. You bump it, it pops into 3 bolts that *clink* onto you, rising pitch. | Junk sticks to you |
| 10–20 s | 6 bots arrive. Your little bolt ring shreds them; junk grows visibly. | Junk = weapon |
| ~20 s | A Pulse glyph glows on Space / button; a tight cluster arrives. | The one skill |
| ~25 s | First level-up: time slows, 3 cards slide in. | Choice and growth |

Rules: no menus before play, settings live in pause, death → results → **Play again** in one click (under 1 s).

## Aesthetic direction

The look is **"Saturday-morning junkyard"**: chunky, hand-drawn-feeling vector shapes with thick dark outlines, warm rusty colours for junk, and one electric cyan for everything magnetic. It must read clearly at 800×450 and look good as a tiny thumbnail.

### Art style

- **Shapes:** simple geometric sprites drawn in code or SVG (no texture art needed). 3 px dark outline on everything, so junk pops off the floor.
- **Perspective:** flat top-down with a soft drop shadow under each object.
- **Robots:** round, goofy, one big eye. They "die" by popping apart, never bleeding (PEGI 12).
- **The magnet:** a red horseshoe with a face; it squashes when moving, stretches when Pulsing.
- **Magnetic field:** cyan dashed circle that ripples outward; junk being pulled leaves short cyan streaks.
- **Arenas:** dark, low-contrast floor (so action reads), with props at the edges: tyre piles, crushed cars, fences.

### Palette

| Role | Colour | Hex |
| --- | --- | --- |
| Floor (Junkyard) | Deep asphalt | `#1E1B24` |
| Floor details | Dusty plum | `#2E2838` |
| Outlines | Near-black | `#120F16` |
| Player magnet | Magnet red | `#E8423F` |
| Magnetic energy, UI accent | Electric cyan | `#3EE6F2` |
| Junk (metal) | Steel grey / rust orange | `#A7B0BA` / `#D9772B` |
| Junk (rare) | Brass gold | `#F2C14E` |
| Enemies | Toxic lime | `#9BE564` |
| Danger, boss | Hot pink | `#FF3D7F` |
| Text | Off-white | `#F4F1EA` |

Each map recolours only the floor and props (Factory: teal steel; Space Station: navy with stars). Player, junk and enemy colours never change, so gameplay always reads.

### Typography and UI

- **Font:** one chunky display font, e.g. *Lilita One* or *Luckiest Guy* (free, Google Fonts, self-hosted) for titles and numbers; *Nunito* bold for small text.
- **HUD:** junk count (big, top-centre, bounces when it grows), XP bar along the top, hearts top-left, timer top-right, Pulse cooldown ring around the button.
- **Upgrade cards:** sticker-style cards with a thick outline, a big icon, name, and at most 20 words. Rarity = border colour (grey, cyan, gold).
- **Buttons:** large, rounded, slight tilt, press down 4 px on click. Minimum 48 px touch targets.
- **Damage numbers:** small, white, pop up and fade; crits in gold and larger.

### Audio

- **Clink ladder:** each junk attach plays a metal *clink*; pitch rises with each piece in a quick chain, resets after 0.5 s. This is the signature sound.
- **Pulse:** deep *whoomp* + electric crackle. **Level-up:** a bright arpeggio. **Hit taken:** a crunchy scrape as junk flies off.
- **Music:** upbeat funky/chiptune loop, ~120 BPM; boss gets a heavier track. Use free CC0 or self-made (e.g. jsfxr for SFX, BeepBox for music).
- Separate music and SFX volume sliders, saved locally.

### Juice checklist

- [ ] White hit flash on robots (1 frame)
- [ ] 40–60 ms hit-stop on big hits and kills of elites
- [ ] Screen shake scaled to impact, capped, with a setting to turn it off
- [ ] Squash and stretch on the magnet and on popping robots
- [ ] Junk pieces bounce and spin as they fly in
- [ ] Camera zoom-out punch each time junk count doubles
- [ ] Particles: sparks on hits, dust puffs on movement, confetti of scrap on boss kill
- [ ] Slow-motion + zoom on run death and boss kill
- [ ] Junk count and score numbers roll up, not jump
- [ ] Everything eases in and out (no linear UI motion)

### Thumbnail and store art

Thumbnail click rate counts from 23 Nov 2026, so treat it as a feature: a huge glowing junk ball with the grinning red magnet in the centre, robots flying off, cyan field ring, title in the chunky font. No fake footage: the thumbnail must show the real game.

## Technical spec

Build it in **TypeScript + Phaser 3 + Vite**, output a static `dist/` folder with relative paths, and keep the initial download under 20 MB (target: under 5 MB).

### Stack

| Piece | Choice | Why |
| --- | --- | --- |
| Engine | Phaser 3 (Arcade physics) | Mature, tons of examples Claude Code knows well |
| Language | TypeScript | Catches bugs early |
| Build | Vite, `base: './'` | Relative paths CrazyGames requires |
| Art | Code-drawn shapes + a few SVG/PNG atlases | Tiny download, consistent style |
| Audio | Phaser sound, OGG + MP3 | Small files, works on iOS |
| Saves | `localStorage` behind a wrapper (later the CrazyGames data module) | Unlocks and settings persist |

### Architecture

- **Scenes:** `Boot` → `Preload` → `Menu` (live arena behind PLAY) → `Game` + `HUD` overlay → `Results`. `Upgrade` and `Pause` are overlay scenes.
- **Systems (one file each):** `Player`, `JunkSystem` (attach, orbit, detach), `EnemySpawner` (wave budget), `UpgradeSystem` (card pool, data-driven), `MetaSave`, `AudioManager`, `Juice` (shake, hit-stop, flash helpers), `CrazySDK` wrapper.
- **Data files:** `enemies.json`, `upgrades.json`, `magnets.json` so balance is tuned without touching code.
- **Object pools** for junk, enemies, bullets and particles; no `new` in the game loop.

### Performance rules

- All movement uses **delta time** (same speed at 60, 144, 165 Hz).
- Junk orbit is computed math (angle + radius), not physics bodies; only the ring's collision is checked against enemies.
- Caps: 150 attached junk, 200 loose junk, 120 enemies, 300 particles.
- Target 60 FPS on a 4 GB Chromebook; add a "low effects" toggle.

### CrazyGames requirements

- [ ] SDK v3 loaded and `await window.CrazyGames.SDK.init()` called; wrapper no-ops when running outside CrazyGames.
- [ ] `gameplayStart()` when a run begins, `gameplayStop()` on pause, results and menus.
- [ ] `loadingStart()` / `loadingStop()` around preload.
- [ ] Rewarded ad (Full Launch only): optional "revive once" or "double scrap" after a run; reward only on completion; game works fully with adblock.
- [ ] Midgame ad only on the results screen, never more than every 3 min.
- [ ] No custom fullscreen button, no external links or app-store links.
- [ ] English, PEGI 12, readable at 800×450 and 907×510.
- [ ] Audio starts only after the first click/tap.
- [ ] Works in Chrome and Edge, desktop and mobile; handles resize and orientation.

## Build plan with Claude Code

Build in six milestones, each playable at its end. Start every Claude Code session by pointing it at this spec (save it as `SPEC.md` in the repo) and ask for one milestone at a time; playtest before moving on.

1. **Prototype (week 1): "Is it fun with grey boxes?"**
   - Prompt: *"Read SPEC.md. Set up Phaser 3 + TypeScript + Vite with base './'. Build the Game scene: player moves with WASD/arrows using delta time, Tin Bots chase the player, killed bots drop junk that flies to the player and orbits, and junk damages bots on contact. Use plain circles."*
   - Done when: it is already fun to grow a ball and smash bots.
2. **Core run (week 2)**
   - Prompt: *"Add the wave spawner from SPEC.md, XP and level-ups with the pick-1-of-3 upgrade overlay using upgrades.json, the Pulse ability, hearts, junk knocked loose on hit, and a Results screen with one-click Play again."*
3. **Content (week 3)**
   - Prompt: *"Add all enemies from the Enemies table, the Compactor boss at 6:00, the remaining upgrade cards and one evolution. Keep all numbers in JSON."*
4. **Art and juice (weeks 4–5)**
   - Prompt: *"Apply the Aesthetic direction section: palette, outlined sprites drawn in code, fonts, HUD layout, sticker-style cards. Then implement every item in the Juice checklist with a central Juice helper and a screen-shake toggle."*
   - Add sounds and music; tune the clink ladder.
5. **Meta and mobile (week 6)**
   - Prompt: *"Add scrap coins, the magnet and map unlock screen, Daily Seed, save data in localStorage, touch joystick + Pulse button, and responsive scaling for 800×450 up to 1920×1080."*
6. **CrazyGames integration and polish (week 7)**
   - Prompt: *"Integrate the CrazyGames SDK v3 through a wrapper that no-ops locally: init, loading and gameplay start/stop events. Check every item in the CrazyGames requirements checklist and fix anything missing. Profile and keep 60 FPS with the caps from SPEC.md."*

**Tip:** after each milestone, have 2–3 friends play without explanation and watch silently. Wherever they hesitate is what to fix next.

## Pre-submission checklist

Tick every box before uploading; the last rejection happened at visual QA, so polish is the gate.

- [ ] A stranger understands the goal in 5 seconds with no help
- [ ] Playing within one click; no text popups in the first minute
- [ ] Every hit has a sound, flash and feedback; nothing feels like a prototype
- [ ] One consistent art style across menu, game, cards and results
- [ ] Restart after death in one click
- [ ] No bugs in 10 full runs (desktop + phone)
- [ ] Initial download under 20 MB; loads under 10 s on slow 4G
- [ ] Same speed at 60 and 144 Hz
- [ ] Text readable at 800×450
- [ ] SDK events fire correctly (check in the CrazyGames QA tool)
- [ ] Original name, icon and thumbnail (no look-alikes of other games)
- [ ] 15–20 s gameplay preview video and an honest, eye-catching thumbnail
- [ ] Short store description: the pitch, controls, and 3 bullet features

After Basic Launch starts, watch average playtime and the 1-minute conversion, and ship fixes during the 7–21 day test window: updates go live instantly.

Sources: CrazyGames requirements, CrazyGames quality guidelines, Basic Launch metrics.
