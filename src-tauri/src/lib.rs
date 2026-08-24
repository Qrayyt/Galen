use futures_util::StreamExt;
use semver::Version;
use serde::{Deserialize, Serialize};
use std::{
    env,
    fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::Duration,
};
use sysinfo::System;
use tauri::{AppHandle, Emitter, Manager, State};

const OLLAMA_API: &str = "http://127.0.0.1:11434/api";
const REPOSITORY: &str = "Qrayyt/Galen";

struct AppState {
    client: reqwest::Client,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct HardwareInfo {
    cpu: String,
    cpu_cores: usize,
    ram_total_gb: f64,
    gpu: String,
    vram_gb: Option<f64>,
    operating_system: String,
    desktop: String,
    architecture: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OllamaStatus {
    installed: bool,
    running: bool,
    version: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct VersionResponse {
    version: String,
}

#[derive(Debug, Deserialize)]
struct TagsResponse {
    models: Vec<TagModel>,
}

#[derive(Debug, Deserialize)]
struct TagModel {
    name: String,
    size: u64,
    modified_at: String,
    details: Option<TagDetails>,
}

#[derive(Debug, Deserialize)]
struct TagDetails {
    parameter_size: Option<String>,
    quantization_level: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct InstalledModel {
    name: String,
    size: u64,
    modified_at: String,
    parameter_size: Option<String>,
    quantization: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PullChunk {
    status: Option<String>,
    completed: Option<u64>,
    total: Option<u64>,
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PullProgress {
    model: String,
    status: String,
    completed: u64,
    total: u64,
    percent: f64,
    done: bool,
    error: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChatRequest {
    request_id: String,
    model: String,
    messages: Vec<ChatMessage>,
}

#[derive(Debug, Deserialize)]
struct ChatChunk {
    message: Option<ChatChunkMessage>,
    done: Option<bool>,
    error: Option<String>,
    eval_count: Option<f64>,
    eval_duration: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct ChatChunkMessage {
    content: Option<String>,
    thinking: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatToken {
    request_id: String,
    content: String,
    thinking: Option<String>,
    done: bool,
    error: Option<String>,
    tokens_per_second: Option<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateInfo {
    available: bool,
    current_version: String,
    latest_version: Option<String>,
    tag: Option<String>,
    error: Option<String>,
}

#[tauri::command]
fn get_hardware_info() -> HardwareInfo {
    let system = System::new_all();
    let cpu = system
        .cpus()
        .first()
        .map(|item| item.brand().trim().to_string())
        .filter(|item| !item.is_empty())
        .unwrap_or_else(|| "Неизвестный процессор".to_string());
    let ram_total_gb = round_one(system.total_memory() as f64 / 1_073_741_824.0);
    let (gpu, vram_gb) = detect_gpu();
    let operating_system = [System::name(), System::os_version()]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>()
        .join(" ");
    let desktop = env::var("XDG_CURRENT_DESKTOP")
        .or_else(|_| env::var("DESKTOP_SESSION"))
        .unwrap_or_else(|_| "Linux Desktop".to_string());

    HardwareInfo {
        cpu,
        cpu_cores: system.cpus().len(),
        ram_total_gb,
        gpu,
        vram_gb,
        operating_system: if operating_system.is_empty() {
            "Arch Linux".to_string()
        } else {
            operating_system
        },
        desktop,
        architecture: env::consts::ARCH.to_string(),
    }
}

fn detect_gpu() -> (String, Option<f64>) {
    if let Ok(output) = Command::new("nvidia-smi")
        .args([
            "--query-gpu=name,memory.total",
            "--format=csv,noheader,nounits",
        ])
        .output()
    {
        if output.status.success() {
            let line = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .unwrap_or_default()
                .trim()
                .to_string();
            let mut parts = line.rsplitn(2, ',').map(str::trim);
            let memory_mb = parts.next().and_then(|value| value.parse::<f64>().ok());
            let name = parts.next().unwrap_or("NVIDIA GPU").to_string();
            return (name, memory_mb.map(|value| round_one(value / 1024.0)));
        }
    }

    if let Ok(output) = Command::new("lspci").output() {
        let gpu_line = String::from_utf8_lossy(&output.stdout)
            .lines()
            .find(|line| line.contains("VGA compatible controller") || line.contains("3D controller"))
            .unwrap_or_default()
            .split_once(": ")
            .map(|(_, value)| value)
            .unwrap_or("Встроенная графика")
            .to_string();
        return (gpu_line, None);
    }

    ("Встроенная графика".to_string(), None)
}

fn round_one(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

fn ollama_executable() -> PathBuf {
    #[cfg(windows)]
    if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
        let executable = PathBuf::from(local_app_data)
            .join("Programs")
            .join("Ollama")
            .join("ollama.exe");
        if executable.is_file() {
            return executable;
        }
    }

    PathBuf::from("ollama")
}

async fn query_ollama_status(client: &reqwest::Client) -> OllamaStatus {
    let api_result = client
        .get(format!("{OLLAMA_API}/version"))
        .timeout(Duration::from_secs(2))
        .send()
        .await;

    match api_result {
        Ok(response) if response.status().is_success() => {
            let version = response.json::<VersionResponse>().await.ok().map(|value| value.version);
            return OllamaStatus {
                installed: true,
                running: true,
                version,
                error: None,
            };
        }
        result => {
            let installed = Command::new(ollama_executable())
                .arg("--version")
                .output()
                .map(|output| output.status.success())
                .unwrap_or(false);
            let error = match result {
                Ok(response) => format!("Ollama ответила кодом {}", response.status()),
                Err(error) => error.to_string(),
            };

            OllamaStatus {
                installed,
                running: false,
                version: None,
                error: Some(if installed {
                    error
                } else {
                    "Ollama не найдена в PATH и стандартной папке установки".to_string()
                }),
            }
        }
    }
}

#[tauri::command]
async fn get_ollama_status(state: State<'_, AppState>) -> Result<OllamaStatus, String> {
    Ok(query_ollama_status(&state.client).await)
}

#[tauri::command]
async fn start_ollama(state: State<'_, AppState>) -> Result<OllamaStatus, String> {
    let current = query_ollama_status(&state.client).await;
    if current.running || !current.installed {
        return Ok(current);
    }

    Command::new(ollama_executable())
        .arg("serve")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Не удалось запустить Ollama: {error}"))?;

    for _ in 0..20 {
        tokio::time::sleep(Duration::from_millis(250)).await;
        let status = query_ollama_status(&state.client).await;
        if status.running {
            return Ok(status);
        }
    }

    Ok(query_ollama_status(&state.client).await)
}

#[tauri::command]
async fn list_models(state: State<'_, AppState>) -> Result<Vec<InstalledModel>, String> {
    let response = state
        .client
        .get(format!("{OLLAMA_API}/tags"))
        .send()
        .await
        .map_err(|error| format!("Ollama недоступна: {error}"))?
        .error_for_status()
        .map_err(|error| error.to_string())?;
    let tags = response
        .json::<TagsResponse>()
        .await
        .map_err(|error| format!("Не удалось прочитать список моделей: {error}"))?;

    Ok(tags
        .models
        .into_iter()
        .map(|model| InstalledModel {
            name: model.name,
            size: model.size,
            modified_at: model.modified_at,
            parameter_size: model.details.as_ref().and_then(|details| details.parameter_size.clone()),
            quantization: model.details.and_then(|details| details.quantization_level),
        })
        .collect())
}

#[tauri::command]
async fn delete_model(model: String, state: State<'_, AppState>) -> Result<(), String> {
    state
        .client
        .delete(format!("{OLLAMA_API}/delete"))
        .json(&serde_json::json!({ "model": model }))
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
async fn pull_model(
    model: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let response = state
        .client
        .post(format!("{OLLAMA_API}/pull"))
        .json(&serde_json::json!({ "model": model, "stream": true }))
        .send()
        .await
        .map_err(|error| format!("Не удалось начать загрузку: {error}"))?
        .error_for_status()
        .map_err(|error| error.to_string())?;

    let mut stream = response.bytes_stream();
    let mut buffer = Vec::<u8>::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| error.to_string())?;
        buffer.extend_from_slice(&chunk);
        while let Some(position) = buffer.iter().position(|byte| *byte == b'\n') {
            let line = buffer.drain(..=position).collect::<Vec<_>>();
            let line = String::from_utf8_lossy(&line);
            if line.trim().is_empty() {
                continue;
            }
            let update: PullChunk = serde_json::from_str(line.trim())
                .map_err(|error| format!("Некорректный ответ Ollama: {error}"))?;
            let completed = update.completed.unwrap_or_default();
            let total = update.total.unwrap_or_default();
            let status = update.status.unwrap_or_else(|| "Скачиваем".to_string());
            let done = status == "success" || update.error.is_some();
            let percent = if total > 0 {
                (completed as f64 / total as f64 * 100.0).clamp(0.0, 100.0)
            } else if done {
                100.0
            } else {
                0.0
            };
            app.emit(
                "model-pull-progress",
                PullProgress {
                    model: model.clone(),
                    status,
                    completed,
                    total,
                    percent,
                    done,
                    error: update.error.clone(),
                },
            )
            .map_err(|error| error.to_string())?;
            if let Some(error) = update.error {
                return Err(error);
            }
        }
    }
    Ok(())
}

#[tauri::command]
async fn chat(request: ChatRequest, app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let mut messages = vec![ChatMessage {
        role: "system".to_string(),
        content: "Ты Гален — локальный персональный AI-ассистент Ильи. Отвечай на русском языке, конкретно и без канцелярита. Если данных не хватает, говори об этом прямо. Не утверждай, что выполнил действие на компьютере, пока инструмент действительно его не выполнил.".to_string(),
    }];
    messages.extend(request.messages.clone());

    let response = state
        .client
        .post(format!("{OLLAMA_API}/chat"))
        .json(&serde_json::json!({
            "model": request.model,
            "messages": messages,
            "stream": true,
            "keep_alive": "10m",
            "options": { "temperature": 0.65 }
        }))
        .send()
        .await
        .map_err(|error| format!("Не удалось обратиться к модели: {error}"))?
        .error_for_status()
        .map_err(|error| error.to_string())?;

    let mut stream = response.bytes_stream();
    let mut buffer = Vec::<u8>::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| error.to_string())?;
        buffer.extend_from_slice(&chunk);
        while let Some(position) = buffer.iter().position(|byte| *byte == b'\n') {
            let line = buffer.drain(..=position).collect::<Vec<_>>();
            let line = String::from_utf8_lossy(&line);
            if line.trim().is_empty() {
                continue;
            }
            let update: ChatChunk = serde_json::from_str(line.trim())
                .map_err(|error| format!("Некорректный поток модели: {error}"))?;
            let message = update.message;
            let error = update.error.clone();
            let done = update.done.unwrap_or(false) || error.is_some();
            let tokens_per_second = match (update.eval_count, update.eval_duration) {
                (Some(count), Some(duration)) if duration > 0.0 => Some(count / (duration / 1_000_000_000.0)),
                _ => None,
            };
            app.emit(
                "chat-token",
                ChatToken {
                    request_id: request.request_id.clone(),
                    content: message
                        .as_ref()
                        .and_then(|value| value.content.clone())
                        .unwrap_or_default(),
                    thinking: message.and_then(|value| value.thinking),
                    done,
                    error: error.clone(),
                    tokens_per_second,
                },
            )
            .map_err(|error| error.to_string())?;
            if let Some(error) = error {
                return Err(error);
            }
        }
    }
    Ok(())
}

#[tauri::command]
fn check_for_update() -> UpdateInfo {
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let output = Command::new("gh")
        .args(["api", &format!("repos/{REPOSITORY}/releases/latest"), "--jq", ".tag_name"])
        .output();

    let output = match output {
        Ok(value) if value.status.success() => value,
        Ok(value) => {
            return UpdateInfo {
                available: false,
                current_version,
                latest_version: None,
                tag: None,
                error: Some(String::from_utf8_lossy(&value.stderr).trim().to_string()),
            }
        }
        Err(error) => {
            return UpdateInfo {
                available: false,
                current_version,
                latest_version: None,
                tag: None,
                error: Some(format!("GitHub CLI недоступен: {error}")),
            }
        }
    };
    let tag = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let latest_string = tag.trim_start_matches('v').to_string();
    let current = Version::parse(&current_version).ok();
    let latest = Version::parse(&latest_string).ok();
    let available = matches!((current, latest), (Some(current), Some(latest)) if latest > current);
    UpdateInfo {
        available,
        current_version,
        latest_version: Some(latest_string),
        tag: Some(tag),
        error: None,
    }
}

#[tauri::command]
fn download_update(tag: String, app: AppHandle) -> Result<String, String> {
    let appimage = env::var("APPIMAGE")
        .map(PathBuf::from)
        .map_err(|_| "Автообновление доступно для AppImage-сборки".to_string())?;
    let download_dir = app.path().temp_dir().map_err(|error| error.to_string())?.join("galen-update");
    if download_dir.exists() {
        fs::remove_dir_all(&download_dir).map_err(|error| error.to_string())?;
    }
    fs::create_dir_all(&download_dir).map_err(|error| error.to_string())?;
    let result = Command::new("gh")
        .args(["release", "download", &tag, "--repo", REPOSITORY, "--pattern", "*.AppImage", "--dir"])
        .arg(&download_dir)
        .arg("--clobber")
        .output()
        .map_err(|error| format!("Не удалось запустить GitHub CLI: {error}"))?;
    if !result.status.success() {
        return Err(String::from_utf8_lossy(&result.stderr).trim().to_string());
    }
    let downloaded = find_appimage(&download_dir)?;
    let pending = appimage.with_extension("AppImage.next");
    fs::copy(&downloaded, &pending).map_err(|error| format!("Не удалось подготовить обновление: {error}"))?;
    set_executable(&pending)?;
    Ok(pending.to_string_lossy().into_owned())
}

fn find_appimage(directory: &Path) -> Result<PathBuf, String> {
    fs::read_dir(directory)
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .find(|path| path.extension().and_then(|value| value.to_str()) == Some("AppImage"))
        .ok_or_else(|| "В релизе не найден AppImage".to_string())
}

#[cfg(unix)]
fn set_executable(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let mut permissions = fs::metadata(path).map_err(|error| error.to_string())?.permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(path, permissions).map_err(|error| error.to_string())
}

#[cfg(not(unix))]
fn set_executable(_path: &Path) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
fn restart_into_update(path: String, app: AppHandle) -> Result<(), String> {
    let current = env::var("APPIMAGE")
        .map(PathBuf::from)
        .map_err(|_| "Перезапуск обновления доступен для AppImage".to_string())?;
    let pending = PathBuf::from(path);
    if !pending.exists() {
        return Err("Файл обновления не найден".to_string());
    }
    let backup = current.with_extension("AppImage.old");
    if backup.exists() {
        fs::remove_file(&backup).map_err(|error| error.to_string())?;
    }
    fs::rename(&current, &backup).map_err(|error| format!("Не удалось сохранить предыдущую версию: {error}"))?;
    if let Err(error) = fs::rename(&pending, &current) {
        let _ = fs::rename(&backup, &current);
        return Err(format!("Не удалось установить обновление: {error}"));
    }
    set_executable(&current)?;
    Command::new(&current)
        .spawn()
        .map_err(|error| format!("Не удалось запустить новую версию: {error}"))?;
    app.exit(0);
    Ok(())
}

pub fn run() {
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .build()
        .expect("failed to create HTTP client");

    tauri::Builder::default()
        .manage(AppState { client })
        .invoke_handler(tauri::generate_handler![
            get_hardware_info,
            get_ollama_status,
            start_ollama,
            list_models,
            delete_model,
            pull_model,
            chat,
            check_for_update,
            download_update,
            restart_into_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Galen");
}

