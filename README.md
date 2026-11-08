# Plexplore

A cinematic, local-first discovery companion for your Plex movie library. Built with React, TypeScript, Vite, and TanStack Query. Plex remains the source of truth; Plexplore has no database, analytics, external metadata provider, or application backend.

## Run locally

Use Node.js **22.12 or newer** and npm. On the desktop connected to your Plex server:

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open **http://127.0.0.1:5173**. The default proxy target is `http://192.168.178.46:32400`; change `PLEX_SERVER_URL` in `.env.local` if needed, then restart Vite. Enter your Plex token in the connection screen. [Plex explains how to find your token](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/). Do not paste tokens into issues, source files, screenshots, or chat.

You can also choose **Explore the sample library**. It contains twelve explicitly fictional movies and locally bundled original illustrations. It makes no Plex or third-party requests and does not simulate successful trailers.

To check a production build locally:

```bash
npm run build
npm run preview
```

Open **http://127.0.0.1:4173**. Vite Preview includes the same Plex proxy. Development and preview servers bind only to loopback by default. Preview is for local testing, not public production hosting.

## Configuration

| Setting              | Location                 | Purpose                                                                                                                                 |
| -------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `PLEX_SERVER_URL`    | `.env.local`             | Plex HTTP(S) origin, including port. No credentials, path, or query. Used only by Vite's server-side proxy.                             |
| `VITE_SECTION_ORDER` | `.env.local`             | Comma-separated rail titles, followed by remaining genres alphabetically. Default: `Recently Added,Continue Watching,Unwatched Movies`. |
| Plex token           | Connection screen        | Stored in `sessionStorage`, with an in-memory fallback if storage is unavailable. Cleared on disconnect.                                |
| Movie library        | Catalog library selector | Appears when the account has more than one movie library.                                                                               |

Never create a `VITE_PLEX_TOKEN` setting: Vite embeds `VITE_` variables in public JavaScript. `.env.local` is ignored by Git. Only the server origin is embedded for display; authentication is entered at runtime.

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

In development, open **Connection settings → Trailer diagnostics**. Production builds omit the diagnostic module and entry point. Inspect sample metadata processes at most eight films sequentially and does not request video streams. The table shows title, Plex identifier, metadata presence, source, observed URL resolution, observed playback, and failure/status. Test preview selects that film in the hero; reopen diagnostics to inspect its result. Playable URLs and tokens are never displayed.

**Real-server acceptance remains unverified.** The implementation environment had no Plex credentials, and a request to the specified private address was rejected by its network proxy (`403 Domain forbidden`), rather than answered by Plex. This says nothing about your Plex server's availability. No response from your server was used as a fixture. Automatic previews were implemented against researched API behavior and synthetic responses, which is a necessary deviation from the PRD's request to validate this particular library first.

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

API requests send authentication in headers. Native image/video elements require a token in their same-origin proxy URL, so credentials can be visible in browser developer tools. The local Vite middleware removes that query parameter and forwards it as a header before proxying, keeping token-bearing URLs out of Vite proxy error logs. Do not publish browser network captures or put access logs ahead of this middleware without redaction. HTTP on your LAN does not encrypt traffic; use Plex HTTPS if you require encrypted LAN transport.

Only relative, trusted Plex resource paths are accepted. External redirects are blocked, HLS requests are checked before attaching credentials, a media/connect content-security policy restricts browser requests to this origin, and pages use a no-referrer policy. Plex Web links contain no token and use `noopener noreferrer`. All artwork and sample assets are local or served through the Plex proxy. There is no telemetry or analytics SDK.

For a later self-hosted deployment, serve `dist/` and forward `/plex/` to a **fixed, trusted Plex origin** using a lightweight reverse proxy. Preserve the prefix in browser-facing streaming URLs; rewrite same-server Location headers, allow range/stream responses, strip query tokens before logging, and block external redirects. Do not expose an arbitrary-target proxy or publish the development server. No application backend is needed; a production proxy configuration is intentionally not supplied without a deployment target and authentication model.

## Development and tests

```bash
npm run check          # Unit/integration tests, TypeScript, production build
npm run test:watch
npx playwright install chromium
npm run test:e2e       # Real Chromium interaction, video and proxy tests
npm run format:check
```

If using an already installed Chromium executable:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e
```

The browser suite starts loopback-only Vite on the dedicated port 5175 with a local proxy fixture on 32401. The suite refuses to reuse an existing server on that port, so it always tests the configured fixture target. It requires no Plex token or real server. Generated WebM and HLS clips in `tests/fixtures` contain only a solid color and sine wave. They exercise actual media decoding without copyrighted trailers or external network dependencies. Tests cover grouping/filtering, pagination/errors, URL trust, trailer preference and caching, selection cancellation, timeout/cleanup, real native and HLS playback, keyboard/modal interactions, privacy, proxy behavior, and narrow layouts.

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
