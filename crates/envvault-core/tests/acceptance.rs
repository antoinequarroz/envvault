use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use age::secrecy::{ExposeSecret, SecretString};
use envvault_core::{
    Error, Project, Result, ScanOptions, SecretStore, Vault, VerifyStatus, crypto, scan,
};
use tempfile::tempdir;

const FIRST_SECRET: &str = "APP_TOKEN=fictitious-acceptance-alpha\n";
const SECOND_SECRET: &str =
    "DATABASE_URL=postgres://fake-user:fake-password@invalid.test/fake-db\n";
const RECOVERY_PASSPHRASE: &str = "fictitious recovery phrase for isolated tests";

#[derive(Default)]
struct MemorySecretStore(Mutex<HashMap<String, String>>);

impl MemorySecretStore {
    fn replace_with_wrong_key(&self, vault_id: &str) -> Result<()> {
        let (wrong_identity, _) = crypto::generate_identity();
        self.save(vault_id, &wrong_identity)
    }
}

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
fn acceptance_full_local_lifecycle_never_exposes_values() {
    let workspace = tempdir().expect("isolated acceptance workspace");
    let project_root = workspace.path().join("fictional-project");
    let vault_root = workspace.path().join("vault");
    let restore_root = workspace.path().join("restored");
    fs::create_dir_all(&project_root).expect("create fictional project");
    fs::write(project_root.join(".env"), FIRST_SECRET).expect("write fictional .env");
    fs::write(project_root.join(".env.production"), SECOND_SECRET)
        .expect("write fictional production env");
    fs::write(
        project_root.join(".env.example"),
        "APP_TOKEN=example-only\n",
    )
    .expect("write non-secret template");

    let secret_store = Arc::new(MemorySecretStore::default());
    let vault = Vault::new(&vault_root, secret_store);
    vault.init().expect("initialize isolated vault");

    let scanned = scan(&project_root, &ScanOptions::default()).expect("scan fictional project");
    let selected: Vec<PathBuf> = scanned
        .iter()
        .filter(|file| file.selected_by_default)
        .map(|file| file.relative_path.clone())
        .collect();
    assert_eq!(
        selected,
        [PathBuf::from(".env"), PathBuf::from(".env.production")]
    );
    assert!(
        scanned.iter().any(
            |file| file.relative_path == Path::new(".env.example") && !file.selected_by_default
        )
    );

    let project = Project {
        id: "fictional-project-id".to_owned(),
        name: "Fictional acceptance project".to_owned(),
        root: project_root.clone(),
        included: selected,
        excluded: vec![],
    };
    let backup = vault.backup(&project).expect("create encrypted backup");
    assert_eq!(backup.file_count, 2);

    fs::write(
        project_root.join(".env"),
        "APP_TOKEN=changed-after-backup\n",
    )
    .expect("modify source after backup");
    fs::remove_file(project_root.join(".env.production")).expect("remove source after backup");

    let history = vault
        .history(Some(&project.id))
        .expect("read encrypted history");
    assert_eq!(history.len(), 1);
    assert_eq!(history[0].id, backup.id);

    let plan = vault
        .plan_restore(&project, Some(&backup.id), &restore_root)
        .expect("preview isolated restore");
    assert!(plan.collisions.is_empty());
    assert_eq!(plan.paths.len(), 2);
    vault
        .restore(&project, &backup.id, &restore_root, false)
        .expect("restore to clean isolated directory");
    assert_eq!(
        fs::read(restore_root.join(".env")).expect("read restored .env"),
        FIRST_SECRET.as_bytes()
    );
    assert_eq!(
        fs::read(restore_root.join(".env.production")).expect("read restored production env"),
        SECOND_SECRET.as_bytes()
    );

    let verification = vault.verify().expect("verify isolated vault");
    assert_eq!(verification.status, VerifyStatus::Healthy);
    assert_eq!(verification.backups_checked, 1);
    assert_eq!(verification.blobs_checked, 2);

    let visible_output = format!(
        "{}\n{}\n{}\n{}",
        serde_json::to_string(&scanned).expect("serialize scan"),
        serde_json::to_string(&history).expect("serialize history"),
        serde_json::to_string(&plan).expect("serialize restore plan"),
        serde_json::to_string(&verification).expect("serialize verification")
    );
    assert_no_secret_values(&visible_output);
    assert_vault_contains_no_plaintext(&vault_root);
}

#[test]
fn acceptance_recovery_replaces_lost_local_identity_and_restores() {
    let workspace = tempdir().expect("isolated recovery workspace");
    let project_root = workspace.path().join("fictional-project");
    let vault_root = workspace.path().join("vault");
    let recovery_file = workspace.path().join("recovery.age");
    let restore_root = workspace.path().join("recovered-output");
    fs::create_dir_all(&project_root).expect("create fictional project");
    fs::write(project_root.join(".env"), FIRST_SECRET).expect("write fictional .env");

    let secret_store = Arc::new(MemorySecretStore::default());
    let vault = Vault::new(&vault_root, secret_store.clone());
    let config = vault.init().expect("initialize isolated vault");
    let project = Project {
        id: "recovery-project-id".to_owned(),
        name: "Fictional recovery project".to_owned(),
        root: project_root,
        included: vec![PathBuf::from(".env")],
        excluded: vec![],
    };
    let backup = vault.backup(&project).expect("create recovery test backup");
    vault
        .export_recovery(
            &recovery_file,
            SecretString::from(RECOVERY_PASSPHRASE.to_owned()),
        )
        .expect("export encrypted recovery identity");
    assert_vault_contains_no_plaintext(&vault_root);
    assert_no_secret_values(&String::from_utf8_lossy(
        &fs::read(&recovery_file).expect("read encrypted recovery file"),
    ));

    secret_store
        .replace_with_wrong_key(&config.vault_id)
        .expect("simulate replacement of local key");
    assert_eq!(
        vault.verify().expect("detect wrong key").status,
        VerifyStatus::WrongKey
    );
    let wrong_key_error = vault
        .restore(&project, &backup.id, &restore_root, false)
        .expect_err("wrong key must not restore");
    assert_no_secret_values(&wrong_key_error.to_string());

    vault
        .import_recovery(
            &recovery_file,
            SecretString::from(RECOVERY_PASSPHRASE.to_owned()),
        )
        .expect("import isolated recovery identity");
    assert_eq!(
        vault.verify().expect("verify recovered vault").status,
        VerifyStatus::Healthy
    );
    vault
        .restore(&project, &backup.id, &restore_root, false)
        .expect("restore after recovery import");
    assert_eq!(
        fs::read(restore_root.join(".env")).expect("read recovered env"),
        FIRST_SECRET.as_bytes()
    );
}

fn assert_no_secret_values(output: &str) {
    for secret in [
        FIRST_SECRET.trim(),
        SECOND_SECRET.trim(),
        RECOVERY_PASSPHRASE,
    ] {
        assert!(
            !output.contains(secret),
            "output exposed a fictional secret value"
        );
    }
}

fn assert_vault_contains_no_plaintext(root: &Path) {
    for entry in walkdir::WalkDir::new(root) {
        let entry = entry.expect("walk isolated vault");
        if !entry.file_type().is_file() {
            continue;
        }
        let contents = fs::read(entry.path()).expect("read vault object");
        assert_no_secret_values(&String::from_utf8_lossy(&contents));
    }
}
