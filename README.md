# SECTOR-09 / StateShift

A zero-dependency, top-down tactical stealth and arcade game built with HTML5 Canvas and vanilla JavaScript. Retrieve brass data nodes while autonomous security units patrol, pursue, attack, and return to their routes. Concrete cover interrupts detection; every 50 points increases the pressure.

## Run

Open **index.html** in a current desktop browser. No installation, build step, server, network connection, or external assets are required. Keep `game.js` beside `index.html`.

Press **Space**, or click **Initialize**, to begin. The logical playfield is always 800 × 600; the page scales it to fit smaller displays. A physical keyboard is required for movement.

Initialization requests browser fullscreen from that gesture. Press **F**, or use the header button, to enter or exit fullscreen. The field fits the viewport without changing collision coordinates or stretching its aspect ratio. At narrower fullscreen sizes, the sidebar is hidden to prioritize the game. If the browser or embedded preview disallows fullscreen, the expanded window layout remains playable.

| Control | Action |
| --- | --- |
| WASD / arrow keys | Move in eight directions |
| P / Escape | Pause or resume |
| T | Toggle diagnostics; run tests when enabled |
| M | Toggle all audio |
| F | Enter or exit fullscreen |
| R | Reset after game over |

Switching windows or hiding the page automatically pauses the simulation. Resume explicitly with P or the button.

## Difficulty modes

Choose a difficulty on the start or game-over screen. **Medium** preserves the original balancing. To change during a run, press P and click **End run / Change mode**; this ends the current run and returns to selection. Restarting after a loss uses the selected mode. God mode is the toughest challenge: five elite guards, the widest sight, fastest attacks, and the shortest damage recovery.

| Mode | Starting guards | Patrol speed | Detection / loss range | Attack cooldown | Recovery after damage | Speed per 50 points |
| --- | --- | --- | --- | --- | --- | --- |
| Easy | 1 | 46.5 px/s | 125 / 175 px | 1.4 s | 1.8 s | +5% |
| Medium | 2 | 62 px/s | 160 / 210 px | 1.05 s | 1.35 s | +8% |
| Hard | 3 | 77.5 px/s | 190 / 245 px | 0.75 s | 0.9 s | +12% |
| God | 5 | 89.9 px/s | 220 / 280 px | 0.55 s | 0.55 s | +15% |

All modes retain wall concealment, the five-guard cap, scoring, alarms, fullscreen controls, and progression. High scores are independent per mode, including God mode.

## Game rules

- A brass diamond yields **10 points** and is replaced at a valid random location.
- Integrity starts at **3**. An attack costs one point; the mode-specific recovery window prevents stacked damage. Every mode, including God, ends after three accepted hits.
- Each **50 points** compounds enemy movement speed by the selected mode's rate, adds one security unit until there are **5**, and writes a HUD log entry.
- A depleted integrity meter displays **YOU LOST** with the final score and replay controls. Restart restores the player, units, score, and threat for the selected difficulty.
- Walls provide real concealment: breaking line of sight immediately stops pursuit, even after detection. Guards return to their routes and can reacquire you when you become visible again.
- While any guard sees you, a subdued red alert frame and status indicator appear with a very quiet, low-pitched siren. Hiding, pausing, losing focus, or game over clears the siren. An accepted damage hit triggers a separate short impact/chirp and a brief screen tint. M mutes all sounds.
- High scores persist under `sector09.highScore.easy`, `.medium`, `.hard`, and `.god.toughest` in browser local storage. The previous `sector09.highScore` record is used as a fallback for Medium. Storage is optional: browsers that restrict it retain separate records for the current page session. Audio is optional and initialized through a user gesture.

## Deliverables

| File | Responsibility |
| --- | --- |
| `index.html` | Flat engineering interface, HUD, accessible start/resume/reset button, canvas, controls, and status log |
| `game.js` | Commented object-oriented simulation, collision and navigation math, drawing, audio, persistence, and unit tests |
| `README.md` | Setup, controls, technical design, assessment mapping, and verification instructions |

## Architecture

The simulation uses a **120 Hz fixed timestep** and `requestAnimationFrame` rendering. Units are expressed in pixels and seconds. A 100 ms accumulator limit prevents excessive catch-up, and window focus changes clear held input. The simulation pauses before a hidden page can produce a large time jump.

| Component | Role |
| --- | --- |
| `Vector2D` | Immutable vector operations, Euclidean distance, normalization, dot products, interpolation |
| `Player` | Normalized keyboard motion, heading, integrity, invulnerability |
| `Enemy` | Explicit finite state machine, route following, pursuit, cooldowns, navigation and steering |
| `Obstacle` | Exact circle/AABB overlap, minimum translation resolution, segment/AABB intersection |
| `FloatingText` | Short-lived collection feedback |
| `SoundSystem` | Gesture-gated Web Audio synthesis, mute, graceful unsupported-device fallback |
| `Game` | Input, lifecycle, fixed-step loop, scoring, spawning, HUD, drawing, diagnostics |

Geometry functions and model classes are also exported through `window.Sector09` and CommonJS. `window.sector09Game` exposes the live instance for technical inspection. Model tests create isolated objects and do not mutate the live game or local storage.

### Movement and collision

Input direction is divided by its Euclidean length before multiplying by player speed (170 px/s). A diagonal therefore has the same speed as cardinal movement. Circle centers are clamped to radius-aware arena bounds.

Circle/rectangle contact uses the rectangle point nearest the circle center. Overlap is resolved along that contact normal; an embedded center resolves toward the nearest face. Motion is subdivided into steps no greater than half a hull radius, with resolution after each axis, preventing tunneling and preserving tangential wall sliding. This applies equally to players and enemies.

### Enemy finite state machine

| State | Behavior | Transition |
| --- | --- | --- |
| PATROL | Follow a repeating route with at least three waypoints | Visible player within 160 px → CHASE |
| CHASE | Navigate toward the player at 1.35× patrol speed | Visible player closer than 35 px and cooldown ready → ATTACK; cover blocks sight or player beyond 210 px → RETURN |
| ATTACK | 0.24-second lunge at 2.5× patrol speed; damage only on clear physical contact | Lunge expires → CHASE; cover blocks sight or player beyond 210 px → RETURN |
| RETURN | Navigate toward the nearest patrol waypoint | Reach waypoint → PATROL; detect player → CHASE |

The 160/210 px detection/loss thresholds implement **hysteresis**, preventing flicker near the acquisition boundary in open space. Obstacles block initial acquisition and immediately interrupt an active pursuit. A concealed player's location is never used as a chase target; guards return to their own nearest waypoint. Attacks have a 1.05-second cooldown and cannot damage through walls.

### Line of sight and steering

Segment/rectangle intersection uses slab clipping: intersect the segment's parameter interval `[0, 1]` against the rectangle's horizontal and vertical intervals. Parallel segments and tangential contact are handled explicitly.

A small visibility graph connects the start, target, and expanded obstacle corners. Dijkstra selects a route with clearance for the enemy hull. Routes refresh every 0.22 seconds. Five forward whisker rays score directional progress against collision risk to steer locally. Velocity interpolation uses `1 - exp(-12 × dt)`, giving consistent mechanical turns across display refresh rates. Navigation avoids direct movement through an obstruction if a target cannot be reached.

### Visual design

The renderer uses a flat 40 px architectural grid, concrete walls, geometric directional hulls, brass data markers, dashed detection boundaries and patrol routes. Detection graphics use a ray-cast visibility polygon clipped to obstacle faces, making hidden space apparent. State labels and rings use the olive, mustard, terracotta, and bone palette. Canvas shadow blur is zero. The interface and canvas use Segoe UI with local sans-serif fallbacks, square borders, flat panels, and no gradients or external fonts.

## Verification

Press **T** to enable real-time velocity vectors, line-of-sight rays, whisker rays, rounded Euclidean distances, frame timing, and test totals. The test suite prints individual results through `console.table` whenever diagnostics are enabled.

The same tests run without a browser using an optional local Node.js installation:

```sh
node --check game.js
node -e "const results = require('./game.js').runTests(); process.exitCode = results.some(test => !test.pass) ? 1 : 0;"
```

The 17 cases cover:

1. Player clamping at all four boundaries.
2. Normalized diagonal speed and zero-vector handling.
3. Collectible contact, tangency, and separation.
4. Full PATROL → CHASE → ATTACK → RETURN → PATROL sequence.
5. Occluded detection and hysteresis thresholds.
6. Attack expiration, cooldown, and damage invulnerability.
7. Corner and embedded collision resolution, wall sliding, and tunneling prevention.
8. Parallel, tangent, and embedded segment/rectangle intersections.
9. Navigation clearance around cover.
10. Simulated enemy return around a wall without penetration.
11. Cover interrupting both chase and attack, followed by visible reacquisition.
12. Detection geometry stopping at the near face of cover.
13. Catch feedback once per accepted hit and no damage through cover.
14. Valid collectible spawning, score escalation, enemy cap, and compound speed.
15. Mode-specific reset, guard counts, progression, and independent records.
16. Increasing guard speed, detection, attack frequency, and mode-specific recovery.
17. Three-hit health depletion in every mode, including God, and damage recovery protection.

Earlier browser checks verified cover ending pursuit and stopping the siren, visible alert activation, catch feedback, mute/unmute, pause, and fullscreen entry/exit without runtime exceptions. The initial version also passed initialization, keyboard movement, live collection, escalation, game-over/reset checks, and a 90-second patrol simulation. Screenshots were inspected for layout and visibility feedback. Audio graph activation and lifecycle were checked programmatically; perceived volume depends on the user's output device.

Difficulty update validation: all 17 tests passed in Node.js and Chrome. Browser interaction verified selection and starting all four modes, YOU LOST screens, switching modes from pause, per-mode record storage including legacy Medium fallback, and native keyboard interaction with the selector. No runtime exceptions were observed. Selection and loss screens were visually reviewed, including the 718 × 715 viewport.

For a manual acceptance pass, initialize, collect a node, move diagonally against a wall, observe all four enemy states, toggle diagnostics/audio, pause/resume, lose three integrity points, and reset. Reload to check the high score. Test local-file storage/audio behavior in the browser intended for submission; these optional APIs can be restricted by browser policy.

## Assessment coverage

| Assessment | Implemented evidence |
| --- | --- |
| Task 1: arcade core | Eight-direction movement, boundary clamping, randomized collectibles, scoring, start and game-over loop |
| Task 1: bonuses | Collision obstacles, escalating difficulty, procedural audio, collection feedback, high score |
| Task 2: AI core | Explicit Enemy FSM, waypoint patrol, distance detection, pursuit, return behavior, visible state labels |
| Task 2: bonuses | Obstacle-aware line of sight, hysteresis, collision-safe navigation, whisker steering, attack cooldown, smooth turns |
| Verification | Toggleable visual diagnostics and executable isolated unit suite |

## Scope and tradeoffs

This is a single-player, keyboard-operated desktop game with one fixed arena. It intentionally uses no asset pipeline or framework. Enemy hulls collide with static cover and arena bounds; units may overlap one another. The visibility graph is designed for this four-obstacle arena, rather than large procedurally generated maps. Speed escalation continues after the unit cap, so long runs become progressively harder. Random spawns use bounded rejection sampling with a deterministic free-space fallback.

God mode now takes damage and uses a 0.55-second recovery window. Its high-score bucket is separate from the previous invincible version; previous practice scores are preserved but do not count toward the new challenge.

