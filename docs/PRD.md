# PRD — Plex Discovery

**Version:** 0.1  
**Status:** Ready for implementation  
**Project type:** Self-hosted web application  
**Initial platform:** Desktop browser (Linux)  
**Future platforms:** iPad, tablets, smartphones  
**Primary media server:** Plex Media Server (Plex Pass)

## 1. Product Overview

Plex Discovery is a self-hosted web application that provides a Netflix-like browsing and content discovery experience for an existing Plex library.

The application allows users to explore their personal movie collection through genre-based carousels, cinematic artwork, automatic trailer previews, and contextual movie information.

Unlike Plex, which focuses primarily on media management and playback, Plex Discovery focuses on helping users decide what to watch.

The application does not replace Plex Media Server or its official clients.

Users browse their library through Plex Discovery and watch the selected movie using Plex.

## 2. Goals

The application must:

- Provide a modern, cinematic browsing experience inspired by Netflix.
- Automatically organize movies into horizontal genre-based carousels.
- Play trailer previews automatically when users focus on a movie.
- Reuse Plex metadata, artwork, watch history, and available trailers.
- Support Plex Pass trailer and extras functionality.
- Run locally without requiring a cloud-hosted application.
- Avoid modifying the Plex library or watch history.
- Be simple to install, configure, and maintain.
- Support desktop browsers initially, with a responsive architecture suitable for future tablet support.

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

During local development, Vite should proxy requests to Plex Media Server to avoid browser CORS restrictions.

The initial Plex server address is:

`http://192.168.178.46:32400`

This address must be configurable and must not be hardcoded throughout the application.

The Plex authentication token must be configurable and must never be committed to source control.

For the initial local prototype, the token may be stored in browser session storage. Clearly document the security limitations of this approach.

The application must not expose the Plex token to third-party services.

The application should be designed so that a lightweight reverse proxy can be introduced for production deployment if required.

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

The architecture should allow touch gestures to be added later.

### 4.3 Movie Selection

When a user focuses on a movie poster:

1. Highlight the selected poster.
2. Display the selected movie's metadata.
3. Wait approximately 1.5 seconds.
4. Automatically start its trailer if available.
5. Start playback muted.
6. Cancel the pending preview if the user selects another movie.
7. Stop the previous trailer when selection changes.

The preview must not start immediately while users are quickly browsing.

Mouse hover may trigger selection on desktop.

Keyboard focus must provide equivalent functionality.

For future touch support, tapping a poster should select the movie rather than immediately navigating away.

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

- Autoplay after the selection delay.
- Muted by default.
- Inline playback without fullscreen.
- No looping unless explicitly enabled.
- Stop playback when the selected movie changes.
- Stop playback when the preview is no longer visible.
- Show a static background when no trailer is available.
- Handle unsupported codecs and playback errors gracefully.
- Avoid unnecessary concurrent video requests.
- Provide an explicit audio toggle.
- Avoid autoplaying multiple trailers simultaneously.

Use native HTML5 video playback when possible.

If Plex returns a trailer format unsupported by the browser, investigate Plex's available streaming/transcoding mechanisms before adding additional playback libraries.

Do not assume Plex Pass guarantees browser-playable trailers for every movie.

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

### 4.6 Open in Plex

Provide an "Open in Plex" action.

The initial implementation should attempt to open the corresponding movie in the Plex web application using a supported deep-link or metadata URL.

Do not construct unverified Plex URLs.

If direct navigation is not reliable, provide a fallback that opens Plex Web and makes the movie title easy to copy.

Direct playback on a Samsung TV is outside MVP scope.

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

## 6. Data and Caching

Plex remains the source of truth.

Do not create a separate persistent movie database.

Use TanStack Query to cache library responses in memory.

Refresh the library when requested by the user.

Avoid downloading full-resolution artwork unnecessarily.

Prefer appropriately sized Plex artwork.

Lazy-load images outside the viewport.

Avoid loading trailer video streams for every movie in advance.

Only request trailer playback resources when a movie becomes selected.

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

Create a development-only diagnostic view showing, for a sample of movies:

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

Users can move through a movie carousel, pause on a title, and watch its trailer automatically without opening a separate details page.

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

The following features are explicitly outside the initial MVP:

- iPad-optimized touch interactions.
- Progressive Web App installation.
- TMDB trailer fallback.
- YouTube trailer integration.
- Personalized recommendations.
- Shared movie shortlist.
- Random movie discovery.
- Custom genre collections.
- Multiple Plex users.
- TV remote control.
- Direct playback on Plex TV clients.
- Optional deployment on the QNAP.
- Optional Docker packaging.

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