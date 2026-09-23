# Prerelease process

The current public artifacts are deliberately unsigned and not notarized. This avoids using unconfigured or personal signing identities and makes the trust boundary explicit.

1. Run every command in [`TESTING.md`](TESTING.md), including the isolated loopback SFTP test.
2. Push the reviewed commit to `main` and wait for the normal CI workflow to pass.
3. Create an annotated prerelease tag such as `v0.1.0-alpha.1` only on that green commit.
4. Push the tag. The `Unsigned prerelease` workflow repeats validation, builds macOS universal, Linux, and Windows bundles, and attaches them to a GitHub prerelease.
5. Confirm every matrix job and uploaded asset before announcing the release.

Do not add ad-hoc signing workarounds or export a developer certificate into CI. A future signed release requires intentionally provisioned platform identities, protected repository secrets, documented certificate ownership, and verification of signatures and notarization in CI.
