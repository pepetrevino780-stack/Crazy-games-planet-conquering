# Publishing on CrazyGames

## 1. Build the upload

```sh
npm run build
```

This writes `dist/planetfall-conquest.zip` (well under 1 MB, with `index.html` at the root) and the unpacked files in `dist/game/`.
Upload the zip as an **HTML5** game in the CrazyGames developer portal.

## 2. Submission settings

| Setting | Value |
| --- | --- |
| Engine / type | HTML5 |
| SDK | HTML5 SDK v3 (already integrated) |
| **Progress Save** | **Enable the Data module option.** Saves go through `CrazyGames.SDK.data`; CrazyGames disables that module if this toggle is off. |
| Orientation | Landscape (portrait also works) |
| Mobile | Touch controls and a compact phone layout are in. **Leave "supports mobile" off until the game has been played on a real iPhone and Android phone** (only emulated phones were tested). |
| Audio mute through SDK | Supported: tick it |
| Cover images | `assets/crazygames/cover-landscape-1920x1080.png`, `cover-portrait-800x1200.png`, `cover-square-800x800.png`: only the title as text, with a hint of play (territories, capitals, a battleship shelling enemy land). Rebuild with `node tools/render-covers.cjs`. |
| Screenshots | `assets/crazygames/screenshot-*.png` (1920x1080 gameplay) |
| Preview videos | `assets/crazygames/preview-landscape-1920x1080.mp4` (16:9) and `preview-portrait-1080x1620.mp4` (2:3). 17 s, 30 fps, no sound, no cursor, normal speed; each opens on its cover for 0.5 s, then cuts to a late-game war (a busy front, a battleship duel, a capital falling). Rebuild with `tools/make-previews.sh`. |

### Listing text (ready to paste)

**Title:** Planetfall Conquest (19 characters; it matches the in-game title)

**Short description:** A single-player strategy game: conquer five alien planets in real time. Expand, defend, disrupt and outplan smarter enemy civilizations, and earn permanent upgrades as you go.

**Description:** Land on a strange alien world and grow your empire tile by tile. Push your borders into the wilderness, then go to war with rival civilizations. Take a rival's capital to throw it into disarray, and guard your own. A five-world campaign teaches a new strategy on each planet: expand on volcanic Vulkara, defend the crystal fields of Cryonis, disable the ancient defenses of Xythera, cut the fungal hubs of Mycelion, and time your assault to the eclipse on Noctyra. Earn Stellar Cores for permanent upgrades, unlock abilities and alien civilizations, or play endless skirmishes on procedurally generated worlds.

**Controls:**
- Click or tap land next to your border to attack it with your attack ratio of troops.
- Drag to pan; mouse wheel or pinch to zoom.
- Drag a building from the bar onto your land (or press 1–5 and click); 6 expedition, 0 battleship, R research, 7–9 abilities
- [ / ] attack ratio, L leaderboard, O objectives, C center on capital, Space pause

### Resubmission note (paste into the portal)

Changes since the second quality review (spec v2):

Visuals
- V1 Terrain repainted: a few flat tones per biome, no dithering on land, seas darker and desaturated, a soft highlight along the shore. Land and sea read apart in grayscale.
- V2 One pixel scale: the map opens at 4 screen pixels per tile or more, zoom snaps to whole pixels, and buildings use the same texel size as the ground.
- V3 The space backdrop never shows: the map always covers the window, even while the screen shakes.
- V4 Territory is a solid tint with a bright 2 px border (no hatching).

UI
- U1 The HUD covers under 20% of the screen at 907x510 (about 5% at 1920x1080): one-row empire bar (troops / cap and the ratio), other resources in its tooltip, compact two-row tool tiles.
- U2 One transient layer at a time: toasts queue one by one and wait while the training card, controls card or battle list is open.
- U3 Tooltips appear after 400 ms of still hover, on the far side of the cursor, and never while dragging or attacking.
- U4 The first world shows only Troops, Land and three tools (Habitat, Extractor, Strike); each later world unlocks more.
- U5 Full tool names (Extractor, Starport, Expedition, Research); no text under 12 px.

Gameplay
- G1 The first landing starts with twice the troops and 1.5x faster attacks (1.5x on world 1): the first click takes land within a second.
- G2 Three-step tutorial: tap land, drag a Habitat, take the enemy capital. The ratio step is gone; the first lesson is won in well under two minutes.
- G3 A goal chip with one line and a progress bar; a finished goal shows a banner with the next goal.
- G4 Floating numbers at 15 px, captured tiles flash, and the screen pulses when you take a capital.
- Capitals now need a real army to storm (half the defender's troops), so a thin spearhead can no longer win a world in seconds.

Audio and keys
- A1 Effects play at one loudness, music sits 6 dB under them, and at most 4 effects play per 250 ms.
- K1 Escape is never used; movement keys follow the physical layout (ZQSD on AZERTY); Ctrl/Cmd+W is blocked only in fullscreen.
- M1 "Supports mobile" is left off until the game has been played on real phones.
- P1 Store screenshots and both preview videos re-recorded with the new look (16:9 and 2:3, 17 s, opening on their cover, no toasts).

## 3. What the SDK integration does

Code: `js/platform.js`, wired up in `js/main.js`. Tests: `tests/platform.test.js`.

- **Init:** `SDK.init()` runs during loading, wrapped in `loadingStart` / `loadingStop`.
- **Gameplay events:** `gameplayStart` fires while a battle runs (including choosing a landing site). `gameplayStop` fires on pause, help, menus, debriefs, ads and hidden tabs. Repeated calls are filtered out.
- **Happy time:** `happytime` fires when a planet is conquered.
- **Midgame ads:** requested only at natural breaks, when starting a battle after a previous one ended (never before the session's first battle). The SDK enforces its own minimum interval. The game pauses while an ad plays.
- **Rewarded ads:** optional. After a victory the debrief offers "Watch an ad: +50% bonus cores", and the reward is granted only on `adFinished`.
- **Ad blockers:** unfilled ads, ad errors, blocked ads and ignored requests never stop the game. If no ad starts within 4 seconds, play continues.
- **Saving:** on CrazyGames, all saving uses the Data module (cloud-synced for logged-in players). Off the portal it falls back to `localStorage`.
- **Other platform rules:**
  - No custom fullscreen button: CrazyGames provides fullscreen.
  - No external links and no third-party ads or branding.
  - Space and the arrow keys don't scroll the page.
  - The right-click menu is disabled on the map.
- **Off-portal:** the game runs normally with the SDK missing, blocked, or in the `disabled` environment (any other website).

## 4. Test before submitting

1. Local test with the SDK in local mode: run `npx http-server dist/game -p 8080`, then open `http://localhost:8080/`. The SDK treats localhost as its local environment and shows test ads.
2. Upload to the portal and play it in the **QA tool**. Check:
   - A midgame ad appears when starting the second battle.
   - The rewarded button on a victory screen grants the bonus.
   - Progress persists after a reload.
3. Play once on a phone in landscape.

## 5. Notes and known gaps

- **Gameplay screenshots** for the listing are in `assets/crazygames/` (`screenshot-*.png`).
- **Sound** is synthesised (no audio files): effects, a looping chiptune per world, planet ambience and a distant-battle bed that rises with your fronts. Settings has master, music and effects volume. It is muted while ads play and follows CrazyGames' mute setting (`SDK.game.settings.muteAudio` and its settings listener), so tick **"The game supports CrazyGames muting audio through SDK"** in the portal.
- **No sitelock:** nothing stops other sites from embedding a copy of the build. Add one only if needed.
- **Requirements not checked directly:** the CrazyGames documentation site could not be reached from the build environment. This integration follows their SDK v3 docs as summarised in search results. Re-check the [technical requirements](https://docs.crazygames.com/requirements/technical) and [ad requirements](https://docs.crazygames.com/requirements/ads/) before submitting.
