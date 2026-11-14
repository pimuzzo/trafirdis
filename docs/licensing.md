# Licensing and attribution

[Back to Trafirdis](../README.md)

Trafirdis uses MIT for its original code and project-owned assets. Dependency licenses and Plex integration terms remain separate.

`THIRD_PARTY_NOTICES` collects dependency copyright notices and license texts in one place. MIT does not require this particular filename: the file is a practical way to retain the notices required by the dependencies when distributing bundled JavaScript, static builds and Docker images. Adding MIT to Trafirdis does not replace or remove those obligations.

## License

Trafirdis's original code and project-owned assets distributed with this version are licensed under the [MIT License](../LICENSE). Dependencies retain their own licenses; [THIRD_PARTY_NOTICES](../THIRD_PARTY_NOTICES) includes frontend dependency attribution and license texts. The project license does not grant rights to Plex software, trademarks or users' movies, trailers and artwork, and does not replace Plex's terms of service.

Earlier snapshots without an explicit project license are not automatically relicensed by adding this file. Project code included in this MIT-licensed version is available under MIT even if it was originally written in an earlier commit. No repository history is rewritten or blanket license granted over earlier snapshots by this change.

Production builds include `LICENSE`, `NOTICE` and `THIRD_PARTY_NOTICES` in `dist/`; keep these files when deploying or redistributing the build. Docker includes the same files and retains the base image's separate Nginx and system-component licenses. When updating frontend dependencies, refresh their versions, attribution and license texts in `THIRD_PARTY_NOTICES`.
