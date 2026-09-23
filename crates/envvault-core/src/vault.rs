use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use age::secrecy::{ExposeSecret, SecretString};
use chrono::{DateTime, Utc};
use keyring::Entry;
use serde::de::DeserializeOwned;
use sha2::{Digest, Sha256};
use uuid::Uuid;
use zeroize::{Zeroize, Zeroizing};

use crate::crypto;
use crate::model::*;
use crate::scan::safe_relative;
use crate::storage::{atomic_write, create_new_atomic};
use crate::{Error, Result};

const CONFIG: &str = "vault.json";
const BACKUPS: &str = "backups";
const SECRETS: &str = "secrets";
const SECRET_CATALOG: &str = "catalog.age";
const SECRET_CATALOG_VERSION: u32 = 1;
const MAX_SSH_KEY_BYTES: u64 = 128 * 1024;

#[derive(serde::Serialize, serde::Deserialize)]
struct StoredSshKey {
    summary: SshKeySummary,
    private_key: String,
}

impl Drop for StoredSshKey {
    fn drop(&mut self) {
        self.private_key.zeroize();
    }
}

#[derive(serde::Serialize, serde::Deserialize)]
struct SecretCatalog {
    format_version: u32,
    ssh_keys: Vec<StoredSshKey>,
    servers: Vec<ServerProfile>,
}

impl Default for SecretCatalog {
    fn default() -> Self {
        Self {
            format_version: SECRET_CATALOG_VERSION,
            ssh_keys: vec![],
            servers: vec![],
        }
    }
}

pub trait SecretStore: Send + Sync {
    fn load(&self, vault_id: &str) -> Result<SecretString>;
    fn save(&self, vault_id: &str, secret: &SecretString) -> Result<()>;
    fn delete(&self, vault_id: &str) -> Result<()>;
}

#[derive(Debug, Default)]
pub struct KeyringSecretStore;

impl KeyringSecretStore {
    fn entry(vault_id: &str) -> Result<Entry> {
        Entry::new("dev.envvault.identity", vault_id).map_err(|_| Error::SecretStore)
    }
}

impl SecretStore for KeyringSecretStore {
    fn load(&self, vault_id: &str) -> Result<SecretString> {
        let value = Self::entry(vault_id)?
            .get_password()
            .map_err(|_| Error::SecretStore)?;
        Ok(SecretString::from(value))
    }

    fn save(&self, vault_id: &str, secret: &SecretString) -> Result<()> {
        Self::entry(vault_id)?
            .set_password(secret.expose_secret())
            .map_err(|_| Error::SecretStore)
    }

    fn delete(&self, vault_id: &str) -> Result<()> {
        match Self::entry(vault_id)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(Error::SecretStore),
        }
    }
}

pub struct Vault {
    root: PathBuf,
    secrets: Arc<dyn SecretStore>,
}

impl Vault {
    pub fn new(root: impl Into<PathBuf>, secrets: Arc<dyn SecretStore>) -> Self {
        Self {
            root: root.into(),
            secrets,
        }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn init(&self) -> Result<VaultConfig> {
        if self.root.join(CONFIG).exists() {
            return Err(Error::AlreadyInitialized);
        }
        fs::create_dir_all(self.root.join(BACKUPS))?;
        fs::create_dir_all(self.root.join(SECRETS))?;
        let (identity, recipient) = crypto::generate_identity();
        let config = VaultConfig {
            format_version: FORMAT_VERSION,
            recipient,
            vault_id: Uuid::new_v4().to_string(),
        };
        self.secrets.save(&config.vault_id, &identity)?;
        let encoded = serde_json::to_vec_pretty(&config)?;
        if let Err(error) = create_new_atomic(&self.root.join(CONFIG), &encoded, 0o600) {
            let _ = self.secrets.delete(&config.vault_id);
            return Err(error);
        }
        let probe = crypto::encrypt(&config.recipient, b"envvault-init-probe")?;
        let opened = crypto::decrypt(&identity, &probe)?;
        if opened.as_slice() != b"envvault-init-probe" {
            return Err(Error::Crypto);
        }
        Ok(config)
    }

    pub fn config(&self) -> Result<VaultConfig> {
        let bytes = fs::read(self.root.join(CONFIG)).map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                Error::NotInitialized
            } else {
                Error::Io(error)
            }
        })?;
        let config: VaultConfig = serde_json::from_slice(&bytes)?;
        if config.format_version != FORMAT_VERSION {
            return Err(Error::InvalidData);
        }
        Ok(config)
    }

    fn identity(&self) -> Result<SecretString> {
        let config = self.config()?;
        self.secrets.load(&config.vault_id)
    }

    pub fn backup(&self, project: &Project) -> Result<BackupSummary> {
        let config = self.config()?;
        let root = project.root.canonicalize()?;
        if !root.is_dir() || project.included.is_empty() {
            return Err(Error::InvalidData);
        }
        let backup_id = Uuid::new_v4().simple().to_string();
        let pending = self
            .root
            .join(BACKUPS)
            .join(format!(".pending-{backup_id}"));
        let final_dir = self.root.join(BACKUPS).join(&backup_id);
        fs::create_dir(&pending)?;
        let result = (|| {
            let mut manifest_files = Vec::new();
            for relative in &project.included {
                safe_relative(relative)?;
                if project.excluded.contains(relative) {
                    continue;
                }
                let source = root.join(relative);
                let metadata = fs::symlink_metadata(&source)?;
                if metadata.file_type().is_symlink() {
                    return Err(Error::Symlink);
                }
                if !metadata.is_file() {
                    return Err(Error::InvalidData);
                }
                let canonical = source.canonicalize()?;
                if !canonical.starts_with(&root) {
                    return Err(Error::UnsafePath);
                }
                let plaintext = Zeroizing::new(fs::read(&canonical)?);
                let digest = hex::encode(Sha256::digest(&*plaintext));
                let encrypted = crypto::encrypt(&config.recipient, &plaintext)?;
                let blob_id = Uuid::new_v4().simple().to_string();
                create_new_atomic(&pending.join(format!("{blob_id}.age")), &encrypted, 0o600)?;
                manifest_files.push(ManifestFile {
                    relative_path: relative.clone(),
                    blob_id,
                    plaintext_size: metadata.len(),
                    sha256: digest,
                    modified: metadata.modified().ok().map(DateTime::<Utc>::from),
                });
            }
            let manifest = BackupManifest {
                format_version: FORMAT_VERSION,
                backup_id: backup_id.clone(),
                project_id: project.id.clone(),
                project_name: project.name.clone(),
                created_at: Utc::now(),
                files: manifest_files,
            };
            let manifest_bytes = Zeroizing::new(serde_json::to_vec(&manifest)?);
            let encrypted_manifest = crypto::encrypt(&config.recipient, &manifest_bytes)?;
            create_new_atomic(&pending.join("manifest.age"), &encrypted_manifest, 0o600)?;
            fs::rename(&pending, &final_dir)?;
            Ok(BackupSummary {
                id: manifest.backup_id,
                project_id: manifest.project_id,
                project_name: manifest.project_name,
                created_at: manifest.created_at,
                file_count: manifest.files.len(),
            })
        })();
        if result.is_err() {
            let _ = fs::remove_dir_all(&pending);
        }
        result
    }

    fn read_manifest_with(
        &self,
        backup_id: &str,
        identity: &SecretString,
    ) -> Result<BackupManifest> {
        validate_opaque_id(backup_id)?;
        let encrypted = fs::read(self.root.join(BACKUPS).join(backup_id).join("manifest.age"))?;
        let plaintext = crypto::decrypt(identity, &encrypted)?;
        let manifest: BackupManifest = parse_json(&plaintext)?;
        if manifest.format_version != FORMAT_VERSION || manifest.backup_id != backup_id {
            return Err(Error::InvalidData);
        }
        for file in &manifest.files {
            safe_relative(&file.relative_path)?;
            validate_opaque_id(&file.blob_id)?;
        }
        Ok(manifest)
    }

    pub fn history(&self, project_id: Option<&str>) -> Result<Vec<BackupSummary>> {
        let identity = self.identity()?;
        let mut summaries = Vec::new();
        let backup_root = self.root.join(BACKUPS);
        for entry in fs::read_dir(backup_root)? {
            let entry = entry?;
            let name = entry.file_name();
            let Some(id) = name.to_str() else { continue };
            if !entry.file_type()?.is_dir() || id.starts_with(".pending-") {
                continue;
            }
            let manifest = self.read_manifest_with(id, &identity)?;
            if project_id.is_none_or(|expected| manifest.project_id == expected) {
                summaries.push(BackupSummary {
                    id: manifest.backup_id,
                    project_id: manifest.project_id,
                    project_name: manifest.project_name,
                    created_at: manifest.created_at,
                    file_count: manifest.files.len(),
                });
            }
        }
        summaries.sort_by_key(|summary| std::cmp::Reverse(summary.created_at));
        Ok(summaries)
    }

    pub fn plan_restore(
        &self,
        project: &Project,
        backup_id: Option<&str>,
        destination: &Path,
    ) -> Result<RestorePlan> {
        let id = match backup_id {
            Some(id) => id.to_owned(),
            None => self
                .history(Some(&project.id))?
                .first()
                .map(|summary| summary.id.clone())
                .ok_or(Error::BackupNotFound)?,
        };
        let identity = self.identity()?;
        let manifest = self.read_manifest_with(&id, &identity)?;
        if manifest.project_id != project.id {
            return Err(Error::BackupNotFound);
        }
        let mut paths = Vec::new();
        let mut collisions = Vec::new();
        for file in &manifest.files {
            let target = destination.join(&file.relative_path);
            if target.exists() {
                collisions.push(file.relative_path.clone());
            }
            paths.push(file.relative_path.clone());
        }
        let original = project.root.canonicalize().ok();
        let destination_canonical = destination.canonicalize().ok();
        Ok(RestorePlan {
            project_name: manifest.project_name,
            backup_id: id,
            destination: destination.to_path_buf(),
            paths,
            collisions,
            restoring_to_original: original.is_some() && original == destination_canonical,
        })
    }

    pub fn restore(
        &self,
        project: &Project,
        backup_id: &str,
        destination: &Path,
        overwrite: bool,
    ) -> Result<usize> {
        let identity = self.identity()?;
        let manifest = self.read_manifest_with(backup_id, &identity)?;
        if manifest.project_id != project.id {
            return Err(Error::BackupNotFound);
        }
        fs::create_dir_all(destination)?;
        let destination = destination.canonicalize()?;
        for file in &manifest.files {
            safe_relative(&file.relative_path)?;
            let target = destination.join(&file.relative_path);
            if target.exists() && !overwrite {
                return Err(Error::Collision(file.relative_path.clone()));
            }
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)?;
                let parent_canonical = parent.canonicalize()?;
                if !parent_canonical.starts_with(&destination) {
                    return Err(Error::UnsafePath);
                }
            }
        }
        for file in &manifest.files {
            let encrypted = fs::read(
                self.root
                    .join(BACKUPS)
                    .join(backup_id)
                    .join(format!("{}.age", file.blob_id)),
            )?;
            let plaintext = crypto::decrypt(&identity, &encrypted)?;
            let digest = hex::encode(Sha256::digest(&*plaintext));
            if digest != file.sha256 || plaintext.len() as u64 != file.plaintext_size {
                return Err(Error::Crypto);
            }
            let target = destination.join(&file.relative_path);
            if overwrite {
                atomic_write(&target, &plaintext, 0o600)?;
            } else {
                create_new_atomic(&target, &plaintext, 0o600)?;
            }
        }
        Ok(manifest.files.len())
    }

    pub fn verify(&self) -> Result<VerifyReport> {
        let config = self.config()?;
        let identity = match self.secrets.load(&config.vault_id) {
            Ok(identity) => identity,
            Err(_) => {
                return Ok(VerifyReport {
                    status: VerifyStatus::WrongKey,
                    backups_checked: 0,
                    blobs_checked: 0,
                    failures: 1,
                });
            }
        };
        if crypto::recipient_for_identity(&identity)? != config.recipient {
            return Ok(VerifyReport {
                status: VerifyStatus::WrongKey,
                backups_checked: 0,
                blobs_checked: 0,
                failures: 1,
            });
        }
        let mut report = VerifyReport {
            status: VerifyStatus::Healthy,
            backups_checked: 0,
            blobs_checked: 0,
            failures: 0,
        };
        for entry in fs::read_dir(self.root.join(BACKUPS))? {
            let entry = entry?;
            let Some(id) = entry.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            if id.starts_with(".pending-") {
                report.status = VerifyStatus::Incomplete;
                report.failures += 1;
                continue;
            }
            let manifest = match self.read_manifest_with(&id, &identity) {
                Ok(manifest) => manifest,
                Err(_) => {
                    report.status = VerifyStatus::Corrupt;
                    report.failures += 1;
                    continue;
                }
            };
            report.backups_checked += 1;
            for file in manifest.files {
                let path = self
                    .root
                    .join(BACKUPS)
                    .join(&id)
                    .join(format!("{}.age", file.blob_id));
                let valid = fs::read(path)
                    .ok()
                    .and_then(|bytes| crypto::decrypt(&identity, &bytes).ok())
                    .is_some_and(|plain| {
                        plain.len() as u64 == file.plaintext_size
                            && hex::encode(Sha256::digest(&*plain)) == file.sha256
                    });
                report.blobs_checked += 1;
                if !valid {
                    report.status = VerifyStatus::Corrupt;
                    report.failures += 1;
                }
            }
        }
        Ok(report)
    }

    pub fn export_recovery(&self, path: &Path, passphrase: SecretString) -> Result<()> {
        let identity = self.identity()?;
        let encrypted = crypto::encrypt_recovery(&identity, passphrase)?;
        create_new_atomic(path, &encrypted, 0o600)
    }

    pub fn import_recovery(&self, path: &Path, passphrase: SecretString) -> Result<()> {
        let config = self.config()?;
        let encrypted = fs::read(path)?;
        let identity = crypto::decrypt_recovery(&encrypted, passphrase)?;
        if crypto::recipient_for_identity(&identity)? != config.recipient {
            return Err(Error::Crypto);
        }
        self.secrets.save(&config.vault_id, &identity)
    }

    pub fn secret_inventory(&self) -> Result<SecretInventory> {
        let catalog = self.read_secret_catalog()?;
        Ok(SecretInventory {
            ssh_keys: catalog
                .ssh_keys
                .iter()
                .map(|key| key.summary.clone())
                .collect(),
            servers: catalog.servers.clone(),
        })
    }

    pub fn import_ssh_key(&self, name: &str, source: &Path) -> Result<SshKeySummary> {
        let name = name.trim();
        if name.is_empty() || name.len() > 100 {
            return Err(Error::InvalidData);
        }
        let metadata = fs::symlink_metadata(source)?;
        if metadata.file_type().is_symlink() {
            return Err(Error::Symlink);
        }
        if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_SSH_KEY_BYTES {
            return Err(Error::InvalidData);
        }
        let bytes = Zeroizing::new(fs::read(source)?);
        let parsed = ssh_key::PrivateKey::from_openssh(&*bytes).map_err(|_| Error::InvalidData)?;
        let summary = SshKeySummary {
            id: Uuid::new_v4().simple().to_string(),
            name: name.to_owned(),
            algorithm: parsed.algorithm().to_string(),
            fingerprint: parsed.fingerprint(Default::default()).to_string(),
            encrypted_at_source: parsed.is_encrypted(),
            created_at: Utc::now(),
        };
        let private_key = String::from_utf8(bytes.to_vec()).map_err(|_| Error::InvalidData)?;
        let mut catalog = self.read_secret_catalog()?;
        if catalog
            .ssh_keys
            .iter()
            .any(|key| key.summary.fingerprint == summary.fingerprint)
        {
            return Err(Error::Collision(PathBuf::from("ssh-key-fingerprint")));
        }
        catalog.ssh_keys.push(StoredSshKey {
            summary: summary.clone(),
            private_key,
        });
        self.write_secret_catalog(&catalog)?;
        Ok(summary)
    }

    pub fn add_server_profile(
        &self,
        name: &str,
        host: &str,
        port: u16,
        username: &str,
        host_key_sha256: &str,
        ssh_key_id: &str,
    ) -> Result<ServerProfile> {
        let name = name.trim();
        let host = host.trim();
        let username = username.trim();
        let host_key_sha256 = host_key_sha256.trim();
        if name.is_empty()
            || name.len() > 100
            || host.is_empty()
            || host.len() > 255
            || host.chars().any(char::is_whitespace)
            || username.is_empty()
            || username.len() > 100
            || username.chars().any(char::is_whitespace)
            || port == 0
            || !host_key_sha256.starts_with("SHA256:")
            || host_key_sha256.chars().any(char::is_whitespace)
        {
            return Err(Error::InvalidData);
        }
        let mut catalog = self.read_secret_catalog()?;
        if !catalog
            .ssh_keys
            .iter()
            .any(|key| key.summary.id == ssh_key_id)
            || catalog.servers.iter().any(|server| {
                server.host == host && server.port == port && server.username == username
            })
        {
            return Err(Error::InvalidData);
        }
        let server = ServerProfile {
            id: Uuid::new_v4().simple().to_string(),
            name: name.to_owned(),
            host: host.to_owned(),
            port,
            username: username.to_owned(),
            host_key_sha256: host_key_sha256.to_owned(),
            ssh_key_id: ssh_key_id.to_owned(),
            created_at: Utc::now(),
        };
        catalog.servers.push(server.clone());
        self.write_secret_catalog(&catalog)?;
        Ok(server)
    }

    pub fn delete_server_profile(&self, id: &str) -> Result<()> {
        validate_opaque_id(id)?;
        let mut catalog = self.read_secret_catalog()?;
        let before = catalog.servers.len();
        catalog.servers.retain(|server| server.id != id);
        if catalog.servers.len() == before {
            return Err(Error::InvalidData);
        }
        self.write_secret_catalog(&catalog)
    }

    pub fn delete_ssh_key(&self, id: &str) -> Result<()> {
        validate_opaque_id(id)?;
        let mut catalog = self.read_secret_catalog()?;
        if catalog.servers.iter().any(|server| server.ssh_key_id == id) {
            return Err(Error::InvalidData);
        }
        let before = catalog.ssh_keys.len();
        catalog.ssh_keys.retain(|key| key.summary.id != id);
        if catalog.ssh_keys.len() == before {
            return Err(Error::InvalidData);
        }
        self.write_secret_catalog(&catalog)
    }

    fn read_secret_catalog(&self) -> Result<SecretCatalog> {
        let path = self.root.join(SECRETS).join(SECRET_CATALOG);
        if !path.exists() {
            return Ok(SecretCatalog::default());
        }
        let encrypted = fs::read(path)?;
        let plaintext = crypto::decrypt(&self.identity()?, &encrypted)?;
        let catalog: SecretCatalog = parse_json(&plaintext)?;
        if catalog.format_version != SECRET_CATALOG_VERSION {
            return Err(Error::InvalidData);
        }
        Ok(catalog)
    }

    fn write_secret_catalog(&self, catalog: &SecretCatalog) -> Result<()> {
        let config = self.config()?;
        let encoded = Zeroizing::new(serde_json::to_vec(catalog)?);
        let encrypted = crypto::encrypt(&config.recipient, &encoded)?;
        atomic_write(
            &self.root.join(SECRETS).join(SECRET_CATALOG),
            &encrypted,
            0o600,
        )
    }
}

fn parse_json<T: DeserializeOwned>(bytes: &[u8]) -> Result<T> {
    serde_json::from_slice(bytes).map_err(|_| Error::InvalidData)
}

fn validate_opaque_id(id: &str) -> Result<()> {
    if id.len() == 32 && id.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        Ok(())
    } else {
        Err(Error::UnsafePath)
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::sync::Mutex;

    use tempfile::tempdir;

    use super::*;

    #[derive(Default)]
    struct MemorySecrets(Mutex<HashMap<String, String>>);

    impl SecretStore for MemorySecrets {
        fn load(&self, id: &str) -> Result<SecretString> {
            self.0
                .lock()
                .map_err(|_| Error::SecretStore)?
                .get(id)
                .cloned()
                .map(SecretString::from)
                .ok_or(Error::SecretStore)
        }
        fn save(&self, id: &str, secret: &SecretString) -> Result<()> {
            self.0
                .lock()
                .map_err(|_| Error::SecretStore)?
                .insert(id.to_owned(), secret.expose_secret().to_owned());
            Ok(())
        }
        fn delete(&self, id: &str) -> Result<()> {
            self.0.lock().map_err(|_| Error::SecretStore)?.remove(id);
            Ok(())
        }
    }

    fn fixture() -> (tempfile::TempDir, tempfile::TempDir, Vault, Project) {
        let vault_dir = tempdir().expect("vault tempdir");
        let project_dir = tempdir().expect("project tempdir");
        fs::write(
            project_dir.path().join(".env"),
            "TOKEN=fictitious-test-value",
        )
        .expect("fixture");
        let vault = Vault::new(vault_dir.path(), Arc::new(MemorySecrets::default()));
        vault.init().expect("init");
        let project = Project {
            id: "project-1".into(),
            name: "demo".into(),
            root: project_dir.path().to_path_buf(),
            included: vec![PathBuf::from(".env")],
            excluded: vec![],
        };
        (vault_dir, project_dir, vault, project)
    }

    #[test]
    fn backup_restore_verify_without_plaintext_in_vault() {
        let (vault_dir, _project_dir, vault, project) = fixture();
        let summary = vault.backup(&project).expect("backup");
        let raw = fs::read(
            vault_dir
                .path()
                .join(BACKUPS)
                .join(&summary.id)
                .join("manifest.age"),
        )
        .expect("manifest");
        assert!(!String::from_utf8_lossy(&raw).contains("fictitious-test-value"));
        assert_eq!(
            vault.verify().expect("verify").status,
            VerifyStatus::Healthy
        );
        let restore_dir = tempdir().expect("restore tempdir");
        vault
            .restore(&project, &summary.id, restore_dir.path(), false)
            .expect("restore");
        assert_eq!(
            fs::read_to_string(restore_dir.path().join(".env")).expect("restored"),
            "TOKEN=fictitious-test-value"
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(restore_dir.path().join(".env"))
                    .expect("metadata")
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
        }
    }

    #[test]
    fn refuses_collision_without_overwrite() {
        let (_vault_dir, _project_dir, vault, project) = fixture();
        let summary = vault.backup(&project).expect("backup");
        let restore_dir = tempdir().expect("restore tempdir");
        fs::write(restore_dir.path().join(".env"), "EXISTING=yes").expect("existing");
        assert!(matches!(
            vault.restore(&project, &summary.id, restore_dir.path(), false),
            Err(Error::Collision(_))
        ));
        assert_eq!(
            fs::read_to_string(restore_dir.path().join(".env")).expect("unchanged"),
            "EXISTING=yes"
        );
    }

    #[cfg(unix)]
    #[test]
    fn refuses_selected_symlink() {
        use std::os::unix::fs::symlink;
        let (_vault_dir, project_dir, vault, mut project) = fixture();
        symlink(
            project_dir.path().join(".env"),
            project_dir.path().join(".env.local"),
        )
        .expect("symlink");
        project.included = vec![PathBuf::from(".env.local")];
        assert!(matches!(vault.backup(&project), Err(Error::Symlink)));
    }

    #[test]
    fn interrupted_backup_is_reported() {
        let (vault_dir, _project_dir, vault, _project) = fixture();
        fs::create_dir(vault_dir.path().join(BACKUPS).join(".pending-test")).expect("pending");
        assert_eq!(
            vault.verify().expect("verify").status,
            VerifyStatus::Incomplete
        );
    }

    #[test]
    fn corrupt_blob_is_reported_without_secret_in_error() {
        let (vault_dir, _project_dir, vault, project) = fixture();
        let summary = vault.backup(&project).expect("backup");
        let manifest = vault
            .read_manifest_with(&summary.id, &vault.identity().expect("identity"))
            .expect("manifest");
        fs::write(
            vault_dir
                .path()
                .join(BACKUPS)
                .join(&summary.id)
                .join(format!("{}.age", manifest.files[0].blob_id)),
            b"broken",
        )
        .expect("corrupt");
        let report = vault.verify().expect("verify");
        assert_eq!(report.status, VerifyStatus::Corrupt);
        assert!(!format!("{:?}", report).contains("fictitious-test-value"));
    }

    #[test]
    fn failed_backup_leaves_no_visible_version() {
        let (vault_dir, _project_dir, vault, mut project) = fixture();
        project.included.push(PathBuf::from(".env.missing"));
        assert!(vault.backup(&project).is_err());
        let entries: Vec<_> = fs::read_dir(vault_dir.path().join(BACKUPS))
            .expect("read backups")
            .collect();
        assert!(entries.is_empty());
    }

    #[test]
    fn invalid_encrypted_manifest_is_rejected() {
        let (vault_dir, _project_dir, vault, project) = fixture();
        let summary = vault.backup(&project).expect("backup");
        let config = vault.config().expect("config");
        let invalid = crypto::encrypt(&config.recipient, b"{not-json").expect("encrypt invalid");
        fs::write(
            vault_dir
                .path()
                .join(BACKUPS)
                .join(&summary.id)
                .join("manifest.age"),
            invalid,
        )
        .expect("replace manifest");
        assert_eq!(
            vault.verify().expect("verify").status,
            VerifyStatus::Corrupt
        );
    }

    #[test]
    fn ssh_keys_and_servers_live_only_in_the_encrypted_catalog() {
        let (vault_dir, project_dir, vault, _project) = fixture();
        let private_key = ssh_key::PrivateKey::random(
            &mut ssh_key::rand_core::OsRng,
            ssh_key::Algorithm::Ed25519,
        )
        .expect("generate test ssh key")
        .to_openssh(ssh_key::LineEnding::LF)
        .expect("encode test ssh key");
        let key_path = project_dir.path().join("test-ssh-key");
        fs::write(&key_path, private_key.as_bytes()).expect("write test ssh key");

        let key = vault
            .import_ssh_key("Test deployment key", &key_path)
            .expect("import ssh key");
        assert_eq!(key.algorithm, "ssh-ed25519");
        assert!(key.fingerprint.starts_with("SHA256:"));
        let server = vault
            .add_server_profile(
                "Test VPS",
                "vps.invalid.test",
                22,
                "deploy",
                "SHA256:fictitious-host-key",
                &key.id,
            )
            .expect("add server");
        let inventory = vault.secret_inventory().expect("read inventory");
        assert_eq!(inventory.ssh_keys, std::slice::from_ref(&key));
        assert_eq!(inventory.servers, std::slice::from_ref(&server));

        let catalog = fs::read(vault_dir.path().join(SECRETS).join(SECRET_CATALOG))
            .expect("read encrypted secret catalog");
        let visible = String::from_utf8_lossy(&catalog);
        assert!(!visible.contains("Test deployment key"));
        assert!(!visible.contains("BEGIN OPENSSH PRIVATE KEY"));
        assert!(vault.delete_ssh_key(&key.id).is_err());
        vault
            .delete_server_profile(&server.id)
            .expect("delete server");
        vault.delete_ssh_key(&key.id).expect("delete unlinked key");
        assert_eq!(
            vault.secret_inventory().expect("empty inventory"),
            SecretInventory::default()
        );
    }
}
