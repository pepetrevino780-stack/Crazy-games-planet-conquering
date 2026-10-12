# Publishing on CrazyGames

## 1. Build the upload

```sh
npm run build
```

This writes `dist/alien-worlds.zip` (about 55 KB, with `index.html` at the root) and the unpacked files in `dist/game/`.
Upload the zip as an **HTML5** game in the CrazyGames developer portal.

## 2. Submission settings

| Setting | Value |
| --- | --- |
| Engine / type | HTML5 |
| SDK | HTML5 SDK v3 (already integrated) |
| **Progress Save** | **Enable the Data module option.** Saves go through `CrazyGames.SDK.data`; CrazyGames disables that module if this toggle is off. |
| Orientation | Landscape (portrait also works) |
| Mobile | Supported: touch controls and responsive layout |
| Cover images | `assets/crazygames/cover-landscape-1920x1080.png`, `cover-portrait-800x1200.png`, `cover-square-800x800.png` |

### Listing text (ready to paste)

**Title:** Alien Worlds: Planetary Conquest

**Short description:** Conquer five alien planets in real time. Expand, defend, disrupt and outplan smarter enemy civilizations, and earn permanent upgrades as you go.

**Description:** Lead your fleet across five strange worlds, each with its own lesson. Seize neutral land on volcanic Vulkara, hold crystal deposits through the storms of Cryonis, and cut the fungal network hubs that shield the Brood Heart on Mycelion. On Xythera you capture energy relays to shut down ancient defenses. On Noctyra you break a coordinated empire and time your assault to the eclipse. Enemies get smarter on every planet, and between battles you spend Stellar Cores on upgrades, special abilities and new alien civilizations.

**Controls:**
- Tap or click your territory to select it, then tap a connected territory to attack.
- Drag between territories to attack or move troops.
- 1–4: attack ratio (25/50/75/100%)
- Q / W / E: special abilities
- Space: pause
- Esc: clear selection

## 3. What the SDK integration does

Code: `js/platform.js`, wired up in `js/main.js`. Tests: `tests/platform.test.js`.

- **Init:** `SDK.init()` runs during loading, wrapped in `loadingStart` / `loadingStop`.
- **Gameplay events:** `gameplayStart` fires while a battle runs. `gameplayStop` fires on pause, help, menus, debriefs, ads and hidden tabs. Repeated calls are filtered out.
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

## 5. Known gaps

- **Art mismatch:** the covers and title screen use the new pixel-art style, but battles still use the earlier look until the pixel redesign is finished. If a reviewer flags covers that don't match gameplay, swap in a battle screenshot or finish the redesign first.
- **No audio yet,** so there is nothing to mute during ads. When sound is added, mute it in the ad pause handler (`setAdHandlers` in `js/main.js`).
- **No sitelock:** nothing stops other sites from embedding a copy of the build. Add one only if needed.
- **Requirements not checked directly:** the CrazyGames documentation site could not be reached from the build environment. This integration follows their SDK v3 docs as summarised in search results. Re-check the [technical requirements](https://docs.crazygames.com/requirements/technical) and [ad requirements](https://docs.crazygames.com/requirements/ads/) before submitting.
