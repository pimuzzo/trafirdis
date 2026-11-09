# Plexplore

A cinematic, local-first discovery companion for your Plex movie library. Built with React, TypeScript, Vite, and TanStack Query. Plex remains the source of truth; Plexplore has no database, analytics, external metadata provider, or application backend.

## Run locally

Use Node.js **22.12 or newer** and npm. On the desktop connected to your Plex server:

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open **http://127.0.0.1:5173**. The default proxy target is `http://192.168.178.46:32400`; change `PLEX_SERVER_URL` in `.env.local` if needed, then restart Vite. Choose **Sign in with Plex**, authorize Plexplore on Plex’s official website, and return to your library. Plexplore never asks for your Plex password. An advanced manual-token option remains available; do not paste tokens into issues, source files, screenshots, or chat.

You can also choose **Explore the sample library**. It contains twelve explicitly fictional movies and locally bundled original illustrations. It makes no Plex or third-party requests and does not simulate successful trailers.

To check a production build locally:

```bash
npm run build
npm run preview
```

Open **http://127.0.0.1:4173**. Vite Preview includes the same Plex proxy. Development and preview servers bind only to loopback by default. Preview is for local testing, not public production hosting.

## Run with Docker

Plexplore remains a frontend SPA. Docker packages a production build with **Nginx serving static files and proxying `/plex/`**. It does not run an application backend, database, Plex server, or custom transcoder. Only Docker Engine/Desktop and Docker Compose v2 are required on the host.

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
| `PLEXPLORE_DIAGNOSTICS` | `false`                                             | Enables advanced trailer diagnostics at container startup. Use `true` to inspect a sample and download a local report.                                      |
| `PLEXPLORE_PORT`        | `8080`                                              | Published port on the Docker host.                                                                                                                          |
| `PLEXPLORE_BIND_IP`     | `127.0.0.1`                                         | Host interface. Set `0.0.0.0` deliberately for access from other devices on your trusted LAN.                                                               |
| `VITE_SECTION_ORDER`    | `Recently Added,Continue Watching,Unwatched Movies` | Public rail order, passed to the frontend build. Rebuild after changing it.                                                                                 |

Use your Plex server's LAN IP or a hostname resolvable inside Docker. `localhost` inside the container refers to the container itself. If Plex runs on the Docker host, its LAN address is the simplest option; Docker Desktop also provides `host.docker.internal`. Linux host-gateway mappings or shared Docker networks can be supplied with a local Compose override if needed.

After editing runtime settings, run `docker compose up -d` to recreate the container. For LAN access, open `http://<docker-host-ip>:8080`; use HTTPS through your existing TLS reverse proxy if you require encrypted browser traffic. Preview sessions also work on HTTP LAN origins where `crypto.randomUUID` is unavailable; clipboard access may still require HTTPS or localhost.

```bash
docker compose ps          # Container and health status
docker compose logs        # Startup messages; request/error logging is disabled
docker compose down        # Stop Plexplore; the Plex server is separate
```

The image runs as the unprivileged `nginx` user on container port 8080. Compose drops capabilities, uses a read-only root filesystem and temporary `/tmp`, and publishes only on loopback by default. The health check verifies the static server, so an offline Plex server does not take down the SPA. Metadata and media pass through one fixed configured origin; streams are unbuffered, range requests are preserved, local redirects stay under `/plex`, and external redirects are rejected.

Native media query tokens are forwarded only to Plex. Nginx access/error logging is disabled because its error messages can include original token-bearing URLs. This differs from the Vite development middleware, which converts query tokens to headers. URLs can still appear in browser developer tools or an additional reverse proxy's logs; configure that proxy's redaction separately.

When Plex redirects native artwork or video to another resource on the configured server, both proxies preserve the media URL's authentication on the trusted `/plex` redirect. Vite strips the query token back into a header on every hop. Header-only authentication is not added to redirect URLs, and external redirects remain blocked.

For a manual image build:

```bash
docker build -t plexplore:local .
docker run --rm -p 127.0.0.1:8080:8080 \
  -e PLEX_SERVER_URL=http://192.168.178.46:32400 plexplore:local
```

Docker deployments hide advanced trailer diagnostics by default. Set `PLEXPLORE_DIAGNOSTICS=true` to enable them without rebuilding the image. The original PRD did not require Docker; packaging was added in response to the subsequent request. The real-server acceptance checks below still apply.

## Configuration

| Setting              | Location                              | Purpose                                                                                                                                  |
| -------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `PLEX_SERVER_URL`    | `.env.local`                          | Plex HTTP(S) origin, including port. No credentials, path, or query. Used by the Vite proxy or Docker runtime.                           |
| `VITE_SECTION_ORDER` | `.env.local`                          | Comma-separated rail titles, followed by remaining genres alphabetically. Default: `Recently Added,Continue Watching,Unwatched Movies`.  |
| Plex token           | Plex sign-in or advanced manual entry | A verified server-specific token is stored in `sessionStorage`. Cleared on disconnect. Manual entry also supports an in-memory fallback. |
| Movie library        | Catalog library selector              | Appears when the account has more than one movie library.                                                                                |

Never create a `VITE_PLEX_TOKEN` setting: Vite embeds `VITE_` variables in public JavaScript. `.env.local` is ignored by Git. The development build embeds only the server origin for display; Docker supplies a public runtime override. Authentication is entered in the browser in both cases.

## Sign in with Plex

Choose **Sign in with Plex** on the connection screen. Plexplore creates a strong PIN using Plex’s documented authorization flow, then redirects this tab to `https://app.plex.tv/auth`. Sign in there, including any two-factor authentication Plex requires, and authorize **Plexplore**. Plex returns the browser to this same application origin. No password, PIN entry, client secret, public callback service, or custom backend is required by Plexplore.

The pending flow is kept in this tab’s session storage with a random return-state value. The return must match the stored state and client identifier, and authorization is bounded by Plex’s reported expiry and a maximum local lifetime of ten minutes. Cancel sign-in aborts requests and polling. Invalid, expired, rejected, interrupted, or throttled sign-in stays on the connection screen with a recoverable error.

After authorization, Plexplore reads the fixed configured server’s unauthenticated `/identity` endpoint and matches its `machineIdentifier` to the authenticated Plex cloud resource list. It obtains that server’s `accessToken`, verifies it against the configured server, and stores **only the server token** in the browser session. The broader Plex account token is used transiently only with Plex’s resource API and is not saved or sent to the media server. Connection URLs returned by the resource list are ignored: signing in does not change your configured proxy target.

Sign-in makes browser requests directly to `https://plex.tv` and `https://clients.plex.tv`; the container still serves only static files and proxies the configured media server. Internet access and browser session storage are required for hosted sign-in. The page’s connection policy allows these two Plex origins specifically. Other Plex servers listed in your account are not contacted. The non-secret client identifier is reused from local storage, with session/in-memory fallbacks, so Plex can identify this app instance in Authorized Devices.

**Use a Plex token instead** expands the advanced manual option. To obtain one manually, sign in to Plex Web, open a library item, choose **Get Info → View XML**, and copy the `X-Plex-Token` value from the opened URL. [Plex’s official token instructions](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/) explain the procedure. A manually entered token can be used without a cloud sign-in request. Sample browsing still makes no Plex/cloud requests.

Disconnect clears local access and catalog caches; it does not revoke Plex’s Authorized Devices entry. You can revoke the app through Plex’s account settings. Plex Home managed-user switching and automatic server selection remain outside this MVP. Maintainer smoke testing has confirmed library browsing and Plex previews in Chrome/Docker. The automated sign-in tests simulate Plex responses and redirects; full account/server compatibility still needs the acceptance checks below.

## Browsing

- Discover shows a cinematic hero and rails derived from actual Plex genre tags. Recently Added, Continue Watching, and Unwatched Movies use Plex's timestamps and watch metadata.
- Hover or keyboard focus selects a film and updates the hero. When browsing below the hero, a small dismissible preview panel keeps the selected film and trailer in view. Enter/click opens details; Escape closes the modal and restores focus. Arrow keys move between posters and rails; Home/End move within the rendered rail.
- Search (`/` shortcut) and genre, year, watch status, runtime, and rating filters combine locally. Typing does not request Plex metadata again. Rating uses Plex's audience rating when present, otherwise its primary rating.
- Rails support trackpads, mouse wheels, scroll buttons, and native touch scrolling. Vertical wheel input scrolls the rail while there is room; at the ends it continues down the page. Ctrl-wheel remains available for zoom.
- Large rails initially render 30 posters; Show more reveals subsequent batches. The full library view renders 40 at a time. Catalog retrieval itself is paginated and loads the complete selected library.
- Open in Plex uses the server's machine identifier and the movie's metadata key. The details panel also provides Copy title if a particular Plex Web version cannot navigate to the film. With no machine identifier, the link opens Plex Web's home.

## How previews work

1. A stable selection waits **1.5 seconds** before fetching details with `includeExtras=1`. Rapid selections cancel pending work.
2. The isolated adapter prefers extras explicitly identified as trailers. `sceneOrSample` extras are secondary previews. Interviews, featurettes, and arbitrary extras are never treated as trailers.
3. Supported, local Plex media parts are attempted in the native HTML5 video element. `canPlayType` is a capability hint; it is never recorded as playback success.
4. For indirect assets or incompatible native formats, Plexplore requests **Plex Media Server's own HLS streaming endpoint** using the extra's key, never the parent movie's key. Native HLS is used where available. Otherwise a dynamically imported `hls.js` implementation supplies Media Source Extensions playback. If a native HLS attempt fails, an MSE fallback is available.
5. Only a loaded media/manifest event establishes URL resolution; only an actual `playing` event establishes playback success. Metadata discovery and constructing a candidate URL do neither.
6. One video element is active. Switching films, opening an occluding dialog, hiding the tab, leaving the visible preview area, pausing, or unmounting aborts work and unloads the stream. Details use the same preview mechanism in their own visible surface. Selection changes reset audio to muted. Previews do not loop.
7. Startup or buffering stalls time out after 12 seconds. A failed candidate advances to the next candidate, then returns to static artwork. Autoplay denial keeps the source ready for the explicit Play preview button. Failures never disable catalog navigation.

Plexplore never sends timeline, scrobble, playback-progress, play-queue, library-edit, or metadata-refresh calls. Streaming may create a temporary PMS transcoder session; cleanup makes a best-effort stop call scoped to that preview session. This uses Plex's existing streaming capabilities, not a custom transcoder or full-movie playback engine.

Trailer discovery is an in-memory, 60-entry LRU cache with a five-minute expiry. Failures and cancelled fetches are not cached. TanStack Query caches catalog data for five minutes and collects inactive queries after ten minutes. Refresh clears trailer discovery and refetches catalog metadata. No movie catalog persists across reloads.

## Trailer diagnostics and real-server validation

In development, open **Connection settings → Trailer diagnostics**. In Docker, enable the optional advanced panel at runtime:

```bash
# Add PLEXPLORE_DIAGNOSTICS=true to .env, then recreate the container.
docker compose up -d
```

Set the flag back to `false` and recreate the container to hide it again. Production defaults to disabled and does not load the diagnostic JavaScript chunk. The same public setting can be used by Vite production builds; changing it there requires rebuilding. Development always enables diagnostics.

The panel starts with the selected movie and shows at most eight loaded titles. Search within the panel to inspect another film, including one excluded by catalog filters. Counts describe only this selected sample, not the entire library.

**Inspect sample metadata** reads fresh details sequentially and clears cached discovery and earlier playback observations for this sample. It never starts streams and never asks Plex to refresh or modify its own metadata. Failed requests are recorded separately from missing extras; denied authentication stops the remaining sample. Cancel or close the panel to abort unfinished requests. Completed observations remain available.

The table distinguishes missing metadata, discovered but unverified trailers, unsupported resources, failed playback, autoplay denial, and observed playback success. A new preview attempt resets old success rather than presenting it as evidence for the new attempt. **Test preview** closes the panel, clears catalog filters and selects the requested film in the hero. Reopen the panel to inspect its result.

**Download report** saves a small JSON file locally with numeric Plex movie IDs, measured states, fixed failure codes and metadata-request HTTP statuses where available. It excludes titles, credentials, server addresses, playable URLs, raw response bodies and free-text errors. Unknown observations remain `null`; metadata alone never becomes playback success. Native media errors do not provide an HTTP status, so the report does not invent one. Downloads work on HTTP LAN origins without clipboard access. Reports are never uploaded automatically; share a report only when you choose to. Refreshing or disconnecting clears in-memory observations.

**Full real-server acceptance remains pending.** Maintainer smoke testing confirmed browsing and Plex previews in Chrome/Docker; individual provider, codec, cleanup and deep-link combinations have not all been checked. The implementation environment had no Plex credentials, and a request to the specified private address was rejected by its network proxy (`403 Domain forbidden`), rather than answered by Plex. This says nothing about your Plex server's availability. No response from your server was used as a fixture. Automatic previews were implemented against researched API behavior and synthetic responses, which is a necessary deviation from the PRD's request to validate this particular library first.

On your desktop:

1. Connect and verify library counts, real artwork, genre grouping, and watched/in-progress status.
2. Inspect diagnostics for a few known films with Plex-provided trailers, a local trailer, and a film without extras.
3. Select a known trailer, remain in the visible hero for 1.5 seconds, and confirm `URL resolved: Yes` and `Playback: Succeeded`. Test muted playback, audio, switching, rapid selection, hiding the tab, scrolling away, and a movie details preview.
4. Check an indirect/online extra and an unsupported original format to exercise PMS HLS. Confirm another Plex playback session is unaffected.
5. Confirm Open in Plex reaches the correct film and Plex watch history remains unchanged after previews.

See [API research and compatibility assumptions](docs/plex-api.md) and [phase delivery record](docs/implementation.md).

## Plex prerequisites and limitations

Plex Pass does not guarantee every title has a trailer or that every browser can decode it. Plex's **Find extras** option must be enabled in the movie library's Advanced settings. Plex's own account, metadata agent, provider availability, and internet connection govern online extras. Existing metadata may need refreshing **in Plex** after changing those settings; Plexplore does not modify it. [Plex's trailer and extras documentation](https://support.plex.tv/articles/202934883-cinema-trailers-extras/) describes these requirements.

- Supported target: current desktop Chromium on Linux with native WebM/MP4 capabilities and MSE for Plex HLS. Native direct playback and Plex-shaped HLS playback are verified with generated local fixtures in Chromium. Actual PMS responses and provider streams require the checks above.
- Native HLS paths and responsive layouts are implemented for future Safari/tablet support; actual Safari, iPad, and Firefox behavior has not been tested. Browser and OS codec support varies.
- Unknown extras schemes, DRM, provider errors, missing playable keys, and external browser-side stream redirects fall back to artwork with diagnostics. Plexplore deliberately does not forward your token to a third-party URL returned by Plex. Some online extras may therefore fail until the PMS server-mediated path is validated against your version.
- Older `extraType=1` records and `plex://` extra keys are isolated compatibility cases, not universal API guarantees. The client uses standard PMS library paths; alternate providers using different feature paths are outside the MVP.
- Deep links follow the researched Python PlexAPI format; navigation in your installed Plex Web version still needs verification.
- Libraries are filtered in browser memory. Extremely large collections may benefit from server-side filtering or virtualization later. Movies without artwork, genres, ratings, year, or runtime remain browsable; absent values do not satisfy numeric filters.
- No TMDB, YouTube, AI recommendations, downloads, full-movie player, multiple-user authentication, or TV control is implemented; these remain outside MVP scope.

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

All UI, source comments, errors, configuration, and documentation are in English. The original supplied specification is retained at `docs/PRD.md`; the product brand is **Plexplore**.

The Docker test suite requires a built `plexplore:local` image, the `node:22-alpine` fixture image, and the same Playwright Chromium installation used by the browser suite. It creates and removes an isolated Docker network and test containers, uses only synthetic Plex responses/media, and checks runtime configuration, non-root/read-only operation, authentication, redirects, range/stream delivery, browser playback, offline Plex behavior, and credential-free logs. Set `PLEXPLORE_TEST_IMAGE` to test another image tag. Builds behind a TLS inspection proxy may use the optional BuildKit secret `--secret id=proxy_ca,src=/path/to/trusted-proxy-ca.pem`; that CA is mounted only during dependency installation and is not copied into the image.
