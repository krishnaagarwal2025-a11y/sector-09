# Architecture and failure handling

The project is a static, dependency-free browser game. Only `public/` is published. Node.js is optional for local HTTP serving and verification; there is no application server or bundler in production.

## Browser startup

Each HTML page loads `core/errors.js` first, followed by styles and its required scripts. Required scripts are marked `data-required`. The bootstrap module runs last and validates the page name, required controls, script dependencies, navigation protocols, animation-frame support, and Canvas 2D availability before creating a menu controller or game instance. Menu pages do not download the simulation or its self-tests.

Classic scripts work on both HTTP and local files without ES module origin restrictions. Scripts publish small namespaces (`SectorPreferences`, `SectorErrors`, `SectorSoundSystem`, `Sector09`, `SectorModelTests`, `SectorMenu`); shared logic also has CommonJS exports for the Node test runner. Game construction belongs only to bootstrap, preventing accidental startup when a model module is imported.

## Simulation

The simulation uses a fixed 120 Hz timestep, a bounded catch-up accumulator, normalized eight-direction player motion, and radius-aware arena limits. Circle/rectangle collision resolution subdivides movement to prevent tunneling and preserves tangential sliding. Geometry and movement reject nonfinite values, invalid sizes and excessive collision substeps.

`game/game.js` contains `Vector2D`, `Obstacle`, `Player`, `Enemy`, `FloatingText` and `Game`. The Enemy FSM has explicit PATROL, CHASE, ATTACK and RETURN states. Cover immediately breaks sight and pursuit. Visibility-graph paths around expanded wall corners provide clearance, whiskers steer locally, and exponential velocity interpolation smooths turns. Ray-cast detection polygons stop at concrete faces. God is the toughest mode and still loses after three accepted hits.

`game/self-tests.js` is an isolated suite shared by the T-key diagnostics and Node tests. It receives the model API explicitly and does not modify a live game, browser preferences, or storage.

## Audio and preferences

`audio/sound-system.js` owns a lazily initialized Web Audio context, master/effects/siren buses, procedural cues, and one shared quiet siren. Unlock returns a resolved boolean, including failure, so callers can accurately report whether previews actually played. Browser/device failures mute audio and produce a recoverable warning; gameplay remains available.

`core/preferences.js` validates saved settings, clamps volumes, reports malformed JSON/invalid values, and retains changes in memory when storage is denied or full. Reads are cached, preventing an unsuccessful write from being overwritten by stale saved values. A storage event invalidates that cache for other-tab updates. High scores remain separate by difficulty, with a separate God challenge bucket and a legacy Medium fallback.

## Error policy

Recoverable problems use a dismissible notice. Fatal startup, uncaught JavaScript, and game-loop failures stop simulation and siren audio, clear held keys, and offer Reload and Home. Failed frames do not schedule another animation frame. Raw stack traces stay in the console and local diagnostics, rather than being displayed in player flows.

| Boundary | Detection | Recovery |
| --- | --- | --- |
| Required script download | Capturing resource-error listener | Fatal recovery screen |
| Stylesheet/other resource | Capturing resource-error listener | Warning and reload guidance |
| Missing modules or controls | Explicit bootstrap validation | Startup prevented; reload/home |
| Missing Canvas/animation support | Capability check | Clear startup failure |
| Corrupt/invalid settings | Parse and normalization checks | Default settings; warning |
| Storage denied/quota | Read/write catches | In-memory settings and records |
| Audio unsupported/resume/effect failure | Capability and operation checks | Audio disabled; game continues |
| Fullscreen unavailable | Promise rejection handling | Windowed play; warning |
| Invalid physics/timestep/state | Model assertions | Fatal frame shutdown |
| Render/update exception | Game-loop catch | Stop loop, silence alarm, recovery UI |
| Unexpected synchronous error | Global error listener | Fatal recovery UI |
| Unhandled rejected promise | Global rejection listener | Warning and local diagnostic entry |
| Broken internal links | Project checks | Test fails before publication |
| Unknown route | Server and Vercel 404 page | Home navigation |

`window.SectorErrors.snapshot()` returns local diagnostic entries. Entries are deduplicated by code/message/severity, repeated occurrences increment a counter, and only the most recent 100 distinct entries are retained. No telemetry is sent anywhere. `SectorErrors.guard()` catches synchronous and asynchronous action failures. The game's diagnostics status reports the number of recorded issues.

No implementation can detect every possible browser, hardware or network failure. If JavaScript itself is disabled or the diagnostics/bootstrap files both fail to load, runtime handlers cannot execute; pages include a JavaScript-disabled message, and the bootstrap has a plain-text fallback when only diagnostics is missing. Browser-controlled tab closing retains its explicit manual-close guidance.

## Tests

- `tests/unit.cjs`: gameplay regressions; malformed/denied storage; bounded error reporting; rejected promises; unsupported audio/resume rejection; invalid geometry; fatal-frame shutdown.
- `tests/project.cjs`: all local HTML links/assets; syntax of every shipped script; public-only deployment; legacy redirects; 404, 400, 405 and HEAD behavior.
- `tests/browser.cjs`: full page flow and gameplay plus injected corrupt preferences, storage denial, unsupported audio, missing controls, missing Canvas, blocked scripts, a renderer exception and an unhandled rejection. Uses an isolated temporary Chromium profile and the bundled Node CDP/WebSocket APIs, without third-party test libraries.

## Routes and deployment

Pages live under `/pages/`; `/play.html`, `/settings.html`, `/sound.html`, `/controls.html`, and `/exit.html` redirect permanently to those paths. Relative links still support opening `public/index.html` locally. The development server reads the same redirects as Vercel and confines file access to `public/`. Tests, scripts, Git metadata, and documentation are outside the production output directory.
