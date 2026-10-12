# Planet Conquest

A real-time territory-conquest strategy game for desktop and mobile browsers.
The campaign is five connected planets. Each one teaches a new strategy, and the last one tests them all.

> Vulkara teaches you to expand, Cryonis to survive, Mycelion to disrupt, Xythera to plan,
> and Noctyra asks you to combine everything you have learned.

## Play

No build step and no dependencies. Serve the folder over HTTP (ES modules don't load from `file://`):

```sh
npm start            # npx http-server on http://localhost:8080
# or: python3 -m http.server 8080
```

**Controls**

| Action | Mouse / keyboard | Touch |
| --- | --- | --- |
| Select a territory (tap more to combine) | Click | Tap |
| Attack a connected target | Click the target while selected | Tap the target |
| Attack or reinforce | Drag from your territory | Drag |
| Attack ratio 25 / 50 / 75 / 100 % | `1` `2` `3` `4` | Ratio buttons |
| Abilities | `Q` `W` `E`, then click a target | Ability buttons |
| Pause (and save) | `Space` | ❚❚ |
| Clear selection | `Esc` | Tap empty space |

**Combat:** an attack captures a territory when *arriving troops × attack strength* beat
*defenders × defense bonus*. Fortified regions, capitals, powered defenses and hub-nourished regions
defend better. Fleets only travel along lanes, so chokepoints matter.

## The campaign

| # | Planet | Lesson | New mechanics | Victory | NPC behaviour |
|---|---|---|---|---|---|
| 1 | **Vulkara** | Learn to Attack | Neutral expansion, attack ratios, magma vents, eruptions | Capture the Ember Throne | *Relaxed*: grabs empty land, rarely strikes you |
| 2 | **Cryonis** | Learn to Defend | Fortified chokepoints, crystal deposits (+production), slow ice passes, whiteout storms that freeze fleets in transit | Hold both crystals for 2:30 **or** take the Frost Bastion | *Cautious*: reinforces threatened regions, retakes losses, waits out storms |
| 3 | **Mycelion** | Learn to Disrupt | Network hubs nourish linked regions (growth and defense); cut-off regions wither; the Brood Heart is shielded while any hub stands; spore blooms | Destroy the Brood Heart | *Aggressive*: expands on two fronts |
| 4 | **Xythera** | Learn to Plan | Energy relays power automated defenses (fortified, fire on passing fleets); ancient factories (+production); scarce production; grid surges | Capture the Core Foundry **and** hold 2 factories | *Tactical*: guards infrastructure and home, punishes territories left empty |
| 5 | **Noctyra** | Prove Your Mastery | Command nodes (one enemy attack front each), eclipse cycle that strips fortifications, limited supply; reuses fortresses, crystals, hubs, relays, defenses and factories | Conquer the Eclipse Citadel | *Coordinated*: multi-front attacks, defends its core, times assaults to the eclipse |

Each planet adds short tutorial objectives, each worth bonus cores. The current one highlights its
target on the map and shows a one-line tip. The **?** button holds optional explanations, and
contextual tips can be switched off.

### Fair difficulty

Difficulty rises through NPC *behaviour*, not bigger armies:

- Decision speed, targeting precision, objective awareness, defense, counterattacks and coordination all improve from planet to planet (see `AI_PROFILES` in `js/campaign.js`).
- No enemy civilization gets better production, attack or defense multipliers than the player's baseline. Enemy start garrisons are calibrated against the player's own.
- Every defeat ends with a debrief that names what went wrong: capital stripped, attacks into fortifications, storm or turret losses, a shielded target, idle production, ignored command nodes.
- **Adaptive assist:** each defeat on a planet (up to 3) makes its NPCs react a little slower. It switches off once the planet is conquered. Difficulty can also be set to Cadet, Commander or Warlord.

### Permanent progression

Victories pay **Stellar Cores**: a base reward, plus bonus objectives (once each), a swift-victory
bonus and a capital-safety bonus. Replaying a conquered planet pays 30% of the base reward.
Cores buy permanent upgrades:

- Starting reserves, production efficiency, resource extraction (crystals and factories), defensive doctrine
- Scouting & intelligence: deeper vision, full intel, threat forecasts
- Abilities: Orbital Strike, Rapid Muster, EMP Pulse
- Alien civilizations with their own trade-offs: Kryll Hive, Vexari Ascendancy, Lumen Wardens

The cores you can earn are well short of buying everything, so you have to choose.

### Saving

The campaign autosaves to `localStorage`, including the battle in progress (every 5 seconds, on
pause, and when the tab is hidden or closed). Close the browser mid-battle and **Resume battle**
continues from the same moment. The simulation is deterministic, so a resumed battle plays out
exactly as it would have. Corrupt or outdated saves fall back to a fresh campaign without breaking the game.

## Project layout

```
index.html, css/style.css   UI shell and responsive layout
js/campaign.js              planets, maps, objectives, NPC profiles (all data)
js/rules.js                 shared rule queries (defense, growth, power, shields, vision)
js/game.js                  deterministic, serialisable battle simulation
js/ai.js                    NPC commander brain
js/progression.js           rewards, upgrades, civilizations, save file
js/render.js                canvas renderer (rotates the map on portrait screens)
js/main.js                  screens, input, HUD, tips, autosave
tests/campaign.test.js      automated checks for the campaign success criteria
tools/balance.js            bot-vs-bot balance probe
tools/production.js         production balance per map
```

## Tests

```sh
npm test
```

The suite covers the campaign success criteria:

- Map validity and each planet's distinct mechanics.
- NPC profiles that improve from planet to planet.
- Every victory condition, including Cryonis's hold-the-crystals path.
- The defeat debrief.
- Rewards and upgrades carrying over.
- Save, load and resume determinism, and corrupt-save recovery.
- A bot-driven learning-curve check: a careless commander loses planets 2–5, while a capable commander with upgrades can win all five.

Balance probe: `node tools/balance.js <profile> <seeds> <upgradeTier>`, e.g. `node tools/balance.js mastermind 8 2`.
