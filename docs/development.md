# Development and validation

[Back to Trafirdis](../README.md)

Development commands, CI checks and repository structure. Start with the [setup guide](setup.md) for local installation and the [user guide](usage.md#trailer-diagnostics-and-real-server-validation) for real-server acceptance checks.

## Development and tests

```bash
npm run check          # Unit/integration tests, TypeScript, production build
npm run test:watch
npx playwright install chromium
npm run test:e2e       # Real Chromium interaction, direct API and video tests
npm run test:docker    # Test static Nginx hosting and direct browser playback
npm run format:check
```

If using an already installed Chromium executable:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e
```

The static HTTPS fixture requires the `openssl` command to generate its temporary test certificate. The browser suite starts loopback-only Vite on dedicated port 5175 and refuses to reuse an existing server. Plex catalog fixtures are cross-origin browser responses; static-hosting tests use separate loopback HTTPS servers for the production build and synthetic Plex API/media, without an application proxy. No real Plex token or library is used. Generated WebM/HLS clips in `tests/fixtures` contain only a solid color and sine wave. Tests cover grouping/filtering, pagination/errors, trusted URLs, trailer caching/lifecycle, actual native and HLS decoding, keyboard/modal interactions, sign-in/server selection, privacy and narrow layouts.

### GitHub Actions

[CI](../.github/workflows/ci.yml) runs on every pull request, pushes to `main`, and manual dispatch. It uses Node.js 22 on Ubuntu 24.04 with three independent checks:

- **Quality checks**: locked dependency installation, formatting (including workflow files), unit/integration tests, TypeScript, and a production build.
- **Browser tests**: the complete Playwright suite against the local synthetic Plex fixture. CI installs Google Chrome so native and HLS tests exercise its media codec support. On failure, the HTML report and screenshots/traces are uploaded as `browser-test-results` for seven days. Upload is best effort because GitHub artifact storage quotas can prevent it; test failures remain blocking and their logs remain available.
- **Docker integration**: builds the production image and runs the static-hosting/direct-browser suite against a synthetic Plex server, including actual media decoding, hosted sign-in simulation, and diagnostics disabled/enabled using the same image.

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

The Docker test suite requires a built `trafirdis:local` image, the `node:22-alpine` fixture image, and the same Playwright Chromium installation used by the browser suite. It creates and removes an isolated Docker network and test containers, uses only synthetic Plex responses/media, and checks runtime diagnostics, non-root/read-only static hosting, direct cross-origin browser playback, hosted sign-in, offline Plex behavior and credential-free application logs. Set `TRAFIRDIS_TEST_IMAGE` to test another image tag. Builds behind a TLS inspection proxy may use the optional BuildKit secret `--secret id=proxy_ca,src=/path/to/trusted-proxy-ca.pem`; that CA is mounted only during dependency installation and is not copied into the image.
