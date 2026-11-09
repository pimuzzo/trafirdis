# Trafirdis development

- Read `docs/COMPLIANCE.md` before changes affecting branding or identity, Plex integration/APIs, authentication or authorization, playback or trailers, external services, distribution or licensing. Follow its references and distinguish verified policy requirements from project-specific precautions. Investigate concrete conflicts and propose compliant alternatives; do not claim legal certification.
- Use English for UI, documentation, code, comments, errors and configuration. Display the product name as Trafirdis and use `trafirdis` for new application identifiers. Plex API names and endpoints describe the integration and must not be renamed as branding.
- Preserve the existing MVP, Plex as the source of truth, and the frontend-only architecture. Keep changes focused; do not add unrelated features, dependencies, services or media providers.
- Keep the legacy browser storage keys, return-state query name, runtime aliases, environment aliases and Compose service key documented in README working. They preserve current sessions, authorized device identities and deployments; do not replace them with a blind text substitution.
- Run appropriate checks and keep the GitHub Actions quality, browser and Docker jobs passing before reporting a PR ready. Never include real Plex credentials or library data in fixtures or uploaded artifacts.
