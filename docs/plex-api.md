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

## Evidence and outstanding validation

Unit tests use explicit synthetic Plex-shaped JSON, including both local parts and indirect extra keys. Browser tests use synthetic WebM/HLS media and actually decode them in Chromium. Proxy tests use a loopback HTTP fixture. These establish application behavior, not the behavior of the user's server or licensed extras provider.

The configured private Plex IP was inaccessible through the managed environment's egress policy, and no Plex token was configured. Therefore the following remain open: actual extras JSON shape, successful server resolution of provider keys, actual codec/transcoding decisions, native Safari HLS behavior, session stop compatibility, and navigation in the user's Plex Web version. The development diagnostic view and the README's acceptance procedure make each of these testable locally without modifying the library.
