use std::fs;
use std::path::PathBuf;
use std::sync::Arc;

use directories::ProjectDirs;
use envvault_core::{
    BackupSummary, KeyringSecretStore, LocalState, Project, RestorePlan, ScanOptions, ScannedFile,
    Vault, VerifyReport, scan,
};
use serde::Serialize;

#[derive(Serialize)]
struct Dashboard {
    initialized: bool,
    projects: Vec<Project>,
    backups: Vec<BackupSummary>,
    remote_configured: bool,
}

fn paths() -> Result<(PathBuf, PathBuf), String> {
    let dirs = ProjectDirs::from("dev", "EnvVault", "EnvVault")
        .ok_or_else(|| "platform directories are unavailable".to_owned())?;
    Ok((
        dirs.config_dir().join("state.json"),
        dirs.data_dir().join("vault"),
    ))
}

fn load_state() -> Result<LocalState, String> {
    let (path, _) = paths()?;
    let bytes = fs::read(path).map_err(|_| "EnvVault is not initialized".to_owned())?;
    serde_json::from_slice(&bytes).map_err(|_| "local configuration is invalid".to_owned())
}

fn save_state(state: &LocalState) -> Result<(), String> {
    let (path, _) = paths()?;
    let bytes = serde_json::to_vec_pretty(state).map_err(|_| "configuration failed".to_owned())?;
    envvault_core::storage::atomic_write(&path, &bytes, 0o600).map_err(|e| e.to_string())
}

fn vault(state: &LocalState) -> Vault {
    Vault::new(&state.vault_path, Arc::new(KeyringSecretStore))
}

#[tauri::command]
fn dashboard() -> Result<Dashboard, String> {
    let state = match load_state() {
        Ok(state) => state,
        Err(_) => {
            return Ok(Dashboard {
                initialized: false,
                projects: vec![],
                backups: vec![],
                remote_configured: false,
            });
        }
    };
    let backups = vault(&state).history(None).map_err(|e| e.to_string())?;
    Ok(Dashboard {
        initialized: true,
        projects: state.projects.clone(),
        backups,
        remote_configured: state.remote.is_some(),
    })
}

#[tauri::command]
fn init_vault() -> Result<(), String> {
    let (state_path, vault_path) = paths()?;
    if state_path.exists() {
        return Err("EnvVault is already initialized".into());
    }
    Vault::new(&vault_path, Arc::new(KeyringSecretStore))
        .init()
        .map_err(|e| e.to_string())?;
    save_state(&LocalState {
        vault_path,
        projects: vec![],
        remote: None,
    })
}

#[tauri::command]
fn scan_project(path: String) -> Result<Vec<ScannedFile>, String> {
    scan(PathBuf::from(path).as_path(), &ScanOptions::default()).map_err(|e| e.to_string())
}

#[tauri::command]
fn add_project(name: String, path: String, selected: Vec<String>) -> Result<(), String> {
    if name.trim().is_empty() || selected.is_empty() {
        return Err("a name and at least one file are required".into());
    }
    let root = PathBuf::from(path)
        .canonicalize()
        .map_err(|_| "project directory is unavailable".to_owned())?;
    let detected = scan(&root, &ScanOptions::default()).map_err(|e| e.to_string())?;
    let included: Vec<PathBuf> = selected.into_iter().map(PathBuf::from).collect();
    if included
        .iter()
        .any(|candidate| !detected.iter().any(|f| &f.relative_path == candidate))
    {
        return Err("selection includes an undetected path".into());
    }
    let mut state = load_state()?;
    if state.projects.iter().any(|project| project.root == root) {
        return Err("project already exists".into());
    }
    state.projects.push(Project {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        root,
        included,
        excluded: vec![],
    });
    save_state(&state)
}

fn project<'a>(state: &'a LocalState, id: &str) -> Result<&'a Project, String> {
    state
        .projects
        .iter()
        .find(|project| project.id == id)
        .ok_or_else(|| "project was not found".into())
}

#[tauri::command]
fn backup_project(project_id: String) -> Result<BackupSummary, String> {
    let state = load_state()?;
    vault(&state)
        .backup(project(&state, &project_id)?)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn project_history(project_id: String) -> Result<Vec<BackupSummary>, String> {
    let state = load_state()?;
    vault(&state)
        .history(Some(&project_id))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn verify_vault() -> Result<VerifyReport, String> {
    let state = load_state()?;
    vault(&state).verify().map_err(|e| e.to_string())
}

#[tauri::command]
fn plan_restore(
    project_id: String,
    backup_id: Option<String>,
    destination: String,
) -> Result<RestorePlan, String> {
    let state = load_state()?;
    vault(&state)
        .plan_restore(
            project(&state, &project_id)?,
            backup_id.as_deref(),
            PathBuf::from(destination).as_path(),
        )
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn execute_restore(
    project_id: String,
    backup_id: String,
    destination: String,
    overwrite: bool,
    confirmed: bool,
) -> Result<usize, String> {
    if !confirmed {
        return Err("explicit confirmation is required".into());
    }
    let state = load_state()?;
    vault(&state)
        .restore(
            project(&state, &project_id)?,
            &backup_id,
            PathBuf::from(destination).as_path(),
            overwrite,
        )
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            dashboard,
            init_vault,
            scan_project,
            add_project,
            backup_project,
            project_history,
            verify_vault,
            plan_restore,
            execute_restore
        ])
        .run(tauri::generate_context!())
        .expect("failed to run EnvVault desktop");
}
