<p align="center">
  <img src="public/icon.svg" alt="Trafirdis" width="80" />
</p>

# Trafirdis

**Your next great watch is already in your library.**

Rediscover your Plex movie collection, one trailer at a time. Browse cinematic artwork, watch a preview and find something that makes you want to press play. When you're ready, **Open in Plex** takes you to the movie in Plex Web.

**[Open Trafirdis →](https://trafirdis.pages.dev)** · [Host your own](#host-your-own) · [User guide](docs/usage.md)

## Made for movie night

- **See what catches your eye.** A cinematic hero, automatic trailer previews and genre rails bring your own collection into focus.
- **Find the right film.** Combine search with genre, year, runtime, rating and watch-status filters.
- **Give unwatched films a chance.** Explore Unwatched or let Surprise me make the next pick.
- **Pick up where you left off.** Recently Added and Continue Watching use your Plex library's metadata.
- **Browse on your favorite screen.** Responsive layouts work across desktop, phone and tablet; phone previews play in movie details.

Trafirdis means **TRAiler FIRst DIScovery**. It connects directly from your browser to Plex, with no Trafirdis account, application backend or analytics.

## Try it now

1. Visit **[trafirdis.pages.dev](https://trafirdis.pages.dev)**.
2. Choose **Sign in with Plex** and authorize Trafirdis on Plex's official website.
3. Connect to your server, choose a movie library and start exploring.

Just curious? Choose **Explore the sample library** to browse fictional films and original artwork without signing in.

The hosted app needs a reachable **HTTPS connection to your Plex server**. Trailer availability depends on your Plex library and browser support. See the [connection requirements](docs/setup.md#publish-as-a-static-https-site) and [trailer troubleshooting](docs/usage.md#plex-prerequisites-and-limitations) if something doesn't play.

## Host your own

From a checkout of this repository, start with Docker Compose:

```bash
docker compose up --build -d
```

Open **http://localhost:8080** and sign in with Plex. No Plex server URL or token belongs in your deployment configuration.

Prefer running from source? Use Node.js **22.12 or newer**:

```bash
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. For static HTTPS hosting, Docker configuration and LAN access, follow the [setup and deployment guide](docs/setup.md).

**Upgrading an older installation?** Trafirdis uses `trafirdis.*` browser storage and `TRAFIRDIS_*` application settings. Stop the old stack, remove the former server-address setting, rebuild and sign in again. Follow the [upgrade steps](docs/setup.md#upgrading-an-existing-installation) to replace the stack safely.

## Learn more

- [User guide](docs/usage.md): browsing, previews, diagnostics and compatibility.
- [Setup and deployment](docs/setup.md): Docker, Cloudflare Pages, configuration, upgrades and security.
- [Development](docs/development.md): local checks, browser tests, CI and source layout.
- [Privacy notice](https://trafirdis.pages.dev/privacy.html): connections, browser storage and diagnostics.
- [Project specification](docs/PRD.md) and [implementation record](docs/implementation.md).

## License and attribution

Original Trafirdis code and project-owned assets are available under the [MIT License](LICENSE). See the [licensing guide](docs/licensing.md) for dependency notices, redistribution and earlier versions.

Trafirdis is an independent, unofficial open-source project and is not affiliated with, endorsed by, or sponsored by Plex.

Plex and Plex Media Server are trademarks of Plex and used under a license. See [compliance guidance](docs/COMPLIANCE.md) for the applicable trademark license and integration policies, and [NOTICE](NOTICE) for attribution.
