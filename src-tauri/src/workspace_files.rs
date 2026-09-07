//! File operations confined to an explicitly selected workspace.
use std::{fs, io::{Read, Write}, path::{Component, Path, PathBuf}};

const LIMIT: usize = 1024 * 1024;

pub fn resolve(root: &str, relative: &str) -> Result<PathBuf, String> {
    let root = fs::canonicalize(root).map_err(|e| e.to_string())?;
    if !root.is_dir() { return Err("Рабочая папка не существует".into()); }
    let path = Path::new(relative);
    if path.is_absolute() || path.components().any(|c| !matches!(c, Component::Normal(_))) {
        return Err("Нужен относительный путь внутри рабочей папки".into());
    }
    for part in path.components() {
        let name = part.as_os_str().to_string_lossy().to_lowercase();
        if name.starts_with('.') || matches!(name.as_str(), "credentials" | "id_rsa" | "id_ed25519") || name.ends_with(".key") || name.contains(':') {
            return Err("Этот путь требует отдельного доступа и недоступен файловому инструменту".into());
        }
    }
    let target = root.join(path);
    let parent = target.parent().ok_or("Нет родительской папки")?;
    let parent = fs::canonicalize(parent).map_err(|e| e.to_string())?;
    if !parent.starts_with(&root) { return Err("Выход за рабочую папку запрещён".into()); }
    if let Ok(meta) = fs::symlink_metadata(&target) {
        if meta.file_type().is_symlink() { return Err("Символические ссылки не разрешены".into()); }
        if !fs::canonicalize(&target).map_err(|e| e.to_string())?.starts_with(&root) {
            return Err("Выход за рабочую папку запрещён".into());
        }
    }
    Ok(parent.join(target.file_name().ok_or("Не указано имя файла")?))
}

pub fn read(root: &str, relative: &str) -> Result<String, String> {
    let path = resolve(root, relative)?;
    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    if !file.metadata().map_err(|e| e.to_string())?.is_file() { return Err("Не обычный файл".into()); }
    let mut bytes = Vec::new();
    file.take((LIMIT + 1) as u64).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
    if bytes.len() > LIMIT { return Err("Максимум 1 МиБ для текстового файла".into()); }
    String::from_utf8(bytes).map_err(|_| "Файл не является UTF-8 текстом".into())
}

/// Publish a complete new file without overwriting an existing destination.
pub fn create(root: &str, relative: &str, content: &str) -> Result<PathBuf, String> {
    if content.len() > LIMIT { return Err("Максимум 1 МиБ для текстового файла".into()); }
    let path = resolve(root, relative)?;
    let temp = path.with_file_name(format!(".galen-{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut file = fs::OpenOptions::new().write(true).create_new(true).open(&temp).map_err(|e| e.to_string())?;
        file.write_all(content.as_bytes()).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        drop(file);
        // A hard link is atomic and fails if another file already occupies path.
        fs::hard_link(&temp, &path).map_err(|e| format!("Не удалось создать файл без перезаписи: {e}"))?;
        if read(root, relative)? != content { return Err("Проверка содержимого не пройдена".into()); }
        Ok(path)
    })();
    let _ = fs::remove_file(temp);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn creates_verified_unicode_file_without_overwriting() {
        let dir = std::env::temp_dir().join(format!("galen-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&dir).unwrap();
        let root = dir.to_str().unwrap();
        create(root, "пример.txt", "Привет мир\n  Отступ").unwrap();
        assert_eq!(read(root, "пример.txt").unwrap(), "Привет мир\n  Отступ");
        assert!(create(root, "пример.txt", "replacement").is_err());
        assert!(resolve(root, "../escape").is_err());
        assert!(resolve(root, ".env").is_err());
        assert!(resolve(root, "file:stream").is_err());
        fs::remove_file(dir.join("пример.txt")).unwrap();
        fs::remove_dir(dir).unwrap();
    }
}
