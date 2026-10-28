# Releases and upgrades

Application releases are explicit. OS maintenance never pulls a new Calendar image. The repository and GHCR container package are public; image pulls need no GitHub credential.

## Development and release sequence

1. Develop locally with fictional data or a separate instance with Google sync disabled. Run check, tests, lint and build, plus relevant browser/host tests. Obtain local and affected Pi acceptance before final release handover.
2. Review accepted scope, dependencies, compatibility and private-data exclusions. Update the version and release notes. Commit clean source; never label a working-tree build as a released version.
3. Wait for source checks, push a matching `v<package version>` tag and create a GitHub **Pre-release**. The image workflow requires a public repository and an explicit prerelease. It refuses to overwrite an existing image tag.
4. CI builds `linux/amd64` and `linux/arm64`, resolves each platform's immutable digest, verifies anonymous registry access, and tests startup, restart, PIN, cache and persistence with fictional data and no network. Using separate platform digests avoids collisions between architectures in Docker's classic local image store. A GitHub release entry alone is not a passed image release.
5. CI attaches `release-image.json`, a verified ARM64 Docker archive and `SHA256SUMS`. The manifest records the source revision, original build date, index digest and platform digests. CI also checks source/channel labels. No `latest` tag is promoted.
6. Deploy the verified published image deliberately, verify backend/data/host health, obtain brief physical handover acceptance, and reconcile operator records. Keep installed references and household configuration in private documentation.

For a verification-only retry, dispatch the workflow from its corrected branch with `tag` and `existing_digest`. It checks that the tag still identifies that exact index and skips the build/push step. The application/test source is checked out from the release tag; workflow repairs do not move the tag or silently rebuild its image. The release manifest reads the original image build date, not the retry time. Existing assets are not overwritten automatically.

The first v0.1.0 attempt failed before ARM64 startup because the same multi-platform index reference was reused locally after AMD64. Its correction uses platform-specific references and verifies the already-published image. The run history retains this failure; it was not a live Pi incident.

## Install a published image

Pull the verified platform digest for the target architecture, then pin that reference in the operator's Compose configuration. For example, substitute the ARM64 digest recorded in the release manifest:

```sh
docker pull --platform linux/arm64 ghcr.io/alex-soul/pi-family-calendar@sha256:<arm64-platform-digest>
```

Alternatively, download the ARM64 archive, manifest and checksums from the release, verify `SHA256SUMS`, transfer and load it with `docker load`. This transfers the same published image, without rebuilding. Docker's classic and containerd image stores can report different local image IDs; registry platform digests remain the portable identity. Verify the loaded architecture, source revision and build labels against the manifest and retain the exact installed reference.

The workflow bakes `APP_RELEASE_CHANNEL=prerelease`, so About distinguishes numeric `0.2.0` from a stable release. Ordinary local Docker builds default to Development. Do not override runtime metadata to misrepresent the installed image.

## Deployment checkpoint

- Record the old immutable image, Compose and relevant host components. Preserve the live volume, Google encryption key, PIN, browser origin/profile and optional Power/Screen/MQTT definitions.
- Create and verify one private [data backup](appliance-tools.md), then rehearse a disposable restore with Google disabled, no network and no household service mounts. The backup verifier requires its matching app version: restore an older backup with its matching image first, then test the candidate against the restored copy. Browser/host state is separate; capture it consistently when the release affects those components.
- Reuse the checkpoint across the release handover; do not repeatedly back up unchanged components. Review freshness after a significant delay or scope change.
- Hold the installation's maintenance lock. Change only the selected image, then run Compose without builds or implicit pulls. Retain the live volume and subsequent household edits.
- Check health, version/channel/revision, database integrity, sync and applicable host controls. Confirm affected visible behaviour and touch on the actual screen.
- On failure, stop and prepare recovery. Switching the live image/configuration or restoring data needs explicit operator approval; never automatically roll back or overwrite later household edits.

The repository provides a manual deployment recipe, not a hardware installer. See [host integration](../host/README.md) and [Google setup](google-calendar.md). Google authorization lifetime and revocation rules still apply.
