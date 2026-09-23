# EnvVault vault format v1

This document is normative for `format_version: 1`.

## Layout

```text
vault/
├── vault.json
├── backups/
│   └── 32-random-hex-backup-id/
│       ├── manifest.age
│       └── 32-random-hex-blob-id.age
└── secrets/
    └── catalog.age
```

Temporary operations use dot-prefixed `pending` directories or `.part` files. Readers ignore pending backup directories; `verify` reports incomplete local backup directories.

`vault.json` contains only:

- `format_version` (integer, currently `1`);
- `recipient` (public age X25519 recipient);
- `vault_id` (random UUID used as the OS-keyring account).

It never contains a private identity, passphrase, project path, filename or secret value.

## Encrypted manifest

`manifest.age` is age ciphertext addressed to the recipient in `vault.json`. Its plaintext is UTF-8 JSON containing the format version, random backup ID, local project ID and name, creation timestamp, and a list of files. Each file entry contains its relative path, random blob ID, plaintext byte length, SHA-256 integrity digest, and optional source modification time.

The digest is inside authenticated encryption. It is used after decryption to detect incomplete or mismatched objects; it is not used as a blob name and leaks no equality information from the vault.

Every blob is an independent age ciphertext. No plaintext file, filename or content-derived identifier is written to the vault.

## Encrypted secret catalog

`secrets/catalog.age` is an atomically replaced age ciphertext. Its plaintext JSON contains imported OpenSSH private keys, their public metadata, and VPS profiles associating a server with a key identifier. Names, hosts, usernames, host fingerprints and private-key material are all encrypted at rest. Only public summaries are returned to the desktop UI; private-key contents never cross the Tauri command boundary.

Imported private keys must be regular, non-symlink OpenSSH files no larger than 128 KiB. EnvVault derives the algorithm and SHA-256 public-key fingerprint from the parsed key and rejects duplicate fingerprints. A key referenced by a server profile cannot be deleted.

## Invariants

1. Backup and blob IDs are exactly 32 hexadecimal characters.
2. Manifest relative paths are non-empty, non-absolute, and contain no parent, root or platform-prefix component.
3. A completed backup directory is immutable.
4. The encrypted manifest is written last inside a pending directory, then the directory is renamed into place.
5. Restore validates all paths and collisions before writing any file, decrypts and hashes each object, then atomically installs it.
6. Unix restore files have mode `0600`.
7. SFTP receives only the `backups/` subtree and accepts only opaque backup directories, `manifest.age`, and opaque `.age` blob names.
8. The secret catalog is written atomically with mode `0600` on Unix and never synchronized by the current SFTP transport.

## Compatibility

Readers reject unsupported versions instead of guessing. Future format changes must introduce a new version and a documented migration. Copying the full vault directory is sufficient to copy all encrypted backup data, but decryption additionally requires the matching keyring identity or recovery file.
