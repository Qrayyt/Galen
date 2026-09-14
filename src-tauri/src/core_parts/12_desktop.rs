use std::hash::{Hash, Hasher};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct InstalledApplication {
    id: String,
    name: String,
    path: String,
    source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CommandRunResult {
    command: String,
    shell: String,
    cwd: Option<String>,
    exit_code: i32,
    success: bool,
    stdout: String,
    stderr: String,
    duration_ms: u64,
    truncated: bool,
}

fn application_id(path: &Path) -> String {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    path.to_string_lossy().to_ascii_lowercase().hash(&mut hasher);
    format!("app-{:016x}", hasher.finish())
}

fn friendly_app_name(path: &Path) -> String {
    path.file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("Приложение")
        .replace(['_', '-'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn is_app_candidate(path: &Path) -> bool {
    let extension = path.extension().and_then(|value| value.to_str()).unwrap_or_default().to_ascii_lowercase();
    let allowed = if cfg!(windows) { ["lnk", "url", "exe"].contains(&extension.as_str()) } else { extension == "desktop" };
    if !allowed { return false; }
    let name = friendly_app_name(path).to_ascii_lowercase();
    !["uninstall", "удалить", "readme", "release notes", "help", "website"].iter().any(|word| name.contains(word))
}

fn collect_apps(root: &Path, source: &str, max_depth: usize, output: &mut Vec<InstalledApplication>) {
    if !root.is_dir() { return; }
    let mut stack = vec![(root.to_path_buf(), 0usize)];
    while let Some((directory, depth)) = stack.pop() {
        if output.len() >= 700 { break; }
        let entries = match fs::read_dir(directory) { Ok(entries) => entries, Err(_) => continue };
        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            if path.is_dir() && depth < max_depth { stack.push((path, depth + 1)); continue; }
            if !is_app_candidate(&path) { continue; }
            output.push(InstalledApplication {
                id: application_id(&path),
                name: friendly_app_name(&path),
                path: path.to_string_lossy().to_string(),
                source: source.to_string(),
            });
        }
    }
}

fn discover_applications() -> Vec<InstalledApplication> {
    let mut applications = Vec::new();
    #[cfg(windows)]
    {
        if let Ok(value) = env::var("APPDATA") {
            collect_apps(&PathBuf::from(value).join("Microsoft/Windows/Start Menu/Programs"), "Пользователь", 6, &mut applications);
        }
        if let Ok(value) = env::var("PROGRAMDATA") {
            collect_apps(&PathBuf::from(value).join("Microsoft/Windows/Start Menu/Programs"), "Для всех", 6, &mut applications);
        }
        if let Ok(value) = env::var("LOCALAPPDATA") {
            collect_apps(&PathBuf::from(value).join("Microsoft/WindowsApps"), "Windows", 1, &mut applications);
        }
    }
    #[cfg(not(windows))]
    {
        collect_apps(Path::new("/usr/share/applications"), "Система", 2, &mut applications);
        collect_apps(Path::new("/usr/local/share/applications"), "Локально", 2, &mut applications);
        if let Ok(value) = env::var("HOME") {
            collect_apps(&PathBuf::from(value).join(".local/share/applications"), "Пользователь", 2, &mut applications);
        }
    }
    applications.sort_by(|left, right| left.name.to_ascii_lowercase().cmp(&right.name.to_ascii_lowercase()));
    let mut names = HashSet::new();
    applications.retain(|application| names.insert(application.name.to_ascii_lowercase()));
    applications
}

fn search_applications(query: &str, limit: usize) -> Vec<InstalledApplication> {
    let needle = query.trim().to_lowercase();
    let mut applications = discover_applications();
    if !needle.is_empty() {
        applications.retain(|application| application.name.to_lowercase().contains(&needle));
        applications.sort_by_key(|application| {
            let name = application.name.to_lowercase();
            if name == needle { 0 } else if name.starts_with(&needle) { 1 } else { 2 }
        });
    }
    applications.truncate(limit.clamp(1, 100));
    applications
}

fn open_discovered_application(app_id: &str) -> Result<InstalledApplication, String> {
    let application = discover_applications().into_iter()
        .find(|application| application.id == app_id)
        .ok_or_else(|| "Приложение больше не найдено. Обнови список и попробуй снова.".to_string())?;
    #[cfg(windows)]
    open::that(&application.path).map_err(|error| format!("Не удалось открыть {}: {error}", application.name))?;
    #[cfg(not(windows))]
    {
        let desktop_id = Path::new(&application.path).file_name().and_then(|value| value.to_str()).ok_or_else(|| "Некорректный desktop-файл".to_string())?;
        Command::new("gtk-launch").arg(desktop_id).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn()
            .map_err(|error| format!("Не удалось открыть {}: {error}", application.name))?;
    }
    Ok(application)
}

#[tauri::command]
fn list_applications() -> Vec<InstalledApplication> { discover_applications() }

#[tauri::command]
fn launch_application(app_id: String) -> Result<(), String> {
    open_discovered_application(&app_id).map(|_| ())
}

async fn execute_command_process(
    command: &str,
    cwd: Option<&str>,
    shell: &str,
    timeout_seconds: u64,
) -> Result<CommandRunResult, String> {
    if command.trim().is_empty() { return Err("Пустая команда".to_string()); }
    let normalized_shell = if cfg!(windows) {
        if shell.eq_ignore_ascii_case("cmd") { "cmd" } else { "powershell" }
    } else { "sh" };
    let mut process = if cfg!(windows) && normalized_shell == "cmd" {
        let mut value = tokio::process::Command::new("cmd.exe");
        value.args(["/D", "/S", "/C", command]);
        value
    } else if cfg!(windows) {
        let mut value = tokio::process::Command::new("powershell.exe");
        value.args(["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command]);
        value
    } else {
        let mut value = tokio::process::Command::new("sh");
        value.args(["-lc", command]);
        value
    };
    process.kill_on_drop(true);
    let resolved_cwd = cwd.map(str::trim).filter(|value| !value.is_empty()).map(str::to_string);
    if let Some(directory) = &resolved_cwd {
        let path = PathBuf::from(directory);
        if !path.is_dir() { return Err(format!("Рабочая папка не найдена: {directory}")); }
        process.current_dir(path);
    }
    let started = Instant::now();
    let timeout_seconds = timeout_seconds.clamp(10, 600);
    let output = tokio::time::timeout(Duration::from_secs(timeout_seconds), process.output()).await
        .map_err(|_| format!("Команда остановлена по таймауту {timeout_seconds} секунд"))?
        .map_err(|error| error.to_string())?;
    let stdout_raw = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr_raw = String::from_utf8_lossy(&output.stderr).to_string();
    let truncated = stdout_raw.chars().count() + stderr_raw.chars().count() > MAX_TOOL_OUTPUT;
    let half_limit = MAX_TOOL_OUTPUT / 2;
    Ok(CommandRunResult {
        command: command.to_string(), shell: normalized_shell.to_string(), cwd: resolved_cwd,
        exit_code: output.status.code().unwrap_or(-1), success: output.status.success(),
        stdout: truncate(&stdout_raw, half_limit), stderr: truncate(&stderr_raw, half_limit),
        duration_ms: started.elapsed().as_millis().min(u128::from(u64::MAX)) as u64, truncated,
    })
}

#[tauri::command]
async fn run_command(command: String, cwd: Option<String>, shell: String, timeout_seconds: u64) -> Result<CommandRunResult, String> {
    execute_command_process(&command, cwd.as_deref(), &shell, timeout_seconds).await
}

#[tauri::command]
async fn generate_media(
    prompt: String,
    images: Vec<String>,
    mode: String,
    seconds: u32,
    state: State<'_, AppState>,
) -> Result<generation::GeneratedMedia, String> {
    generation::generate(&state.client, &prompt, &images, &mode, seconds.clamp(2, 8)).await
}

#[cfg(test)]
mod desktop_tests {
    use super::*;

    #[test]
    fn app_names_are_readable_and_filters_remove_uninstallers() {
        assert_eq!(friendly_app_name(Path::new("C:/Apps/Visual_Studio-Code.lnk")), "Visual Studio Code");
        assert!(!is_app_candidate(Path::new("C:/Apps/Uninstall Galen.lnk")));
    }

    #[test]
    fn application_ids_are_stable() {
        let path = Path::new("C:/Apps/Galen.lnk");
        assert_eq!(application_id(path), application_id(path));
    }
}
