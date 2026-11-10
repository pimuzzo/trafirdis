# Incremental implementation record

The repository was inspected first and contained only Git metadata. The entire supplied PRD was read before implementation. Each phase ended with a working TypeScript/Vite application; the final implementation includes all five phases.

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

Added after the original MVP at the user's request: a multi-stage Dockerfile and Docker Compose service, static hosting plus a fixed-origin Nginx proxy, runtime Plex origin configuration, loopback-only publishing by default, non-root/read-only operation, and container/browser integration tests. No application backend or database was introduced. Docker request logging is disabled to prevent native media query tokens from appearing in logs. Session generation supports HTTP LAN browsers as well as secure origins. The real Plex server remains unvalidated; Docker tests use a synthetic local Plex fixture.

## Plex sign-in follow-up

Added hosted **Sign in with Plex** as the primary connection action after the user requested an integrated login. The existing manual-token workflow remains an advanced fallback. The implementation uses Plex’s documented strong-PIN authorization, verifies one-use return state, resolves the configured server through `/identity` and the Plex cloud resource list, and persists only its verified server-specific token. The browser handles authentication directly with Plex, keeping the app frontend-only and compatible with the existing Docker image. Automated tests simulate cloud authorization; real account/server validation remains outstanding.

## Trailer reliability follow-up

After the MVP merge, added runtime opt-in diagnostics for Docker and production Vite builds. This deliberately extends the PRD's development-only view; production keeps the panel disabled and its module unloaded unless explicitly enabled. The app remains a frontend SPA with the existing fixed-origin proxy.

Diagnostics can search the loaded library, inspect at most eight fresh metadata records sequentially, cancel pending work, and test a title outside catalog filters. Missing metadata, request failures, unavailable resources, autoplay denial and playback failures remain distinct. Rechecks and new preview attempts clear stale success; pausing preserves genuine observations. Downloaded reports use an explicit allowlist of numeric IDs, states and fixed error codes, excluding titles, credentials, addresses and raw error text. No additional provider, database, dependency or server write was introduced.

The maintainer has confirmed browsing and previews on the real server with Chrome/Docker. Automated tests continue to use synthetic local Plex responses; full provider/codec, session-cleanup and deep-link acceptance remains pending. GitHub Actions runs the expanded unit, browser and Docker suites for this follow-up.

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

The hero starts muted and keeps the user's mute/unmute choice across Surprise me and pause/resume, settings and tab visibility restarts. It reuses the existing preview audio preference and one video element while each movie change cancels and replaces the old stream. Muting again also carries over to the next suggestion.

The preference stays in memory for the mounted hero preview. Opening details removes that preview, so returning starts muted again; reloading also starts muted. Browser denial of unmuted autoplay retains the source and sound preference for Play preview. This adds no storage, dependency or Plex operation.

## Preview loading controls

Both preview surfaces show a small amber spinner inside Finding your preview while waiting, discovering or loading media. It replaces the status dot and respects reduced-motion preferences. Artwork remains visible until playback starts; the text status is announced politely.

Play is disabled during loading and when Plex has no playable trailer resource. It remains available to resume a pause, retry a failure, replay an ended trailer or start a browser-blocked source directly from a user gesture. Tests hold synthetic metadata and media responses to verify loading controls on the hero and details, and verify missing trailers, retry recovery and existing autoplay/audio behavior. No playback transport, Plex operation or dependency changes.

## Trailer restart revalidation

A maintainer report found that details reopen and hero scroll-away/return could fail after initial successful playback; a full page reload restored it. Playback previously reused five-minute cached extras, leaving it dependent on resource keys read before a stream stopped.

Each actual start now re-reads extras from Plex with fresh discovery and no-store HTTP caching. The cache remains bounded for other callers; fresh failures never fall back to an older resource, and diagnostic observations remain independent. The existing startup delay, abort/generation guards, per-attempt sessions, native/HLS fallback, audio preferences and scoped best-effort cleanup are retained.

Regression fixtures deliberately expire an extra after stop and return a generic 400 on reuse, plus a nonfatal 404 for cleanup. Tests repeat both reported HLS lifecycles in Chromium and through Docker/Nginx. These synthetic scenarios cover stale-resource handling; confirmation with the maintainer's actual trailers remains necessary. This change adds no dependency, storage, backend, provider or Plex operation.
