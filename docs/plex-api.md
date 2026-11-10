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

PMS metadata types and legacy extraType values are different namespaces. The official `trailer` metadata type is 5; Trafirdis does not equate that with `extraType`. Explicit `subtype="trailer"` is the primary classification. A legacy `extraType=1` fallback applies only when subtype is absent, and remains a compatibility assumption requiring local-server validation. Explicit interview/featurette subtypes always override a numeric value. Scene/sample previews are labeled separately.

## Request surface

All catalog calls are GET requests through `/plex`, targeting the configured PMS origin:

- `/`: server name, version, machine identifier.
- `/library/sections`: accessible libraries; select movie libraries only.
- `/library/sections/{id}/all?type=1&X-Plex-Container-Start=...&X-Plex-Container-Size=200`: paginated catalog. Total size can come from the JSON body or response header. Repeated pages are detected.
- `/library/metadata/{id}?includeExtras=1`: lazy discovery for a stable selection or explicit diagnostic inspection.
- `/photo/:/transcode`: scaled artwork using a trusted relative metadata image key.
- Local `/library/parts/...` keys: direct stream candidates. Indirect/third-party part URLs are not given directly to the browser.
- `/video/:/transcode/universal/decision`: fresh preflight for each HLS attempt, using exactly the start query (extra key, media/part indices, settings and session/client identity), JSON Accept and header credentials. Require recognized numeric general success (1000/1001) and conversion-OK transcode code 1001; denied, unknown or malformed responses fail closed. This compatibility allowlist follows the official conversion-OK example; additional successful codes require evidence before support. No decision or provider text is exposed to the UI.
- `/video/:/transcode/universal/start.m3u8`: PMS-generated stream using the extra's metadata key, media/part index zero, HLS, server direct streaming enabled, direct play disabled, 720p/3 Mbps target, unique preview session identifier. PMS may remux or transcode; Trafirdis does neither itself.
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

New preview players start muted. A mounted hero or open details popup retains its in-memory audio choice through movie changes and restarts; opening details removes the hero player, and closing/reopening details creates a fresh muted player. Browser regression tests cover these accepted preferences.

## Evidence and outstanding validation

Unit tests use explicit synthetic Plex-shaped JSON, including both local parts and indirect extra keys. Browser tests use synthetic WebM/HLS media and actually decode them in Chromium. Proxy tests use a loopback HTTP fixture. These establish application behavior, not the behavior of the user's server or licensed extras provider.

The configured private Plex IP was inaccessible through the managed environment's egress policy, and no Plex token was configured. Therefore the following remain open: actual extras JSON shape, successful server resolution of provider keys, actual codec/transcoding decisions, native Safari HLS behavior, session stop compatibility, and navigation in the user's Plex Web version. The opt-in diagnostic view and the README's acceptance procedure make each of these testable locally without modifying the library.

## Hosted Plex sign-in

The additional sign-in flow follows the [official PMS authentication guide](https://developer.plex.tv/pms/) and [Plex’s authentication walkthrough](https://forums.plex.tv/t/authenticating-with-plex/609370). It uses `POST https://plex.tv/api/v2/pins?strong=true`, the documented `https://app.plex.tv/auth#?` URL, and `GET https://plex.tv/api/v2/pins/{id}` with the same client identifier and encoded strong code. Plex’s reported PIN expiry bounds the client session, with an additional ten-minute local ceiling. This uses the documented PIN/token flow; JWT key registration/refresh is not introduced.

A random one-use state value is checked on return. The account token returned by the PIN endpoint is used only for `GET https://clients.plex.tv/api/v2/resources?includeHttps=1&includeRelay=1&includeIPv6=1`. Per the official guide’s “Talking to PMS” section, the app selects the resource whose client identifier matches the configured server’s unauthenticated `/identity` response, then uses the resource’s server-specific access token. It verifies server access before storing that token. Cloud-supplied connection URLs are not used.

Authentication runs directly in the browser with credentials omitted, redirects rejected for API fetches, no-store requests, and a no-referrer policy. Trafirdis never receives the Plex password or two-factor code. No auth token is placed in the callback URL or emitted in logs. A non-secret persistent client identifier identifies this app installation. Session storage contains the pending PIN/state only until completion/cancellation, then the server access token; the cloud account token is not persisted.

Unit and real-browser tests cover PIN creation/polling, expiry, forged return state, cancellation, network errors, configured-server matching, per-server token selection, and manual/sample fallback. Docker tests cover the production runtime and simulated hosted sign-in. These tests use synthetic responses; live Plex account authorization, current cloud CORS behavior, and access to the user’s actual server remain to be validated in the user’s browser.

## Runtime diagnostics and export

The metadata inspection path still uses only `GET /library/metadata/{id}?includeExtras=1`. An explicit inspection invalidates in-memory entries for at most eight selected IDs, fetches them sequentially, and records metadata errors without misclassifying them as absent extras. It stops after denied authentication and aborts on cancellation. It does not construct stream attempts or call Plex metadata-refresh endpoints.

Reports preserve observations while previews are paused and reset them when a new check or playback attempt starts. Only media/manifest events establish resolution and only a `playing` event establishes playback. Failure codes distinguish missing trailers, unavailable resources, authentication, network, timeout, response, unsafe resource, autoplay and codec problems. A playback failure reports the last attempted candidate's failure, not a speculative diagnosis of the provider. HTTP status is included only when observed by metadata or decision API requests; native media failures expose no such status.

The versioned JSON export serializes an explicit allowlist of numeric movie IDs, known phases, booleans, fixed source/method/failure values and bounded HTTP statuses. Unknowns are null. It never serializes Plex payloads, titles, credentials, server addresses, URLs or free-text errors. The browser downloads it locally without clipboard access or a network upload. Docker tests verify both runtime modes and report downloads from the same production image.

## Playback decision restart follow-up — 2026-11-10

Private maintainer logs from PMS 1.43.5.11079 show successful HLS starts followed by successful scoped stops and rejected starts for the same extra with fresh transcode session IDs. All 182 observed start HTTP 400 responses across the supplied rotated server logs report `Denying access due to session lacking decision for transcode`. Failed-start cleanup then returns 404 because no valid transcode session exists. The `iva` agent lookup error also appears on successful starts and does not establish a provider outage. Metadata re-fetches returning 200 before failed starts show why discovery-cache invalidation alone is insufficient. No original logs, identities, titles, keys or URLs are included here.

The [official transcoder API](https://developer.plex.tv/pms/) documents both decision and start routes and their playback/client identifiers. The previous implementation requested start directly. Each HLS attempt now awaits decision approval before assigning a native source or loading an HLS manifest through hls.js. The start query is reused unchanged for the decision, including a unique playback-session identifier and the stable client identifier. A startup timeout or cancellation aborts negotiation, ignores late replies and uses existing scoped cleanup; no catalogue/watch-history operations are added. Direct native parts retain their existing path.

Synthetic browser and Docker fixtures require a matching decision before serving HLS and invalidate that approval on stop. They exercise actual media decoding and repeated restarts. These checks establish client sequencing, not Plex server internals. The maintainer confirmed on 2026-11-10 that explicit negotiation fixes the reported Chrome/Docker restart issue. Why PMS sometimes creates an implicit AdHoc decision for the first request remains an internal server behavior we have not established; acceptance across other providers/codecs remains open. No automatic fallback bypasses a refused decision. Existing best-effort stop compatibility remains unchanged; a late server-side decision after a cancelled HTTP request may still need Plex's normal session expiry.

## Faster repeat previews — 2026-11-10

The existing five-minute, 60-movie discovery cache now also holds a non-persistent preferred resource/transport identity after a real `playing` event. That identity excludes generated transcode-session parameters. It changes candidate order only; all attempt URLs and HLS decisions are newly generated, with offset zero. No media bytes, manifests or approved decisions are cached, and no API operation is added.

A repeat preview with a fresh verified preference skips the 1.5-second selection timer. New/unverified selections keep the debounce. Failed preferred attempts clear the hint and retain ordinary fallbacks. Expiry, eviction, invalidation, refresh and client teardown remove it. Discovery-object identity and cancellation guards prevent stale callbacks from warming new entries. Reports still reset their measured playback state on every attempt. Synthetic clock tests verify removal of the selection delay; browser tests verify that a previously failed native route is not retried before working HLS during details back-navigation and hero visibility restarts. Plex transcoder/provider preparation remains uncached and real-server latency improvement is not inferred from these tests.
