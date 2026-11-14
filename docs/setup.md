# Setup and deployment

[Back to Trafirdis](../README.md)

Run Trafirdis locally, host your own copy or upgrade an existing installation. For everyday browsing and connection behavior, see the [user guide](usage.md).

## Run locally

Use Node.js **22.12 or newer** and npm. On the desktop connected to your Plex server:

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open **http://127.0.0.1:5173**. Choose **Sign in with Plex**, authorize Trafirdis on Plex’s official website, and connect to a server from your account. A single server or your previously selected server connects automatically; otherwise choose from your owned and shared servers. No server URL environment variable is required. Trafirdis never asks for your Plex password. An advanced manual-token option remains available; do not paste tokens into issues, source files, screenshots, or chat.

You can also choose **Explore the sample library**. It contains twelve explicitly fictional movies and locally bundled original illustrations. It makes no Plex or third-party requests and does not simulate successful trailers.

To check a production build locally:

```bash
npm run build
npm run preview
```

Open **http://127.0.0.1:4173**. Vite Preview serves the static build; the browser connects directly to the selected Plex server. Development and preview servers bind only to loopback by default. Preview is for local testing, not public production hosting.

## Publish as a static HTTPS site

Run `npm ci` and `npm run build`. Publish the complete `dist/` directory at the root of an HTTPS site, preserving `runtime-config.js`, the privacy notice and static assets. No application backend, Plex proxy, account secret or per-user deployment setting is required. Do not publish the Vite development server. The app currently expects hosting at the domain root, rather than a subdirectory.

For Cloudflare Pages, use `npm run build` as the build command and `dist` as the output directory. Keep the generated `_headers` file: Pages uses it to apply the security headers in [`public/_headers`](../public/_headers) to every path. Other static hosts must configure equivalent response headers themselves; the HTML meta policy alone cannot prevent framing. Avoid adding duplicate or conflicting policies at a reverse proxy.

The production Content Security Policy permits scripts only from the application's own origin, blocks inline/evaluated scripts, forms, embedded frames and plugins, and prevents other pages from framing Trafirdis. Styles retain inline support for the existing UI, and HLS workers can use blob URLs. API, artwork and media connections initially support account discovery and become restricted to the selected server before authenticated media renders. Responses also disable MIME sniffing, referrer disclosure, camera, microphone and geolocation access. Docker includes the same headers, including on errors and cached assets. Only the local Vite development server permits inline scripts and local WebSockets for React refresh; production builds and Vite Preview use the stricter policy.

Users sign in to their own Plex account and choose their own server. The hosting server distributes application files; Plex tokens, catalog requests, artwork and trailers travel between the user's browser, Plex authentication services and the selected media server. No media relay is provided by Trafirdis hosting. Serve this application from an origin you trust: its JavaScript can access browser session credentials. Do not add analytics or scripts that capture requests or browser storage.

The browser must be able to reach the selected server. An HTTPS site requires an HTTPS Plex connection, working server CORS and valid certificates, commonly through Plex's advertised `plex.direct` URLs. Local connections can require the browser's local-network permission and compatible DNS; outside the server's network, an advertised remote/relay connection must actually work. A resource being listed does not establish reachability or playback support. See [Plex secure connections](https://support.plex.tv/articles/206225077-how-to-use-secure-server-connections/) and [resource discovery](https://support.plex.tv/articles/206721658-using-plex-tv-resources-information-to-troubleshoot-app-connections/).

Static HTTPS hosting, cross-origin API/artwork, native video, native HLS and MSE HLS are covered with synthetic local HTTPS servers. Tests use a temporary self-signed fixture certificate with browser certificate errors explicitly ignored; this does not establish real Plex certificate, CORS, local-network permission, relay, Safari or provider compatibility. Validate your real server in the target browsers before announcing a hosted deployment.

## Run with Docker

Trafirdis remains a frontend SPA. Docker packages a production build with **Nginx serving static files**. All Plex requests originate in the browser. It does not run an application backend, database, Plex server, or custom transcoder. Only Docker Engine/Desktop and Docker Compose v2 are required on the host.

From your project checkout:

```bash
cp .env.example .env
docker compose up --build -d
```

Open **http://localhost:8080** and choose **Sign in with Plex**. `docker compose up --build -d` also works without an environment file: the browser discovers and connects to your Plex server after sign-in. No token belongs in `.env`, Compose, build arguments, or the image.

Compose reads `.env` automatically. If you already configured `.env.local` for Vite, use `docker compose --env-file .env.local up --build -d` instead.

| Docker setting          | Default                                             | Purpose                                                                                                                |
| ----------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `TRAFIRDIS_DIAGNOSTICS` | `false`                                             | Enables advanced trailer diagnostics at container startup. Use `true` to inspect a sample and download a local report. |
| `TRAFIRDIS_PORT`        | `8080`                                              | Published port on the Docker host.                                                                                     |
| `TRAFIRDIS_BIND_IP`     | `127.0.0.1`                                         | Host interface. Set `0.0.0.0` deliberately for access from other devices on your trusted LAN.                          |
| `VITE_SECTION_ORDER`    | `Recently Added,Continue Watching,Unwatched Movies` | Public rail order, passed to the frontend build. Rebuild after changing it.                                            |

After editing runtime settings, run `docker compose up -d` to recreate the container. For LAN access, open `http://<docker-host-ip>:8080`; use HTTPS through your existing TLS reverse proxy if you require encrypted browser traffic. Preview sessions also work on HTTP LAN origins where `crypto.randomUUID` is unavailable.

```bash
docker compose ps          # Container and health status
docker compose logs        # Startup messages; request/error logging is disabled
docker compose down        # Stop Trafirdis; the Plex server is separate
```

The image runs as the unprivileged `nginx` user on container port 8080. Compose drops capabilities, uses a read-only root filesystem and temporary `/tmp`, and publishes only on loopback by default. The health check verifies the static server, so an offline Plex server does not take down the SPA. Plex connectivity and media delivery are handled directly by the browser and the selected server.

Plex credentials and media requests go directly from the browser to the selected Plex server. Nginx serves application files only; built-in access/error logging remains disabled. An additional hosting reverse proxy should not capture browser storage, and scripts served by the hosting origin must be trusted.

API fetches reject redirects. Native artwork/video URLs carry a server token, so the selected server must provide valid same-origin media URLs and authenticated redirects. The browser's connection policy blocks unrelated media origins. Trafirdis does not rewrite server URLs or inject authentication through a hosting proxy.

For a manual image build:

```bash
docker build -t trafirdis:local .
docker run --rm -p 127.0.0.1:8080:8080 \
  trafirdis:local
```

Docker deployments hide advanced trailer diagnostics by default. Set `TRAFIRDIS_DIAGNOSTICS=true` to enable them without rebuilding the image. The original PRD did not require Docker; packaging was added in response to the subsequent request. The [real-server acceptance checks](usage.md#trailer-diagnostics-and-real-server-validation) still apply.

## Upgrading an existing installation

The rebrand uses only Trafirdis identifiers, including the Compose service, browser storage, sign-in return parameter and public runtime configuration. Previous application-specific aliases are no longer accepted.

Before updating an existing Docker checkout, stop its stack using the previous Compose file so the old service does not keep the port occupied:

```bash
docker compose down
```

Remove the former server-address environment setting from your deployment and recreate the container. The image now serves only static files and never proxies Plex requests. Old token-only or proxy-based sessions require sign-in again; existing Trafirdis device, library and view preferences remain. The user's browser, rather than the container, must be able to reach the selected server.

Update the checkout and use `TRAFIRDIS_PORT`, `TRAFIRDIS_BIND_IP` and `TRAFIRDIS_DIAGNOSTICS` in your `.env` file. `VITE_SECTION_ORDER` retains its name. Then rebuild and start the Trafirdis service:

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
| `VITE_SECTION_ORDER` | `.env.local`                          | Comma-separated rail titles, followed by remaining genres alphabetically. Default: `Recently Added,Continue Watching,Unwatched Movies`.                |
| Plex token           | Plex sign-in or advanced manual entry | A verified server-specific token is stored in `sessionStorage`. Cleared on disconnect. Manual entry also supports an in-memory fallback.               |
| Movie library        | Catalog library selector              | Appears with multiple movie libraries. The choice is remembered per server in this browser; an unavailable choice falls back to an accessible library. |

Never create a `VITE_PLEX_TOKEN` setting: Vite embeds `VITE_` variables in public JavaScript. `.env.local` is ignored by Git. Deployment configuration contains only public UI/diagnostics settings; server discovery and authentication happen in the browser.

## Security and privacy

Trafirdis supports personal self-hosting and static HTTPS hosting. `sessionStorage` tokens can be read by scripts executing on the application's origin and by browser extensions with sufficient access. They survive reloads within the tab. Disconnect clears the token and query caches; closing the tab normally ends the session. Do not use a shared or untrusted browser profile.

API requests send authentication in headers. Native image/video URLs carry the server token and can be visible in browser developer tools and Plex-side logs. All API, artwork, preview and cleanup requests go to the selected Plex origin; the static host receives no Plex credentials in normal application requests. Do not publish browser network captures. HTTP LAN traffic is not encrypted; HTTPS app origins require HTTPS Plex connections. Hosted sign-in always uses Plex HTTPS endpoints, and the callback URL contains a random state value rather than a token.

Only relative, trusted Plex media resource paths are accepted. The hosted sign-in integration separately uses the fixed Plex HTTPS authentication/resource endpoints. API fetches reject redirects. The initial content-security policy permits HTTP(S) discovery; before authenticated media renders, a second, stricter policy limits connections, images and media to the app and selected Plex origin. That policy also blocks redirects to other origins. Disconnecting reloads the page because CSP restrictions cannot be relaxed in place. HLS requests are checked against the selected origin before attaching credentials, and pages use a no-referrer policy. Plex Web links contain no token and use `noopener noreferrer`. Artwork comes from the selected Plex connection; sample assets are local. There is no telemetry or analytics SDK.

The Docker image is a static web server. If placing a reverse proxy in front, configure TLS and any deployment authentication there; do not configure a Plex media route. A restrictive hosting CSP header must allow server discovery and the selected Plex origin, because the application's meta policies cannot relax a response-header policy. Do not publicly expose the Vite development server.
