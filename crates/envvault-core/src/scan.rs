use std::collections::HashSet;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::SystemTime;

use chrono::{DateTime, Utc};
use walkdir::{DirEntry, WalkDir};

use crate::{Error, Result, ScannedFile};

const IGNORED_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "build",
    "dist",
    ".cache",
    ".next",
    ".turbo",
];
const TEMPLATES: &[&str] = &[".env.example", ".env.sample", ".env.template"];

#[derive(Debug, Clone, Default)]
pub struct ScanOptions {
    pub include: Vec<PathBuf>,
    pub exclude: Vec<PathBuf>,
}

fn is_ignored(entry: &DirEntry) -> bool {
    entry.file_type().is_dir()
        && entry
            .file_name()
            .to_str()
            .is_some_and(|name| IGNORED_DIRS.contains(&name))
}

pub fn safe_relative(path: &Path) -> Result<()> {
    if path.as_os_str().is_empty() || path.is_absolute() {
        return Err(Error::UnsafePath);
    }
    if path.components().any(|part| {
        matches!(
            part,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) {
        return Err(Error::UnsafePath);
    }
    Ok(())
}

pub fn scan(root: &Path, options: &ScanOptions) -> Result<Vec<ScannedFile>> {
    let root = root.canonicalize()?;
    if !root.is_dir() {
        return Err(Error::InvalidData);
    }
    let includes: HashSet<_> = options.include.iter().cloned().collect();
    let excludes: HashSet<_> = options.exclude.iter().cloned().collect();
    let mut files = Vec::new();
    for entry in WalkDir::new(&root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| !is_ignored(entry))
    {
        let entry = entry.map_err(|error| Error::Io(error.into()))?;
        if entry.file_type().is_symlink() || !entry.file_type().is_file() {
            continue;
        }
        let relative = entry
            .path()
            .strip_prefix(&root)
            .map_err(|_| Error::UnsafePath)?
            .to_path_buf();
        safe_relative(&relative)?;
        if excludes.contains(&relative) {
            continue;
        }
        let Some(name) = entry.file_name().to_str() else {
            continue;
        };
        let detected = name == ".env" || name.starts_with(".env.");
        if !detected && !includes.contains(&relative) {
            continue;
        }
        let metadata = fs::symlink_metadata(entry.path())?;
        let modified = metadata.modified().ok().map(system_time_to_utc);
        files.push(ScannedFile {
            relative_path: relative.clone(),
            size: metadata.len(),
            modified,
            selected_by_default: !TEMPLATES.contains(&name) || includes.contains(&relative),
        });
    }
    files.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    Ok(files)
}

fn system_time_to_utc(value: SystemTime) -> DateTime<Utc> {
    value.into()
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use super::*;

    #[test]
    fn detects_env_and_ignores_templates_and_build_dirs() {
        let dir = tempdir().expect("tempdir");
        fs::write(dir.path().join(".env"), "A=fake").expect("write");
        fs::write(dir.path().join(".env.example"), "A=example").expect("write");
        fs::create_dir(dir.path().join("node_modules")).expect("mkdir");
        fs::write(dir.path().join("node_modules/.env"), "NO=fake").expect("write");
        let found = scan(dir.path(), &ScanOptions::default()).expect("scan");
        assert_eq!(found.len(), 2);
        assert!(found[0].selected_by_default);
        assert!(!found[1].selected_by_default);
    }

    #[cfg(unix)]
    #[test]
    fn does_not_follow_symlinks() {
        use std::os::unix::fs::symlink;
        let dir = tempdir().expect("tempdir");
        let outside = tempdir().expect("outside");
        fs::write(outside.path().join(".env"), "OUTSIDE=fake").expect("write");
        symlink(outside.path(), dir.path().join("linked")).expect("symlink");
        assert!(
            scan(dir.path(), &ScanOptions::default())
                .expect("scan")
                .is_empty()
        );
    }

    #[test]
    fn rejects_traversal() {
        assert!(safe_relative(Path::new("../secret")).is_err());
        assert!(safe_relative(Path::new("/secret")).is_err());
    }
}
