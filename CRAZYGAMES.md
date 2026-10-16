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

**Description:** Land on a strange alien world and grow your empire tile by tile. Push your borders into the wilderness, then go to war with rival civilizations. Take a rival's capital to throw it into disarray, and guard your own. A five-world campaign teaches a new strategy on each planet: expand on volcanic Vulkara, defend the crystal fields of Cryonis, cut the fungal hubs of Mycelion, disable the ancient defenses of Xythera, and time your assault to the eclipse on Noctyra. Earn Stellar Cores for permanent upgrades, unlock abilities and alien civilizations, or play endless skirmishes on procedurally generated worlds.

**Controls:**
- Click or tap land next to your border to attack it with your attack ratio of troops.
- Drag to pan; mouse wheel or pinch to zoom.
- Drag a building from the bar onto your land (or press 1–5 and click); 6 expedition, 0 battleship, R research, 7–9 abilities
- [ / ] attack ratio, L leaderboard, O objectives, C center on capital, Space pause

### Resubmission note (paste into the portal)

Changes since the quality rejection:
- Renamed from "Alien Worlds" to **Planetfall Conquest** (the old name belonged to other games).
- New players land straight in play: no menus or briefing screens on first launch; returning players get one Play button.
- Onboarding shows instead of tells: one short line per step with an animated mouse/finger and key caps, only three core actions on the first world, and a controls card that fades after the first attack.
- Music for every world, planet ambience, a battle bed, volume sliders, and support for the CrazyGames mute setting.
- Keys follow the keyboard layout (ZQSD on AZERTY); Escape is never used in-game.
- Cleaner phone layout (the HUD covers about half as much of the screen), labelled tool tiles, and a fix for a blank map on older iOS Safari.
- New covers with gameplay, and preview videos at 16:9 and 2:3 that open on their cover.

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
