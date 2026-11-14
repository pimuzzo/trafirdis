# User guide and trailer troubleshooting

[Back to Trafirdis](../README.md)

Sign in, browse your library and understand preview behavior. Deployment and HTTPS connection requirements are covered in the [setup guide](setup.md).

## Sign in with Plex

Choose **Sign in with Plex** on the connection screen. Trafirdis creates a strong PIN using Plex’s documented authorization flow, then redirects this tab to `https://app.plex.tv/auth`. Sign in there, including any two-factor authentication Plex requires, and authorize **Trafirdis**. Plex returns the browser to this same application origin. No password, PIN entry, client secret, public callback service, or custom backend is required by Trafirdis.

The pending flow is kept in this tab’s session storage with a random return-state value. The return must match the stored state and client identifier, and authorization is bounded by Plex’s reported expiry and a maximum local lifetime of ten minutes. Cancel sign-in aborts requests and polling. Invalid, expired, rejected, interrupted, or throttled sign-in stays on the connection screen with a recoverable error.

After authorization, Trafirdis requests the Plex cloud resource list and shows the owned/shared resources that provide a server and an access token. With one server, or a still-accessible remembered choice, it connects automatically. **Change server** in Connection settings clears that preference and returns to sign-in and selection. A failed automatic connection leaves the server chooser available for retry or another server.

For the selected server only, Trafirdis tries the advertised local connections first, then remote and relay connections, preferring HTTPS within each group. HTTPS app origins reject HTTP alternatives. Each candidate is checked with an authenticated `GET /` using that resource’s token, and its returned `machineIdentifier` must match the selected cloud resource before the connection is saved. Candidate checks start 250 milliseconds apart; the first identity-verified response wins and cancels the others, with a ten-second deadline per started check. Public `/identity` is not a prerequisite: real PMS responses can restrict its CORS permission to Plex’s own web origin even while authenticated access works.

HTTP deployments can additionally try a private IPv4 LAN address and its exact port from the selected Plex resource's connection metadata when it is explicitly local, not a relay, and the server explicitly reports `httpsRequired: false`. No address is extracted from DNS names, no port is guessed and no HTTP fallback is added on HTTPS app origins or when secure transport is required/unknown. This handles unreachable `plex.direct` DNS on HTTP LAN deployments without a configured server URL. HTTP traffic is unencrypted; hosted HTTPS sites still require working HTTPS Plex connections. Tests cover DNS failure with a successful LAN fallback, stalled probes, cancellation and the secure-transport guards.

The account token is used transiently only with Plex’s resource API and is discarded after lookup. Resource tokens remain in memory while choosing; only the verified selected token and connection are stored in this tab’s session storage (`trafirdis.token`, `trafirdis.server`). The remembered server ID (`trafirdis.preferred-server`) contains no credential and is checked against each fresh account resource list.

Sign-in makes browser requests directly to `https://plex.tv` and `https://clients.plex.tv`. Normal catalog, artwork and preview traffic goes directly from the browser to the chosen Plex connection. Internet access and browser session storage are required for hosted sign-in. Unselected account servers are not probed. The non-secret client identifier is reused from local storage, with session/in-memory fallbacks, so Plex can identify this app instance in Authorized Devices.

**Use a Plex token instead** expands the advanced manual option. To obtain one manually, sign in to Plex Web, open a library item, choose **Get Info → View XML**, and copy the `X-Plex-Token` value from the opened URL. [Plex’s official token instructions](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/) explain the procedure. A manually entered token can be used without a cloud sign-in request. Also enter the server HTTP(S) origin in the form; Trafirdis verifies access before connecting. Sample browsing still makes no Plex/cloud requests.

Disconnect clears local access and catalog caches; it does not revoke Plex’s Authorized Devices entry. You can revoke the app through Plex’s account settings. Plex Home managed-user switching remains outside this MVP. Maintainer smoke testing has confirmed library browsing and Plex previews in Chrome/Docker. The automated sign-in tests simulate Plex responses and redirects; full account/server compatibility still needs the acceptance checks below.

## Browsing

- Discover shows a cinematic hero and rails derived from actual Plex genre tags. Recently Added, Continue Watching, and Unwatched Movies use Plex's timestamps and watch metadata. The Unwatched tab filters the same categories instead of changing the layout, and hides the redundant Unwatched Movies section.
- The last Discover/Unwatched view is remembered in this browser under `trafirdis.catalog-view` and restored on refresh alongside the saved library selection. Only the view is persisted; search and other filters reset. A new or invalid preference defaults to Discover. The view preference survives disconnect; clearing this site's browser data removes it. Browsing remains usable if local storage is blocked.
- Discover groups the library into categories. The featured movie is picked randomly from unwatched films when any are available, otherwise from watched films. It stays stable while hovering, moving keyboard focus, searching, filtering or browsing details. **Surprise me** makes another pick using the same rule and avoids the current film when an alternative exists. The button is disabled when there is no other film to suggest. An explicit diagnostic Test preview can select a different featured movie. Hover reveals card actions; keyboard focus selects a poster without starting another player. Enter/click opens details; Escape closes the modal and restores focus. Arrow keys move between posters and rails; Home/End move within the rendered rail.
- Inside category-opened details, Previous/Next movie buttons and a position counter follow the category you opened. Left/Right keys and horizontal swipes across the details also navigate; swipes over the trailer and controls are ignored. Navigation respects category order and current filters, stops at both ends, and includes films without trailers. More info in the hero opens standalone details without a category counter, buttons, keyboard navigation or swipe navigation between films. Closing preserves your page position and filters.
- Details keep long titles complete and wrap them to the available width. Synopses initially show up to five lines, with Read more / Read less only when needed. Dialog height follows the dynamic viewport so browser bars leave room for scrolling and the sticky navigation/close controls.
- Search (`/` shortcut) and genre, year, watch status, runtime, and rating filters combine locally. Typing does not request Plex metadata again. Rating uses Plex's audience rating when present, otherwise its primary rating.
- On supported desktop browsers, filter and library select menus open after mouse release to prevent the opening gesture from selecting an option. Keyboard and touch interaction remain native, with a fallback if picker support is unavailable or denied. All focus outlines use a compact 1px offset so they do not overlap adjacent controls.
- Rails support trackpads, mouse wheels, scroll buttons, and native touch scrolling. Vertical wheel input scrolls the rail while there is room; at the ends it continues down the page. Ctrl-wheel remains available for zoom.
- Categories remain visible during search and every filter combination, including Unwatched. Empty categories are omitted. Recently Added is limited to the 25 most recent films matching the current filters, including its details navigation. Other rails initially render 30 posters; Show more reveals subsequent batches. Catalog retrieval itself is paginated and loads the complete selected library.
- Open in Plex uses the server's machine identifier and the movie's metadata key. The movie title remains selectable as ordinary text for manual copying if needed. With no machine identifier, the link opens Plex Web's home.
- At viewport widths of 540px or less, the hero shows static artwork without starting a preview; details can still play trailers. Wider viewports, including smartphone landscape, retain hero previews. The maintainer has accepted the layout on PC, smartphone and iPad.

- **Pick for me** is fulfilled by **Surprise me → Open in Plex** in the hero, using the existing unwatched-first selection from the selected library.
- A dedicated **Shortlist** is not planned. Use **Unwatched → Recently Added** as the list of candidates for the evening.

## How previews work

1. An eligible visible hero or opened details preview waits **1.5 seconds** before cold discovery with `includeExtras=1`. Focusing or hovering a poster does not start another preview. Rapid film changes cancel pending work; an eligible retained buffer can skip the delay.
2. The isolated adapter prefers extras explicitly identified as trailers. `sceneOrSample` extras are secondary previews. Interviews, featurettes, and arbitrary extras are never treated as trailers.
3. Supported, local Plex media parts are attempted in the native HTML5 video element. `canPlayType` is a capability hint; it is never recorded as playback success.
4. For indirect assets or incompatible native formats, Trafirdis requests **Plex Media Server's own HLS streaming endpoint** using the extra's key, never the parent movie's key. Every new HLS stream first requests a fresh Plex playback decision with matching stream settings and session/client identifiers; a refused or unsupported decision never starts a manifest. A recently playing preview may instead reuse its still-open session and browser buffer as described below. A cold or failed reuse repeats negotiation while keeping availability metadata cached. Native HLS is used where available. Otherwise a dynamically imported `hls.js` implementation supplies Media Source Extensions playback. If a native HLS attempt fails, an MSE fallback is available.
5. Only a loaded media/manifest event establishes URL resolution. Playback success waits for the browser's video-frame callback after playback starts; browsers without that API require current decoded video data and nonzero video dimensions. Artwork and Finding your preview remain until that confirmation, then Preview playing appears and the video fades in over 600ms. The fade respects reduced-motion preferences. Metadata, a candidate URL or the `playing` event alone does not establish frame presentation on browsers with frame callbacks.
6. One video element is active. Switching films, opening an occluding dialog, leaving the visible preview area, pausing, or unmounting stops visible/audible playback. Eligible HLS buffers can be retained briefly; other work is aborted and unloaded. Details use the same preview mechanism in their own visible surface. The hero starts muted and keeps the user's mute/unmute choice across Surprise me, pausing, settings and tab visibility changes while its preview remains mounted. Opening details replaces the hero preview; returning to the hero starts muted again. An opened details popup starts muted and keeps the user's mute/unmute choice when navigating between films, pausing or resuming. Closing and reopening details resets that choice. If a browser blocks unmuted autoplay, Play preview starts the loaded source directly from a tap. Previews do not loop.
7. While finding/loading a preview, a small spinner appears inside the status badge and Play is disabled. Play stays disabled when no playable trailer is available. Errors offer Retry preview; browser autoplay denial offers Play preview; completed trailers offer Replay preview. The loading indicator respects reduced-motion preferences.
8. Startup or buffering stalls time out after 12 seconds. Once media is playing, waiting for a frame in a hidden tab suspends the presentation deadline; returning to the tab restores the deadline if a frame is still missing. Actual buffering/network stalls retain their timeout even while hidden. A failed candidate advances to the next candidate, then returns to static artwork. Autoplay denial keeps the source ready for the explicit Play preview button. Failures never disable catalog navigation.

Trafirdis never sends timeline, scrobble, playback-progress, play-queue, library-edit, or metadata-refresh calls. Streaming may create a temporary PMS transcoder session; cleanup makes a best-effort stop call scoped to that preview session. This uses Plex's existing streaming capabilities, not a custom transcoder or full-movie playback engine.

Trailer discovery is an in-memory, 60-entry LRU cache with a five-minute expiry. Failures and cancelled fetches are not cached. TanStack Query caches catalog data for five minutes and collects inactive queries after ten minutes. Refresh clears trailer discovery and refetches catalog metadata. No movie catalog persists across reloads.

## Trailer diagnostics and real-server validation

In development, open **Connection settings → Trailer diagnostics**. In Docker, enable the optional advanced panel at runtime:

```bash
# Add TRAFIRDIS_DIAGNOSTICS=true to .env, then recreate the container.
docker compose up -d
```

Set the flag back to `false` and recreate the container to hide it again. Production defaults to disabled and does not load the diagnostic JavaScript chunk. The same public setting can be used by Vite production builds; changing it there requires rebuilding. Development always enables diagnostics.

The panel starts with the selected movie and shows at most eight loaded titles. Search within the panel to inspect another film, including one excluded by catalog filters. Counts describe only this selected sample, not the entire library.

**Inspect sample metadata** reads fresh details sequentially and clears cached discovery and earlier playback observations for this sample. It never starts streams and never asks Plex to refresh or modify its own metadata. Failed requests are recorded separately from missing extras; denied authentication stops the remaining sample. Cancel or close the panel to abort unfinished requests. Completed observations remain available.

The table distinguishes missing metadata, discovered but unverified trailers, unsupported resources, failed playback, autoplay denial, and observed playback success. A new preview attempt resets old success rather than presenting it as evidence for the new attempt. **Test preview** closes the panel, clears catalog filters and selects the requested film in the hero. At widths of 540px or less it opens standalone details instead, where the trailer can play. Reopen the panel to inspect its result.

**Download report** saves a small JSON file locally with numeric Plex movie IDs, measured states, fixed failure codes and metadata-request HTTP statuses where available. It excludes titles, credentials, server addresses, playable URLs, raw response bodies and free-text errors. Unknown observations remain `null`; metadata alone never becomes playback success. Native media errors do not provide an HTTP status, so the report does not invent one. Downloads work on HTTP LAN origins without clipboard access. Reports are never uploaded automatically; share a report only when you choose to. Refreshing or disconnecting clears in-memory observations.

**Maintainer acceptance and remaining checks.** Browsing and Plex previews were confirmed on the real Chrome/Docker deployment. On 2026-11-11 the maintainer also confirmed that Open in Plex opens the correct film in Plex Web and that the layout looks good on PC and smartphone. On 2026-11-12 the maintainer confirmed that iPad works well, with no glitches or other problems to report. These confirmations do not establish every provider/codec combination, session-cleanup behavior or browser/OS background scheduling; those checks remain open. The implementation environment had no Plex credentials, and its initial private-server request was rejected by the network proxy. Automated tests use only synthetic responses/media; no real Plex credentials or library responses were used as fixtures.

For remaining compatibility checks or regression testing after upgrades:

1. Connect and verify library counts, real artwork, genre grouping, and watched/in-progress status.
2. Inspect diagnostics for a few known films with Plex-provided trailers, a local trailer, and a film without extras.
3. Use an eligible visible hero or open movie details, wait for the trailer and confirm `URL resolved: Yes` and `Playback: Succeeded` in diagnostics. Check that Finding your preview lasts until a video frame is ready, then the video fades in. Test muted playback, audio, switching, rapid selection, changing browser tabs without interrupting playback, scrolling away, and a movie details preview. On narrow smartphones use details because the hero preview is disabled.
4. Check an indirect/online extra and an unsupported original format to exercise PMS HLS. Confirm another Plex playback session is unaffected.
5. Recheck Open in Plex on additional browsers/clients or after upgrades; correct Plex Web navigation is already maintainer-confirmed on the current deployment. Separately verify that previewing leaves Plex watch history unchanged.

See [API research and compatibility assumptions](plex-api.md) and [phase delivery record](implementation.md).

## Plex prerequisites and limitations

Plex Pass does not guarantee every title has a trailer or that every browser can decode it. Plex's **Find extras** option must be enabled in the movie library's Advanced settings. Plex's own account, metadata agent, provider availability, and internet connection govern online extras. Existing metadata may need refreshing **in Plex** after changing those settings; Trafirdis does not modify it. [Plex's trailer and extras documentation](https://support.plex.tv/articles/202934883-cinema-trailers-extras/) describes these requirements.

- Supported target: current desktop Chromium on Linux with native WebM/MP4 capabilities and MSE for Plex HLS. Native direct playback and Plex-shaped HLS playback are verified with generated local fixtures in Chromium. Actual PMS responses and provider streams require the checks above.
- Responsive layout is implemented and maintainer-accepted on PC, smartphone and iPad. The tested iPad setup works without reported problems; other Safari/device configurations and Firefox remain unverified. Native HLS and codec support depend on the browser and OS.
- Unknown extras schemes, DRM, provider errors, missing playable keys, and external browser-side stream redirects fall back to artwork with diagnostics. Trafirdis deliberately does not forward your token to a third-party URL returned by Plex. Some online extras may therefore fail until the PMS server-mediated path is validated against your version.
- Older `extraType=1` records and `plex://` extra keys are isolated compatibility cases, not universal API guarantees. The client uses standard PMS library paths; alternate providers using different feature paths are outside the MVP.
- Deep links follow the researched Python PlexAPI format. The maintainer confirmed correct film navigation in their Plex Web deployment on 2026-11-11; other client/browser versions still need their own compatibility checks.
- Libraries are filtered in browser memory. Extremely large collections may benefit from server-side filtering or virtualization later. Movies without artwork, genres, ratings, year, or runtime remain browsable; absent values do not satisfy numeric filters.
- No TMDB, YouTube, downloads, full-movie player or multiple-user authentication is implemented; these remain outside MVP scope. Custom collections, TV remote control, direct playback on Plex TV clients, Progressive Web App installation and personalized recommendations are excluded from planned scope.

### Verify the preview restart fix

Rebuild the Docker image after updating to the fix branch (`docker compose up --build -d`), then reload the browser so the new frontend is loaded. In Chrome, play a trailer, close details while it plays and reopen the same poster repeatedly. Also scroll a playing hero out of view and back, pause/resume and replay. Check the accepted audio reset/preservation rules above and that only one preview is active.

Network should show a successful `/video/:/transcode/universal/decision` before each new `start.m3u8`, using the same extra and session/settings for that attempt. HTTP 200 for decision alone is not sufficient: Plex must approve conversion. An error remains retryable and must not trigger a full-movie player or any metadata/history update. Inspect locally; do not publish token-bearing URLs or raw Plex logs. A 404 on best-effort cleanup after a failed start does not establish the cause of the playback failure.

Automated tests exercise a synthetic server that refuses unapproved starts, including repeated popup reopen and hero visibility restarts. Actual PMS/provider/codec acceptance remains a separate manual check; explicit negotiation is supported by the observed missing-decision errors, not a guarantee that every real trailer will play.

### Retained preview buffers

To avoid preparing the same HLS stream again on a quick return, Trafirdis can keep up to two already-playing previews paused and muted in memory for 30 seconds after leaving them. An eligible buffer must still contain the start and hold no more than 60 seconds of media. Returning restarts at zero on the existing open session. The browser element and buffer are reused, not an old URL from a closed session. Native direct-play parts and ended/unverified/ineligible buffers retain their normal cold-start behavior.

There is still only one visible/playing video. Inactive elements are detached and silent. hls.js stops loading while retained; native HLS buffering is controlled by the browser, with preload disabled as a hint. These limits bound retained entries, lifetime and accepted buffer duration, not exact memory bytes. Plex can keep a transcoder allocated during this short interval. No adjacent trailers are preloaded and no media is persisted.

An experiment with bounded adjacent-trailer preloading in category details has been approved for a separate PR. It is not implemented or enabled here; buffering limits, session budgets, cancellation and real-server impact must be defined and validated in that work.

Expiry, eviction, errors, refresh/metadata inspection, settings and disconnect release retained buffers and make scoped best-effort stop calls. An unusable retained playback falls back to a new session with a fresh Plex decision. Hero and popup mute preferences keep their existing rules; a new surface still starts muted even when it takes a buffered element.

To test on Chrome/Docker, play A, open details, move to B and back to A, or scroll the playing hero out of view and back within 30 seconds. A warm return should restart from zero without another decision/start or initial-segment wait. A first visit, return after eviction/expiry or missing start buffer can still incur Plex startup latency. Use Network to distinguish reused open streams from fresh starts. Synthetic native/MSE and production Docker tests prove buffer reuse with slow initial media and rejected new requests; real Plex/provider/session survival still needs validation. PR #6's earlier route-preference optimization was reverted after showing no noticeable improvement on the real deployment.

### Switching browser tabs

Changing the active browser tab does not pause, mute, restart or release an active hero/details preview. It keeps its current position, audio choice and open Plex session, and ends normally when the trailer finishes. An explicitly paused preview stays paused. Scrolling the preview out of its viewport still suspends it; settings, disconnect and retained-buffer limits still apply.

This is Trafirdis's application policy, not an override of browser/OS behavior. Tab discard, energy saving, device sleep and browser media policies can still suspend playback. Automated headless tests dispatch visibility events while decoding real synthetic HLS; desktop Chrome tab switching should also be checked manually. Retained inactive buffers still expire after 30 seconds of elapsed time even if a background tab throttles timer callbacks.

On 2026-11-14, the maintainer confirmed that the new server-discovery and direct-connection flow works on their deployment after the authenticated-root and LAN fallback fixes. This confirms that setup; other hosted HTTPS deployments, DNS configurations and browser/provider combinations still need their own checks.
