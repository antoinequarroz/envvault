# Dedicated SFTP storage

Treat the VPS as untrusted ciphertext storage. EnvVault does not need shell commands on it, and the VPS never receives the age private identity, recovery passphrase, plaintext manifest, or source `.env` files.

## Recommended server boundary

Create a dedicated unprivileged account and directory for EnvVault. Give it only the permissions needed to create directories, upload temporary files, and atomically rename within that directory. Use a dedicated SSH key with no passphrase only when the local machine's filesystem protections are appropriate; otherwise use an SSH agent-compatible operational process outside EnvVault.

Restrict the account with the server's SFTP-only controls and deny password authentication. Exact commands vary by operating system and hosting provider, so review the platform's OpenSSH guidance rather than pasting an unreviewed production configuration.

Obtain the server's Ed25519 fingerprint through a trusted administrative channel. On the server, an administrator can display it with:

```sh
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub -E sha256
```

Compare the entire `SHA256:...` value out of band. Do not accept a fingerprint learned only from the same first network connection you are trying to authenticate.

## Configure EnvVault

```sh
envvault remote configure \
  --host backup.example.test \
  --port 22 \
  --username envvault \
  --remote-path /srv/envvault \
  --private-key /path/to/dedicated_ssh_key \
  --host-key 'SHA256:TRUSTED_FINGERPRINT'
envvault sync push
envvault sync pull
```

The desktop Settings view exposes the same fields and explicit Push/Pull operations. EnvVault does not perform background synchronization or automatic deletion.

## First-use checklist

1. Use a new vault containing only fictitious files.
2. Confirm that the stored remote objects are `.age` ciphertext and that project names and paths are not visible.
3. Push twice; the second push should transfer nothing.
4. Copy the public `vault.json` and pull into an isolated test vault with the matching recovery identity.
5. Run `envvault verify`, restore to an empty directory, and compare the fictitious bytes.
6. Keep an independent copy. A malicious or broken VPS can still delete or roll back ciphertext.

If the server host key changes, EnvVault stops. Investigate through a trusted administrative channel before updating the saved fingerprint. Never replace it merely to silence the error.
