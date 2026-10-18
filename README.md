# SECTOR-09 / StateShift

[Play the game](https://sector-09.vercel.app) · [GitHub repository](https://github.com/krishnaagarwal2025-a11y/sector-09)

A zero-dependency HTML5 Canvas tactical stealth game. Collect brass data nodes, hide behind concrete cover, and survive increasingly aggressive security units. Built with vanilla JavaScript and procedural graphics/audio.

## Project layout

```text
Escape/
├── public/                         # Only this directory is deployed
│   ├── index.html                  # Centered animated home menu
│   ├── 404.html                    # Missing-page recovery
│   ├── pages/
│   │   ├── play.html
│   │   ├── settings.html
│   │   ├── sound.html
│   │   ├── controls.html
│   │   └── exit.html
│   └── assets/
│       ├── css/
│       │   ├── theme.css
│       │   ├── menu.css
│       │   ├── game.css
│       │   └── errors.css
│       └── js/
│           ├── core/               # Startup, diagnostics, preferences
│           │   ├── bootstrap.js
│           │   ├── errors.js
│           │   ├── preferences.js
│           │   └── theme.js
│           ├── audio/
│           │   ├── sound-system.js
│           │   └── site-audio.js    # Site-wide activation and music continuity
│           ├── game/
│           │   ├── game.js          # Models, physics, AI, loop and rendering
│           │   └── self-tests.js    # Browser/Node model verification
│           └── ui/
│               ├── menu.js
│               └── touch-controls.js
├── scripts/
│   └── serve.cjs                   # Dependency-free development server
├── tests/
│   ├── unit.cjs
│   ├── project.cjs
│   └── browser.cjs
├── docs/
│   └── architecture.md
├── package.json                    # Commands only; no dependencies
├── vercel.json                     # Output directory, redirects, headers
├── .gitignore
├── .vercelignore
└── README.md
```

## Run

Open `public/index.html` directly, or use Node.js 22+ for local HTTP serving:

```sh
npm start
```

Visit [localhost:3000](http://127.0.0.1:3000). No `npm install` is required. Set `PORT` or pass a port to `node scripts/serve.cjs 8080` if needed. The logical playfield remains 800 × 600 and scales without changing collision geometry. Desktop supports a keyboard; phones/tablets automatically show touch controls.

## Phones and tablets

Rotate to **landscape**, tap **Start game**, and drag the **left joystick** to move. The right thumb buttons pause/resume through the menu and toggle all audio. Home, fullscreen (if supported), music, difficulty selection and replay are also tappable. Portrait remains playable and offers a rotation hint; orientation is never forced.

The joystick has a radial deadzone and variable speed, with full diagonal motion capped at keyboard speed. Pointer capture supports drags outside its base. Touch cancellation, lost capture, pause, focus loss and rotation clear input; rotation pauses an active run. Pause and Sound work with a second finger while the first holds the joystick. Safe-area padding accounts for notches, the short-screen start menu uses two columns, and the keyboard help box is hidden on touch devices. Decorative drawing is capped near 60 fps on touch devices while simulation remains at 120 Hz.

Phone layouts and real dispatched touch events were verified in Chromium emulation at 844 × 390, 667 × 375, 740 × 360, 932 × 430 and 568 × 320, plus portrait rotation. This is not a physical-device certification; fullscreen/audio availability still depends on the phone's browser.

Local-file storage policy varies by browser. Use HTTP or the deployed HTTPS site for consistent settings across pages.

## Pages and settings

The play page is a full-viewport canvas, with floating score/health/mode telemetry and compact Home/Pause/Fullscreen actions. Controls sit in a collapsible box at the bottom right and start collapsed on small screens. There is no gameplay header, footer or sidebar. The 800 × 600 world remains fully visible without distortion; extra aspect-ratio space uses the same matte field background. State labels remain on guards, while field events remain in the internal simulation log rather than a separate panel.

Home offers Play, Settings, Sound, Field manual and Exit. Game settings save difficulty, fullscreen, motion preferences, and **Light/Dark appearance**. The saved theme applies to menus, HUD, walls, grid and units. The Sound page provides independent **master, effects, siren and BGM** volume sliders, mute, and previews for collection, siren, contact, patrol deployment and BGM. System reduced-motion preferences are respected. Browser tab closing may require the tab's own close button; Exit explains that fallback.

The procedural BGM is a simple 16-step minor pattern at 88 BPM, now with stronger bass/melody levels and longer notes. It runs on the home page, Settings, Sound, Manual, Exit, and the game, including standby, pause and game over. A single shared audio instance prevents duplicate loops on a page. First playback requires a click or keypress under browser autoplay rules; the floating **Enable music / Music on** button provides an explicit control. Navigation remembers activation and the musical step in session storage. Independent HTML pages recreate their audio context, so a brief loading gap can occur, and a browser may require another interaction before resuming. Hidden tabs, mute, music volume zero and fatal errors stop BGM.

The shared siren sweeps from 300 to 540 Hz and stops immediately when you hide. Every actual additional patrol unit at a 50-point milestone plays a deployment cue. After the five-patrol cap, escalation continues without a false spawn cue. BGM defaults to 100%; existing browsers receive the maximum once for this revision, while later manual slider changes remain saved. Other saved volume choices are preserved.

Settings use `sector09.preferences` in local storage. Denied storage falls back to page-session memory with a visible notice. High scores are saved per mode; God uses `sector09.highScore.god.toughest` so former invincible-practice records do not count. The former single high score remains a Medium fallback.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move in eight directions |
| Space | Initialize |
| P / Escape | Pause/resume |
| F | Toggle fullscreen |
| M | Mute/unmute all sounds |
| T | Diagnostics and isolated self-tests |
| R | Restart after losing |

Loss of focus pauses automatically and clears held input. Pause offers mode switching and links to the other pages. Navigating away ends the active run; scores are saved on collection.

## Difficulty

| Mode | Initial guards | Patrol speed | Sight / loss range | Attack cooldown | Hit recovery | Speed per 50 points |
| --- | --- | --- | --- | --- | --- | --- |
| Easy | 1 | 46.5 px/s | 125 / 175 px | 1.4 s | 1.8 s | +5% |
| Medium | 2 | 62 px/s | 160 / 210 px | 1.05 s | 1.35 s | +8% |
| Hard | 3 | 77.5 px/s | 190 / 245 px | 0.75 s | 0.9 s | +12% |
| God | 5 | 89.9 px/s | 220 / 280 px | 0.55 s | 0.55 s | +15% |

All modes start with three integrity points. God is the toughest mode and is **not invincible**. Brass nodes yield 10 points each. Each run keeps 2 or 3 pickups on the map at once, spaced apart and clear of cover. Each lasts 10–14 seconds, with a shrinking timer ring and a fade in its final 3 seconds; collected or expired pickups are immediately replaced. Expiration awards no points and timers freeze during pause. Every 50 points increases speed and adds a regular guard up to five. At 100–149 points, one Warden replaces all normal guards. Its first arrival in each run pauses the simulation for a Warden introduction and warning. Tap Continue Game or press Space to resume the same encounter; pickup timers, guards and player remain frozen during the briefing. Later waves arrive without another briefing. At 150–199, two Wardens take over. At 200, normal patrols return at the current threat level, capped at five. The cycle repeats: one Warden at 300, two at 350, regular patrols at 400, and so on. Wardens have larger hulls, double chevrons, labels, a distinct deployment warning and sound. Their chase speed is at least 204 px/s versus the player's 170 px/s, scales with difficulty/threat, and cover still breaks pursuit. Wardens patrol the entire arena perimeter and central lanes. Cover still blocks sight; full-map patrol does not grant vision through walls. Three accepted hits end the game with a YOU LOST screen and replay controls. Cover immediately breaks pursuit and silences the visibility alarm.

## Technical design and diagnostics

The fixed-step 120 Hz simulation includes normalized movement, radius-aware boundary clamping, circle/rectangle wall sliding, finite-state enemies (PATROL, CHASE, ATTACK, RETURN), slab-based line of sight, visibility-graph navigation, whisker steering and smooth turns. Flat geometric drawing and Web Audio require no external assets or libraries.

Error boundaries cover required asset loading, missing DOM/modules, Canvas support, storage, audio, fullscreen, invalid physics state and frame failures. Recoverable issues show a dismissible notice. Fatal failures stop simulation/audio and offer Reload or Home. Diagnostics are local, deduplicated and capped at 100 distinct entries; inspect them with `window.SectorErrors.snapshot()`. No telemetry leaves the browser. See [architecture and failure handling](docs/architecture.md) for details and practical limits.

## Verification

```sh
npm test
npm run test:browser
```

`npm test` runs 19 top-level checks, including the 17 model regression cases, storage/error/audio fault tests, patrol/boss wave milestones, timed multiple pickups and expiration, boss chase speed and cover behavior, spawn audio triggers/cap, theme/music preferences, asset/link and JavaScript syntax checks, and server/deployment routing checks.

`npm run test:browser` requires an installed Chrome/Chromium browser. Set `CHROME_PATH` if it is not found automatically. It verifies all six pages, saved light theme including Canvas pixels, mixer, gameplay, siren visibility/cover triggers, site-wide BGM/phase restoration, pause/game-over continuity, mute and the music control, and responsive layout, then injects failures to verify recovery. OfflineAudioContext renders actual siren/music/patrol/boss/collection waveforms to assert increased BGM signal, silent mute and bounded peaks; this checks synthesis, not the user's speakers or perceived loudness. It uses a fresh temporary profile; screenshots go to ignored `artifacts/screenshots/`. No test dependencies are installed. Press T in-game to run the same 17 isolated model cases and inspect velocity vectors, LOS, distances, whiskers and frame timing.

## Deployment

Vercel publishes **only `public/`**, keeping source documentation, tests and tools out of the website. Existing `/play.html`, `/settings.html`, `/sound.html`, `/controls.html` and `/exit.html` bookmarks redirect to `/pages/...`. The project is connected to its private GitHub repository; the production game is public.

```sh
npx vercel deploy --prod
```

Run this from the repository root with an authenticated Vercel CLI.

## Scope

One fixed arena, single player and keyboard controls. Units collide with walls and arena bounds but may overlap each other. Difficulty keeps escalating after the unit cap. Optional browser APIs can be denied; implemented fallbacks are described above. The visibility graph is optimized for this four-obstacle map, rather than large generated worlds.


