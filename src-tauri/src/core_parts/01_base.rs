mod coding_tools;
mod generation;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use futures_util::{future::join_all, StreamExt};
use kothok_edge_tts::{init_tls, EdgeTts, Engine as TtsEngine, TtsEvent};
use regex::Regex;
use semver::Version;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::{
    collections::{HashMap, HashSet},
    env, fs,
    net::IpAddr,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::Arc,
    time::{Duration, Instant},
};
use sysinfo::System;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::{oneshot, Mutex};
use url::Url;
use uuid::Uuid;

const OLLAMA_API: &str = "http://127.0.0.1:11434/api";
const COMFYUI_API: &str = "http://127.0.0.1:8188";
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ContentEngineStatus {
    installed: bool,
    running: bool,
    name: String,
    endpoint: String,
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

#[derive(Debug, Deserialize)]
struct ShowResponse {
    #[serde(default)]
    capabilities: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct InstalledModel {
    name: String,
    size: u64,
    modified_at: String,
    parameter_size: Option<String>,
    quantization: Option<String>,
    capabilities: Vec<String>,
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
    computer_enabled: bool,
    workspace_directory: Option<String>,
    custom_instructions: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OllamaResponse {
    message: OllamaResponseMessage,
    eval_count: Option<f64>,
    eval_duration: Option<f64>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
struct OllamaResponseMessage {
    #[serde(default = "assistant_role")]
    role: String,
    #[serde(default)]
    content: String,
    #[serde(default)]
    thinking: String,
    #[serde(default)]
    tool_calls: Vec<OllamaToolCall>,
}

#[derive(Debug, Deserialize)]
struct OllamaStreamChunk {
    #[serde(default)]
    message: OllamaResponseMessage,
    #[serde(default)]
    eval_count: Option<f64>,
    #[serde(default)]
    eval_duration: Option<f64>,
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
    kind: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolRun {
    id: String,
    name: String,
    label: String,
    status: String,
    detail: Option<String>,
    duration_ms: Option<u64>,
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
    reasoning_seconds: Option<f64>,
    error: Option<String>,
    tool: Option<ToolRun>,
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
    asset_name: Option<String>,
    asset_size: Option<u64>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GitHubReleaseInfo {
    tag_name: String,
    #[serde(default)]
    assets: Vec<GitHubReleaseAsset>,
}

#[derive(Debug, Clone, Deserialize)]
struct GitHubReleaseAsset {
    name: String,
    #[serde(default)]
    size: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateProgress {
    status: String,
    downloaded: u64,
    total: u64,
    percent: f64,
    done: bool,
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
            reasoning_seconds: None,
            error: None,
            tool: None,
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
            reasoning_seconds: None,
            error: Some(error.to_string()),
            tool: None,
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
