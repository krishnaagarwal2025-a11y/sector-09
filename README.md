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
│       │   ├── menu.css
│       │   ├── game.css
│       │   └── errors.css
│       └── js/
│           ├── core/               # Startup, diagnostics, preferences
│           │   ├── bootstrap.js
│           │   ├── errors.js
│           │   └── preferences.js
│           ├── audio/
│           │   └── sound-system.js
│           ├── game/
│           │   ├── game.js          # Models, physics, AI, loop and rendering
│           │   └── self-tests.js    # Browser/Node model verification
│           └── ui/
│               └── menu.js
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

Visit [localhost:3000](http://127.0.0.1:3000). No `npm install` is required. Set `PORT` or pass a port to `node scripts/serve.cjs 8080` if needed. The logical playfield remains 800 × 600 and scales without changing collision geometry. A desktop keyboard is required for movement.

Local-file storage policy varies by browser. Use HTTP or the deployed HTTPS site for consistent settings across pages.

## Pages and settings

Home offers Play, Settings, Sound, Field manual and Exit. Game settings save default difficulty, fullscreen on start and decorative motion preferences. The Sound page provides master/effects/siren volume sliders, mute and audible previews. System reduced-motion preferences are respected. Browser tab closing may require the tab's own close button; Exit explains that fallback.

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

All modes start with three integrity points. God is the toughest mode and is **not invincible**. Brass nodes yield 10 points. Every 50 points increases speed and adds a guard up to five. Three accepted hits end the game with a YOU LOST screen and replay controls. Cover immediately breaks pursuit and silences the visibility alarm.

## Technical design and diagnostics

The fixed-step 120 Hz simulation includes normalized movement, radius-aware boundary clamping, circle/rectangle wall sliding, finite-state enemies (PATROL, CHASE, ATTACK, RETURN), slab-based line of sight, visibility-graph navigation, whisker steering and smooth turns. Flat geometric drawing and Web Audio require no external assets or libraries.

Error boundaries cover required asset loading, missing DOM/modules, Canvas support, storage, audio, fullscreen, invalid physics state and frame failures. Recoverable issues show a dismissible notice. Fatal failures stop simulation/audio and offer Reload or Home. Diagnostics are local, deduplicated and capped at 100 distinct entries; inspect them with `window.SectorErrors.snapshot()`. No telemetry leaves the browser. See [architecture and failure handling](docs/architecture.md) for details and practical limits.

## Verification

```sh
npm test
npm run test:browser
```

`npm test` runs 11 top-level checks, including the 17 model regression cases, storage/error/audio fault tests, asset/link and JavaScript syntax checks, and server/deployment routing checks.

`npm run test:browser` requires an installed Chrome/Chromium browser. Set `CHROME_PATH` if it is not found automatically. It verifies all six pages, preferences, mixer, gameplay and responsive layout, then injects failures to verify recovery. It uses a fresh temporary profile; screenshots go to ignored `artifacts/screenshots/`. No test dependencies are installed. Press T in-game to run the same 17 isolated model cases and inspect velocity vectors, LOS, distances, whiskers and frame timing.

## Deployment

Vercel publishes **only `public/`**, keeping source documentation, tests and tools out of the website. Existing `/play.html`, `/settings.html`, `/sound.html`, `/controls.html` and `/exit.html` bookmarks redirect to `/pages/...`. The project is connected to its private GitHub repository; the production game is public.

```sh
npx vercel deploy --prod
```

Run this from the repository root with an authenticated Vercel CLI.

## Scope

One fixed arena, single player and keyboard controls. Units collide with walls and arena bounds but may overlap each other. Difficulty keeps escalating after the unit cap. Optional browser APIs can be denied; implemented fallbacks are described above. The visibility graph is optimized for this four-obstacle map, rather than large generated worlds.
