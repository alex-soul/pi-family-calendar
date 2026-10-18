# Releases and upgrades

Application releases are explicit. OS maintenance never pulls a new Calendar image. The repository and GHCR container package became public on 18 October 2026; public image pulls do not require a GitHub credential.

**Current hold:** v0.1.0 was built by the original private-release workflow. AMD64 verification passed, but the ARM64 pull collided with the same index reference in the runner's Docker image store. No verified archive was attached or Pi handover performed. The workflow still contains its original private-visibility guards; update those guards and architecture selection before the next run. Do not move the existing tag or blindly rebuild it. The sequence below documents that original workflow until its repair is validated.

## Development and release sequence

1. Develop locally using fictional data or a separate instance with Google sync disabled. Run check, tests, lint and build, plus relevant browser/host tests.
2. Review accepted scope, dependency findings, private-data exclusions and compatibility. Update version, documentation and release notes. Record a clean source commit; never label a working-tree build as a released version.
3. Push the source and matching `v<package version>` tag. Wait for source checks, then create a GitHub release marked **Pre-release**. The private image workflow requires both a private repository and an explicit prerelease; changing that policy needs a separate release decision.
4. The workflow builds `linux/amd64` and `linux/arm64`, verifies private package visibility and tests the published digest on both architectures. Tests use fictional data and no network, and check startup, automatic restart, PIN, cache and persistence. A published GitHub entry alone does not prove that image CI succeeded.
5. The workflow attaches a verified ARM64 Docker archive, `release-image.json` and `SHA256SUMS` to the private release. The manifest records the source commit, image index digest, ARM64 image ID and build time. Tags are versioned; the workflow does not promote `latest`.
6. Deploy that verified artifact deliberately, obtain relevant Pi acceptance, then reconcile deployment evidence and follow-ups. Keep installed version/digest and private host details in the operator's records.

The release workflow sets `APP_RELEASE_CHANNEL=prerelease`, so About distinguishes a numeric GitHub prerelease such as `0.1.0` from a stable release. Docker builds default to the Development channel. Build revision/date/channel are baked into the image; runtime overrides must not misrepresent its identity.

## Install an already published image

With a private-registry credential, authenticate to GHCR using a credential helper or runtime secret handling, then pull the verified digest for the target architecture. Do not put a token in Compose, Git or shell arguments.

Alternatively, download the ARM64 archive and manifest through authenticated GitHub release access. Verify `SHA256SUMS`, transfer to the ARM64 host, load the archive with `docker load`, and confirm the loaded image ID equals `arm64ImageId` in the manifest. This deploys the same published image without storing a registry credential on the Pi. It does not rebuild it. Use the immutable loaded image ID in the private Compose override and keep the recorded registry digest for provenance.

## Deployment checkpoint

- Record the existing immutable image, Compose configuration and installed host components. Preserve the live volume, encryption key, PIN, browser origin/profile and optional Power/Screen/MQTT definitions.
- Create and verify a private [data backup](appliance-tools.md), then validate a disposable restore with Google disabled and no household service mounts. Browser/host state is separate from app data; capture it consistently if the release changes those components.
- Use the installation's maintenance lock to avoid package/power/deployment overlap. Change only the selected image, then run Compose with no build or implicit image update. Do not restore old data automatically.
- Check container/HTTP health, installed version/channel/revision, database integrity, sync and applicable host controls. Confirm affected visible behaviour and touch on the actual screen.
- On a failed deployment, stop and prepare recovery. Switching the live image/configuration or restoring data requires explicit operator approval; never run an automatic rollback that could overwrite later household edits.

The repository provides a manual deployment recipe, not a hardware installer. See [host integration](../host/README.md) and [Google setup](google-calendar.md). Existing saved credentials still follow Google's authorization lifetime and revocation rules.
