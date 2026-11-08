# Plex API research and validation boundaries

Research date: 2026-11-08. Sources were read before implementing automatic previews. The app requests JSON explicitly. No third-party API is called at runtime.

## Sources and decisions

| Source                                                                                                               | What it establishes                                                                                                                     | Implementation                                                                                               |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [Official Plex Media Server API](https://developer.plex.tv/pms/)                                                     | JSON via Accept, X-Plex token headers/query parameters, pagination, metadata keys, extras subtypes, photo resizing, universal streaming | `src/plex/client.ts`, `src/trailer/discovery.ts`, `src/trailer/service.ts`                                   |
| [Plex Cinema Trailers, Extras, & Related Albums](https://support.plex.tv/articles/202934883-cinema-trailers-extras/) | Automatic extras need Plex Pass, enabled metadata settings, and internet access; availability varies by title                           | Setup instructions and explicit unavailable state                                                            |
| [Python PlexAPI base source](https://github.com/pushingkarmaorg/python-plexapi/blob/master/plexapi/base.py)          | Existing client uses includeExtras and universal `start.m3u8` with the media key; exposes a Plex Web detail link                        | Isolated extras request and PMS HLS fallback                                                                 |
| [Python PlexAPI server source](https://github.com/pushingkarmaorg/python-plexapi/blob/master/plexapi/server.py)      | Plex Web detail link combines machineIdentifier, `details`, and metadata key                                                            | `src/plex/links.ts`; generic Plex Web plus Copy title fallback                                               |
| [Python PlexAPI clip/extra source](https://github.com/pushingkarmaorg/python-plexapi/blob/master/plexapi/video.py)   | Extras have subtype and media parts; `extraType` is not comprehensively documented                                                      | Prefer explicit subtypes; isolate numeric fallback                                                           |
| [hls.js project](https://github.com/video-dev/hls.js)                                                                | Native HLS is browser dependent; MSE supplies HLS playback elsewhere                                                                    | Lazy load only after native parts cannot play; use the light build without alternate audio/subtitle features |

PMS metadata types and legacy extraType values are different namespaces. The official `trailer` metadata type is 5; Plexplore does not equate that with `extraType`. Explicit `subtype="trailer"` is the primary classification. A legacy `extraType=1` fallback applies only when subtype is absent, and remains a compatibility assumption requiring local-server validation. Explicit interview/featurette subtypes always override a numeric value. Scene/sample previews are labeled separately.

## Request surface

All catalog calls are GET requests through `/plex`, targeting the configured PMS origin:

- `/`: server name, version, machine identifier.
- `/library/sections`: accessible libraries; select movie libraries only.
- `/library/sections/{id}/all?type=1&X-Plex-Container-Start=...&X-Plex-Container-Size=200`: paginated catalog. Total size can come from the JSON body or response header. Repeated pages are detected.
- `/library/metadata/{id}?includeExtras=1`: lazy discovery for a stable selection or explicit diagnostic inspection.
- `/photo/:/transcode`: scaled artwork using a trusted relative metadata image key.
- Local `/library/parts/...` keys: direct stream candidates. Indirect/third-party part URLs are not given directly to the browser.
- `/video/:/transcode/universal/start.m3u8`: PMS-generated stream using the extra's metadata key, media/part index zero, HLS, server direct streaming enabled, direct play disabled, 720p/3 Mbps target, unique preview session identifier. PMS may remux or transcode; Plexplore does neither itself.
- `/video/:/transcode/universal/stop?session=...`: best-effort legacy cleanup for this preview only. This compatibility endpoint is not assumed to be available on every PMS; failure is ignored and PMS expires abandoned sessions. Catalog and watch history are unaffected.

The default library feature paths target ordinary Plex Media Server libraries. The official API can expose feature paths via `/media/providers`; nonstandard providers are not yet supported. `plex://` extra metadata keys are handed to PMS as a streaming `path`, not fetched by the browser. This behavior varies with server/provider versions and is explicitly unverified for the user's library.

## What is measured

The diagnostic record distinguishes:

- **Metadata**: a trailer or supported sample extra was found.
- **Candidate**: a trusted native part or PMS HLS URL can be constructed. This is not success.
- **URL resolved**: native loaded-metadata or HLS manifest-parsed event occurred.
- **Playback succeeded**: the actual video element emitted `playing`.
- **Unavailable/error/blocked**: metadata absent, no safe candidate, loading timeout, incompatible stream, interrupted network, or autoplay denial.

No HEAD request is used as proof of playability. No video prefetch is performed for unselected films. Diagnostics inspect a small sequential sample without loading streams. Abort signals and generation checks prevent obsolete responses from replacing the current preview. Source release and player destruction prevent concurrent active video. Automatic retry is bounded by the candidate list.

Native image and video elements cannot resend a proxy-injected authentication header when following a redirect. Both Vite and Docker preserve the original media query token on validated same-server redirects; Vite removes it before each upstream request. Relative locations resolve against the current resource. Header-only credentials remain in headers, and external redirects are rejected before returning any authenticated location. Regression tests include redirect chains and actual Chromium image/video decoding.

Every preview restart resets the element and its audio control to muted, including pause/resume, settings and tab-visibility changes. The control also reads the element's actual muted state when toggled. Browser regression tests exercise all three restart paths.

## Evidence and outstanding validation

Unit tests use explicit synthetic Plex-shaped JSON, including both local parts and indirect extra keys. Browser tests use synthetic WebM/HLS media and actually decode them in Chromium. Proxy tests use a loopback HTTP fixture. These establish application behavior, not the behavior of the user's server or licensed extras provider.

The configured private Plex IP was inaccessible through the managed environment's egress policy, and no Plex token was configured. Therefore the following remain open: actual extras JSON shape, successful server resolution of provider keys, actual codec/transcoding decisions, native Safari HLS behavior, session stop compatibility, and navigation in the user's Plex Web version. The development diagnostic view and the README's acceptance procedure make each of these testable locally without modifying the library.

## Hosted Plex sign-in

The additional sign-in flow follows the [official PMS authentication guide](https://developer.plex.tv/pms/) and [Plex’s authentication walkthrough](https://forums.plex.tv/t/authenticating-with-plex/609370). It uses `POST https://plex.tv/api/v2/pins?strong=true`, the documented `https://app.plex.tv/auth#?` URL, and `GET https://plex.tv/api/v2/pins/{id}` with the same client identifier and encoded strong code. Plex’s reported PIN expiry bounds the client session, with an additional ten-minute local ceiling. This uses the documented PIN/token flow; JWT key registration/refresh is not introduced.

A random one-use state value is checked on return. The account token returned by the PIN endpoint is used only for `GET https://clients.plex.tv/api/v2/resources?includeHttps=1&includeRelay=1&includeIPv6=1`. Per the official guide’s “Talking to PMS” section, the app selects the resource whose client identifier matches the configured server’s unauthenticated `/identity` response, then uses the resource’s server-specific access token. It verifies server access before storing that token. Cloud-supplied connection URLs are not used.

Authentication runs directly in the browser with credentials omitted, redirects rejected for API fetches, no-store requests, and a no-referrer policy. Plexplore never receives the Plex password or two-factor code. No auth token is placed in the callback URL or emitted in logs. A non-secret persistent client identifier identifies this app installation. Session storage contains the pending PIN/state only until completion/cancellation, then the server access token; the cloud account token is not persisted.

Unit and real-browser tests cover PIN creation/polling, expiry, forged return state, cancellation, network errors, configured-server matching, per-server token selection, and manual/sample fallback. Docker tests cover the production runtime and simulated hosted sign-in. These tests use synthetic responses; live Plex account authorization, current cloud CORS behavior, and access to the user’s actual server remain to be validated in the user’s browser.
