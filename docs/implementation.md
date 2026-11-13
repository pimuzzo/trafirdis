# Incremental implementation record

Earlier sections record past deliveries. The latest server-discovery follow-up describes the current architecture; references to a fixed Plex proxy in older entries are historical.

The repository was inspected first and contained only Git metadata. The entire supplied PRD was read before implementation. Each phase ended with a working TypeScript/Vite application; the final implementation includes all five phases.

The phase table records initial delivery. Current maintainer acceptance and remaining compatibility checks are recorded at the end of this document; earlier validation boundaries are not claims that subsequently confirmed features remain unverified.

| Phase                  | Delivered                                                                                                                                                                         | Validation boundary                                                                                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 — Plex integration   | React/TypeScript/Vite setup, configurable loopback proxy, token session, isolated JSON adapter, movie-library discovery, pagination, normalized metadata and sized artwork        | Production build and initial catalog tests passed. Real PMS unavailable in this environment.                                                                       |
| 2 — Cinematic catalog  | Original branding, hero, metadata genre rails, library view, combined local filters, keyboard/mouse/trackpad navigation, details and Plex links, labeled fictional sample library | Build and catalog tests passed before adding previews. Final browser suite verifies interactions and narrow layouts.                                               |
| 3 — Trailer discovery  | Extras classification, native/PMS stream plans, bounded in-memory discovery cache, browser capability hints, development diagnostics                                              | Official Plex API and client-source research completed; synthetic integration tests cover missing and indirect media. Candidate URLs are not recorded as playable. |
| 4 — Automatic previews | 1.5-second delay, cancellation, one muted inline video, visibility cleanup, audio/play controls, bounded fallback, timeout, static artwork recovery                               | Lifecycle tests plus actual Chromium decoding of generated native and HLS fixtures.                                                                                |
| 5 — Polish             | Responsive layout, lazy artwork, skeletons, modal focus/keyboard support, reduced motion, credential-safe proxy and stream guards, documentation and formatting                   | Final unit, proxy, browser and production-build checks recorded in the delivery response.                                                                          |

## Decisions and deviations

1. **Real-server validation could not precede automatic playback.** The cloud network rejected the private server address, and no credentials were available. The app was still implemented completely using official API research, isolated compatibility logic, synthetic fixtures, and diagnostics. This does not satisfy real-library acceptance by itself; the README states the local validation procedure and remaining unknowns.
2. **A single purposeful playback dependency was added.** `hls.js` is imported only for PMS HLS when the browser's native path is unavailable or fails. This addresses Linux Chromium support without a large player framework or custom media backend. The light build omits features the preview surface does not need.
3. **Sample content is optional and explicitly fictional.** It demonstrates the interface without credentials. It never silently substitutes for a failed Plex connection or pretends a trailer played.
4. **PMS can supply server-side HLS conversion.** This is existing Plex functionality investigated as requested by the trailer requirements. Trafirdis contains no transcoder, full-movie engine, backend service, database, or history synchronization.
5. **Production deployment remains a documented extension.** Local development and local production preview both work through Vite's proxy. Public deployment, QNAP-specific packaging, and external trailer providers remain outside the initial scope. Docker was subsequently requested and is described below.

## Docker follow-up

Added after the original MVP at the user's request: a multi-stage Dockerfile and Docker Compose service, static hosting plus a fixed-origin Nginx proxy, runtime Plex origin configuration, loopback-only publishing by default, non-root/read-only operation, and container/browser integration tests. No application backend or database was introduced. Docker request logging is disabled to prevent native media query tokens from appearing in logs. Session generation supports HTTP LAN browsers as well as secure origins. Real Plex validation was unavailable at initial Docker delivery; subsequent maintainer confirmations are recorded below. Docker tests use a synthetic local Plex fixture.

## Plex sign-in follow-up

Added hosted **Sign in with Plex** as the primary connection action after the user requested an integrated login. The existing manual-token workflow remains an advanced fallback. The implementation uses Plex’s documented strong-PIN authorization, verifies one-use return state, resolves the configured server through `/identity` and the Plex cloud resource list, and persists only its verified server-specific token. The browser handles authentication directly with Plex, keeping the app frontend-only and compatible with the existing Docker image. Automated tests simulate cloud authorization; real account/server validation remains outstanding.

## Trailer reliability follow-up

After the MVP merge, added runtime opt-in diagnostics for Docker and production Vite builds. This deliberately extends the PRD's development-only view; production keeps the panel disabled and its module unloaded unless explicitly enabled. At that stage, the frontend SPA used a fixed-origin proxy, since removed by the server-discovery follow-up below.

Diagnostics can search the loaded library, inspect at most eight fresh metadata records sequentially, cancel pending work, and test a title outside catalog filters. Missing metadata, request failures, unavailable resources, autoplay denial and playback failures remain distinct. Rechecks and new preview attempts clear stale success; pausing preserves genuine observations. Downloaded reports use an explicit allowlist of numeric IDs, states and fixed error codes, excluding titles, credentials, addresses and raw error text. No additional provider, database, dependency or server write was introduced.

The maintainer has confirmed browsing and previews on the real server with Chrome/Docker. Automated tests continue to use synthetic local Plex responses; additional provider/codec and session-cleanup checks remain pending. Correct Open in Plex navigation was subsequently confirmed as recorded below. GitHub Actions runs the expanded unit, browser and Docker suites for this follow-up.

## Category navigation follow-up

The existing movie-details popup now supports previous/next navigation within the opening category, with a position counter, keyboard arrows and horizontal touch swipes outside the player and controls. The opening list is captured so navigation keeps its order and active filters; category ends do not wrap. The original popup restores focus and page position on close. Movie changes reuse the existing preview lifecycle, cancel obsolete work and retain its muted autoplay behavior.

This change extends the existing details popup. The home hero, playback/audio policy and Plex API behavior are preserved. Previews are confined to the hero and opened details. Adjacent metadata/video preloading and a broader mobile layout redesign are deferred. No dependencies, backend services or new Plex operations were added.

## Browsing polish follow-up

The movie-library selector remembers an explicit choice in browser local storage, scoped to the server's public identity (or configured origin when the identity is unavailable). Preferences are checked against the current account's accessible sections before loading movies, with a safe fallback when a library disappears. Storage failures preserve in-memory switching. No credentials or movie catalog are persisted with the preference.

The search field groups its icon and input under one focus outline, with separate space for the shortcut badge. A randomly featured movie stays stable across hover, keyboard focus, local filtering, details navigation and metadata refreshes. A new page or library gets a fresh choice; diagnostics can explicitly select a test film. The redundant My library navigation entry was removed; Discover, Unwatched, search and all filters retain category rails; empty categories are omitted. The floating player and its visibility/selection orchestration were removed, so focusing a lower rail does not initiate another stream.

## Featured discovery follow-up

The hero omits the decorative index and adds Surprise me. Initial and explicit random selections share an unwatched-first pool, with watched films as the fallback when no unwatched titles remain. The current film is excluded when an eligible alternative exists; a single-candidate pool disables the action. Updated Plex watch metadata revalidates the pool, while ordinary browsing preserves the chosen film. Advanced diagnostics retain explicit movie selection.

The Unwatched view keeps genre and other category rails, but omits its redundant Unwatched Movies section. Returning to Discover restores that section when applicable. Existing trailer discovery, authentication and playback mechanisms are unchanged.

## Details audio preference

Details keep the user's mute/unmute choice in memory while the popup remains open, including previous/next navigation and pause/resume. The popup reuses one video element across films; stream cancellation and cleanup still run for every movie change. Closing and reopening details starts a fresh muted session. The subsequent hero audio preference change is recorded below.

Autoplay denial retains the selected audio state and loaded source for an explicit Play preview gesture. Later metadata cannot overwrite the blocked phase; waiting for user input does not expire the source, while an actual manual playback retry still has the normal startup timeout. No preference is persisted and no Plex operation or authentication behavior changes.

## Accepted scope decisions — 2026-11-10

- **Pick for me: complete by acceptance.** Surprise me in the hero, followed by Open in Plex, satisfies the maintainer's discovery use case. The existing unwatched-first, full-selected-library behavior is accepted instead of a separate filter-aware picker.
- **Shortlist: removed from planned work.** The maintainer uses Unwatched → Recently Added to review candidates for the evening. No separate temporary or shared candidate list is required.

These are scope and acceptance decisions; they introduce no application behavior or storage changes.

## Hero audio preference

The hero starts muted and keeps the user's mute/unmute choice across Surprise me and pause/resume, settings and viewport visibility restarts. It reuses the existing preview audio preference and one video element while each movie change cancels and replaces the old stream. Muting again also carries over to the next suggestion.

The preference stays in memory for the mounted hero preview. Opening details removes that preview, so returning starts muted again; reloading also starts muted. Browser denial of unmuted autoplay retains the source and sound preference for Play preview. This adds no storage, dependency or Plex operation.

## Preview loading controls

Both preview surfaces show a small amber spinner inside Finding your preview while waiting, discovering or loading media. It replaces the status dot and respects reduced-motion preferences. Artwork remains visible until playback starts; the text status is announced politely.

Play is disabled during loading and when Plex has no playable trailer resource. It remains available to resume a pause, retry a failure, replay an ended trailer or start a browser-blocked source directly from a user gesture. Tests hold synthetic metadata and media responses to verify loading controls on the hero and details, and verify missing trailers, retry recovery and existing autoplay/audio behavior. No playback transport, Plex operation or dependency changes.

## Preview playback decision follow-up

The existing PRD now defines restart reliability for hero and details previews. HLS playback requests a fresh, validated PMS decision before loading any manifest, with the same extra, settings and session/client identity as start. Decision approval alone never marks a URL resolved or playback verified. Denied/unknown responses cannot start a stream, authentication failures stop candidate fallback, and cancellation/timeout prevents late approvals from attaching stale sources. Existing metadata caching, native parts, audio preferences and scoped cleanup remain in place.

Unit tests cover decision validation, credential handling, cancellation and startup timeout. Browser and production Docker fixtures reject starts without matching decisions and exercise repeated popup reopen and hero scroll-away/return using synthetic media. The maintainer subsequently confirmed the decision fix on Chrome/Docker, as recorded in the retained-buffer follow-up below; private diagnostic logs are not repository assets.

## Retained preview buffers experiment

PR #6's route-preference optimization was reverted and closed at the maintainer's request after no noticeable real-library improvement. This replacement starts from main with PR #5's verified decision fix intact. The maintainer confirmed that fix on Chrome/Docker.

Playback lifetime is now independent of its mounted surface. An eligible already-playing HLS element can be detached, muted and suspended in a two-entry/30-second pool; claiming it reattaches the same buffered element and restarts at zero on the still-open session. Native parts, ended/unverified/oversized buffers and missing-start buffers use fresh playback. Reuse failure disposes the old session and rebuilds through a fresh decision/start. Timeouts, one playing surface, audio rules and per-attempt diagnostics remain intact. Catalog teardown, expiry, eviction, refresh/inspection, settings release retained resources. No media persistence, backend, dependency or neighbor preloading was added.

Browser tests prove no new media requests are necessary for a warm return with delayed initial segments, using native HLS and MSE. Unit tests verify lifecycle limits and cleanup; production Docker asserts no new HLS preparation for buffered returns. Native buffering and PMS transcoder resources remain browser/server controlled, so the documented limits are not an exact memory or server-resource cap. The maintainer confirmed the retained-preview behavior works on the real Plex deployment.

## Browser-tab playback continuity

Within the retained-preview PR, removed the document-visibility gate from both preview surfaces at the maintainer's request. Changing browser tabs no longer pauses/mutes the video, clears retained buffers or rebuilds its session; viewport scrolling, manual pause and settings/disconnect still apply. Inactive retention also checks an elapsed-time deadline when accessed, covering throttled background timers. Headless visibility-event tests verify ongoing real synthetic HLS playback and unchanged position/source/audio; actual desktop/OS background media scheduling remains to be checked manually.

## Responsive catalog and preview readiness — 2026-11-11

Hero previews are not mounted at widths of 540px or less; static artwork keeps narrow layouts usable. Details previews remain available, and wider viewports, including smartphone landscape, retain hero playback. Diagnostics Test preview opens standalone details on narrow screens instead of targeting the disabled hero preview.

More info in the hero now opens standalone film details without a category counter or movie navigation. Category-opened details retain their captured filtered sequence, buttons, keyboard arrows and touch swipes. Recently Added is capped at the 25 newest films matching the current filters, including its count and details navigation. Other rails retain their existing batches and Show more action.

The dedicated Copy title button and its clipboard state/API calls were removed at the maintainer's request. Movie titles remain selectable for normal browser copying.

Focus outlines use the shared amber styling with a 1px offset. A common native-select component opens desktop pickers after mouse release on supported browsers, preventing the opening gesture from also selecting an option. Keyboard and touch behavior remain native; missing or denied picker support falls back to ordinary browser interaction. The maintainer confirmed the accidental-selection fix in Brave.

Preview playback is reported only after a video-frame callback following playback start, with a decoded-data and nonzero-dimensions fallback where that API is unavailable. Artwork and Finding your preview remain until then; the existing 600ms video fade is preserved and respects reduced motion. Pending frame callbacks are cancelled and invalidated on cleanup, suspension and restart. The first-frame wait remains covered by the startup timeout.

Automated checks cover the responsive preview breakpoint, standalone/category details, all select controls, keyboard/touch/fallback interaction, delayed frame confirmation, stale callbacks, retained HLS restarts, and Recently Added limits under filters. Browser and Docker fixtures contain only synthetic data/media. `.idea/` workspace files are ignored.

## Current maintainer acceptance — 2026-11-12

- Real Plex browsing and trailer playback were confirmed on the Chrome/Docker deployment; the decision fix and retained-buffer behavior were also accepted in earlier follow-ups.
- Open in Plex opens the correct film in Plex Web in the maintainer's tested browser.
- The layout looks good on PC and smartphone. This is visual acceptance, not a complete mobile codec, autoplay or browser compatibility matrix.
- On 2026-11-12 the maintainer confirmed that iPad works well, with no glitches or other problems to report. iPad acceptance is complete for the tested setup.
- Other browser/device configurations, including Firefox and other Safari setups, additional provider/codec combinations, session cleanup and browser/OS background scheduling still need targeted manual checks.
- Automated hosted sign-in tests simulate Plex responses; broader real account/server compatibility remains a separate acceptance item.

## Next separate experiment

Custom collections, TV remote control, direct playback on Plex TV clients, Progressive Web App installation and personalized recommendations have been removed from planned scope at the maintainer's request.

The maintainer approved trying bounded adjacent-trailer preloading during category-details browsing in a dedicated PR. No adjacent preload is implemented or enabled here. That work must define buffering/session budgets and cancellation, preserve the active trailer's priority, measure real Plex latency and load, and explicitly update the current no-preloading requirements.

## Long movie details — 2026-11-12

Details retain complete wrapping titles, with responsive mobile typography. Long synopses initially show five lines and expose Read more / Read less only when measured text overflows. The toggle reports its expanded state and controls the synopsis paragraph; switching films resets it. Short synopses need no extra control.

Dialog height uses dynamic viewport units with a viewport-height fallback, allowing for mobile browser bars. Synthetic desktop/mobile checks exercise long titles and synopses, expansion/collapse, navigation reset, short viewport resizing, accessible sticky controls, no horizontal overflow and focus restoration.

## Catalog view preference — 2026-11-13

Discover/Unwatched is restored on refresh from the browser-wide `trafirdis.catalog-view` local-storage entry. It stores only `discover` or `unwatched`, derived from the existing watch-status filter. Search and other filters remain transient; actions that already clear all filters also return the remembered view to Discover. The existing server-scoped library preference is unchanged. Invalid or missing view preferences use Discover, and blocked storage preserves in-memory switching. No credentials or movie data are added to persistent storage. The preference survives disconnect; clearing site data removes it.

Unit checks cover restoration, transient filter reset, invalid values and blocked storage. Browser checks verify that both library and view survive reload, the correct watched films/categories are shown, and selecting Discover persists the return to the full catalog.

## Hidden-frame readiness and CI reports — 2026-11-13

The first-frame watchdog now distinguishes healthy playback awaiting presentation from a real media stall. After a playing event, a hidden document can defer its frame callback without timing out or releasing the stream. Visibility return restores the presentation deadline if the frame is still missing. Waiting/network stalls keep their timeout in either visibility state. Frame-confirmed display, audio, session identity and cleanup behavior are preserved.

Unit tests cover startup and buffering resume with withheld frames, restoring the visible deadline and a real stall while hidden. Browser tests combine a simulated hidden state with deliberately delayed frame callbacks while real synthetic video continues past 12 seconds, then restore frame delivery without another stream request. This reproduces the missing-frame condition; it does not claim to validate native browser/OS tab suspension.

GitHub browser jobs upload reports only on failure, and upload itself is best effort. This addresses artifact-quota failures after otherwise passing tests while keeping test failures blocking and retaining logs in Actions.

## Account server discovery and static hosting — 2026-11-13

Hosted sign-in now lists account-authorized owned/shared servers instead of requiring a configured deployment target. A single resource or remembered accessible choice connects automatically; failures leave a retryable chooser. Change server in settings clears that preference. Resource connections are validated and tried in local/remote/relay order, preferring HTTPS within each group, with HTTP alternatives only on HTTP app origins. An authenticated server-root request verifies access and the selected resource identity before session storage, with a ten-second deadline per candidate. Public identity probing was removed after real PMS CORS behavior prevented the browser from reading that unauthenticated endpoint. The account token is discarded after lookup; only the verified selected token/connection use session storage, while the non-secret preferred server ID uses local storage.

The Plex client now supports a selected direct origin for API, artwork, preview negotiation, native playback, HLS and cleanup. A stricter CSP is installed before authenticated media renders; disconnect reloads to reset that policy. Docker and Vite serve only application files. Deployment server-address configuration and the media proxy have been removed completely. Existing token-only or proxy-based sessions require sign-in again; users select their server after login, or enter its address in the manual-token form. Disconnect lets unmount cleanup run before reloading; scoped preview-stop requests use fetch keepalive so navigation can finish cleanup. This remains best-effort PMS session expiry. No application backend, dynamic proxy, external media provider or dependency was added.

The distributable build is exercised on a static HTTPS fixture with a separate CORS-enabled HTTPS Plex fixture, including artwork, native video, native HLS, MSE HLS, refresh restoration, mixed-content rejection and external-media protection. Temporary fixture certificate errors are explicitly ignored; real certificate trust, Plex cloud/PMS CORS, browser local-network permissions, remote/relay access and the maintainer's real trailers still require validation. This supersedes earlier single-target deployment decisions and does not claim live Plex or public-site acceptance.

HTTP deployments can additionally try a private IPv4 LAN address and its exact port from the selected Plex resource's connection metadata when it is explicitly local, not a relay, and the server explicitly reports `httpsRequired: false`. No address is extracted from DNS names, no port is guessed and no HTTP fallback is added on HTTPS app origins or when secure transport is required/unknown. This handles unreachable `plex.direct` DNS on HTTP LAN deployments without a configured server URL. HTTP traffic is unencrypted; hosted HTTPS sites still require working HTTPS Plex connections. Tests cover DNS failure with a successful LAN fallback, stalled probes, cancellation and the secure-transport guards.

On 2026-11-14, the maintainer confirmed that the complete server-discovery/direct-connection flow works on their deployment after the authenticated-root and advertised-LAN fallback fixes. This is live acceptance for that setup, not exhaustive validation of public HTTPS hosting, all browser/network combinations or all trailer providers.
