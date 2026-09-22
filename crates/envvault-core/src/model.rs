use std::path::PathBuf;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

pub const FORMAT_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultConfig {
    pub format_version: u32,
    pub recipient: String,
    pub vault_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalState {
    pub vault_path: PathBuf,
    #[serde(default)]
    pub projects: Vec<Project>,
    pub remote: Option<RemoteConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub root: PathBuf,
    pub included: Vec<PathBuf>,
    #[serde(default)]
    pub excluded: Vec<PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ScannedFile {
    pub relative_path: PathBuf,
    pub size: u64,
    pub modified: Option<DateTime<Utc>>,
    pub selected_by_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupManifest {
    pub format_version: u32,
    pub backup_id: String,
    pub project_id: String,
    pub project_name: String,
    pub created_at: DateTime<Utc>,
    pub files: Vec<ManifestFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManifestFile {
    pub relative_path: PathBuf,
    pub blob_id: String,
    pub plaintext_size: u64,
    pub sha256: String,
    pub modified: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupSummary {
    pub id: String,
    pub project_id: String,
    pub project_name: String,
    pub created_at: DateTime<Utc>,
    pub file_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestorePlan {
    pub project_name: String,
    pub backup_id: String,
    pub destination: PathBuf,
    pub paths: Vec<PathBuf>,
    pub collisions: Vec<PathBuf>,
    pub restoring_to_original: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum VerifyStatus {
    Healthy,
    Incomplete,
    Corrupt,
    WrongKey,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifyReport {
    pub status: VerifyStatus,
    pub backups_checked: usize,
    pub blobs_checked: usize,
    pub failures: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub remote_path: String,
    pub private_key: PathBuf,
    pub host_key_sha256: String,
}
