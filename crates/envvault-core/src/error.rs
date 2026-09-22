use std::path::PathBuf;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("vault is not initialized")]
    NotInitialized,
    #[error("vault is already initialized")]
    AlreadyInitialized,
    #[error("project was not found")]
    ProjectNotFound,
    #[error("backup was not found")]
    BackupNotFound,
    #[error("destination collision: {0}")]
    Collision(PathBuf),
    #[error("unsafe path in encrypted metadata")]
    UnsafePath,
    #[error("symbolic links are not accepted")]
    Symlink,
    #[error("vault data is corrupt or cannot be decrypted with this key")]
    Crypto,
    #[error("invalid vault data")]
    InvalidData,
    #[error("secret storage is unavailable")]
    SecretStore,
    #[error("remote host key does not match the configured fingerprint")]
    HostKeyMismatch,
    #[error("remote operation failed")]
    Remote,
    #[error("I/O operation failed")]
    Io(#[from] std::io::Error),
    #[error("configuration is invalid")]
    Json(#[from] serde_json::Error),
}

pub type Result<T> = std::result::Result<T, Error>;
