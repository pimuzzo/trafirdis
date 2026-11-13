# PRD — Trafirdis

This document records the implemented MVP and accepted follow-ups. The current interaction requirements below supersede the original hover-driven preview proposal. Delivery history is recorded in [the implementation record](implementation.md).

**Version:** 0.1  
**Status:** MVP implemented; remaining compatibility checks tracked below\
**Project type:** Self-hosted web application  
**Initial platform:** Desktop browser (Linux)  
**Responsive validation:** PC, smartphone and iPad accepted by the maintainer\
**Primary media server:** Plex Media Server (Plex Pass)

## 1. Product Overview

Trafirdis is a self-hosted web application that provides a Netflix-like browsing and content discovery experience for an existing Plex library.

The application allows users to explore their personal movie collection through genre-based carousels, cinematic artwork, automatic trailer previews, and contextual movie information.

Unlike Plex, which focuses primarily on media management and playback, Trafirdis focuses on helping users decide what to watch.

The application does not replace Plex Media Server or its official clients.

Users browse their library through Trafirdis and watch the selected movie using Plex.

## 2. Goals

The application must:

- Provide a modern, cinematic browsing experience inspired by Netflix.
- Automatically organize movies into horizontal genre-based carousels.
- Play trailer previews automatically in the visible hero and opened movie details, after a short delay.
- Reuse Plex metadata, artwork, watch history, and available trailers.
- Support Plex Pass trailer and extras functionality.
- Run locally without requiring a cloud-hosted application.
- Avoid modifying the Plex library or watch history.
- Be simple to install, configure, and maintain.
- Support desktop browsers with responsive layouts for tablets and smartphones.

### Non-goals

The initial version will not:

- Implement a full movie playback engine.
- Transcode media.
- Replace the official Plex client.
- Manage or modify media files.
- Download trailers or movies.
- Require a separate media database.
- Implement user recommendations using AI.
- Support Samsung Tizen directly.
- Require Docker or a dedicated application backend.

## 3. Technical Architecture

### Technology Stack

- React
- TypeScript
- Vite
- TanStack Query
- CSS Modules or a lightweight styling solution
- Native HTML5 video playback where supported
- Plex Media Server HTTP API

Avoid unnecessary frameworks, complex state management, and large UI component libraries.

### Architecture

The application should be a client-side Single Page Application (SPA).

After Plex sign-in, discover owned and shared servers from the account resource list. Connect automatically when one server is available or a remembered choice remains accessible; otherwise show a server chooser. Verify the selected server identity and access before persisting the session. Remember only the public server ID across sessions, and allow changing it from Connection settings.

The browser should connect directly to the selected server, allowing the complete SPA to be served as static files over HTTPS without per-user environment configuration. HTTPS hosting requires reachable HTTPS Plex connections and compatible browser networking/CORS. Vite and Nginx serve application files only; no Plex proxy or deployment server-address setting is supported.

The Plex authentication token must be configurable and must never be committed to source control.

Hosted Plex sign-in is the primary connection flow, with manual-token entry as an advanced fallback. Only the verified server token is stored in browser session storage; the account token remains transient. Clearly document the security limitations of browser token storage.

The application must not expose the Plex token to third-party services.

Local development, production preview and Docker use direct browser-to-Plex connections. Docker packages a static Nginx web server.

No custom application backend is required for the MVP.

### Plex Integration

Implement a dedicated Plex API client responsible for:

- Connecting to Plex Media Server.
- Retrieving available movie libraries.
- Fetching movie metadata.
- Retrieving genre information.
- Retrieving artwork and background images.
- Retrieving watched and unwatched status.
- Retrieving movie extras and trailers.
- Resolving playable trailer URLs.
- Handling authentication and connection errors.

Prefer documented Plex functionality where available.

Where Plex APIs are undocumented, isolate their usage behind a dedicated adapter and document assumptions.

Avoid coupling UI components directly to Plex API response formats.

## 4. Core User Experience

### 4.1 Homepage

The homepage should resemble a modern streaming platform.

It must include:

- A large cinematic hero section.
- A featured movie with background artwork.
- Movie title, year, duration, rating, and short description.
- A primary action to open the movie in Plex.
- A secondary action to display more information.
- Multiple horizontal movie carousels.

The layout should use dark backgrounds, readable typography, smooth transitions, and large movie artwork.

Avoid excessive animations or visual clutter.

The featured film is chosen randomly from unwatched films when available, otherwise from watched films. It stays stable during ordinary browsing and filtering. Surprise me intentionally selects another eligible film when possible.

At viewport widths of 540px or less, the hero uses static artwork without a preview. Movie-details previews remain available. Wider viewports, including smartphone landscape, retain hero previews.

### 4.2 Genre-Based Carousels

Movies must be automatically grouped using their Plex genre metadata.

Example sections:

- Continue Watching
- Recently Added
- Unwatched Movies
- Science Fiction
- Thriller
- Comedy
- Horror
- Drama
- Animation
- Documentary
- Action
- Adventure

Only display genre sections containing movies.

A movie may appear in multiple genres.

Genre names should reflect Plex metadata rather than relying on a hardcoded genre list.

The application should support configurable ordering of sections.

Horizontal scrolling should support mouse wheels, trackpads, and navigation buttons.

Rails support native horizontal touch scrolling. Recently Added contains at most the 25 newest films matching the active filters; its count and details navigation use the same bounded list. Other rails initially render 30 posters and reveal further batches with Show more.

### 4.3 Movie Selection

Hover reveals poster actions; keyboard focus highlights the selected poster. Neither replaces the featured film nor starts a trailer in a lower rail.

Click, Enter or a touch tap opens the film's details in a modal. Opening from a category captures its currently filtered sequence. Previous/Next buttons, keyboard arrows and horizontal swipes outside the trailer and interactive controls navigate that sequence without wrapping. Closing restores focus and page position.

More info in the hero opens standalone details for that film, without a category counter, previous/next buttons, or keyboard/swipe movie navigation.

A newly opened details preview or eligible visible hero waits approximately 1.5 seconds before starting cold trailer discovery/playback. Rapid film changes cancel obsolete work. Reusing an eligible retained preview can skip that delay. New preview surfaces start muted; the existing in-memory audio preference is preserved while navigating within the same surface.

### 4.4 Trailer Preview

Trailer playback is a core product feature.

The application should prioritize trailers available directly through Plex.

Because the user has Plex Pass, the implementation should investigate Plex-provided extras and trailer metadata before introducing external providers.

Trailer discovery priority:

1. Plex movie extras identified as trailers.
2. Other relevant Plex-provided preview assets, where supported.
3. Optional external providers in a future phase.

Do not assume every Plex movie has an available trailer.

The application must distinguish between:

- Trailer metadata found.
- Trailer URL resolved.
- Trailer playable in the browser.
- Trailer unavailable.

A trailer must not be considered available merely because Plex returns metadata.

### Trailer Playback Requirements

- Autoplay after the preview delay on the accepted hero/details surfaces.
- Muted by default.
- Inline playback without fullscreen.
- No looping unless explicitly enabled.
- Stop playback when the selected movie changes.
- Suspend playback when its surface leaves the viewport or is occluded; changing browser tabs alone preserves playback as specified below.
- Show a static background when no trailer is available.
- Handle unsupported codecs and playback errors gracefully.
- Avoid unnecessary concurrent video requests.
- Provide an explicit audio toggle.
- Avoid autoplaying multiple trailers simultaneously.
- Keep artwork and Finding your preview visible until the browser presents a video frame. Only then report Preview playing and reveal the video with a 600ms fade. Without video-frame callback support, require current decoded video data and nonzero video dimensions before reporting playback. Respect reduced-motion preferences.

Use native HTML5 video playback when possible.

If Plex returns a trailer format unsupported by the browser, investigate Plex's available streaming/transcoding mechanisms before adding additional playback libraries.

Do not assume Plex Pass guarantees browser-playable trailers for every movie.

### Preview restart reliability — 2026-11-10

This follow-up applies to the accepted hero and details preview surfaces. It does not restore hover-driven hero selection or the removed floating preview.

**Problem:** On the reported Chrome/Docker deployment, a Plex trailer can play initially but fail after closing/reopening details while it is playing, or after scrolling the playing hero out of view and back. Server logs identify HTTP 400 starts with a missing playback decision. Refreshing extras alone did not resolve the issue.

**Requirements:**

- Before each Plex HLS attempt, request and validate a fresh playback decision on the selected Plex server. Use the extra's key, never the full movie, and the same media indices, stream settings, client identity and playback session as the corresponding start.
- HTTP 200 alone is not approval: require a recognized conversion-OK decision. A denied, malformed, unsupported or failed decision must not start a stream or bypass Plex restrictions.
- Negotiate again on popup reopen, hero visibility return, pause/resume, replay and candidate fallback. Availability metadata may remain cached; playback decisions must not be cached or shared across attempts.
- Cancelling or timing out negotiation must abort the request and prevent late responses from attaching a source. Keep one active player and best-effort cleanup scoped to its session.
- Preserve accepted audio preferences, loading controls, muted defaults and explicit retry/autoplay behavior. Decision approval does not establish URL resolution or actual playback.
- Add no backend, database, dependency, external media service, metadata write or watch-history operation. Never commit private logs, real credentials or library data.

**Acceptance:**

1. Browser tests repeatedly close/reopen playing details and scroll a playing hero out of view/back. A synthetic server rejects any start without a matching decision; playback resumes with fresh session identifiers and one player.
2. Unit/browser coverage rejects unsuccessful HTTP/decision responses and proves cancelled or timed-out negotiations cannot start stale playback. Existing native direct play remains supported.
3. Production Docker integration exercises the same strict decision/start contract and restart sequences. Quality, browser and Docker CI jobs pass.
4. The maintainer repeats these scenarios on the real Plex server. Synthetic tests validate the client protocol and lifecycle; they cannot establish that every provider/codec combination succeeds on the actual server.

### Retained preview buffers — 2026-11-10

The maintainer found no noticeable improvement from the route-preference experiment in PR #6; it was reverted and closed without merging. Network timings show multi-second waits for HLS segment responses, while decision/start requests complete in milliseconds. The new experiment must avoid rebuilding a recently used stream, rather than only reducing the selection timer. The requirements below supersede per-visibility/per-navigation renegotiation only when an already-approved stream remains open; every new stream still requires a fresh decision.

- A previously playing HLS preview may keep its existing browser element, media buffer and still-open Plex session in memory when it leaves the viewport, closes or changes to another film. It must be paused and muted while inactive, with at most one playing/visible player.
- Keep at most two inactive previews, for at most 30 seconds after each release. Retain only buffers containing the beginning (at least 0.25 seconds from zero, with no more than 60 buffered seconds). These are entry/time/buffer-duration limits, not a strict byte-memory guarantee. Do not preload other trailers or persist media.
- Returning to an eligible preview starts at zero on its existing open session, without new decision/start/initial segment requests when the required bytes remain buffered. Cold, unverified, ended, oversized or evicted buffers use the normal delayed discovery and fresh approved HLS path. Do not reuse closed session URLs.
- On reuse failure, dispose the old playback and rebuild through a fresh Plex decision/session. Existing startup/buffering timeouts and candidate fallbacks remain active; no Plex restriction is bypassed.
- Expiry, eviction, error, refresh/inspection, settings and disconnect release retained sessions with existing scoped best-effort stop calls. Cached media must stay silent and detached from the visible surface. Native HLS buffering remains browser-controlled; hls.js loading is suspended explicitly. Plex may retain a transcoder temporarily until cleanup/expiry.
- Preserve existing popup/hero audio reset rules and controls. Media loading establishes resolution; a presented frame after playback starts establishes playback success, with the decoded-data fallback above where frame callbacks are unavailable. Retained history must not make a new restart appear successful before it plays.

Acceptance: simulate slow initial segments, play A and B, then deny new media requests. Returning to A and the hero must still play from zero with the same existing element/source and no new HLS startup. Test native HLS and MSE; test 30-second expiry, two-entry eviction, ineligible buffers, teardown, silence and fresh-session fallback after reuse failure. Production Docker must prove the no-rebuild path too. Real Plex latency and session survival remain maintainer acceptance items; a first-start speedup is not claimed.

### Browser-tab continuity — 2026-11-10

The maintainer confirmed retained buffers work on the real deployment and requested continued playback when switching browser tabs, for both hero and details.

- Browser document visibility changes must not pause/mute/restart an active preview, clear its retained buffers or recreate its Plex session. Playback position and the chosen audio state continue, and trailers still end normally.
- Once the media reports playback, a missing video-frame callback in a hidden document must not be treated as a playback stall: rendering may be suspended there. Keep visual readiness tied to frame confirmation, suspend only the presentation deadline while hidden, and restore it on return if necessary. Real buffering/network stalls must still time out while hidden.
- Keep viewport-based suspension for scrolling out of the preview, manual pause, settings/disconnect cleanup, one playing surface and existing mute rules. A manually paused preview must not auto-resume on a visibility event.
- Inactive retained entries still expire by elapsed time, including when background timers are throttled. This does not extend the 30-second cache lifetime.
- Do not add background keepalive workarounds, dependencies or Plex endpoints. Browser/OS tab suspension remains outside the application guarantee.

Acceptance: for hero and details, dispatch hidden/visible events while real synthetic HLS decodes; assert time continues, source/session/audio are unchanged, and no stop/start is introduced. Existing scroll/retention/cleanup tests must pass. Real desktop tab switching remains a manual check because headless Chrome does not report pages hidden when another tab is brought forward.

### 4.5 Movie Details

Selecting a movie should display:

- Title
- Poster
- Background artwork
- Synopsis
- Release year
- Duration
- Genres
- Content rating, if available
- Community or critic rating, if available
- Watched/unwatched status
- Available trailer
- Action to open the movie in Plex

Use a modal or expandable panel rather than requiring full-page navigation.

Category-opened details include bounded navigation through their opening sequence. Hero-opened details show only the selected film, as specified in section 4.3.

Keep long titles complete and wrap them within the dialog. Show at most five synopsis lines initially, with an accessible Read more / Read less control only when the text exceeds that height. Changing films resets the synopsis to its collapsed state. Dialog height must follow the dynamic viewport, keeping scrolling and sticky navigation/close controls usable on short mobile screens with browser bars.

### 4.6 Open in Plex

Provide an "Open in Plex" action.

The initial implementation should attempt to open the corresponding movie in the Plex web application using a supported deep-link or metadata URL.

Do not construct unverified Plex URLs.

If direct navigation is not reliable, provide a fallback that opens Plex Web. Keep the movie title selectable as ordinary text for manual copying; no dedicated copy button is required.

TV remote control and direct playback on Plex TV clients are excluded from planned scope.

The maintainer confirmed on 2026-11-11 that Open in Plex opens the correct film in Plex Web in their browser. The dedicated Copy title action was removed at the maintainer's request; copying uses normal browser text selection. This confirmation does not establish compatibility with every Plex client or browser version.

## 5. Browsing and Filtering

Provide basic filters:

- Genre
- Release year
- Watched/unwatched
- Duration
- Rating

Provide a search field that searches the loaded Plex movie metadata.

Search should be responsive and should not require a new Plex request for every keystroke.

Allow combining multiple filters.

For the MVP, all filtering may happen client-side.

Remember the last Discover/Unwatched view in browser local storage and restore it on refresh alongside the selected library. Persist only the view, leaving search and other filters transient. Default to Discover when no valid preference exists; storage failures must preserve in-memory browsing. The preference survives disconnect and is removed by clearing site data.

On supported desktop browsers, native select menus open after mouse release so the opening click cannot also choose an option. Preserve keyboard and touch behavior, with a native fallback when picker support is missing or denied. Focus outlines use the shared amber styling with a 1px offset to avoid overlapping adjacent controls.

## 6. Data and Caching

Plex remains the source of truth.

Do not create a separate persistent movie database.

Use TanStack Query to cache library responses in memory.

Refresh the library when requested by the user.

Avoid downloading full-resolution artwork unnecessarily.

Prefer appropriately sized Plex artwork.

Lazy-load images outside the viewport.

Avoid loading trailer video streams for every movie in advance.

In the current implementation, only request trailer playback resources for the eligible hero or opened details preview. Adjacent trailers are not preloaded; a separately approved experiment is recorded in section 11.

Use a small in-memory cache for trailer availability and resolved metadata.

Do not cache Plex authentication tokens in application logs.

## 7. UI and Design Guidelines

The interface should feel like a polished streaming platform rather than a Plex administration dashboard.

### Visual Style

- Dark cinematic theme.
- Large background artwork.
- Horizontal content rails.
- Poster-focused navigation.
- Smooth focus transitions.
- Minimal navigation chrome.
- Readable text overlays.
- Consistent spacing.
- Responsive layout.

The design may be inspired by Netflix interaction patterns, but must use original branding, styling, and components.

Do not copy Netflix logos, proprietary assets, or exact interface artwork.

### Interaction

The interface must work with:

- Mouse
- Keyboard
- Trackpad

Keyboard navigation should support arrow keys, Enter, and Escape where appropriate.

Animations should respect `prefers-reduced-motion`.

The layout should remain usable on smaller screens even though desktop is the initial target.

## 8. Security and Privacy

The application is intended for personal, local-network use.

Requirements:

- No telemetry.
- No analytics SDK.
- No mandatory external accounts beyond Plex authentication.
- No third-party transmission of Plex tokens.
- No token values in console logs.
- No Plex credentials committed to Git.
- No public exposure of the development server by default.
- Read-only Plex operations for catalog browsing.
- Clear documentation of browser token storage risks.

The initial implementation should work without external trailer providers.

External metadata providers may be introduced later with explicit configuration.

## 9. Error Handling

Handle the following situations:

- Plex server unavailable.
- Invalid or expired Plex token.
- No movie libraries found.
- Empty movie library.
- Missing poster or background artwork.
- Missing genre metadata.
- Missing trailer.
- Unsupported trailer codec.
- Trailer playback timeout.
- Browser autoplay restrictions.
- Network interruption.

The application should remain navigable when trailers fail.

A trailer failure must never block movie selection or browsing.

## 10. Development Phases

All five phases below are implemented with the accepted interaction changes above. Automated checks use synthetic Plex data and media. Maintainer acceptance confirms real-server browsing/previews, the PC and smartphone layout, and correct Open in Plex navigation. On 2026-11-12 the maintainer also confirmed that iPad works well, with no glitches or other problems to report. The remaining manual checks cover other browser/device configurations, including Firefox, additional provider/codec combinations, session cleanup and browser/OS background scheduling; these are compatibility checks rather than missing core MVP features.

### Phase 1 — Plex Integration

Implement:

- Vite project setup.
- Plex configuration.
- Plex API client.
- Movie library discovery.
- Movie metadata retrieval.
- Poster and artwork rendering.
- Genre extraction.

**Acceptance criteria:**

The application can display real movies from the existing Plex server and group them correctly by genre.

### Phase 2 — Netflix-Like Catalog

Implement:

- Cinematic homepage.
- Featured movie banner.
- Genre-based carousels.
- Mouse and keyboard navigation.
- Movie selection.
- Movie details.
- Basic search and filtering.

**Acceptance criteria:**

Users can browse their entire Plex movie library without opening the official Plex interface.

### Phase 3 — Trailer Discovery

Implement:

- Plex extras discovery.
- Trailer identification.
- Trailer URL resolution.
- Browser compatibility checks.
- Trailer availability caching.
- Trailer diagnostics.

Provide a diagnostic view enabled in development and available through explicit production opt-in, showing for a sample of movies:

- Movie title.
- Plex movie identifier.
- Whether trailer metadata exists.
- Trailer source.
- Whether the URL resolves.
- Whether playback succeeds.
- Playback failure reason.

**Acceptance criteria:**

The application can identify and play available Plex trailers and clearly report why unavailable trailers cannot be played.

### Phase 4 — Automatic Previews

Implement:

- Delayed trailer autoplay.
- Muted playback.
- Selection cancellation.
- Trailer switching.
- Static fallback artwork.
- Audio toggle.
- Playback error recovery.

**Acceptance criteria:**

Users can browse posters without starting streams, open details to watch a delayed automatic preview, and watch the eligible hero preview without opening details. Switching films cancels obsolete work and never starts multiple active previews.

### Phase 5 — Polish

Implement:

- Responsive refinements.
- Loading skeletons.
- Image lazy loading.
- Accessibility improvements.
- Performance optimization.
- Keyboard navigation improvements.
- Reliable Plex deep linking.
- README and setup instructions.

## 11. Future Enhancements

Scope decisions confirmed by the maintainer:

- **Pick for me / random movie discovery: accepted as complete.** The hero's Surprise me action and Open in Plex cover this use case. Its current unwatched-first selection from the selected library is accepted; a separate filter-aware picker is no longer required.
- **Shortlist: removed from planned scope.** Unwatched combined with Recently Added is the accepted candidate view for the evening. No dedicated temporary or shared shortlist is planned.
- **Custom collections: removed from planned scope.** The maintainer does not require manually curated collections.
- **TV remote control and direct playback on Plex TV clients: removed from planned scope.** The maintainer does not require either capability.
- **Progressive Web App installation: removed from planned scope.** The maintainer does not require PWA support.
- **Personalized recommendations: removed from planned scope.** The maintainer does not require a recommendation system.

These decisions supersede earlier proposals for these features. The remaining ideas below were outside the original MVP; delivered follow-ups are recorded in [the implementation record](implementation.md):

- Bounded adjacent-trailer preloading while browsing category details: approved for an experiment in a separate PR, not implemented or enabled in this branch. That PR must define buffering/session budgets and cancellation, measure real Plex startup latency and load, and explicitly revise the current no-preloading requirements.
- TMDB trailer fallback.
- YouTube trailer integration.
- Multiple Plex users.
- Optional deployment on the QNAP.
- Optional Docker packaging: delivered as a follow-up.

The application architecture should allow these features without requiring a major rewrite.

## 12. Success Criteria

The MVP is successful when:

1. It connects reliably to the existing Plex server.
2. It discovers and displays the movie library.
3. Movies are automatically organized into genre carousels.
4. Users can browse using mouse and keyboard.
5. Selecting a movie displays its metadata.
6. Available trailers play automatically after a short delay.
7. Missing trailers do not interrupt navigation.
8. Plex remains unchanged and fully operational.
9. No additional database or media server is required.
10. The application can be started locally with minimal configuration.

## 13. Instructions for Codex

Implement this project incrementally.

Start by inspecting the repository and determining whether an existing application structure is present.

Do not assume the repository is empty.

Prefer small, maintainable components and clear separation between Plex integration, data models, trailer discovery, and UI presentation.

Do not introduce a custom backend unless a concrete technical limitation makes it necessary.

Before implementing automatic trailer playback, verify how Plex exposes extras and trailers for this user's Plex Pass library.

Do not invent Plex API behavior.

Use real Plex responses to validate assumptions.

If an API behavior is uncertain, isolate the integration, document the uncertainty, and provide a diagnostic test.

Avoid implementing future enhancements before the MVP works.

Maintain a working application at the end of each phase.

Add tests for genre grouping, movie filtering, trailer selection, preview cancellation, and error handling.

Document setup, configuration, known limitations, and supported browser behavior.

**Primary product principle:**

Make browsing a personal Plex library feel like discovering movies on Netflix, while leaving media management and playback entirely to Plex.
