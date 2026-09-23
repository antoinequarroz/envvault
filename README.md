# EnvVault

EnvVault is a local-first desktop application and CLI for making encrypted, versioned backups of deliberately selected `.env` files. Every file and every metadata manifest is encrypted with [age](https://age-encryption.org/) before it enters the vault. A configured VPS is blind object storage: it receives only opaque, already-encrypted `.age` objects.

> Status: security-conscious prerelease. The local backup, history, verification, recovery, restore and explicit SFTP push/pull paths are implemented in the CLI and desktop app. Evaluate it with fictitious values and read [`SECURITY.md`](SECURITY.md) before relying on it.

## Why

Environment files often contain development credentials but are intentionally excluded from Git. Copying them by hand is fragile; putting them in ordinary cloud storage exposes plaintext. EnvVault keeps the format simple and auditable while leaving secret values invisible in the UI, logs and normal command output.

## Architecture

```text
React / Tauri desktop ─┐
                      ├── envvault-core ── age ── local vault
Rust CLI ─────────────┘                       └── SFTP (ciphertext only)
                                   private identity ── OS keyring
```

- `crates/envvault-core`: scanning, path policy, age encryption, immutable storage, restore, verify, recovery, SFTP transport. It has no CLI or Tauri dependency.
- `crates/envvault-cli`: `clap` interface over the same core.
- `apps/envvault-desktop/src-tauri`: thin Tauri 2 command layer.
- `apps/envvault-desktop/src`: React + TypeScript + Vite UI. It never renders file contents.
- [`docs/VAULT_FORMAT.md`](docs/VAULT_FORMAT.md): version 1 on-disk format and invariants.

## Install and build

Prerequisites: current stable Rust, Node.js 20+, npm, and the [Tauri 2 platform prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
cargo build --release -p envvault-cli
cd apps/envvault-desktop
npm ci
npm run tauri build
```

The CLI binary is `target/release/envvault`. For development:

```sh
cargo run -p envvault-cli -- --help
cd apps/envvault-desktop && npm run tauri dev
```

GitHub prerelease desktop bundles are unsigned and not notarized. Windows and macOS may warn or refuse to open them. Do not bypass operating-system security controls; build from the reviewed tag if a bundle is blocked. See [`docs/RELEASING.md`](docs/RELEASING.md).

## CLI quick start

```sh
envvault init
envvault scan /path/to/project
envvault project add /path/to/project
envvault backup my-project
envvault list --json
envvault history my-project
envvault verify
envvault restore my-project --destination /safe/preview/folder
```

`project add` shows its exact selection and asks for confirmation. `.env.example`, `.env.sample` and `.env.template` are shown but off by default. A backup is not created during project registration.

Restore always prints a path-only preview. Existing files stop the operation unless `--overwrite` is deliberately supplied. Interactive restore requires typing `RESTORE`; `--yes` exists for reviewed automation. Restored files are written atomically and use mode `0600` on Unix.

Read-only commands `scan`, `list`, `history`, `backup` result metadata and `verify` support `--json` where applicable. JSON never contains environment values.

Run `envvault --help` and subcommand help for every option.

## Scanning rules

EnvVault detects `.env` and `.env.*`, including `.env.local`, `.env.development`, `.env.production` and `.env.test`. It does not follow symlinks. It prunes `.git`, `node_modules`, `target`, `build`, `dist`, `.cache`, `.next` and `.turbo`. Only relative paths that pass traversal validation can enter a manifest or restore target.

Use `project add --include RELATIVE_PATH` to deliberately include a detected template and `--exclude RELATIVE_PATH` to omit a candidate. EnvVault does not search for arbitrary credentials outside the `.env` family.

## Recovery and machine loss

The age private identity exists in the operating-system keyring, not in the vault. Create an offline recovery copy immediately:

```sh
envvault recovery export /separate/media/envvault-recovery.age
```

The passphrase is requested through the terminal and is never accepted as a command-line argument or logged. The recovery file is itself age-encrypted with its passphrase. Keep the passphrase in a password manager and keep the file separate from the vault.

After losing a machine:

1. Copy the vault folder and encrypted recovery file to the new machine.
2. Recreate the local state (or retain the platform configuration directory from the old machine).
3. Run `envvault recovery import /path/to/envvault-recovery.age`.
4. Run `envvault verify` before restoring.

Import refuses an identity whose public recipient does not match the vault configuration.

The desktop Settings view exposes the same export and import operations. Passphrases are masked, cleared after each attempt, and never shown in status output.

## Optional VPS storage

Configure an SFTP destination with an exact host-key fingerprint obtained through a trusted channel:

```sh
envvault remote configure \
  --host backup.example.test --username envvault --remote-path /srv/envvault \
  --private-key /path/to/dedicated_ssh_key \
  --host-key 'SHA256:TRUSTED_FINGERPRINT'
envvault sync push
envvault sync pull
```

EnvVault uses the SSH library directly, so secrets are not placed in subprocess arguments. Unknown or changed host keys are rejected. Uploads use `.part` files followed by an atomic rename; pulls use local pending directories. Existing immutable backup IDs are never silently replaced, and remote deletion is never automatic.

Current sync is explicit push/pull, not a background bidirectional merge. A remote server should restrict the account to the configured directory. The SSH private key path is local configuration; the key itself is never copied into the vault.

See [`docs/VPS.md`](docs/VPS.md) for a dedicated-account checklist and safe first-use procedure.

## Security model and limits

EnvVault is designed to protect confidentiality and detect tampering if the vault directory, backup disk, or VPS is stolen. Blob names are random; encrypted manifests hide project names, paths, timestamps and hashes. The public age recipient and a random vault ID are the only vault-level plaintext configuration.

It does **not** protect against:

- a fully compromised local machine while EnvVault is decrypting;
- malware reading source `.env` files before backup or restored files afterward;
- loss of both the system keyring identity and recovery material;
- a weak or disclosed recovery passphrase;
- traffic analysis such as ciphertext sizes and backup counts;
- rollback or deletion by a malicious storage operator (keep independent copies).

Rust reduces several classes of memory-safety bugs; it is not a security guarantee. Plaintext buffers use `zeroize` wrappers where practical, but operating systems, allocators and UI/terminal infrastructure can retain copies. EnvVault never executes, parses, sources or validates the values inside `.env` files.

Errors are intentionally non-sensitive. Tracing records operational state only; do not enable low-level third-party SSH debugging in production. Project names and local filesystem paths are metadata and remain present in the local application state; they are not uploaded by SFTP.

## Development and tests

```sh
cargo fmt --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace
./scripts/test-sftp-local.sh
cd apps/envvault-desktop
npm run lint
npm run build
npm audit
```

Tests cover age round trips, wrong keys, corruption, recovery, encrypted-manifest failure, path traversal, symlinks, collisions, Unix restore permissions, atomic replacement, incomplete backups, strict SSH host-key comparison and obvious secret leakage. The acceptance suite exercises a complete fake-data lifecycle; the loopback harness crosses a real SFTP transport boundary with temporary keys. See [`docs/TESTING.md`](docs/TESTING.md).

## Known MVP limits

- SFTP interoperability requires a server supporting the requested atomic rename. There is no automatic remote deletion or three-way conflict merge.
- File changes are represented by new immutable backup versions; content deduplication is intentionally omitted to avoid deterministic identifiers and extra complexity.
- Windows applies restrictive creation semantics available to the platform, but the explicit `0600` assertion is Unix-only.
- There is no key rotation workflow in version 1.
- Desktop prerelease bundles are not yet code-signed or notarized.

## License

Licensed under the MIT License. See [`LICENSE`](LICENSE).
