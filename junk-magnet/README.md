# Mycelion (formerly Junk Magnet)

*Hive Rising.* They came to conquer your planet. Turn their army into your swarm.

Top-down survivors-like for CrazyGames. You're the Hive Core, the living heart of the alien
world Mycelion. Human colonists drop from orbit to take it; every invader you kill is infected
and joins the swarm circling you, and that growing swarm is your weapon and your armour.
Design spec: [SPEC.md](SPEC.md).

> The project folder, its `play/` build, the npm package and the save key keep the old
> `junk-magnet` name on purpose, so existing links keep working:
> **Play:** https://pepetrevino780-stack.github.io/Crazy-games-planet-conquering/junk-magnet/play/

Phaser 3 + TypeScript + Vite. Every sprite, sound and music track is generated in code,
so the whole build is about **0.4 MB gzipped**.

```bash
npm install
npm run dev          # play locally at http://localhost:5173
npm run build        # type-check + static build in dist/ (relative paths)
npm run zip          # build + junk-magnet.zip ready to upload to CrazyGames (upload it as "Mycelion")
npm run build:play   # copy the build to play/ (for GitHub Pages)
```

## What's in the game

| Area | Status |
| --- | --- |
| Core loop | Move; infected colonists become swarmlings that circle you in a living cloud; contact damage = mass × speed |
| Growth | Swarm size starts at 60 and rises 10 per level (up to 250). A full swarm merges new swarmlings into its lightest one (spore → grub → crawler → brute → titan), so it keeps getting heavier |
| Spore Burst | Space / button. Hits harder the bigger the swarm, **Overcharged** when full; catching 6+ colonists refunds half the cooldown |
| Health | 100 HP bar, bright green → yellow (half) → red (blinking under 30%). A full swarm cuts damage by up to 40%; no passive healing, only rare nectar pods and cards |
| Aggression phases | Calm → Hunting (1:00) → Swarming (2:30) → Frenzy (4:00) → Overdrive (6:00), with banners and heavier music |
| Aimed attacks | Left-click Acid Spit. Cards add Barb Volley, Spore Mine, Chain Lightning, Hive Drop and the Lava Bloom evolution |
| Colonists | Trooper, Scout Bike, Rifleman, Riot Shield, Jammer, Harvester Kid, Squad Pod, Tunneler, Siphon Trooper, Demolisher, Medic Drone; squads; glowing elites; world-only Rover, Pile Driver and Grav Mine |
| Bosses | Siege Walker at 2:30, Drop Carrier at 4:30, The Colony Ship at 6:00 |
| Upgrades | 24 cards + 6 evolutions (Magma Gland, Razor Swarm, Acid Ring, Endless Brood, Lava Bloom, Void Burst); Acid / Storm / Tank / Razor build paths |
| Content | Slot-machine supply crates; shock, acid, bouncer and golden swarmlings; a Feeding Pit between phases; lava vents and thorn walls on every world; kill-streak calls (HIVE FRENZY! = damage boost) |
| Meta | Biomass; the Evolution Chamber with 6 hive cores and 3 worlds (Mycelion, Vulkara, Cryonis); Daily Seed with modifiers; challenges; 12 achievements; Hard and Nightmare |
| Ads | Optional rewarded ads only when an ad can play (revive, reroll, bonus pod, need biomass, double biomass); midgame ad only on Play again, max one per 3 min. `?fakeads` simulates ads in `npm run dev` |
| Audio | Synthesised wet squelches, chitter and a hive hum; the attach sound still climbs the same rising pitch ladder; music for menu / run / boss |
| Mobile | Floating joystick, Spore Burst button, pause icon; portrait and landscape layouts |
| CrazyGames SDK v3 | Loads only when embedded; loading / gameplay events, midgame + rewarded ads, mutes during ads |

### Old → new names

Internal ids in `src/data/*.json` and texture keys keep their old names (`bot-tin`, `junk-bolt`,
`magnet-horseshoe`, `crusher`…) so saves, balance and code are unchanged; only art, names,
text, colours and sounds changed.

| Junk Magnet | Mycelion |
| --- | --- |
| Red horseshoe magnet | Hive Core |
| Junk ball, bolt → gear → can → pipe → cube | Swarm, spore → grub → crawler → brute → titan |
| Battery / fuel / spring / gold junk | Shock / acid / bouncer / golden swarmlings |
| Pulse, Fireball | Spore Burst, Acid Spit |
| Junk Shotgun, Magnet Mine, Meteor Drop | Barb Volley, Spore Mine, Hive Drop |
| Robots (Tin Bot, Sprinter, Spitter, Shield Bot, Anti-Mag, Repair Drone…) | Colonists (Trooper, Scout Bike, Rifleman, Riot Shield, Jammer, Medic Drone…) |
| Crusher, Magnetron, The Compactor | Siege Walker, Drop Carrier, The Colony Ship |
| Scrap coins, Garage, Junk shop, treasure chest | Biomass, Evolution Chamber, Feeding Pit, supply crate |
| Junkyard, Factory, Space Station | Mycelion, Vulkara, Cryonis |
| Car crushers, electric fences | Lava vents, thorn walls |

## Tuning

All balance lives in `src/data/*.json` (`enemies.json` has waves and the boss, `junk.json`
has damage, knockback and the coin economy, `magnets.json`, `maps.json`, `upgrades.json`).

`npm run playtest` runs a kiting bot (target: dies before 5:00) through a full run at 4× speed, and `npm run playtest:idle`
is the AFK test: an idle player must die before 1:30 (and `--fullball`, with a full swarm, before 2:00) or it exits with an error (both need
`npm run dev` on port 5173, or `URL=...`). Currently (after the Mycelion reskin, numbers unchanged): idle ≈ 0:33, idle with a full swarm ≈ 1:41, bot ≈ 3:09 (dies to the Siege Walker's
Swarming phase), inside the target that most players die between 3:00 and 6:00. The bot is a decent player, so
humans will find it harder; playtest with real people before trusting the numbers.

## Before submitting (needs a human)

- [ ] Playtest with 2–3 people who haven't seen it; watch where they hesitate
- [ ] Check 60 FPS on a low-end Chromebook and a phone (headless testing can't measure real GPU speed)
- [ ] Check SDK events in the CrazyGames QA tool (local runs skip the SDK entirely)
- [x] Record the 15–20 s gameplay preview video (`store/preview-*.mp4`, rebuild with `tools/make-previews.sh`)
- [ ] Daily Seed "leaderboard" is your own best for the day on this device; a shared board needs a backend
