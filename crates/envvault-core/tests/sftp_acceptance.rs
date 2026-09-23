use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use age::secrecy::{ExposeSecret, SecretString};
use envvault_core::{
    Error, Project, RemoteConfig, Result, SecretStore, SftpRemote, Vault, VerifyStatus,
};
use tempfile::tempdir;

const FAKE_SECRET: &str = "SFTP_TOKEN=fictitious-loopback-only\n";

#[derive(Default)]
struct MemorySecretStore(Mutex<HashMap<String, String>>);

impl SecretStore for MemorySecretStore {
    fn load(&self, vault_id: &str) -> Result<SecretString> {
        self.0
            .lock()
            .map_err(|_| Error::SecretStore)?
            .get(vault_id)
            .cloned()
            .map(SecretString::from)
            .ok_or(Error::SecretStore)
    }

    fn save(&self, vault_id: &str, secret: &SecretString) -> Result<()> {
        self.0
            .lock()
            .map_err(|_| Error::SecretStore)?
            .insert(vault_id.to_owned(), secret.expose_secret().to_owned());
        Ok(())
    }

    fn delete(&self, vault_id: &str) -> Result<()> {
        self.0
            .lock()
            .map_err(|_| Error::SecretStore)?
            .remove(vault_id);
        Ok(())
    }
}

#[test]
fn sftp_loopback_push_pull_resume_conflict_and_host_key() {
    if env::var_os("ENVAULT_RUN_SFTP_ACCEPTANCE").is_none() {
        eprintln!("skipped: run scripts/test-sftp-local.sh for the isolated loopback test");
        return;
    }

    let host = required_env("ENVAULT_SFTP_HOST");
    let port = required_env("ENVAULT_SFTP_PORT")
        .parse::<u16>()
        .expect("valid test port");
    let username = required_env("ENVAULT_SFTP_USERNAME");
    let private_key = PathBuf::from(required_env("ENVAULT_SFTP_PRIVATE_KEY"));
    let private_key_contents = fs::read_to_string(&private_key).expect("read loopback private key");
    let host_key = required_env("ENVAULT_SFTP_HOST_KEY");
    let remote_path = PathBuf::from(required_env("ENVAULT_SFTP_REMOTE_PATH"));

    let workspace = tempdir().expect("isolated SFTP test workspace");
    let source_vault = workspace.path().join("source-vault");
    let pulled_vault = workspace.path().join("pulled-vault");
    let project_root = workspace.path().join("fictional-project");
    fs::create_dir_all(&project_root).expect("create fictional project");
    fs::write(project_root.join(".env"), FAKE_SECRET).expect("write fictional .env");

    let secrets = Arc::new(MemorySecretStore::default());
    let source = Vault::new(&source_vault, secrets.clone());
    source.init().expect("initialize source vault");
    let project = Project {
        id: "sftp-acceptance-project".to_owned(),
        name: "Fictional SFTP project".to_owned(),
        root: project_root,
        included: vec![PathBuf::from(".env")],
        excluded: vec![],
    };
    let backup = source.backup(&project).expect("create encrypted backup");

    let config = RemoteConfig {
        host: host.clone(),
        port,
        username: username.clone(),
        remote_path: remote_path.to_string_lossy().into_owned(),
        private_key: private_key.clone(),
        host_key_sha256: host_key.clone(),
    };
    let wrong_host = SftpRemote::with_private_key(
        RemoteConfig {
            host_key_sha256: "SHA256:deliberately-wrong-loopback-key".to_owned(),
            ..config.clone()
        },
        SecretString::from(private_key_contents.clone()),
        None,
    );
    assert!(matches!(
        wrong_host.push(&source_vault),
        Err(Error::HostKeyMismatch)
    ));

    let remote =
        SftpRemote::with_private_key(config, SecretString::from(private_key_contents), None);
    assert_eq!(remote.push(&source_vault).expect("push ciphertext"), 2);
    assert_eq!(remote.push(&source_vault).expect("idempotent push"), 0);

    fs::create_dir_all(pulled_vault.join("backups")).expect("create pull target");
    fs::copy(
        source_vault.join("vault.json"),
        pulled_vault.join("vault.json"),
    )
    .expect("copy public vault configuration");
    let pending = pulled_vault
        .join("backups")
        .join(format!(".pending-sync-{}", backup.id));
    fs::create_dir_all(&pending).expect("create interrupted pull state");
    fs::copy(
        source_vault
            .join("backups")
            .join(&backup.id)
            .join("manifest.age"),
        pending.join("manifest.age"),
    )
    .expect("seed one completed object from an interrupted pull");

    assert!(remote.pull(&pulled_vault).expect("resume pull") >= 1);
    let pulled = Vault::new(&pulled_vault, secrets);
    assert_eq!(
        pulled.verify().expect("verify pulled vault").status,
        VerifyStatus::Healthy
    );
    let restore_root = workspace.path().join("restored");
    pulled
        .restore(&project, &backup.id, &restore_root, false)
        .expect("restore pulled backup");
    assert_eq!(
        fs::read(restore_root.join(".env")).expect("read restored .env"),
        FAKE_SECRET.as_bytes()
    );

    let blob = fs::read_dir(pulled_vault.join("backups").join(&backup.id))
        .expect("read pulled backup")
        .filter_map(std::result::Result::ok)
        .map(|entry| entry.path())
        .find(|path| path.file_name().is_some_and(|name| name != "manifest.age"))
        .expect("find encrypted blob");
    fs::write(&blob, b"fictitious-corrupt-ciphertext").expect("create local conflict");
    assert!(matches!(remote.pull(&pulled_vault), Err(Error::Remote)));
}

fn required_env(name: &str) -> String {
    env::var(name).unwrap_or_else(|_| panic!("{name} is required by the loopback test harness"))
}
