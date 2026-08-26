use futures_util::StreamExt;
use regex::Regex;
use semver::Version;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    env, fs,
    net::IpAddr,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::Arc,
    time::Duration,
};
use sysinfo::System;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::{oneshot, Mutex};
use url::Url;
use uuid::Uuid;

const OLLAMA_API: &str = "http://127.0.0.1:11434/api";
const REPOSITORY: &str = "Qrayyt/Galen";
const MAX_WEB_CHARS: usize = 18_000;
const MAX_TOOL_OUTPUT: usize = 18_000;

struct AppState {
    client: reqwest::Client,
    approvals: Arc<Mutex<HashMap<String, oneshot::Sender<bool>>>>,
    cancelled: Arc<Mutex<HashSet<String>>>,
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

#[derive(Debug, Clone, Deserialize)]
struct AgentMessage {
    role: String,
    content: String,
    #[serde(default)]
    images: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct MemoryRecord {
    label: String,
    value: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentRequest {
    request_id: String,
    model: String,
    messages: Vec<AgentMessage>,
    memories: Vec<MemoryRecord>,
    reasoning: String,
    web_enabled: bool,
    terminal_enabled: bool,
    workspace_directory: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OllamaResponse {
    message: OllamaResponseMessage,
    eval_count: Option<f64>,
    eval_duration: Option<f64>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct OllamaResponseMessage {
    #[serde(default = "assistant_role")]
    role: String,
    #[serde(default)]
    content: String,
    #[serde(default)]
    tool_calls: Vec<OllamaToolCall>,
}

fn assistant_role() -> String {
    "assistant".to_string()
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct OllamaToolCall {
    function: OllamaFunction,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct OllamaFunction {
    name: String,
    #[serde(default)]
    arguments: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SourceLink {
    title: String,
    url: String,
    snippet: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolApproval {
    request_id: String,
    approval_id: String,
    command: String,
    cwd: Option<String>,
    reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentEvent {
    request_id: String,
    kind: String,
    phase: Option<String>,
    label: Option<String>,
    content: Option<String>,
    sources: Option<Vec<SourceLink>>,
    approval: Option<ToolApproval>,
    tokens_per_second: Option<f64>,
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct MemoryCandidate {
    label: String,
    value: String,
    category: String,
}

#[derive(Debug, Deserialize)]
struct MemoryEnvelope {
    #[serde(default)]
    memories: Vec<MemoryCandidate>,
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

fn emit_status(app: &AppHandle, request_id: &str, phase: &str, label: &str) {
    let _ = app.emit(
        "agent-event",
        AgentEvent {
            request_id: request_id.to_string(),
            kind: "status".to_string(),
            phase: Some(phase.to_string()),
            label: Some(label.to_string()),
            content: None,
            sources: None,
            approval: None,
            tokens_per_second: None,
            error: None,
        },
    );
}

fn emit_error(app: &AppHandle, request_id: &str, error: &str) {
    let _ = app.emit(
        "agent-event",
        AgentEvent {
            request_id: request_id.to_string(),
            kind: "error".to_string(),
            phase: Some("done".to_string()),
            label: None,
            content: None,
            sources: None,
            approval: None,
            tokens_per_second: None,
            error: Some(error.to_string()),
        },
    );
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
        .unwrap_or_else(|_| {
            if cfg!(windows) {
                "Windows Desktop".to_string()
            } else {
                "Linux Desktop".to_string()
            }
        });

    HardwareInfo {
        cpu,
        cpu_cores: system.cpus().len(),
        ram_total_gb,
        gpu,
        vram_gb,
        operating_system: if operating_system.is_empty() {
            env::consts::OS.to_string()
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
            .find(|line| {
                line.contains("VGA compatible controller") || line.contains("3D controller")
            })
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
            let version = response
                .json::<VersionResponse>()
                .await
                .ok()
                .map(|value| value.version);
            OllamaStatus {
                installed: true,
                running: true,
                version,
                error: None,
            }
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
    let tags = state
        .client
        .get(format!("{OLLAMA_API}/tags"))
        .send()
        .await
        .map_err(|error| format!("Ollama недоступна: {error}"))?
        .error_for_status()
        .map_err(|error| error.to_string())?
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
            parameter_size: model
                .details
                .as_ref()
                .and_then(|details| details.parameter_size.clone()),
            quantization: model.details.and_then(|details| details.quantization_level),
        })
        .collect())
}

#[tauri::command]
async fn delete_model(model: String, state: State<'_, AppState>) -> Result<(), String> {
    state
        .client
        .delete(format!("{OLLAMA_API}/delete"))
        .json(&json!({ "model": model }))
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
        .json(&json!({ "model": model, "stream": true }))
        .send()
        .await
        .map_err(|error| format!("Не удалось начать загрузку: {error}"))?
        .error_for_status()
        .map_err(|error| error.to_string())?;
    let mut stream = response.bytes_stream();
    let mut buffer = Vec::<u8>::new();
    while let Some(chunk) = stream.next().await {
        buffer.extend_from_slice(&chunk.map_err(|error| error.to_string())?);
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

fn system_prompt(request: &AgentRequest) -> String {
    let memory = request
        .memories
        .iter()
        .map(|item| format!("- {}: {}", item.label, item.value))
        .collect::<Vec<_>>()
        .join("\n");
    let mode = match request.reasoning.as_str() {
        "light" => "Работай быстро. Используй инструмент только если без него нельзя дать точный ответ.",
        "heavy" => "Проверяй факты тщательно, используй несколько источников, проверяй результаты инструментов и продумывай ответ глубоко.",
        _ => "Сбалансируй скорость и тщательность. Проверяй актуальные факты через веб.",
    };
    let terminal = if cfg!(windows) {
        "Система: Windows. run_terminal запускает cmd.exe; для PowerShell используй powershell -NoProfile -Command \"...\"."
    } else {
        "Система: Linux. run_terminal запускает sh."
    };
    let today = chrono::Local::now().format("%Y-%m-%d");
    format!(
        "Ты Гален — умный персональный AI-агент. Сегодня {today}. Отвечай на языке пользователя, обычно по-русски. Пиши естественно, конкретно и без канцелярита. \
Внутренние рассуждения никогда не показывай пользователю: в финальном ответе должны быть только вывод, полезные детали и результаты. \
{mode} Для актуальных, неизвестных или проверяемых сведений используй web_search, затем при необходимости read_webpage. \
Когда использовал интернет, добавляй ссылки в Markdown рядом с утверждениями. Не выдумывай источники. \
Для взаимодействия с компьютером используй run_terminal. Каждая команда будет отдельно подтверждена пользователем. \
Никогда не говори, что действие выполнено, пока инструмент не вернул успешный результат. {terminal} \
Учитывай прикреплённые документы и изображения. Если текущая модель не поддерживает изображение, честно объясни это.\n\nПамять о пользователе:\n{}",
        if memory.is_empty() { "Пока пуста.".to_string() } else { memory }
    )
}

fn tool_definitions(request: &AgentRequest) -> Vec<Value> {
    let mut tools = Vec::new();
    if request.web_enabled {
        tools.push(json!({
            "type": "function",
            "function": {
                "name": "web_search",
                "description": "Ищет актуальную информацию в интернете. Используй для новостей, текущих фактов, цен, документации и незнакомых тем.",
                "parameters": {
                    "type": "object",
                    "properties": { "query": { "type": "string", "description": "Точный поисковый запрос" } },
                    "required": ["query"]
                }
            }
        }));
        tools.push(json!({
            "type": "function",
            "function": {
                "name": "read_webpage",
                "description": "Читает содержимое найденной веб-страницы по URL.",
                "parameters": {
                    "type": "object",
                    "properties": { "url": { "type": "string" } },
                    "required": ["url"]
                }
            }
        }));
    }
    if request.terminal_enabled {
        tools.push(json!({
            "type": "function",
            "function": {
                "name": "run_terminal",
                "description": "Запускает команду в терминале компьютера после явного подтверждения пользователя.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "command": { "type": "string", "description": "Полная команда для shell" },
                        "cwd": { "type": "string", "description": "Рабочая папка, если нужна" },
                        "reason": { "type": "string", "description": "Коротко зачем нужна команда" }
                    },
                    "required": ["command", "reason"]
                }
            }
        }));
    }
    tools
}

async fn ollama_step(
    state: &AppState,
    request: &AgentRequest,
    messages: &[Value],
    tools: &[Value],
) -> Result<OllamaResponse, String> {
    let (num_ctx, temperature, num_predict, think) = match request.reasoning.as_str() {
        "light" => (8192, 0.55, 2048, false),
        "heavy" => (32768, 0.65, 8192, true),
        _ => (16384, 0.6, 4096, true),
    };
    let mut body = json!({
        "model": request.model,
        "messages": messages,
        "stream": false,
        "think": think,
        "keep_alive": "15m",
        "options": {
            "temperature": temperature,
            "num_ctx": num_ctx,
            "num_predict": num_predict
        }
    });
    if !tools.is_empty() {
        body["tools"] = Value::Array(tools.to_vec());
    }
    state
        .client
        .post(format!("{OLLAMA_API}/chat"))
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("Не удалось обратиться к модели: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Ollama вернула ошибку: {error}"))?
        .json::<OllamaResponse>()
        .await
        .map_err(|error| format!("Не удалось прочитать ответ модели: {error}"))
}

async fn is_cancelled(state: &AppState, request_id: &str) -> bool {
    state.cancelled.lock().await.contains(request_id)
}

fn take_arg(arguments: &Value, key: &str) -> String {
    arguments
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string()
}

#[tauri::command]
async fn agent_chat(
    request: AgentRequest,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.cancelled.lock().await.remove(&request.request_id);
    let mut messages = vec![json!({ "role": "system", "content": system_prompt(&request) })];
    messages.extend(request.messages.iter().map(|message| {
        let mut value = json!({ "role": message.role, "content": message.content });
        if !message.images.is_empty() {
            value["images"] = json!(message.images);
        }
        value
    }));
    let has_images = request
        .messages
        .iter()
        .any(|message| !message.images.is_empty());
    let tools = if has_images {
        Vec::new()
    } else {
        tool_definitions(&request)
    };
    let max_steps = match request.reasoning.as_str() {
        "light" => 2,
        "heavy" => 8,
        _ => 5,
    };
    let mut all_sources: Vec<SourceLink> = Vec::new();

    for _ in 0..max_steps {
        if is_cancelled(&state, &request.request_id).await {
            state.cancelled.lock().await.remove(&request.request_id);
            return Ok(());
        }
        emit_status(&app, &request.request_id, "thinking", "Думаю");
        let reply = match ollama_step(&state, &request, &messages, &tools).await {
            Ok(reply) => reply,
            Err(error) => {
                emit_error(&app, &request.request_id, &error);
                return Err(error);
            }
        };
        let calls = reply.message.tool_calls.clone();
        if calls.is_empty() {
            emit_status(&app, &request.request_id, "writing", "Формулирую ответ");
            let answer = if reply.message.content.trim().is_empty() {
                "Не получилось сформировать ответ. Попробуй переформулировать запрос или выбрать более сильную модель.".to_string()
            } else {
                reply.message.content
            };
            for chunk in chunk_text(&answer, 28) {
                if is_cancelled(&state, &request.request_id).await {
                    return Ok(());
                }
                app.emit(
                    "agent-event",
                    AgentEvent {
                        request_id: request.request_id.clone(),
                        kind: "token".to_string(),
                        phase: Some("writing".to_string()),
                        label: None,
                        content: Some(chunk),
                        sources: None,
                        approval: None,
                        tokens_per_second: None,
                        error: None,
                    },
                )
                .map_err(|error| error.to_string())?;
                tokio::time::sleep(Duration::from_millis(8)).await;
            }
            let speed = match (reply.eval_count, reply.eval_duration) {
                (Some(count), Some(duration)) if duration > 0.0 => {
                    Some(count / (duration / 1_000_000_000.0))
                }
                _ => None,
            };
            if !all_sources.is_empty() {
                app.emit(
                    "agent-event",
                    AgentEvent {
                        request_id: request.request_id.clone(),
                        kind: "sources".to_string(),
                        phase: None,
                        label: None,
                        content: None,
                        sources: Some(deduplicate_sources(all_sources)),
                        approval: None,
                        tokens_per_second: None,
                        error: None,
                    },
                )
                .map_err(|error| error.to_string())?;
            }
            app.emit(
                "agent-event",
                AgentEvent {
                    request_id: request.request_id.clone(),
                    kind: "done".to_string(),
                    phase: Some("done".to_string()),
                    label: Some("Готово".to_string()),
                    content: None,
                    sources: None,
                    approval: None,
                    tokens_per_second: speed,
                    error: None,
                },
            )
            .map_err(|error| error.to_string())?;
            state.cancelled.lock().await.remove(&request.request_id);
            return Ok(());
        }

        messages.push(json!({
            "role": reply.message.role,
            "content": reply.message.content,
            "tool_calls": calls.clone(),
        }));
        for call in calls {
            let name = call.function.name.as_str();
            let result = match name {
                "web_search" if request.web_enabled => {
                    emit_status(&app, &request.request_id, "searching", "Ищу в интернете");
                    let query = take_arg(&call.function.arguments, "query");
                    match web_search(&state.client, &query).await {
                        Ok((text, sources)) => {
                            all_sources.extend(sources);
                            text
                        }
                        Err(error) => format!("Ошибка поиска: {error}"),
                    }
                }
                "read_webpage" if request.web_enabled => {
                    emit_status(&app, &request.request_id, "reading", "Читаю страницу");
                    let url = take_arg(&call.function.arguments, "url");
                    match read_webpage(&state.client, &url).await {
                        Ok((text, source)) => {
                            all_sources.push(source);
                            text
                        }
                        Err(error) => format!("Ошибка чтения страницы: {error}"),
                    }
                }
                "run_terminal" if request.terminal_enabled => {
                    let command = take_arg(&call.function.arguments, "command");
                    let requested_cwd = take_arg(&call.function.arguments, "cwd");
                    let reason = take_arg(&call.function.arguments, "reason");
                    let cwd = if requested_cwd.is_empty() {
                        request.workspace_directory.clone()
                    } else {
                        Some(requested_cwd)
                    };
                    match ask_terminal_approval(&app, &state, &request.request_id, &command, cwd.as_deref(), &reason).await {
                        Ok(true) => {
                            emit_status(&app, &request.request_id, "terminal", "Выполняю команду");
                            run_terminal(&command, cwd.as_deref()).await.unwrap_or_else(|error| format!("Ошибка команды: {error}"))
                        }
                        Ok(false) => "Пользователь отклонил выполнение команды. Не утверждай, что она выполнена.".to_string(),
                        Err(error) => format!("Подтверждение команды не получено: {error}"),
                    }
                }
                _ => format!("Инструмент {name} недоступен."),
            };
            messages.push(json!({ "role": "tool", "tool_name": name, "content": result }));
        }
    }

    let error = "Агент исчерпал лимит шагов. Переключи режим на «Тяжёлый» или уточни задачу.";
    emit_error(&app, &request.request_id, error);
    Err(error.to_string())
}

async fn ask_terminal_approval(
    app: &AppHandle,
    state: &AppState,
    request_id: &str,
    command: &str,
    cwd: Option<&str>,
    reason: &str,
) -> Result<bool, String> {
    let approval_id = Uuid::new_v4().to_string();
    let key = format!("{request_id}:{approval_id}");
    let (sender, receiver) = oneshot::channel();
    state.approvals.lock().await.insert(key.clone(), sender);
    emit_status(app, request_id, "waiting", "Жду подтверждения команды");
    app.emit(
        "agent-event",
        AgentEvent {
            request_id: request_id.to_string(),
            kind: "approval".to_string(),
            phase: Some("waiting".to_string()),
            label: Some("Нужно подтверждение".to_string()),
            content: None,
            sources: None,
            approval: Some(ToolApproval {
                request_id: request_id.to_string(),
                approval_id: approval_id.clone(),
                command: command.to_string(),
                cwd: cwd.map(str::to_string),
                reason: if reason.is_empty() {
                    None
                } else {
                    Some(reason.to_string())
                },
            }),
            tokens_per_second: None,
            error: None,
        },
    )
    .map_err(|error| error.to_string())?;
    let resolved = tokio::time::timeout(Duration::from_secs(300), receiver).await;
    state.approvals.lock().await.remove(&key);
    match resolved {
        Ok(Ok(value)) => Ok(value),
        Ok(Err(_)) => Err("канал подтверждения закрыт".to_string()),
        Err(_) => Err("время подтверждения истекло".to_string()),
    }
}

#[tauri::command]
async fn resolve_tool_approval(
    request_id: String,
    approval_id: String,
    approved: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let key = format!("{request_id}:{approval_id}");
    let sender = state
        .approvals
        .lock()
        .await
        .remove(&key)
        .ok_or_else(|| "Запрос подтверждения уже закрыт".to_string())?;
    sender
        .send(approved)
        .map_err(|_| "Не удалось передать подтверждение".to_string())
}

#[tauri::command]
async fn cancel_agent(request_id: String, state: State<'_, AppState>) -> Result<(), String> {
    state.cancelled.lock().await.insert(request_id.clone());
    let prefix = format!("{request_id}:");
    let keys = state
        .approvals
        .lock()
        .await
        .keys()
        .filter(|key| key.starts_with(&prefix))
        .cloned()
        .collect::<Vec<_>>();
    let mut approvals = state.approvals.lock().await;
    for key in keys {
        if let Some(sender) = approvals.remove(&key) {
            let _ = sender.send(false);
        }
    }
    Ok(())
}

async fn run_terminal(command: &str, cwd: Option<&str>) -> Result<String, String> {
    if command.trim().is_empty() {
        return Err("Пустая команда".to_string());
    }
    let mut process = if cfg!(windows) {
        let mut value = tokio::process::Command::new("cmd.exe");
        value.args(["/D", "/S", "/C", command]);
        value
    } else {
        let mut value = tokio::process::Command::new("sh");
        value.args(["-lc", command]);
        value
    };
    process.kill_on_drop(true);
    if let Some(directory) = cwd.filter(|value| !value.trim().is_empty()) {
        let path = PathBuf::from(directory);
        if !path.is_dir() {
            return Err(format!("Рабочая папка не найдена: {directory}"));
        }
        process.current_dir(path);
    }
    let output = tokio::time::timeout(Duration::from_secs(120), process.output())
        .await
        .map_err(|_| "Команда остановлена по таймауту 120 секунд".to_string())?
        .map_err(|error| error.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined = format!(
        "Код завершения: {}\n\nSTDOUT:\n{}\n\nSTDERR:\n{}",
        output.status.code().unwrap_or(-1),
        stdout,
        stderr
    );
    Ok(truncate(&combined, MAX_TOOL_OUTPUT))
}

async fn web_search(
    client: &reqwest::Client,
    query: &str,
) -> Result<(String, Vec<SourceLink>), String> {
    if query.trim().is_empty() {
        return Err("Пустой поисковый запрос".to_string());
    }
    let response = client
        .get("https://html.duckduckgo.com/html/")
        .query(&[("q", query)])
        .header("User-Agent", "Mozilla/5.0 (compatible; Galen/0.3)")
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?;
    let html = response.text().await.map_err(|error| error.to_string())?;
    let sources = parse_search_results(&html);
    if sources.is_empty() {
        return Err("Поиск не вернул результатов".to_string());
    }
    let text = sources
        .iter()
        .enumerate()
        .map(|(index, source)| {
            format!(
                "{}. {}\nURL: {}\n{}",
                index + 1,
                source.title,
                source.url,
                source.snippet.clone().unwrap_or_default()
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n");
    Ok((text, sources))
}

fn parse_search_results(html: &str) -> Vec<SourceLink> {
    let link_re =
        Regex::new(r#"(?s)<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>"#).unwrap();
    let snippet_re = Regex::new(r#"(?s)<a[^>]+class="result__snippet"[^>]*>(.*?)</a>|<div[^>]+class="result__snippet"[^>]*>(.*?)</div>"#).unwrap();
    let snippets = snippet_re
        .captures_iter(html)
        .map(|capture| {
            strip_html(
                capture
                    .get(1)
                    .or_else(|| capture.get(2))
                    .map(|m| m.as_str())
                    .unwrap_or_default(),
            )
        })
        .collect::<Vec<_>>();
    link_re
        .captures_iter(html)
        .take(8)
        .enumerate()
        .filter_map(|(index, capture)| {
            let raw_url = html_escape::decode_html_entities(
                capture.get(1).map(|m| m.as_str()).unwrap_or_default(),
            )
            .to_string();
            let url = unwrap_duckduckgo_url(&raw_url);
            validate_public_url(&url).ok()?;
            Some(SourceLink {
                title: strip_html(capture.get(2).map(|m| m.as_str()).unwrap_or_default()),
                url,
                snippet: snippets
                    .get(index)
                    .cloned()
                    .filter(|value| !value.is_empty()),
            })
        })
        .collect()
}

async fn read_webpage(
    client: &reqwest::Client,
    input: &str,
) -> Result<(String, SourceLink), String> {
    let url = validate_public_url(input)?;
    let response = client
        .get(url.clone())
        .header("User-Agent", "Mozilla/5.0 (compatible; Galen/0.3)")
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let final_url = validate_public_url(response.url().as_str())?;
    let response = response
        .error_for_status()
        .map_err(|error| error.to_string())?;
    let mime = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_string();
    if !mime.contains("text") && !mime.contains("json") && !mime.contains("xml") {
        return Err(format!("Неподдерживаемый тип страницы: {mime}"));
    }
    let html = response.text().await.map_err(|error| error.to_string())?;
    let title_re = Regex::new(r"(?is)<title[^>]*>(.*?)</title>").unwrap();
    let title = title_re
        .captures(&html)
        .and_then(|capture| capture.get(1))
        .map(|value| strip_html(value.as_str()))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| final_url.to_string());
    let script_re =
        Regex::new(r"(?is)<(script|style|svg|noscript)[^>]*>.*?</(script|style|svg|noscript)>")
            .unwrap();
    let cleaned = script_re.replace_all(&html, " ");
    let text = truncate(&strip_html(&cleaned), MAX_WEB_CHARS);
    Ok((
        format!("Заголовок: {title}\nURL: {final_url}\n\n{text}"),
        SourceLink {
            title,
            url: final_url.to_string(),
            snippet: Some(truncate(&text, 260)),
        },
    ))
}

fn validate_public_url(input: &str) -> Result<Url, String> {
    let url = Url::parse(input).map_err(|_| "Некорректный URL".to_string())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("Разрешены только http/https ссылки".to_string());
    }
    let host = url
        .host_str()
        .ok_or_else(|| "В URL нет домена".to_string())?
        .to_ascii_lowercase();
    if host == "localhost" || host.ends_with(".local") {
        return Err("Локальные адреса запрещены веб-инструменту".to_string());
    }
    if let Ok(ip) = host.parse::<IpAddr>() {
        let private = match ip {
            IpAddr::V4(value) => {
                value.is_private()
                    || value.is_loopback()
                    || value.is_link_local()
                    || value.is_unspecified()
            }
            IpAddr::V6(value) => {
                value.is_loopback() || value.is_unspecified() || value.is_unique_local()
            }
        };
        if private {
            return Err("Приватные IP-адреса запрещены веб-инструменту".to_string());
        }
    }
    Ok(url)
}

fn unwrap_duckduckgo_url(input: &str) -> String {
    let absolute = if input.starts_with("//") {
        format!("https:{input}")
    } else {
        input.to_string()
    };
    Url::parse(&absolute)
        .ok()
        .and_then(|url| {
            url.query_pairs()
                .find(|(key, _)| key == "uddg")
                .map(|(_, value)| value.to_string())
        })
        .unwrap_or(absolute)
}

fn strip_html(input: &str) -> String {
    let tags = Regex::new(r"(?s)<[^>]+>").unwrap();
    let spaced = tags.replace_all(input, " ");
    html_escape::decode_html_entities(&spaced)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn truncate(input: &str, limit: usize) -> String {
    if input.chars().count() <= limit {
        return input.to_string();
    }
    format!(
        "{}\n…[обрезано]",
        input.chars().take(limit).collect::<String>()
    )
}

fn chunk_text(input: &str, target: usize) -> Vec<String> {
    let mut chunks = Vec::new();
    let mut current = String::new();
    for word in input.split_inclusive(char::is_whitespace) {
        current.push_str(word);
        if current.chars().count() >= target {
            chunks.push(std::mem::take(&mut current));
        }
    }
    if !current.is_empty() {
        chunks.push(current);
    }
    if chunks.is_empty() {
        chunks.push(input.to_string());
    }
    chunks
}

fn deduplicate_sources(sources: Vec<SourceLink>) -> Vec<SourceLink> {
    let mut seen = HashSet::new();
    sources
        .into_iter()
        .filter(|source| seen.insert(source.url.clone()))
        .take(10)
        .collect()
}

#[tauri::command]
async fn extract_memories(
    model: String,
    user_message: String,
    assistant_message: String,
    state: State<'_, AppState>,
) -> Result<Vec<MemoryCandidate>, String> {
    if user_message.trim().is_empty() {
        return Ok(Vec::new());
    }
    let body = json!({
        "model": model,
        "stream": false,
        "think": false,
        "keep_alive": "15m",
        "format": "json",
        "messages": [
            {
                "role": "system",
                "content": "Извлеки только долговременные факты о пользователе, которые пригодятся в других диалогах: имя, предпочтения, постоянные настройки, проекты и важные ограничения. Не сохраняй разовые вопросы, пароли, токены, медицинские и финансовые тайны. Верни строго JSON: {\"memories\":[{\"label\":\"короткое название\",\"value\":\"факт\",\"category\":\"profile|preference|project|other\"}]}. Если сохранять нечего, верни {\"memories\":[]}."
            },
            {
                "role": "user",
                "content": format!("Сообщение пользователя:\n{}\n\nОтвет ассистента:\n{}", truncate(&user_message, 5000), truncate(&assistant_message, 3000))
            }
        ],
        "options": { "temperature": 0.1, "num_ctx": 4096, "num_predict": 600 }
    });
    let response = state
        .client
        .post(format!("{OLLAMA_API}/chat"))
        .json(&body)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .json::<OllamaResponse>()
        .await
        .map_err(|error| error.to_string())?;
    let content = response.message.content;
    let start = content.find('{').unwrap_or(0);
    let end = content
        .rfind('}')
        .map(|value| value + 1)
        .unwrap_or(content.len());
    let parsed =
        serde_json::from_str::<MemoryEnvelope>(&content[start..end]).unwrap_or(MemoryEnvelope {
            memories: Vec::new(),
        });
    Ok(parsed
        .memories
        .into_iter()
        .filter(|item| !item.label.trim().is_empty() && !item.value.trim().is_empty())
        .take(8)
        .collect())
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    validate_public_url(&url)?;
    open::that(url).map_err(|error| error.to_string())
}

#[cfg(windows)]
#[tauri::command]
async fn transcribe_once() -> Result<String, String> {
    let script = r#"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
Add-Type -AssemblyName System.Speech
$culture = [System.Globalization.CultureInfo]::GetCultureInfo('ru-RU')
$recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine($culture)
$recognizer.SetInputToDefaultAudioDevice()
$recognizer.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
$result = $recognizer.Recognize([TimeSpan]::FromSeconds(20))
if ($null -ne $result) { [Console]::Write($result.Text) }
"#;
    let mut process = tokio::process::Command::new("powershell.exe");
    process
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .kill_on_drop(true);
    let output = tokio::time::timeout(Duration::from_secs(25), process.output())
        .await
        .map_err(|_| "Распознавание речи остановлено по таймауту".to_string())?
        .map_err(|error| format!("Не удалось запустить распознавание речи: {error}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() {
        return Err(
            "Речь не распознана. Проверь микрофон и русский речевой пакет Windows.".to_string(),
        );
    }
    Ok(text)
}

#[cfg(not(windows))]
#[tauri::command]
async fn transcribe_once() -> Result<String, String> {
    Err("Нативное распознавание сейчас доступно на Windows".to_string())
}

#[tauri::command]
fn check_for_update() -> UpdateInfo {
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let output = Command::new("gh")
        .args([
            "api",
            &format!("repos/{REPOSITORY}/releases/latest"),
            "--jq",
            ".tag_name",
        ])
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
    let download_dir = app
        .path()
        .temp_dir()
        .map_err(|error| error.to_string())?
        .join("galen-update");
    if download_dir.exists() {
        fs::remove_dir_all(&download_dir).map_err(|error| error.to_string())?;
    }
    fs::create_dir_all(&download_dir).map_err(|error| error.to_string())?;
    let result = Command::new("gh")
        .args([
            "release",
            "download",
            &tag,
            "--repo",
            REPOSITORY,
            "--pattern",
            "*.AppImage",
            "--dir",
        ])
        .arg(&download_dir)
        .arg("--clobber")
        .output()
        .map_err(|error| format!("Не удалось запустить GitHub CLI: {error}"))?;
    if !result.status.success() {
        return Err(String::from_utf8_lossy(&result.stderr).trim().to_string());
    }
    let downloaded = find_appimage(&download_dir)?;
    let pending = appimage.with_extension("AppImage.next");
    fs::copy(&downloaded, &pending)
        .map_err(|error| format!("Не удалось подготовить обновление: {error}"))?;
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
    let mut permissions = fs::metadata(path)
        .map_err(|error| error.to_string())?
        .permissions();
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
    fs::rename(&current, &backup)
        .map_err(|error| format!("Не удалось сохранить предыдущую версию: {error}"))?;
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
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= 5 {
                return attempt.stop();
            }
            if validate_public_url(attempt.url().as_str()).is_ok() {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .build()
        .expect("failed to create HTTP client");
    tauri::Builder::default()
        .manage(AppState {
            client,
            approvals: Arc::new(Mutex::new(HashMap::new())),
            cancelled: Arc::new(Mutex::new(HashSet::new())),
        })
        .invoke_handler(tauri::generate_handler![
            get_hardware_info,
            get_ollama_status,
            start_ollama,
            list_models,
            delete_model,
            pull_model,
            agent_chat,
            resolve_tool_approval,
            cancel_agent,
            extract_memories,
            open_url,
            transcribe_once,
            check_for_update,
            download_update,
            restart_into_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Galen");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocks_local_web_targets() {
        assert!(validate_public_url("http://127.0.0.1/private").is_err());
        assert!(validate_public_url("http://192.168.1.2/admin").is_err());
        assert!(validate_public_url("http://localhost:11434/api/tags").is_err());
    }

    #[test]
    fn accepts_public_https_targets() {
        assert!(validate_public_url("https://example.com/docs?q=galen").is_ok());
    }

    #[test]
    fn unwraps_duckduckgo_redirects() {
        let input = "https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs&rut=test";
        assert_eq!(unwrap_duckduckgo_url(input), "https://example.com/docs");
    }

    #[test]
    fn answer_chunks_round_trip() {
        let answer = "Короткий ответ, который должен появляться плавно и без потери пробелов.";
        assert_eq!(chunk_text(answer, 12).join(""), answer);
    }

    #[test]
    fn parses_duckduckgo_result_markup() {
        let html = r##"<a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs&amp;rut=x">Docs &amp; help</a><a class="result__snippet" href="#">Fresh <b>documentation</b></a>"##;
        let results = parse_search_results(html);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "Docs & help");
        assert_eq!(results[0].url, "https://example.com/docs");
        assert_eq!(results[0].snippet.as_deref(), Some("Fresh documentation"));
    }
}
