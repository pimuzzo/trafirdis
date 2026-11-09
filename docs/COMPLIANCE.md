# Compliance and integration guidance

Trafirdis is an independent project. This document records policy references, project decisions and unresolved questions; it is not legal certification, Plex approval, or a substitute for reviewing the current policies.

## Official references and review status

Reviewed on 2026-11-09:

- [Plex Trademark Guidelines](https://www.plex.tv/about/privacy-legal/plex-trademarks-and-guidelines/).
- [Plex Terms of Service](https://www.plex.tv/about/privacy-legal/plex-terms-of-service/), including section 1 (License and Interfacing Software) and proprietary-rights provisions. The reviewed official text identifies a revision of October 30, 2025.
- [Official English regional trademark page](https://www.plex.tv/en-ca/about/privacy-legal/plex-trademarks-and-guidelines/), whose indexed text was available when direct automated trademark-page requests returned HTTP 403.

The review used Plex-hosted policy text, not third-party summaries. Direct access was inconsistent, and the current trademark revision could not be independently confirmed. Reopen the canonical documents before changes with policy implications. Do not copy entire policy documents into this repository.

## Branding and attribution

The trademark guidance permits unique application names with descriptive compatibility statements such as “for Plex.” It restricts Plex-derived product names, derivative marks and confusing visual presentation, and requires ownership attribution. Its icon guidance specifically addresses derivative play-symbol imagery.

Use **Trafirdis** for the displayed name and `trafirdis` for new application identifiers. The name means **TRAiler FIRst DIScovery**. Use Plex names for compatibility and integration, with Trafirdis's own identity more prominent. Our original icon combines a film-frame T and discovery spark in mint and lavender; it uses no Plex logo, profile play symbol or copied brand asset. Generic transport controls are functional UI, not our logo.

Include this disclaimer in the README:

> Trafirdis is an independent, unofficial open-source project and is not affiliated with, endorsed by, or sponsored by Plex.

Maintain the ownership attribution in the [README](../README.md). Its license wording refers to the conditional trademark license in the linked guidelines, not separate written approval, endorsement, or a license to redistribute Plex software or media. Additional uses outside those guidelines need investigation. The Trafirdis name has not been legally cleared or registered through this task.

## Integration, rights and entitlements

The Terms address personal/non-commercial use, Interfacing Software, security restrictions, protected content and Plex Pass functionality. Their Interfacing Software provisions call for a privacy notice and source copyright notice. Review the associated license/grant clauses before changing distribution or commercial scope.

Keep authentication, subscription entitlements and technical restrictions intact. A Plex Pass subscription does not by itself authorize every implementation or distribution model. Do not redistribute Plex software, user media, provider trailers or artwork without the necessary rights. Project licensing does not grant rights to Plex marks or content.

The application links to a bundled [privacy notice](../public/privacy.html) and includes a source copyright notice and [NOTICE](../NOTICE). Sample illustrations and synthetic test media are project assets; users' Plex media are separate.

## Project safeguards, not additional Plex policy claims

These are Trafirdis design decisions; do not describe them as mandated by Plex unless a current official policy supports that claim:

- Prefer documented APIs. Isolate undocumented behavior and record evidence and uncertainty in [API research](plex-api.md). Documentation alone does not settle every authorization question.
- Keep Plex as the source of truth. The application reads catalog data, requests authorized previews and makes scoped session-cleanup calls; it does not edit library metadata or watch history.
- Keep access tokens out of source control and logs. Use the configured server proxy, reject external media redirects and avoid sending credentials to unrelated services.
- Keep the account token transient during Plex resource lookup. Store the verified server token only in the browser session, with an in-memory fallback for manual access. Keep the public client identifier stable within the application namespace. If an upgrade changes that namespace, document the new sign-in and device identity, and never silently revoke prior authorizations.
- Retain the privacy notice when behavior changes. It explains browser storage, first-party Plex requests, native-media query credentials, deployment logs and local diagnostic downloads. There is no app telemetry or automatic report upload.
- Preserve dependency notices and check distribution licenses. The runtime image packages Trafirdis and Nginx, not Plex Media Server or anyone's library.

## Known limitations and unresolved questions

- No project source-code license has yet been selected. The open-source identity describes the project's intent; public visibility and this notice alone do not grant an open-source distribution license. The maintainer must choose an appropriate license and confirm contributor rights before licensing a release.
- The broad Terms restrictions on overlapping functionality and exclusive Plex Pass features need case-specific assessment for expanded functionality or commercial distribution. This review does not conclude that every present or future integration is approved.
- Legacy extras keys, provider resolution and preview-session cleanup have compatibility assumptions documented in `plex-api.md`. An endpoint being undocumented proves neither permission nor prohibition.
- Provider rights, API access, subscription conditions and policies can change. A successful playback test establishes technical behavior, not permission to redistribute the stream.
- Trademark review relied partly on an official indexed regional page because direct requests were blocked. Policy currency and any use outside the published trademark license remain review items.

For a potentially conflicting feature, state the concrete concern and prefer a supported, authorized Plex operation or an official-client link. Avoid authentication, entitlement or DRM workarounds.

## Checklist for future changes

1. **Identity:** Does the name, icon, copy or promotional material stay independent, with compatibility attribution and no implied endorsement?
2. **Integration:** Which official APIs and terms support the operation? What remains undocumented or uncertain?
3. **Access and playback:** Are account permission, Plex Pass conditions and media restrictions respected? Are real-server assumptions identified for validation?
4. **Privacy:** Where do credentials, identifiers, media and diagnostics go? Does the privacy notice still match the implementation?
5. **External services:** What new data disclosures, provider terms, authentication requirements and content rights apply?
6. **Distribution:** Are project and dependency licenses, contributor rights, required notices and commercial-use implications understood?

Record relevant sources, decisions and unresolved items in the change description. Do not claim legal certification or treat project-specific precautions as quotations from Plex policy.
