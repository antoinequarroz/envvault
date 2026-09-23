# Testing EnvVault safely

Use only temporary directories and fictitious values. The automated acceptance tests never use the normal EnvVault state directory, operating-system keyring, real SSH credentials, or a remote server.

## Automated acceptance tests

Run the complete local lifecycle:

```sh
cargo test -p envvault-core --test acceptance
```

This initializes an isolated vault, discovers and selects fake `.env` files, creates an encrypted version, modifies or deletes the sources, restores exact bytes, verifies integrity, exercises recovery after a replaced identity, and checks that serialized command results and vault files do not expose values.

Run the real SFTP transport boundary against an ephemeral loopback-only SSH server:

```sh
./scripts/test-sftp-local.sh
```

The harness requires `sshd`, `ssh-keygen`, `nc`, and Ruby. It creates temporary Ed25519 host and client keys, binds to `127.0.0.1`, and removes the entire temporary test directory on exit. It tests a wrong host fingerprint, upload, idempotent upload, interrupted-pull resume, exact restore, and conflict refusal. It never reads `~/.ssh`, the normal keyring, or a VPS.

## Manual desktop trial

1. Create a disposable project directory containing `.env` with values such as `API_TOKEN=fictitious-only`.
2. Launch the desktop app from a disposable user account or disposable operating-system profile so its platform state and keyring entry are isolated.
3. Initialize the vault, scan the disposable project, review the exact path selection, and create a backup.
4. Export recovery to a temporary file with a unique test passphrase of at least 12 characters.
5. Change or remove the fake source file, restore into a new empty directory, and compare bytes.
6. Run verification and inspect history. The UI should show paths and status, never file values.
7. If testing SFTP, use a dedicated disposable account and key as described in [`VPS.md`](VPS.md). Confirm the fingerprint through a trusted channel before saving it.

The desktop UI build can be checked without reading user state:

```sh
cd apps/envvault-desktop
npm ci
npm run lint
npm run build
```

## Full contributor checks

```sh
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace
cargo audit
cd apps/envvault-desktop
npm audit --audit-level=high
```

Desktop release bundles are unsigned and not notarized during this prerelease. Do not weaken Gatekeeper, SmartScreen, antivirus, or other operating-system controls to test them. If a bundle is blocked, build from the reviewed tag.
