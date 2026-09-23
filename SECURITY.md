# EnvVault security policy

EnvVault is a security-conscious prerelease, not an independently audited secret manager. Evaluate it with fictitious values before deciding whether its threat model fits your use case.

## What EnvVault protects

Every selected file and every backup manifest is encrypted with age before it enters the vault or crosses SFTP. The age private identity is stored in the operating-system keyring. An offline recovery export is encrypted separately with a user-chosen passphrase. A stolen vault directory, backup disk, or VPS should reveal only the public recipient, a random vault identifier, ciphertext sizes, and backup counts.

Authenticated encryption and encrypted manifests detect ciphertext modification. SFTP requires an exact SHA-256 host-key fingerprint and refuses an unknown or changed key. Remote uploads are staged before rename, pulls are resumable, and an existing immutable backup ID is never silently replaced.

## What EnvVault does not protect

- A compromised or hostile machine while EnvVault can read source files, decrypt, or restore.
- Malware, shell history, editors, filesystem snapshots, swap, or backups outside EnvVault.
- Loss of both the keyring identity and the offline recovery file or its passphrase.
- A weak or disclosed recovery passphrase.
- Traffic analysis, ciphertext size, backup count, rollback, or deletion by a storage operator.
- Incorrect selection by the user. EnvVault backs up only explicitly selected `.env`-family files.

Project names and local paths remain in local application state. They are encrypted inside remote backup manifests. The SSH private key stays at its configured local path and is never copied into the vault.

## Safe evaluation

Follow [`docs/TESTING.md`](docs/TESTING.md) with fictitious values. Keep an independent copy of anything important, restore into an empty preview directory, inspect it, and run `envvault verify` before treating a backup as usable.

Official prerelease desktop bundles are currently unsigned and not notarized. Do not bypass operating-system protections to open a blocked bundle; build from the tagged source after reviewing it instead.

## Dependency audit disclosure

The 2026-09-23 `cargo audit` run reported no vulnerability-class advisories and eight allowed warnings. Seven are unmaintained transitive packages: `proc-macro-error` through Tauri's Linux GTK stack, `proc-macro-error2` through age's localization macro, and five `unic-*` crates through Tauri's URL-pattern support. The eighth is an unsound-API warning for `glib 0.18.5`, pulled into Linux desktop builds by Tauri's GTK/WebKit stack. EnvVault does not call the affected iterator API directly, but transitive exposure still matters. These findings are not being hidden or waived as proof of safety; they should be reevaluated as upstream releases move.

`npm audit --audit-level=high` reported no vulnerabilities on the same date. Audit tools are useful evidence, not a substitute for review or independent security assessment.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting for the repository when available. Otherwise contact the maintainer privately through the profile linked from the repository. Do not include real secrets, recovery material, private keys, or production host details. A minimal reproduction should use generated keys and fictitious values.
