use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::{Context, Result, anyhow, bail};
use clap::{Args, Parser, Subcommand};
use directories::ProjectDirs;
use envvault_core::{
    KeyringSecretStore, LocalState, Project, RemoteConfig, ScanOptions, SftpRemote, Vault, scan,
};
use secrecy::SecretString;

#[derive(Parser)]
#[command(
    name = "envvault",
    version,
    about = "Encrypted local backups for .env files"
)]
struct Cli {
    #[arg(long, global = true)]
    state: Option<PathBuf>,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    Init {
        #[arg(long)]
        vault: Option<PathBuf>,
    },
    Scan {
        path: PathBuf,
        #[arg(long)]
        json: bool,
    },
    Project {
        #[command(subcommand)]
        command: ProjectCommand,
    },
    Backup {
        project: String,
        #[arg(long)]
        json: bool,
    },
    List {
        #[arg(long)]
        json: bool,
    },
    History {
        project: String,
        #[arg(long)]
        json: bool,
    },
    Restore(RestoreArgs),
    Verify {
        #[arg(long)]
        json: bool,
    },
    Recovery {
        #[command(subcommand)]
        command: RecoveryCommand,
    },
    Remote {
        #[command(subcommand)]
        command: RemoteCommand,
    },
    Sync {
        #[command(subcommand)]
        command: SyncCommand,
    },
}

#[derive(Subcommand)]
enum ProjectCommand {
    Add {
        path: PathBuf,
        #[arg(long)]
        name: Option<String>,
        #[arg(long = "include")]
        include: Vec<PathBuf>,
        #[arg(long = "exclude")]
        exclude: Vec<PathBuf>,
        #[arg(long)]
        yes: bool,
    },
}

#[derive(Args)]
struct RestoreArgs {
    project: String,
    #[arg(long)]
    version: Option<String>,
    #[arg(long)]
    destination: Option<PathBuf>,
    #[arg(long)]
    overwrite: bool,
    #[arg(long)]
    yes: bool,
}

#[derive(Subcommand)]
enum RecoveryCommand {
    Export { path: PathBuf },
    Import { path: PathBuf },
}

#[derive(Subcommand)]
enum RemoteCommand {
    Configure {
        #[arg(long)]
        host: String,
        #[arg(long, default_value_t = 22)]
        port: u16,
        #[arg(long)]
        username: String,
        #[arg(long)]
        remote_path: String,
        #[arg(long)]
        private_key: PathBuf,
        #[arg(long)]
        host_key: String,
    },
}

#[derive(Subcommand)]
enum SyncCommand {
    Push,
    Pull,
}

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .without_time()
        .with_target(false)
        .init();
    if let Err(error) = run(Cli::parse()) {
        eprintln!("envvault: {error}");
        std::process::exit(1);
    }
}

fn run(cli: Cli) -> Result<()> {
    let state_path = cli.state.unwrap_or(default_state_path()?);
    match cli.command {
        Command::Init { vault } => {
            if state_path.exists() {
                bail!("local configuration already exists");
            }
            let vault_path = vault.unwrap_or(default_vault_path()?);
            Vault::new(&vault_path, Arc::new(KeyringSecretStore)).init()?;
            save_state(
                &state_path,
                &LocalState {
                    vault_path,
                    projects: vec![],
                    remote: None,
                },
            )?;
            println!("Vault initialized. Export a recovery key before relying on backups.");
        }
        Command::Scan { path, json } => {
            let found = scan(&path, &ScanOptions::default())?;
            if json {
                println!("{}", serde_json::to_string_pretty(&found)?);
            } else {
                for file in found {
                    let status = if file.selected_by_default {
                        "secret candidate"
                    } else {
                        "template (not selected)"
                    };
                    println!(
                        "{}\t{} bytes\t{}\t{}",
                        file.relative_path.display(),
                        file.size,
                        file.modified
                            .map(|v| v.to_rfc3339())
                            .unwrap_or_else(|| "unknown".into()),
                        status
                    );
                }
            }
        }
        command => {
            let mut state = load_state(&state_path)?;
            let vault = Vault::new(&state.vault_path, Arc::new(KeyringSecretStore));
            dispatch(command, &state_path, &mut state, &vault)?;
        }
    }
    Ok(())
}

fn dispatch(
    command: Command,
    state_path: &Path,
    state: &mut LocalState,
    vault: &Vault,
) -> Result<()> {
    match command {
        Command::Project {
            command:
                ProjectCommand::Add {
                    path,
                    name,
                    include,
                    exclude,
                    yes,
                },
        } => {
            let root = path
                .canonicalize()
                .context("project directory is unavailable")?;
            if state.projects.iter().any(|p| p.root == root) {
                bail!("project is already configured");
            }
            let found = scan(
                &root,
                &ScanOptions {
                    include,
                    exclude: exclude.clone(),
                },
            )?;
            let selected: Vec<_> = found
                .iter()
                .filter(|f| f.selected_by_default)
                .map(|f| f.relative_path.clone())
                .collect();
            if selected.is_empty() {
                bail!("no selected .env files were found");
            }
            println!("Selected files:");
            for path in &selected {
                println!("  {}", path.display());
            }
            if !yes && !confirm("Add this project with exactly this selection? [y/N] ")? {
                bail!("cancelled");
            }
            let project_name = name.unwrap_or_else(|| {
                root.file_name()
                    .and_then(|v| v.to_str())
                    .unwrap_or("project")
                    .to_owned()
            });
            state.projects.push(Project {
                id: uuid::Uuid::new_v4().to_string(),
                name: project_name,
                root,
                included: selected,
                excluded: exclude,
            });
            save_state(state_path, state)?;
            println!("Project added. No backup was created yet.");
        }
        Command::Backup { project, json } => {
            print_value(&vault.backup(find_project(state, &project)?)?, json)?
        }
        Command::List { json } => print_value(&vault.history(None)?, json)?,
        Command::History { project, json } => {
            let project = find_project(state, &project)?;
            print_value(&vault.history(Some(&project.id))?, json)?;
        }
        Command::Restore(args) => {
            let project = find_project(state, &args.project)?;
            let destination = args.destination.unwrap_or_else(|| project.root.clone());
            let plan = vault.plan_restore(project, args.version.as_deref(), &destination)?;
            println!(
                "Backup: {}\nDestination: {}\nFiles:",
                plan.backup_id,
                plan.destination.display()
            );
            for path in &plan.paths {
                println!(
                    "  {}{}",
                    path.display(),
                    if plan.collisions.contains(path) {
                        " [exists]"
                    } else {
                        ""
                    }
                );
            }
            if !plan.collisions.is_empty() && !args.overwrite {
                bail!("collisions detected; use --overwrite only after reviewing the preview");
            }
            if !args.yes {
                print!("Type RESTORE to continue: ");
                io::stdout().flush()?;
                let mut input = String::new();
                io::stdin().read_line(&mut input)?;
                if input.trim() != "RESTORE" {
                    bail!("cancelled");
                }
            }
            let count = vault.restore(project, &plan.backup_id, &destination, args.overwrite)?;
            println!("Restored {count} file(s) with restrictive permissions.");
        }
        Command::Verify { json } => {
            let report = vault.verify()?;
            print_value(&report, json)?;
            if report.failures > 0 {
                bail!("verification did not pass");
            }
        }
        Command::Recovery { command } => match command {
            RecoveryCommand::Export { path } => {
                let first = rpassword::prompt_password("Recovery passphrase: ")?;
                let second = rpassword::prompt_password("Repeat recovery passphrase: ")?;
                if first.len() < 12 || first != second {
                    bail!("passphrases must match and contain at least 12 characters");
                }
                vault.export_recovery(&path, SecretString::from(first))?;
                println!("Encrypted recovery file created. Store it separately from the vault.");
            }
            RecoveryCommand::Import { path } => {
                let passphrase = rpassword::prompt_password("Recovery passphrase: ")?;
                vault.import_recovery(&path, SecretString::from(passphrase))?;
                println!("Recovery identity imported into the system keyring.");
            }
        },
        Command::Remote {
            command:
                RemoteCommand::Configure {
                    host,
                    port,
                    username,
                    remote_path,
                    private_key,
                    host_key,
                },
        } => {
            if !host_key.starts_with("SHA256:") || !private_key.is_file() {
                bail!("an exact SHA256 host key and an existing private-key file are required");
            }
            state.remote = Some(RemoteConfig {
                host,
                port,
                username,
                remote_path,
                private_key,
                host_key_sha256: host_key,
            });
            save_state(state_path, state)?;
            println!("Remote configured. Unknown host keys are never accepted automatically.");
        }
        Command::Sync { command } => {
            let remote = state
                .remote
                .clone()
                .ok_or_else(|| anyhow!("remote is not configured"))?;
            let backend = SftpRemote::new(remote);
            let count = match command {
                SyncCommand::Push => backend.push(vault.root())?,
                SyncCommand::Pull => backend.pull(vault.root())?,
            };
            println!("Transferred {count} encrypted object(s).");
        }
        Command::Init { .. } | Command::Scan { .. } => unreachable!("handled before state loading"),
    }
    Ok(())
}

fn find_project<'a>(state: &'a LocalState, needle: &str) -> Result<&'a Project> {
    state
        .projects
        .iter()
        .find(|p| p.id == needle || p.name == needle)
        .ok_or_else(|| anyhow!("project was not found"))
}

fn default_state_path() -> Result<PathBuf> {
    let dirs = ProjectDirs::from("dev", "EnvVault", "EnvVault")
        .ok_or_else(|| anyhow!("platform configuration directory is unavailable"))?;
    Ok(dirs.config_dir().join("state.json"))
}

fn default_vault_path() -> Result<PathBuf> {
    let dirs = ProjectDirs::from("dev", "EnvVault", "EnvVault")
        .ok_or_else(|| anyhow!("platform data directory is unavailable"))?;
    Ok(dirs.data_dir().join("vault"))
}

fn load_state(path: &Path) -> Result<LocalState> {
    let bytes = fs::read(path).context("EnvVault is not initialized; run `envvault init`")?;
    serde_json::from_slice(&bytes).context("local configuration is invalid")
}

fn save_state(path: &Path, state: &LocalState) -> Result<()> {
    envvault_core::storage::atomic_write(path, &serde_json::to_vec_pretty(state)?, 0o600)?;
    Ok(())
}

fn confirm(prompt: &str) -> Result<bool> {
    print!("{prompt}");
    io::stdout().flush()?;
    let mut answer = String::new();
    io::stdin().read_line(&mut answer)?;
    Ok(matches!(answer.trim(), "y" | "Y" | "yes" | "YES"))
}

fn print_value<T: serde::Serialize + std::fmt::Debug>(value: &T, json: bool) -> Result<()> {
    if json {
        println!("{}", serde_json::to_string_pretty(value)?);
    } else {
        println!("{value:#?}");
    }
    Ok(())
}
