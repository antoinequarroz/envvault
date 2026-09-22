use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::Path;

use tempfile::NamedTempFile;

use crate::Result;

pub fn atomic_write(path: &Path, bytes: &[u8], mode: u32) -> Result<()> {
    let parent = path.parent().ok_or(crate::Error::UnsafePath)?;
    fs::create_dir_all(parent)?;
    let mut temp = NamedTempFile::new_in(parent)?;
    set_mode(temp.as_file(), mode)?;
    temp.write_all(bytes)?;
    temp.as_file_mut().sync_all()?;
    temp.persist(path).map_err(|error| error.error)?;
    sync_dir(parent)?;
    Ok(())
}

pub fn create_new_atomic(path: &Path, bytes: &[u8], mode: u32) -> Result<()> {
    if path.exists() {
        return Err(crate::Error::Collision(path.to_path_buf()));
    }
    let parent = path.parent().ok_or(crate::Error::UnsafePath)?;
    fs::create_dir_all(parent)?;
    let temp = parent.join(format!(".tmp-{}", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)?;
        set_mode(&file, mode)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        fs::rename(&temp, path)?;
        sync_dir(parent)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

#[cfg(unix)]
fn set_mode(file: &File, mode: u32) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    file.set_permissions(fs::Permissions::from_mode(mode))
}

#[cfg(not(unix))]
fn set_mode(_file: &File, _mode: u32) -> std::io::Result<()> {
    Ok(())
}

fn sync_dir(path: &Path) -> Result<()> {
    File::open(path)?.sync_all()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use tempfile::tempdir;

    use super::*;

    #[test]
    fn atomic_write_replaces_complete_file() {
        let dir = tempdir().expect("tempdir");
        let path = dir.path().join("state");
        atomic_write(&path, b"old", 0o600).expect("first write");
        atomic_write(&path, b"new-complete-value", 0o600).expect("replacement");
        assert_eq!(fs::read(path).expect("read"), b"new-complete-value");
    }

    #[test]
    fn create_new_never_overwrites() {
        let dir = tempdir().expect("tempdir");
        let path = dir.path().join("immutable");
        create_new_atomic(&path, b"first", 0o600).expect("create");
        assert!(matches!(
            create_new_atomic(&path, b"second", 0o600),
            Err(crate::Error::Collision(_))
        ));
        assert_eq!(fs::read(path).expect("read"), b"first");
    }
}
