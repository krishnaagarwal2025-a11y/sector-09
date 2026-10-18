# Release QA — 18 October 2026

This review covers the current single-player browser arcade game. Automated checks
and exploratory input sessions passed in local Chrome and Edge. Both browsers use
Chromium; this is not Safari, Firefox, physical-phone, or human playtester certification.

## Issues found and resolved

| Finding | Resolution and evidence |
| --- | --- |
| A visible player hugging cover could freeze a chasing guard. Navigation inflated the destination clearance, and steering looked beyond the destination. | Navigate to contact distance using actual body clearance and shorten the final steering probe. Regression scenes cover all 16 wall faces, both enemy types and all four difficulties (128 scenarios). Cover still blocks sight. |
| Speed grew exponentially without a ceiling. God Warden chase reached about 3,575 px/s at 1,000 points and eventually exceeded collision safety limits. | Cap the threat multiplier at 3× and bound movement speeds. Warden chase remains faster than the player: 204–306 versus 170 px/s. Test scaling at one million points for every mode. |
| Detection graphics showed the smaller patrol radius while chasing used the larger loss radius. | Drawing and detection now share the same sight-range property, with the existing wall clipping. |
| The second Warden followed the same route direction; its label could overlap its hull markings. | Reverse the second Warden's full-map route and move boss labels clear of the chevrons. Agents may still overlap during combat; physical agent-to-agent collision is outside this game's design. |
| Keyboard focus could escape an open briefing/pause menu; browser shortcuts such as Ctrl+R were intercepted. | Add dialog semantics, isolate background controls, wrap Tab/Shift+Tab, focus the menu action, preserve modified browser shortcuts, and clear touch input on fullscreen changes. |
| The music control could still say “Music on” after muting gameplay. | Audio state changes refresh the shared control, including mute and zero master volume. Browser checks verify labels as well as audio state. |
| Paused/standby screens repainted the same field on every animation frame. | Draw static scenes only after mode, theme, size, difficulty or diagnostics changes. A browser check verifies that paused drawing stops. |
| Oversized/fractional saved scores could produce unreasonable displays. | Reject unsafe/noninteger stored records; display large legitimate scores compactly, with exact accessible score labels. |
| The phone HUD covered part of the arena, labels were small, and pickups could spawn under thumb controls. | Move telemetry/actions into side gutters on wide phones. Project pickup positions into the viewport and exclude visible control rectangles on spawn and presentation changes. Add regression checks across phone sizes. Add a site icon and page descriptions. |
| Unversioned production assets could retain stale copies after an update. | Require cache revalidation in the Vercel response configuration. Live files are compared to the deployed sources after publishing. |

## Verification

Run `npm run test:all` for the complete release suite. Run the browser suite with
`CHROME_PATH` pointing to Edge to repeat it in that browser.

- **22 top-level Node checks**, including the **17 embedded model regressions**:
  physics, cover, attacks, timed pickups, Warden phases, records, preferences,
  error boundaries, audio fallback, asset links, syntax, server and deployment rules.
- **12 seeded movement-only sessions**, three per difficulty, each simulating
  three minutes. The final session set contains **112 runs/retries, 1,206 pickups
  and 55 Warden briefings across 36 simulated minutes**. No movement teleports,
  injected score or invulnerability are used. The controller has knowledge of
  model positions; its performance is not evidence of human difficulty balance.
- **Browser keyboard play** collects actual pickups through dispatched key events.
  Other checks cover focus loss, menu focus, restart, pause, mute, themes, first
  Warden introduction, the 100/150/200 waves and pickup timer freezing.
- **Real dispatched touch events** cover start, movement, dragging outside the pad,
  cancellation, two-finger pause, mute, continuation, rotation and replay.
  Landscape sizes: 844×390, 667×375, 740×360, 932×430 and 568×320; portrait is also checked.
- **Audio waveform rendering** checks BGM, siren, collection, patrol/boss warnings,
  simultaneous effects, mute silence and bounded peaks at full mixer settings.
- **Injected failures** cover corrupt settings, denied storage, unavailable audio,
  missing DOM, unavailable Canvas, blocked scripts, render failures and rejected promises.
- **Synthetic performance scenes** measure two physics steps and a draw for five
  God guards, one Warden and two Wardens. Observed 95th-percentile work was roughly
  **0.7–2.5 ms on this machine**, with occasional longer samples. This excludes a
  real phone GPU, network delay, thermal throttling and perceived input latency.

Raw session/performance summaries are in ignored `artifacts/qa/`. Browser snapshots
are in ignored `artifacts/screenshots/`. No telemetry or player data is uploaded.

An early Node project-test worker exited without an application diagnostic; its
isolated rerun and subsequent full suites passed. The paused-render optimization
also required the fault-injection test to invalidate the static render cache
before requesting a deliberately failing draw.

## Remaining release limits

No unresolved application failure was reproduced in the completed test matrix.
Real iPhone/Safari, Android devices and Firefox remain untested. Audio quality and
loudness on physical speakers, touch comfort and competitive difficulty balance
need human/device validation before a broad commercial launch. Basic keyboard
accessibility was checked; no full screen-reader/WCAG audit was performed.

This is an endless arcade game with one arena, procedural audio and local scores.
Full-page navigation ends an active run and briefly recreates audio; browser autoplay
and fullscreen restrictions still apply. This QA pass improves release reliability;
it is not a claim that every browser, exploit or future failure has been eliminated.
