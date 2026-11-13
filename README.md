# Trafirdis

**Discover your next movie, one trailer at a time.**

A trailer-first discovery experience for Plex. **Trafirdis** means **TRAiler FIRst DIScovery**: an interface for exploring your personal movie library through cinematic artwork, genre carousels and automatic trailer previews. Plex Media Server is the initially supported integration. React, TypeScript, Vite and TanStack Query power a frontend SPA with no application backend, separate movie database, analytics or external metadata provider.

Trafirdis is an independent, unofficial open-source project and is not affiliated with, endorsed by, or sponsored by Plex.

Plex and Plex Media Server are trademarks of Plex and used under a license. See [compliance guidance](docs/COMPLIANCE.md) for the applicable trademark license, integration policies and unresolved questions, the [privacy notice](public/privacy.html) for application data practices, and [NOTICE](NOTICE) for copyright and attribution. A source-code license has not yet been selected; the open-source identity is project intent rather than a license grant.

## Run locally

Use Node.js **22.12 or newer** and npm. On the desktop connected to your Plex server:

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open **http://127.0.0.1:5173**. The default proxy target is `http://192.168.178.46:32400`; change `PLEX_SERVER_URL` in `.env.local` if needed, then restart Vite. Choose **Sign in with Plex**, authorize Trafirdis on Plex’s official website, and return to your library. Trafirdis never asks for your Plex password. An advanced manual-token option remains available; do not paste tokens into issues, source files, screenshots, or chat.

You can also choose **Explore the sample library**. It contains twelve explicitly fictional movies and locally bundled original illustrations. It makes no Plex or third-party requests and does not simulate successful trailers.

To check a production build locally:

```bash
npm run build
npm run preview
```

Open **http://127.0.0.1:4173**. Vite Preview includes the same Plex proxy. Development and preview servers bind only to loopback by default. Preview is for local testing, not public production hosting.

## Run with Docker

Trafirdis remains a frontend SPA. Docker packages a production build with **Nginx serving static files and proxying `/plex/`**. It does not run an application backend, database, Plex server, or custom transcoder. Only Docker Engine/Desktop and Docker Compose v2 are required on the host.

From your project checkout:

```bash
cp .env.example .env
# Edit PLEX_SERVER_URL in .env if your Plex address differs.
docker compose up --build -d
```

Open **http://localhost:8080** and choose **Sign in with Plex**. With the supplied Plex address, `docker compose up --build -d` also works without an environment file. No token belongs in `.env`, Compose, build arguments, or the image.

Compose reads `.env` automatically. If you already configured `.env.local` for Vite, use `docker compose --env-file .env.local up --build -d` instead.

| Docker setting          | Default                                             | Purpose                                                                                                                                                     |
| ----------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PLEX_SERVER_URL`       | `http://192.168.178.46:32400`                       | Plex origin reachable **from the container**. Applied at startup to both the proxy and the browser's server label; changing it does not require rebuilding. |
| `TRAFIRDIS_DIAGNOSTICS` | `false`                                             | Enables advanced trailer diagnostics at container startup. Use `true` to inspect a sample and download a local report.                                      |
| `TRAFIRDIS_PORT`        | `8080`                                              | Published port on the Docker host.                                                                                                                          |
| `TRAFIRDIS_BIND_IP`     | `127.0.0.1`                                         | Host interface. Set `0.0.0.0` deliberately for access from other devices on your trusted LAN.                                                               |
| `VITE_SECTION_ORDER`    | `Recently Added,Continue Watching,Unwatched Movies` | Public rail order, passed to the frontend build. Rebuild after changing it.                                                                                 |

Use your Plex server's LAN IP or a hostname resolvable inside Docker. `localhost` inside the container refers to the container itself. If Plex runs on the Docker host, its LAN address is the simplest option; Docker Desktop also provides `host.docker.internal`. Linux host-gateway mappings or shared Docker networks can be supplied with a local Compose override if needed.

After editing runtime settings, run `docker compose up -d` to recreate the container. For LAN access, open `http://<docker-host-ip>:8080`; use HTTPS through your existing TLS reverse proxy if you require encrypted browser traffic. Preview sessions also work on HTTP LAN origins where `crypto.randomUUID` is unavailable.

```bash
docker compose ps          # Container and health status
docker compose logs        # Startup messages; request/error logging is disabled
docker compose down        # Stop Trafirdis; the Plex server is separate
```

The image runs as the unprivileged `nginx` user on container port 8080. Compose drops capabilities, uses a read-only root filesystem and temporary `/tmp`, and publishes only on loopback by default. The health check verifies the static server, so an offline Plex server does not take down the SPA. Metadata and media pass through one fixed configured origin; streams are unbuffered, range requests are preserved, local redirects stay under `/plex`, and external redirects are rejected.

Native media query tokens are forwarded only to Plex. Nginx access/error logging is disabled because its error messages can include original token-bearing URLs. This differs from the Vite development middleware, which converts query tokens to headers. URLs can still appear in browser developer tools or an additional reverse proxy's logs; configure that proxy's redaction separately.

When Plex redirects native artwork or video to another resource on the configured server, both proxies preserve the media URL's authentication on the trusted `/plex` redirect. Vite strips the query token back into a header on every hop. Header-only authentication is not added to redirect URLs, and external redirects remain blocked.

For a manual image build:

```bash
docker build -t trafirdis:local .
docker run --rm -p 127.0.0.1:8080:8080 \
  -e PLEX_SERVER_URL=http://192.168.178.46:32400 trafirdis:local
```

Docker deployments hide advanced trailer diagnostics by default. Set `TRAFIRDIS_DIAGNOSTICS=true` to enable them without rebuilding the image. The original PRD did not require Docker; packaging was added in response to the subsequent request. The real-server acceptance checks below still apply.

## Upgrading an existing installation

The rebrand uses only Trafirdis identifiers, including the Compose service, browser storage, sign-in return parameter and public runtime configuration. Previous application-specific aliases are no longer accepted.

Before updating an existing Docker checkout, stop its stack using the previous Compose file so the old service does not keep the port occupied:

```bash
docker compose down
```

Update the checkout and use `TRAFIRDIS_PORT`, `TRAFIRDIS_BIND_IP` and `TRAFIRDIS_DIAGNOSTICS` in your `.env` file. `PLEX_SERVER_URL` and `VITE_SECTION_ORDER` retain their names. Then rebuild and start the Trafirdis service:

```bash
docker compose up --build -d
```

Keep the current Compose project name when updating. If you move the checkout later, preserve its existing `COMPOSE_PROJECT_NAME` or stop the previous deployment first. These steps do not change Plex library data.

Finish or cancel pending sign-ins before upgrading, then sign in again afterward. Trafirdis uses browser keys under `trafirdis.*` and the `trafirdis_auth` return-state query parameter; previous browser data is neither imported nor deleted. A new public client identifier is generated for the Trafirdis namespace. Previous authorizations can be revoked separately in Plex account settings.

Custom runtime integrations must supply `window.__TRAFIRDIS_CONFIG__`. Test scripts accept `TRAFIRDIS_TEST_IMAGE` (default `trafirdis:local`).

The intended hosted repository name is `trafirdis`. Repository settings and Git remote URLs are not changed by this rebrand; the maintainer renames the repository separately. Previously downloaded reports and device labels managed by Plex may retain their historical name.

## Configuration

| Setting              | Location                              | Purpose                                                                                                                                                |
| -------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PLEX_SERVER_URL`    | `.env.local`                          | Plex HTTP(S) origin, including port. No credentials, path, or query. Used by the Vite proxy or Docker runtime.                                         |
| `VITE_SECTION_ORDER` | `.env.local`                          | Comma-separated rail titles, followed by remaining genres alphabetically. Default: `Recently Added,Continue Watching,Unwatched Movies`.                |
| Plex token           | Plex sign-in or advanced manual entry | A verified server-specific token is stored in `sessionStorage`. Cleared on disconnect. Manual entry also supports an in-memory fallback.               |
| Movie library        | Catalog library selector              | Appears with multiple movie libraries. The choice is remembered per server in this browser; an unavailable choice falls back to an accessible library. |

Never create a `VITE_PLEX_TOKEN` setting: Vite embeds `VITE_` variables in public JavaScript. `.env.local` is ignored by Git. The development build embeds only the server origin for display; Docker supplies a public runtime override. Authentication is entered in the browser in both cases.

## Sign in with Plex

Choose **Sign in with Plex** on the connection screen. Trafirdis creates a strong PIN using Plex’s documented authorization flow, then redirects this tab to `https://app.plex.tv/auth`. Sign in there, including any two-factor authentication Plex requires, and authorize **Trafirdis**. Plex returns the browser to this same application origin. No password, PIN entry, client secret, public callback service, or custom backend is required by Trafirdis.

The pending flow is kept in this tab’s session storage with a random return-state value. The return must match the stored state and client identifier, and authorization is bounded by Plex’s reported expiry and a maximum local lifetime of ten minutes. Cancel sign-in aborts requests and polling. Invalid, expired, rejected, interrupted, or throttled sign-in stays on the connection screen with a recoverable error.

After authorization, Trafirdis reads the fixed configured server’s unauthenticated `/identity` endpoint and matches its `machineIdentifier` to the authenticated Plex cloud resource list. It obtains that server’s `accessToken`, verifies it against the configured server, and stores **only the server token** in the browser session. The broader Plex account token is used transiently only with Plex’s resource API and is not saved or sent to the media server. Connection URLs returned by the resource list are ignored: signing in does not change your configured proxy target.

Sign-in makes browser requests directly to `https://plex.tv` and `https://clients.plex.tv`; the container still serves only static files and proxies the configured media server. Internet access and browser session storage are required for hosted sign-in. The page’s connection policy allows these two Plex origins specifically. Other Plex servers listed in your account are not contacted. The non-secret client identifier is reused from local storage, with session/in-memory fallbacks, so Plex can identify this app instance in Authorized Devices.

**Use a Plex token instead** expands the advanced manual option. To obtain one manually, sign in to Plex Web, open a library item, choose **Get Info → View XML**, and copy the `X-Plex-Token` value from the opened URL. [Plex’s official token instructions](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/) explain the procedure. A manually entered token can be used without a cloud sign-in request. Sample browsing still makes no Plex/cloud requests.

Disconnect clears local access and catalog caches; it does not revoke Plex’s Authorized Devices entry. You can revoke the app through Plex’s account settings. Plex Home managed-user switching and automatic server selection remain outside this MVP. Maintainer smoke testing has confirmed library browsing and Plex previews in Chrome/Docker. The automated sign-in tests simulate Plex responses and redirects; full account/server compatibility still needs the acceptance checks below.

## Browsing

- Discover shows a cinematic hero and rails derived from actual Plex genre tags. Recently Added, Continue Watching, and Unwatched Movies use Plex's timestamps and watch metadata. The Unwatched tab filters the same categories instead of changing the layout, and hides the redundant Unwatched Movies section.
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
8. Startup or buffering stalls time out after 12 seconds. A failed candidate advances to the next candidate, then returns to static artwork. Autoplay denial keeps the source ready for the explicit Play preview button. Failures never disable catalog navigation.

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

See [API research and compatibility assumptions](docs/plex-api.md) and [phase delivery record](docs/implementation.md).

## Plex prerequisites and limitations

Plex Pass does not guarantee every title has a trailer or that every browser can decode it. Plex's **Find extras** option must be enabled in the movie library's Advanced settings. Plex's own account, metadata agent, provider availability, and internet connection govern online extras. Existing metadata may need refreshing **in Plex** after changing those settings; Trafirdis does not modify it. [Plex's trailer and extras documentation](https://support.plex.tv/articles/202934883-cinema-trailers-extras/) describes these requirements.

- Supported target: current desktop Chromium on Linux with native WebM/MP4 capabilities and MSE for Plex HLS. Native direct playback and Plex-shaped HLS playback are verified with generated local fixtures in Chromium. Actual PMS responses and provider streams require the checks above.
- Responsive layout is implemented and maintainer-accepted on PC, smartphone and iPad. The tested iPad setup works without reported problems; other Safari/device configurations and Firefox remain unverified. Native HLS and codec support depend on the browser and OS.
- Unknown extras schemes, DRM, provider errors, missing playable keys, and external browser-side stream redirects fall back to artwork with diagnostics. Trafirdis deliberately does not forward your token to a third-party URL returned by Plex. Some online extras may therefore fail until the PMS server-mediated path is validated against your version.
- Older `extraType=1` records and `plex://` extra keys are isolated compatibility cases, not universal API guarantees. The client uses standard PMS library paths; alternate providers using different feature paths are outside the MVP.
- Deep links follow the researched Python PlexAPI format. The maintainer confirmed correct film navigation in their Plex Web deployment on 2026-11-11; other client/browser versions still need their own compatibility checks.
- Libraries are filtered in browser memory. Extremely large collections may benefit from server-side filtering or virtualization later. Movies without artwork, genres, ratings, year, or runtime remain browsable; absent values do not satisfy numeric filters.
- No TMDB, YouTube, downloads, full-movie player or multiple-user authentication is implemented; these remain outside MVP scope. Custom collections, TV remote control, direct playback on Plex TV clients, Progressive Web App installation and personalized recommendations are excluded from planned scope.

## Security and privacy

This is a personal local-network prototype. `sessionStorage` tokens can be read by scripts executing on the application's origin and by browser extensions with sufficient access. They survive reloads within the tab. Disconnect clears the token and query caches; closing the tab normally ends the session. Do not use a shared or untrusted browser profile.

API requests send authentication in headers. Native image/video elements require a token in their same-origin proxy URL, so credentials can be visible in browser developer tools. The local Vite middleware removes that query parameter and forwards it as a header before proxying, keeping token-bearing URLs out of Vite proxy error logs. Do not publish browser network captures or put access logs ahead of this middleware without redaction. HTTP on your LAN does not encrypt traffic; use Plex HTTPS and an HTTPS app origin if you require encrypted transport. Hosted sign-in always uses Plex HTTPS endpoints, and the authorization callback URL contains a random state value rather than a token.

Only relative, trusted Plex media resource paths are accepted. The hosted sign-in integration separately uses the fixed Plex HTTPS authentication/resource endpoints. External redirects are blocked, HLS requests are checked before attaching credentials, a media/connect content-security policy restricts media to this origin and connections to this origin plus the two required Plex sign-in origins, and pages use a no-referrer policy. Plex Web links contain no token and use `noopener noreferrer`. All artwork and sample assets are local or served through the Plex proxy. There is no telemetry or analytics SDK.

The Docker image supplies a local/LAN production reverse proxy with those protections. If placing another proxy in front, preserve the `/plex` prefix and streaming behavior, configure TLS and authentication for your deployment, and prevent token-bearing request URLs from entering access/error logs. Do not publicly expose the Vite development server or an arbitrary-target proxy.

## Development and tests

```bash
npm run check          # Unit/integration tests, TypeScript, production build
npm run test:watch
npx playwright install chromium
npm run test:e2e       # Real Chromium interaction, video and proxy tests
npm run test:docker    # Test a built image with the real Nginx proxy and browser playback
npm run format:check
```

If using an already installed Chromium executable:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e
```

The browser suite starts loopback-only Vite on the dedicated port 5175 with a local proxy fixture on 32401. The suite refuses to reuse an existing server on that port, so it always tests the configured fixture target. It requires no Plex token or real server. Generated WebM and HLS clips in `tests/fixtures` contain only a solid color and sine wave. They exercise actual media decoding without copyrighted trailers or external network dependencies. Tests cover grouping/filtering, pagination/errors, URL trust, trailer preference and caching, selection cancellation, timeout/cleanup, real native and HLS playback, keyboard/modal interactions, privacy, proxy behavior, and narrow layouts.

### GitHub Actions

[CI](.github/workflows/ci.yml) runs on every pull request, pushes to `main`, and manual dispatch. It uses Node.js 22 on Ubuntu 24.04 with three independent checks:

- **Quality checks**: locked dependency installation, formatting (including workflow files), unit/integration tests, TypeScript, and a production build.
- **Browser tests**: the complete Playwright suite against the local synthetic Plex fixture. CI installs Google Chrome so native and HLS tests exercise its media codec support. The HTML report and failure screenshots/traces are uploaded as `browser-test-results` for seven days.
- **Docker integration**: builds the production image and runs the container/proxy/browser suite against a synthetic Plex server, including actual media decoding, hosted sign-in simulation, and diagnostics disabled/enabled using the same image.

The workflow needs no Plex credentials, private-network access, repository secrets, or image-registry publishing permissions. Actions are pinned to commit SHAs and repository permissions are read-only. New commits cancel older runs for the same branch or pull request. CI rejects focused `test.only` cases and allows 60 seconds per browser test (30 seconds locally); it does not automatically retry failed tests. Local runs also retain traces for failures.

For branch protection on `main`, require the **Quality checks**, **Browser tests**, and **Docker integration** status checks before merging. Failed runs expose their logs in the PR's Checks tab; browser artifacts can be downloaded from the corresponding Actions run. The workflow does not publish an image or deploy the app. Real Plex account/server acceptance still happens on your desktop.

## Source layout

```text
src/domain/       Internal movie model, filters, genre grouping
src/plex/         Plex transport schemas, API adapter, safe URLs, deep links
src/trailer/      Extras discovery, bounded cache, playback plans, media lifecycle
src/hooks/        Preview cancellation and delayed-start orchestration
src/components/   Reusable catalog, artwork, details, controls and dialogs
src/App.tsx       Connection/session boundary
public/sample/    Original local sample illustrations
```

All UI, source comments, errors, configuration, and documentation are in English. `docs/PRD.md` records the implemented MVP, accepted interaction changes, validation boundaries and future scope. Future work affecting identity, integrations or distribution must consult `docs/COMPLIANCE.md`.

The Docker test suite requires a built `trafirdis:local` image, the `node:22-alpine` fixture image, and the same Playwright Chromium installation used by the browser suite. It creates and removes an isolated Docker network and test containers, uses only synthetic Plex responses/media, and checks runtime configuration, non-root/read-only operation, authentication, redirects, range/stream delivery, browser playback, offline Plex behavior, and credential-free logs. Set `TRAFIRDIS_TEST_IMAGE` to test another image tag. Builds behind a TLS inspection proxy may use the optional BuildKit secret `--secret id=proxy_ca,src=/path/to/trusted-proxy-ca.pem`; that CA is mounted only during dependency installation and is not copied into the image.

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
