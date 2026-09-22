//! EnvVault's reusable, UI-independent core.

pub mod crypto;
pub mod error;
pub mod model;
pub mod remote;
pub mod scan;
pub mod storage;
pub mod vault;

pub use error::{Error, Result};
pub use model::*;
pub use remote::SftpRemote;
pub use scan::{ScanOptions, scan};
pub use vault::{KeyringSecretStore, SecretStore, Vault};
