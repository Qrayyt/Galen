use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use futures_util::StreamExt;
use reqwest::{multipart, Client};
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    env, fs,
    fs::File,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::Duration,
};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

pub const COMFYUI_API: &str = "http://127.0.0.1:8188";

const COMFY_NVIDIA_URL: &str = "https://github.com/comfyanonymous/ComfyUI/releases/latest/download/ComfyUI_windows_portable_nvidia.7z";
const COMFY_AMD_URL: &str = "https://github.com/comfyanonymous/ComfyUI/releases/latest/download/ComfyUI_windows_portable_amd.7z";
const COMFY_INTEL_URL: &str = "https://github.com/comfyanonymous/ComfyUI/releases/latest/download/ComfyUI_windows_portable_intel.7z";

const QWEN_GGUF_URL: &str = "https://huggingface.co/Novice25/Qwen-Image-Edit-Rapid-AIO-GGUF/resolve/main/v19/Qwen-Rapid-AIO-NSFW-v19_Q4_K.gguf?download=true";
const QWEN_CLIP_URL: &str = "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors?download=true";
const QWEN_VAE_URL: &str = "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors?download=true";
const GGUF_NODE_ZIP: &str = "https://github.com/city96/ComfyUI-GGUF/archive/refs/heads/main.zip";

const WAN_REPO: &str = "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files";
const WAN_CLIP_URL: &str = "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors?download=true";
const WAN_VAE_URL: &str = "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors?download=true";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationStatus {
    pub installed: bool,
    pub running: bool,
    pub root: Option<String>,
    pub endpoint: String,
    pub image_ready: bool,
    pub video_i2v_ready: bool,
    pub video_t2v_ready: bool,
    pub qwen_loader: Option<String>,
    pub models: HashMap<String, Option<String>>,
    pub missing_image: Vec<String>,
    pub missing_video_i2v: Vec<String>,
    pub missing_video_t2v: Vec<String>,
    pub missing_nodes: Vec<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallProgress {
    pub component: String,
    pub status: String,
    pub downloaded: u64,
    pub total: u64,
    pub percent: f64,
    pub done: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedMedia {
    pub kind: String,
    pub name: String,
    pub mime: String,
    pub path: String,
    pub data_url: Option<String>,
    pub engine: String,
}

#[derive(Clone, Copy)]
struct ModelSpec {
    key: &'static str,
    class: &'static str,
    input: &'static str,
    candidates: &'static [&'static str],
}

const MODEL_SPECS: &[ModelSpec] = &[
    ModelSpec { key: "qwen_clip", class: "CLIPLoader", input: "clip_name", candidates: &["qwen_2.5_vl_7b_fp8_scaled.safetensors"] },
    ModelSpec { key: "qwen_vae", class: "VAELoader", input: "vae_name", candidates: &["qwen_image_vae.safetensors"] },
    ModelSpec { key: "wan_i2v_high", class: "UNETLoader", input: "unet_name", candidates: &["Wan2.2_Remix_NSFW_i2v_14b_high_lighting_fp8_e4m3fn_v3.0.safetensors", "wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors"] },
    ModelSpec { key: "wan_i2v_low", class: "UNETLoader", input: "unet_name", candidates: &["Wan2.2_Remix_NSFW_i2v_14b_low_lighting_fp8_e4m3fn_v3.0.safetensors", "wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors"] },
    ModelSpec { key: "wan_t2v_high", class: "UNETLoader", input: "unet_name", candidates: &["Wan2.2_Remix_NSFW_t2v_14b_high_lighting_v2.0.safetensors", "wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors"] },
    ModelSpec { key: "wan_t2v_low", class: "UNETLoader", input: "unet_name", candidates: &["Wan2.2_Remix_NSFW_t2v_14b_low_lighting_v2.0.safetensors", "wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors"] },
    ModelSpec { key: "wan_clip", class: "CLIPLoader", input: "clip_name", candidates: &["nsfw_wan_umt5-xxl_fp8_scaled.safetensors", "umt5_xxl_fp8_e4m3fn_scaled.safetensors"] },
    ModelSpec { key: "wan_vae", class: "VAELoader", input: "vae_name", candidates: &["split_files/vae/wan_2.1_vae.safetensors", "wan_2.1_vae.safetensors"] },
];

fn managed_root() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        env::var("LOCALAPPDATA").ok().map(|value| PathBuf::from(value).join("Galen").join("ComfyUI"))
    }
    #[cfg(not(windows))]
    {
        env::var("HOME").ok().map(|value| PathBuf::from(value).join(".local/share/Galen/ComfyUI"))
    }
}

fn generated_root() -> PathBuf {
    #[cfg(windows)]
    {
        if let Ok(value) = env::var("LOCALAPPDATA") {
            return PathBuf::from(value).join("Galen").join("generated");
        }
    }
    #[cfg(not(windows))]
    {
        if let Ok(value) = env::var("HOME") {
            return PathBuf::from(value).join(".local/share/Galen/generated");
        }
    }
    env::temp_dir().join("Galen-generated")
}

fn normalize_root(candidate: PathBuf) -> Option<PathBuf> {
    if candidate.join("main.py").is_file() { return Some(candidate); }
    let nested = candidate.join("ComfyUI");
    if nested.join("main.py").is_file() { return Some(nested); }
    let portable = candidate.join("ComfyUI_windows_portable").join("ComfyUI");
    if portable.join("main.py").is_file() { return Some(portable); }
    None
}

pub fn discover_comfy_root() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(value) = env::var("COMFYUI_DIR") { candidates.push(PathBuf::from(value)); }
    if let Some(root) = managed_root() { candidates.push(root); }
    if let Ok(home) = env::var("USERPROFILE").or_else(|_| env::var("HOME")) {
        let home = PathBuf::from(home);
        candidates.extend([home.join("Documents/AI/ComfyUI"), home.join("Documents/ComfyUI"), home.join("ComfyUI")]);
    }
    #[cfg(windows)]
    if let Ok(local) = env::var("LOCALAPPDATA") {
        let root = PathBuf::from(local);
        candidates.extend([
            root.join("Programs/ComfyUI"),
            root.join("Programs/ComfyUI Desktop"),
            root.join("ComfyUI"),
        ]);
    }
    candidates.into_iter().find_map(normalize_root)
}

pub fn is_installed() -> bool { discover_comfy_root().is_some() }

fn portable_python(root: &Path) -> Option<PathBuf> {
    let parent = root.parent()?;
    let embedded = parent.join("python_embeded").join(if cfg!(windows) { "python.exe" } else { "python" });
    if embedded.is_file() { return Some(embedded); }
    let candidates = [
        root.join(".venv/Scripts/python.exe"), root.join("venv/Scripts/python.exe"),
        root.join(".venv/bin/python"), root.join("venv/bin/python"),
    ];
    candidates.into_iter().find(|path| path.is_file())
}

fn hidden_command(program: &Path) -> Command {
    let mut command = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command
}

fn start_process(root: &Path) -> Result<(), String> {
    let python = portable_python(root).unwrap_or_else(|| PathBuf::from(if cfg!(windows) { "python.exe" } else { "python3" }));
    let mut command = hidden_command(&python);
    command
        .current_dir(root)
        .args(["-s", "main.py", "--listen", "127.0.0.1", "--port", "8188", "--lowvram", "--preview-method", "none"])
        .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    command.spawn().map_err(|error| format!("Не удалось запустить ComfyUI: {error}"))?;
    Ok(())
}

pub async fn health(client: &Client) -> bool {
    client.get(format!("{COMFYUI_API}/system_stats"))
        .timeout(Duration::from_secs(2)).send().await
        .map(|response| response.status().is_success()).unwrap_or(false)
}

pub async fn ensure_running(client: &Client) -> Result<PathBuf, String> {
    if health(client).await {
        return discover_comfy_root().ok_or_else(|| "ComfyUI отвечает, но его локальная папка не определена".to_string());
    }
    let root = discover_comfy_root().ok_or_else(|| "ComfyUI не установлен. Установи движок в разделе моделей/настроек Galen.".to_string())?;
    start_process(&root)?;
    for _ in 0..180 {
        tokio::time::sleep(Duration::from_millis(500)).await;
        if health(client).await { return Ok(root); }
    }
    Err("ComfyUI найден и запущен, но не начал отвечать на 127.0.0.1:8188 за 90 секунд.".to_string())
}

fn choices(object_info: &Value, class: &str, input: &str) -> Vec<String> {
    object_info.get(class)
        .and_then(|value| value.get("input"))
        .and_then(|value| value.get("required"))
        .and_then(|value| value.get(input))
        .and_then(Value::as_array)
        .and_then(|outer| outer.first())
        .and_then(Value::as_array)
        .map(|values| values.iter().filter_map(Value::as_str).map(str::to_string).collect())
        .unwrap_or_default()
}

fn norm(value: &str) -> String { value.replace('\\', "/").trim().to_ascii_lowercase() }
fn basename(value: &str) -> String { norm(value).rsplit('/').next().unwrap_or_default().to_string() }

fn match_choice(values: &[String], candidates: &[&str]) -> Option<String> {
    for candidate in candidates {
        if let Some(found) = values.iter().find(|value| norm(value) == norm(candidate)) { return Some(found.clone()); }
    }
    for candidate in candidates {
        if let Some(found) = values.iter().find(|value| basename(value) == basename(candidate)) { return Some(found.clone()); }
    }
    None
}

async fn object_info(client: &Client) -> Value {
    match client.get(format!("{COMFYUI_API}/object_info")).timeout(Duration::from_secs(15)).send().await {
        Ok(response) => match response.error_for_status() {
            Ok(response) => response.json::<Value>().await.unwrap_or_else(|_| json!({})),
            Err(_) => json!({}),
        },
        Err(_) => json!({}),
    }
}

fn find_on_disk(root: &Path, candidates: &[&str]) -> Option<String> {
    let models = root.join("models");
    if !models.is_dir() { return None; }
    let wanted = candidates.iter().map(|value| basename(value)).collect::<Vec<_>>();
    let mut stack = vec![models.clone()];
    let mut visited = 0usize;
    while let Some(dir) = stack.pop() {
        if visited > 6000 { break; }
        let entries = match fs::read_dir(&dir) { Ok(value) => value, Err(_) => continue };
        for entry in entries.filter_map(Result::ok) {
            visited += 1;
            let path = entry.path();
            if path.is_dir() { stack.push(path); continue; }
            let name = path.file_name().and_then(|value| value.to_str()).map(basename).unwrap_or_default();
            if wanted.iter().any(|candidate| *candidate == name) {
                return path.strip_prefix(&models).ok().map(|value| value.to_string_lossy().replace('\\', "/"));
            }
        }
    }
    None
}

pub async fn status(client: &Client) -> GenerationStatus {
    let root = discover_comfy_root();
    let running = health(client).await;
    let info = if running { object_info(client).await } else { json!({}) };
    let mut models: HashMap<String, Option<String>> = HashMap::new();
    let gguf_choices = choices(&info, "UnetLoaderGGUF", "unet_name");
    let standard_choices = choices(&info, "UNETLoader", "unet_name");
    let qwen_gguf_candidates = ["Qwen-Rapid-AIO-NSFW-v19_Q4_K.gguf"];
    let qwen_standard_candidates = ["qwen_image_edit_2509_fp8_e4m3fn.safetensors", "qwen_image_edit_fp8_e4m3fn.safetensors"];
    let qwen_gguf = match_choice(&gguf_choices, &qwen_gguf_candidates).or_else(|| root.as_deref().and_then(|r| find_on_disk(r, &qwen_gguf_candidates)));
    let qwen_standard = match_choice(&standard_choices, &qwen_standard_candidates).or_else(|| root.as_deref().and_then(|r| find_on_disk(r, &qwen_standard_candidates)));
    let qwen_loader = if qwen_gguf.is_some() { Some("gguf".to_string()) } else if qwen_standard.is_some() { Some("standard".to_string()) } else { None };
    models.insert("qwen_unet".to_string(), qwen_gguf.or(qwen_standard));
    for spec in MODEL_SPECS {
        let value = match_choice(&choices(&info, spec.class, spec.input), spec.candidates)
            .or_else(|| root.as_deref().and_then(|r| find_on_disk(r, spec.candidates)));
        models.insert(spec.key.to_string(), value);
    }
    let has_node = |name: &str| info.get(name).is_some();
    let image_nodes = ["CLIPLoader", "VAELoader", "TextEncodeQwenImageEditPlus", "KSampler", "VAEDecode", "SaveImage"];
    let mut missing_nodes = image_nodes.iter().filter(|node| !has_node(node)).map(|node| node.to_string()).collect::<Vec<_>>();
    if qwen_loader.as_deref() == Some("gguf") && !has_node("UnetLoaderGGUF") { missing_nodes.push("UnetLoaderGGUF".to_string()); }
    let image_keys = ["qwen_unet", "qwen_clip", "qwen_vae"];
    let i2v_keys = ["wan_i2v_high", "wan_i2v_low", "wan_clip", "wan_vae"];
    let t2v_keys = ["wan_t2v_high", "wan_t2v_low", "wan_clip", "wan_vae"];
    let missing_image = image_keys.iter().filter(|key| models.get(*key).and_then(|v| v.as_ref()).is_none()).map(|v| v.to_string()).collect::<Vec<_>>();
    let missing_video_i2v = i2v_keys.iter().filter(|key| models.get(*key).and_then(|v| v.as_ref()).is_none()).map(|v| v.to_string()).collect::<Vec<_>>();
    let missing_video_t2v = t2v_keys.iter().filter(|key| models.get(*key).and_then(|v| v.as_ref()).is_none()).map(|v| v.to_string()).collect::<Vec<_>>();
    let video_base = ["UNETLoader", "ModelSamplingSD3", "CLIPLoader", "VAELoader", "CLIPTextEncode", "KSamplerAdvanced", "VAEDecode", "CreateVideo", "SaveVideo"];
    let video_nodes_ok = video_base.iter().all(|node| has_node(node));
    let image_nodes_ok = missing_nodes.is_empty();
    let installed = root.is_some();
    let root_display = root.as_ref().map(|value| value.to_string_lossy().to_string());
    GenerationStatus {
        installed, running, root: root_display, endpoint: COMFYUI_API.to_string(),
        image_ready: running && missing_image.is_empty() && image_nodes_ok,
        video_i2v_ready: running && missing_video_i2v.is_empty() && video_nodes_ok && has_node("WanImageToVideo"),
        video_t2v_ready: running && missing_video_t2v.is_empty() && video_nodes_ok && has_node("EmptyHunyuanLatentVideo"),
        qwen_loader, models, missing_image, missing_video_i2v, missing_video_t2v, missing_nodes,
        error: if running { None } else { Some(if installed { "ComfyUI установлен, но не запущен".to_string() } else { "ComfyUI не установлен".to_string() }) },
    }
}
