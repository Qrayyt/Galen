use std::{
    fs,
    path::{Path, PathBuf},
};

const MAX_READ_CHARS: usize = 48_000;
const MAX_SEARCH_RESULTS: usize = 80;
const MAX_LIST_ENTRIES: usize = 500;

fn workspace_root(workspace: Option<&str>) -> Result<PathBuf, String> {
    let raw = workspace
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Рабочая папка не выбрана. Укажи workspace в настройках Galen.".to_string())?;
    let path = PathBuf::from(raw);
    if !path.is_dir() {
        return Err(format!("Рабочая папка не найдена: {raw}"));
    }
    path.canonicalize().map_err(|error| format!("Не удалось открыть workspace: {error}"))
}

fn resolve_existing(workspace: Option<&str>, input: &str) -> Result<PathBuf, String> {
    let root = workspace_root(workspace)?;
    let requested = if input.trim().is_empty() || input.trim() == "." {
        root.clone()
    } else {
        let path = PathBuf::from(input.trim());
        if path.is_absolute() { path } else { root.join(path) }
    };
    let canonical = requested
        .canonicalize()
        .map_err(|_| format!("Путь не найден: {}", requested.display()))?;
    if !canonical.starts_with(&root) {
        return Err("Файловые инструменты Galen работают только внутри выбранного workspace.".to_string());
    }
    Ok(canonical)
}

fn resolve_writable(workspace: Option<&str>, input: &str) -> Result<PathBuf, String> {
    let root = workspace_root(workspace)?;
    let raw = input.trim();
    if raw.is_empty() {
        return Err("Не указан путь файла".to_string());
    }
    let requested = {
        let path = PathBuf::from(raw);
        if path.is_absolute() { path } else { root.join(path) }
    };
    let parent = requested.parent().ok_or_else(|| "Некорректный путь".to_string())?;
    let parent_existing = if parent.exists() {
        parent.to_path_buf()
    } else {
        let mut cursor = parent;
        loop {
            if cursor.exists() { break cursor.to_path_buf(); }
            cursor = cursor.parent().ok_or_else(|| "Не удалось определить родительскую папку".to_string())?;
        }
    };
    let canonical_parent = parent_existing
        .canonicalize()
        .map_err(|error| format!("Не удалось проверить путь: {error}"))?;
    if !canonical_parent.starts_with(&root) {
        return Err("Запись разрешена только внутри выбранного workspace.".to_string());
    }
    Ok(requested)
}

fn relative(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn ignored(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| matches!(name, ".git" | "node_modules" | "target" | "dist" | "build" | ".next" | ".venv" | "venv" | "__pycache__"))
        .unwrap_or(false)
}

pub fn list_directory(workspace: Option<&str>, input: &str, depth: usize) -> Result<String, String> {
    let root = workspace_root(workspace)?;
    let start = resolve_existing(workspace, input)?;
    if !start.is_dir() {
        return Err(format!("Это не папка: {}", relative(&root, &start)));
    }
    let max_depth = depth.clamp(1, 5);
    let mut lines = Vec::new();
    walk_tree(&root, &start, 0, max_depth, &mut lines)?;
    if lines.is_empty() {
        Ok("Папка пуста.".to_string())
    } else {
        Ok(lines.join("\n"))
    }
}

fn walk_tree(root: &Path, dir: &Path, level: usize, max_depth: usize, out: &mut Vec<String>) -> Result<(), String> {
    if out.len() >= MAX_LIST_ENTRIES || level >= max_depth {
        return Ok(());
    }
    let mut entries = fs::read_dir(dir)
        .map_err(|error| format!("Не удалось прочитать {}: {error}", dir.display()))?
        .filter_map(Result::ok)
        .collect::<Vec<_>>();
    entries.sort_by_key(|entry| (!entry.path().is_dir(), entry.file_name().to_string_lossy().to_ascii_lowercase()));
    for entry in entries {
        if out.len() >= MAX_LIST_ENTRIES { break; }
        let path = entry.path();
        if ignored(&path) { continue; }
        let is_dir = path.is_dir();
        let indent = "  ".repeat(level);
        out.push(format!("{indent}{}{}", relative(root, &path), if is_dir { "/" } else { "" }));
        if is_dir {
            walk_tree(root, &path, level + 1, max_depth, out)?;
        }
    }
    Ok(())
}

pub fn read_file(workspace: Option<&str>, input: &str, start_line: usize, end_line: usize) -> Result<String, String> {
    let root = workspace_root(workspace)?;
    let path = resolve_existing(workspace, input)?;
    if !path.is_file() {
        return Err(format!("Это не файл: {}", relative(&root, &path)));
    }
    let bytes = fs::read(&path).map_err(|error| format!("Не удалось прочитать файл: {error}"))?;
    if bytes.iter().take(4096).any(|byte| *byte == 0) {
        return Err("Похоже на бинарный файл; чтение как текста пропущено.".to_string());
    }
    let text = String::from_utf8_lossy(&bytes);
    let lines = text.lines().collect::<Vec<_>>();
    let from = start_line.max(1).min(lines.len().max(1));
    let to = if end_line == 0 { (from + 399).min(lines.len()) } else { end_line.max(from).min(lines.len()) };
    let mut output = String::new();
    output.push_str(&format!("Файл: {} · строк {}\n", relative(&root, &path), lines.len()));
    for index in from..=to {
        if let Some(line) = lines.get(index - 1) {
            output.push_str(&format!("{index:>5} | {line}\n"));
            if output.chars().count() >= MAX_READ_CHARS {
                output.push_str("… вывод обрезан …\n");
                break;
            }
        }
    }
    Ok(output)
}

pub fn search_files(workspace: Option<&str>, query: &str, input: &str) -> Result<String, String> {
    let needle = query.trim();
    if needle.is_empty() { return Err("Пустой поисковый запрос".to_string()); }
    let root = workspace_root(workspace)?;
    let start = resolve_existing(workspace, input)?;
    let mut results = Vec::new();
    search_path(&root, &start, needle, &mut results)?;
    if results.is_empty() {
        Ok(format!("Совпадений для `{needle}` не найдено."))
    } else {
        Ok(results.join("\n"))
    }
}

fn search_path(root: &Path, path: &Path, needle: &str, out: &mut Vec<String>) -> Result<(), String> {
    if out.len() >= MAX_SEARCH_RESULTS || ignored(path) { return Ok(()); }
    if path.is_dir() {
        for entry in fs::read_dir(path).map_err(|error| error.to_string())?.filter_map(Result::ok) {
            search_path(root, &entry.path(), needle, out)?;
            if out.len() >= MAX_SEARCH_RESULTS { break; }
        }
        return Ok(());
    }
    if !path.is_file() { return Ok(()); }
    let metadata = match fs::metadata(path) { Ok(value) => value, Err(_) => return Ok(()) };
    if metadata.len() > 2_500_000 { return Ok(()); }
    let bytes = match fs::read(path) { Ok(value) => value, Err(_) => return Ok(()) };
    if bytes.iter().take(4096).any(|byte| *byte == 0) { return Ok(()); }
    let text = String::from_utf8_lossy(&bytes);
    let needle_lower = needle.to_lowercase();
    for (index, line) in text.lines().enumerate() {
        if line.to_lowercase().contains(&needle_lower) {
            out.push(format!("{}:{}: {}", relative(root, path), index + 1, line.trim()));
            if out.len() >= MAX_SEARCH_RESULTS { break; }
        }
    }
    Ok(())
}

pub fn write_file(workspace: Option<&str>, input: &str, content: &str) -> Result<String, String> {
    let root = workspace_root(workspace)?;
    let path = resolve_writable(workspace, input)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("Не удалось создать папку: {error}"))?;
    }
    fs::write(&path, content).map_err(|error| format!("Не удалось записать файл: {error}"))?;
    Ok(format!("Записан файл {} ({} байт).", relative(&root, &path), content.len()))
}

pub fn replace_in_file(workspace: Option<&str>, input: &str, find: &str, replace: &str, replace_all: bool) -> Result<String, String> {
    if find.is_empty() { return Err("Строка поиска не может быть пустой".to_string()); }
    let root = workspace_root(workspace)?;
    let path = resolve_existing(workspace, input)?;
    if !path.is_file() { return Err("Указанный путь не является файлом".to_string()); }
    let text = fs::read_to_string(&path).map_err(|error| format!("Не удалось прочитать файл: {error}"))?;
    let count = text.matches(find).count();
    if count == 0 { return Err("Точный фрагмент для замены не найден. Сначала перечитай актуальные строки файла.".to_string()); }
    if count > 1 && !replace_all {
        return Err(format!("Фрагмент встречается {count} раз. Уточни более уникальный контекст или явно включи replaceAll."));
    }
    let next = if replace_all { text.replace(find, replace) } else { text.replacen(find, replace, 1) };
    fs::write(&path, next).map_err(|error| format!("Не удалось записать файл: {error}"))?;
    Ok(format!("Обновлён {} · замен: {}.", relative(&root, &path), if replace_all { count } else { 1 }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_workspace() -> PathBuf {
        let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let root = std::env::temp_dir().join(format!("galen-coding-tools-{stamp}"));
        fs::create_dir_all(root.join("src")).unwrap();
        fs::write(root.join("src/main.rs"), "fn main() {\n    println!(\"hi\");\n}\n").unwrap();
        root
    }

    #[test]
    fn reads_and_searches_workspace() {
        let root = temp_workspace();
        let workspace = root.to_string_lossy().to_string();
        assert!(read_file(Some(&workspace), "src/main.rs", 1, 2).unwrap().contains("println"));
        assert!(search_files(Some(&workspace), "println", ".").unwrap().contains("src/main.rs:2"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_escape_from_workspace() {
        let root = temp_workspace();
        let workspace = root.to_string_lossy().to_string();
        assert!(resolve_existing(Some(&workspace), "..").is_err());
        let _ = fs::remove_dir_all(root);
    }
}
