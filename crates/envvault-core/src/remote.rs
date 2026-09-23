use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};

use base64::Engine;
use secrecy::{ExposeSecret, SecretString};
use sha2::{Digest, Sha256};
use ssh2::{RenameFlags, Session, Sftp};

use crate::model::RemoteConfig;
use crate::{Error, Result};

/// SFTP transport for immutable ciphertext objects. It never receives plaintext or an age key.
pub struct SftpRemote {
    config: RemoteConfig,
    credential: SshCredential,
}

enum SshCredential {
    File,
    Memory {
        private_key: SecretString,
        passphrase: Option<SecretString>,
    },
}

impl SftpRemote {
    pub fn new(config: RemoteConfig) -> Self {
        Self {
            config,
            credential: SshCredential::File,
        }
    }

    pub fn with_private_key(
        config: RemoteConfig,
        private_key: SecretString,
        passphrase: Option<SecretString>,
    ) -> Self {
        Self {
            config,
            credential: SshCredential::Memory {
                private_key,
                passphrase,
            },
        }
    }

    fn connect(&self) -> Result<(Session, Sftp)> {
        let tcp = TcpStream::connect((&*self.config.host, self.config.port))
            .map_err(|_| Error::Remote)?;
        let mut session = Session::new().map_err(|_| Error::Remote)?;
        session.set_tcp_stream(tcp);
        session.handshake().map_err(|_| Error::Remote)?;
        let host_key = session.host_key().ok_or(Error::Remote)?.0;
        verify_host_key(host_key, &self.config.host_key_sha256)?;
        match &self.credential {
            SshCredential::File => session
                .userauth_pubkey_file(&self.config.username, None, &self.config.private_key, None)
                .map_err(|_| Error::Remote)?,
            SshCredential::Memory {
                private_key,
                passphrase,
            } => session
                .userauth_pubkey_memory(
                    &self.config.username,
                    None,
                    private_key.expose_secret(),
                    passphrase.as_ref().map(ExposeSecret::expose_secret),
                )
                .map_err(|_| Error::Remote)?,
        }
        if !session.authenticated() {
            return Err(Error::Remote);
        }
        let sftp = session.sftp().map_err(|_| Error::Remote)?;
        Ok((session, sftp))
    }

    pub fn test_connection(&self) -> Result<()> {
        self.connect().map(|_| ())
    }

    pub fn push(&self, vault_root: &Path) -> Result<usize> {
        let (_session, sftp) = self.connect()?;
        ensure_remote_dir(&sftp, Path::new(&self.config.remote_path))?;
        let remote_backups = Path::new(&self.config.remote_path).join("backups");
        ensure_remote_dir(&sftp, &remote_backups)?;
        let mut transferred = 0;
        for entry in fs::read_dir(vault_root.join("backups"))? {
            let entry = entry?;
            let Some(id) = entry.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            if !entry.file_type()?.is_dir() || !is_opaque_id(&id) {
                continue;
            }
            let remote_dir = remote_backups.join(&id);
            ensure_remote_dir(&sftp, &remote_dir)?;
            for file in fs::read_dir(entry.path())? {
                let file = file?;
                let Some(name) = file.file_name().to_str().map(str::to_owned) else {
                    continue;
                };
                if !file.file_type()?.is_file() || !is_ciphertext_name(&name) {
                    continue;
                }
                let bytes = fs::read(file.path())?;
                let destination = remote_dir.join(&name);
                if let Ok(stat) = sftp.stat(&destination) {
                    if stat.size == Some(bytes.len() as u64)
                        && read_remote(&sftp, &destination)? == bytes
                    {
                        continue;
                    }
                    return Err(Error::Remote);
                }
                let partial = remote_dir.join(format!(".{name}.part"));
                let mut handle = sftp.create(&partial).map_err(|_| Error::Remote)?;
                handle.write_all(&bytes).map_err(|_| Error::Remote)?;
                handle.fsync().map_err(|_| Error::Remote)?;
                drop(handle);
                sftp.rename(&partial, &destination, Some(RenameFlags::ATOMIC))
                    .map_err(|_| Error::Remote)?;
                transferred += 1;
            }
        }
        Ok(transferred)
    }

    pub fn pull(&self, vault_root: &Path) -> Result<usize> {
        let (_session, sftp) = self.connect()?;
        let remote_backups = Path::new(&self.config.remote_path).join("backups");
        let local_backups = vault_root.join("backups");
        fs::create_dir_all(&local_backups)?;
        let mut transferred = 0;
        for (remote_dir, _) in sftp.readdir(&remote_backups).map_err(|_| Error::Remote)? {
            let Some(id) = remote_dir.file_name().and_then(|name| name.to_str()) else {
                continue;
            };
            if !is_opaque_id(id) {
                continue;
            }
            let final_dir = local_backups.join(id);
            if final_dir.exists() {
                for (remote_file, _) in sftp.readdir(&remote_dir).map_err(|_| Error::Remote)? {
                    let Some(name) = remote_file.file_name().and_then(|name| name.to_str()) else {
                        continue;
                    };
                    if !is_ciphertext_name(name) {
                        continue;
                    }
                    let local = final_dir.join(name);
                    if fs::read(local).ok().as_deref()
                        != Some(read_remote(&sftp, &remote_file)?.as_slice())
                    {
                        return Err(Error::Remote);
                    }
                }
                continue;
            }
            let pending = local_backups.join(format!(".pending-sync-{id}"));
            fs::create_dir_all(&pending)?;
            let operation = (|| {
                for (remote_file, _) in sftp.readdir(&remote_dir).map_err(|_| Error::Remote)? {
                    let Some(name) = remote_file.file_name().and_then(|name| name.to_str()) else {
                        continue;
                    };
                    if !is_ciphertext_name(name) {
                        continue;
                    }
                    let mut handle = sftp.open(&remote_file).map_err(|_| Error::Remote)?;
                    let mut bytes = Vec::new();
                    handle.read_to_end(&mut bytes).map_err(|_| Error::Remote)?;
                    write_resumable_ciphertext(&pending.join(name), &bytes)?;
                    transferred += 1;
                }
                if !pending.join("manifest.age").exists() {
                    return Err(Error::Remote);
                }
                fs::rename(&pending, &final_dir)?;
                Ok(())
            })();
            if operation.is_err() {
                return operation.map(|_| transferred);
            }
        }
        Ok(transferred)
    }
}

fn read_remote(sftp: &Sftp, path: &Path) -> Result<Vec<u8>> {
    let mut handle = sftp.open(path).map_err(|_| Error::Remote)?;
    let mut bytes = Vec::new();
    handle.read_to_end(&mut bytes).map_err(|_| Error::Remote)?;
    Ok(bytes)
}

fn write_resumable_ciphertext(path: &Path, bytes: &[u8]) -> Result<()> {
    if fs::read(path).ok().as_deref() == Some(bytes) {
        return Ok(());
    }
    crate::storage::atomic_write(path, bytes, 0o600)
}

pub fn verify_host_key(host_key: &[u8], expected: &str) -> Result<()> {
    let digest = Sha256::digest(host_key);
    let actual = format!(
        "SHA256:{}",
        base64::engine::general_purpose::STANDARD_NO_PAD.encode(digest)
    );
    if actual == expected {
        Ok(())
    } else {
        Err(Error::HostKeyMismatch)
    }
}

fn ensure_remote_dir(sftp: &Sftp, path: &Path) -> Result<()> {
    let mut current = PathBuf::new();
    for part in path.components() {
        current.push(part);
        if sftp.stat(&current).is_err() {
            sftp.mkdir(&current, 0o700).map_err(|_| Error::Remote)?;
        }
    }
    Ok(())
}

fn is_opaque_id(value: &str) -> bool {
    value.len() == 32 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn is_ciphertext_name(value: &str) -> bool {
    value == "manifest.age" || value.strip_suffix(".age").is_some_and(is_opaque_id)
}

#[cfg(test)]
mod tests {
    use tempfile::tempdir;

    use super::*;

    #[test]
    fn strict_host_key_requires_exact_sha256_fingerprint() {
        let key = b"fictitious-host-key";
        let expected = format!(
            "SHA256:{}",
            base64::engine::general_purpose::STANDARD_NO_PAD.encode(Sha256::digest(key))
        );
        assert!(verify_host_key(key, &expected).is_ok());
        assert!(matches!(
            verify_host_key(b"different", &expected),
            Err(Error::HostKeyMismatch)
        ));
    }

    #[test]
    fn accepts_only_opaque_ciphertext_names() {
        assert!(is_ciphertext_name("manifest.age"));
        assert!(is_ciphertext_name("0123456789abcdef0123456789abcdef.age"));
        assert!(!is_ciphertext_name(".env.age"));
        assert!(!is_ciphertext_name("../../secret.age"));
        assert!(!is_ciphertext_name("manifest.age.part"));
    }

    #[test]
    fn interrupted_pull_can_resume_from_atomic_objects() {
        let dir = tempdir().expect("tempdir");
        let partial = dir.path().join("manifest.age");
        write_resumable_ciphertext(&partial, b"complete-ciphertext").expect("first transfer");
        write_resumable_ciphertext(&partial, b"complete-ciphertext").expect("idempotent retry");
        fs::write(&partial, b"interrupted").expect("simulate interrupted state");
        write_resumable_ciphertext(&partial, b"complete-ciphertext").expect("resume");
        assert_eq!(fs::read(partial).expect("read"), b"complete-ciphertext");
    }
}
