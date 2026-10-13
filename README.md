# Alien Worlds: Planetary Conquest

A real-time territory-conquest strategy game in retro pixel art, for desktop and mobile browsers.
Land on a strange alien world, grow your empire tile by tile, and break rival civilizations across a
five-planet campaign. Each planet teaches a new strategy. Skirmish mode generates a new world every time.

**Publishing on CrazyGames:** `npm run build` creates `dist/alien-worlds.zip`. See [CRAZYGAMES.md](CRAZYGAMES.md).

## Play

**Online (GitHub Pages):** https://pepetrevino780-stack.github.io/Crazy-games-planet-conquering/
(after Pages is enabled: Settings → Pages → Deploy from a branch → this branch, `/ (root)`).

**Locally:**

No build step and no dependencies. Serve the folder over HTTP (ES modules don't load from `file://`):

```sh
npm start            # http://localhost:8080
```

### How it plays

1. **Land.** Click open ground on the main continent to choose your landing site. You have 10 seconds; if you don't choose, you land automatically.
2. **Expand.** Click land next to your border. That sends your *attack ratio* of troops, and the border advances tile by tile until the attack runs out of troops. Unclaimed wilderness is cheap. Mountains, rivers and volcanoes are slow and costly.
3. **Grow.** You have one troop pool. When an attack ends, its surviving troops march home and rejoin it (even above your cap for a while, shown in amber). Its cap grows with your land, and troops regrow fastest when your army is well below the cap, so keep attacking.
4. **Fight.** Every rival is a labelled nation blob. Attacking a civilization costs more where its garrison is dense or the land is fortified. **Capture a capital and that civilization collapses.** Lose yours and you are defeated.
5. **Build and research.** Spend minerals on Habitats (+troop cap), Extractors (+minerals), Starports (dropships across the sea), Bastions (defence) and Research Spires (exotic matter). Use a building tool on one of your own buildings of that type to upgrade it (up to level 3): effects add up per level, Bastions reach further and Starports launch faster dropships. Spend exotic matter on research and energy on special abilities.

| Action | Desktop | Touch |
| --- | --- | --- |
| Attack / expand | Click land next to your border | Tap |
| Pan | Drag, or WASD / arrow keys | Drag (never attacks) |
| Zoom (smooth) | Mouse wheel, `Q` / `E`, `+` / `-` | Pinch |
| Attack ratio | Slider, `[` / `]` | Slider |
| Build | `1`–`5`, then click your land | Build bar |
| Expedition / Research | `6` / `R` (or just click land across the sea) | Build bar |
| Abilities | `7` `8` `9` | Build bar |
| Leaderboard / Objectives | `L` / `O` | Top bar |
| Center on capital / Pause | `C` / `Space` | Top bar |
| Battle panel (top right) | Your troops vs each country you fight; click a row to glide there, Retreat to recall (−25%) | Tap the battles chip |
| Radial menu: attack, expedition, build, ally, gift, betray, info | Right-click a spot | Long-press |
| Explain anything | Hover it (map tiles, tools, resources, buttons) | Long-press |
| Pin a tile's details | Click it | Tap |

## The campaign

| # | World | Lesson | What's new | Victory | Main enemy |
|---|---|---|---|---|---|
| 1 | **Vulkara**: Ashen Cradle | Attack | Expansion, attack ratio, magma vents, eruptions | Capture the Ember Throne | Cindari Clans: relaxed |
| 2 | **Cryonis**: Frozen Frontier | Defend | Terrain defence, bastions, crystal deposits, whiteout storms | Hold 3 crystals for 2:30, or take the Frost Bastion | Glacari Concord: cautious, retaliates |
| 3 | **Mycelion**: Living World | Disrupt | Network hubs nourish land and shield the Brood Heart; spore blooms | Destroy the Brood Heart | Mycelial Swarm: aggressive expander |
| 4 | **Xythera**: Ancient Machines | Plan | Relays power automated defences; ancient factories; scarce growth | Core Foundry plus 2 factories | Axiom Directorate: tactical |
| 5 | **Noctyra**: Eternal Eclipse | Mastery | Command nodes add enemy attack fronts; the eclipse strips the Citadel; everything returns | Conquer the Eclipse Citadel | Umbral Dominion: coordinated |

**Tutorial:** a Tutorial button on the title screen (offered once to new players) opens seven short,
replayable lessons on a small, calm world where nobody attacks you and the game waits for each step: land and
expand; direction and survivors; build and upgrade; the battle panel and retreat; across the sea with Starports
and dropships; research and abilities; and winning a world. Each lesson gets a checkmark, and finishing all seven
pays 25 Stellar Cores once. After that, Vulkara's in-world training shrinks to three steps.

On the first visit to Vulkara, a step-by-step training card teaches by doing: attack, expand, use the attack
ratio, build, seize a vent. An arrow on the map or a glowing button shows where to act, and tools and resources
unlock as each step introduces them (locked tools show a padlock; Skip unlocks everything). Each world also has
10–18 independent nations with mixed personalities, short
objectives with bonus rewards, contextual tips (can be turned off), and a field manual (`?`) that pauses the game.

**Diplomacy:** every independent nation has a level of trust in you (hover its land to see its attitude).
Gifts of troops or minerals raise it; attacking it lowers it. With enough trust a nation accepts an alliance:
allies never attack you or each other, help fight whoever attacks you, and can't be attacked by you. Betraying
an ally leaves a traitor mark for 30 s, and every other nation trusts you less.

**Skirmish modes:** Classic, Free-for-all (capture any 4 capitals), Teams (half the nations fight on your side,
half with the Dominion) and Fast build (half-price buildings, double income, faster growth, short ceasefire).

**Fair difficulty:**
- Rival civilizations start with footprints comparable to yours.
- Difficulty comes from behaviour: decision speed, when and whom to strike, reserves, retaliation, and multi-front coordination (`AI_PROFILES` in `js/campaign.js`).
- You can read the enemy: red arrows show where attacks on you are heading (independent nations' attacks need
  Scouting 1, which also adds attack sizes), a warning fires when a neighbour masses troops near its cap on
  your border, and each rival's personality (Relaxed, Isolationist, Defensive, Opportunist, Aggressive,
  Calculating, Mastermind) is shown on the leaderboard and its hover card. Opportunists wait for a neighbour
  to get into a war, then strike whoever is weakest.
- Every defeat ends with a debrief explaining what went wrong.
- Repeated defeats on a planet enable an *adaptive assist* that slows its enemy commanders.

**Permanent progression:**
- Victories pay Stellar Cores, which buy upgrades, abilities and new player civilizations.
- First clears pay in full; replays and skirmishes pay less.
- The results screen charts every empire's land over the battle, lists time, peak land, battles won,
  enemies defeated and attacks repelled, previews the next world and offers a replay.
- Each victory earns up to 3 stars (win, all objectives, under par time). Your best is shown on the campaign map.

**Saving:**
- The campaign and the battle in progress autosave every 5 seconds, on pause, and when the tab closes.
- Saves go to the CrazyGames Data module on CrazyGames, and to `localStorage` elsewhere.
- A world is regenerated from its seed, so a save is only the run-length-encoded ownership map plus a little state (usually under 50 KB).

## Art direction

Everything is original pixel art, generated or hand-authored in code:
- **Maps:** each world is generated as a coherent, Earth-like planet, at 3× the original width and height
  (Vulkara 900×570 up to Noctyra 1230×750 tiles).
  - About a third land: one big main continent where you and the main enemy start, 3–5 smaller named
    continents separated by straits and open ocean, and island chains. Crossing an ocean needs an expedition.
  - Two layers of domain warp shape the coastlines; a 2–3 tile shelf and a dark coast outline frame the land,
    and the open ocean darkens with distance from shore.
  - Mountain ranges with passes, and rivers that run to the sea.
  - Volcano clusters, inland lakes, biomes and ruins.
  - Painted from the theme's limited palette with ordered dithering.
- **Sprites:** buildings, capitals (one per civilization), sites, dropships and icons are character grids, tinted with the owner's colour.
  - Three levels of detail: simple 5×5 map icons when zoomed far out, the standard sprites, and hand-drawn
    double-resolution buildings close up.
  - Each building level has its own silhouette (a side module at level 2; two modules and a roof beacon at
    level 3). New buildings rise out of the ground, and lights blink.
- **Backdrops:** skies, planets, the eclipsed sun and the title landscape are procedural.
- **Scaling:** pixels stay crisp, because the camera only uses integer zoom.
- **Balance on bigger maps:** each planet has a `scale` (tiles per original tile). Troop amounts, regrowth,
  income per tile and attack speed scale with its area, radii and distances with its length, so a battle
  plays at the same pace as on the original map.
- **Fonts:** Pixelify Sans and Silkscreen, bundled locally (SIL OFL).

Readability comes first:
- Ownership is shown by colour, borders and patterns (the player's land is striped, the main enemy's is dotted).
- Labels are sized by empire and never overlap.
- A strategic view flattens the terrain.
- Big moments get feedback: the colony ship crash-lands (debris, shockwave, crater, screen shake) and your
  territory spreads out from the crater, dropships touch down the same way in miniature, your advancing front
  pulses and ticks, eruptions shake the ground, captured capitals get a banner and fanfare, and troops, costs
  and gains (eruption minerals, spore-bloom troops, Rapid Muster) float up as numbers.
- Reduced motion turns off particles, pulsing and screen shake.

## Adding content

- **A new world type:** add an entry to `THEMES` in `js/world/themes.js` with terrain names, a palette and generator settings. Skirmish mode picks it up automatically.
- **A new planet:** add an entry to `PLANETS` in `js/campaign.js` with theme, seed, size, enemy, nations, sites, events, victory conditions and objectives.
- **A new site type or building:** add it to `SITE_TYPES` or `BUILDINGS` (its effects are data: income, growth, defence radius, power), plus a sprite in `js/art/sprites.js`.
- **A new enemy behaviour:** add a profile to `AI_PROFILES`.

## Project layout

```
index.html, css/style.css   interface shell and responsive layout
js/world/                   noise, themes, procedural world generation, terrain painting
js/sim/core.js              rules: troops, costs, defence, sites, attacks
js/sim/engine.js            battle setup, spawn, simulation loop, commands, victory, saves
js/sim/ai.js                NPC commanders
js/campaign.js              planets, enemies, sites, buildings, research (data)
js/progression.js           rewards, upgrades, civilizations, settings, save file
js/render.js                pixel map renderer and camera
js/art/                     sprites, icons, backdrops, title scene, planet orbs
js/main.js                  screens, input, HUD, notices, sound, saving
js/audio.js                 synthesised sound effects
js/platform.js              CrazyGames SDK v3 wrapper (no-op elsewhere)
tools/                      build, balance probes, world previews, cover renderer
tests/                      automated tests
```

## Tests and tools

```sh
npm test                                   # engine, worlds, campaign, saves, platform
npm run lint
node tools/balance.js mastermind 4 2       # bot plays every planet (profile, seeds, upgrade tier)
node tools/trace.js mycelion tactical 0 1  # empire sizes over time for one battle
node tools/worldpreview.js out 1234        # PNG previews of every world type
```
