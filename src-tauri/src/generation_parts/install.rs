fn emit_progress(app: &AppHandle, component: &str, status: &str, downloaded: u64, total: u64, done: bool, error: Option<String>) {
    let percent = if total > 0 { (downloaded as f64 / total as f64 * 100.0).clamp(0.0, 100.0) } else if done { 100.0 } else { 0.0 };
    let _ = app.emit("generation-install-progress", InstallProgress {
        component: component.to_string(), status: status.to_string(), downloaded, total, percent, done, error,
    });
}

async fn download_file(client: &Client, app: &AppHandle, component: &str, url: &str, destination: &Path) -> Result<(), String> {
    if destination.is_file() { return Ok(()); }
    if let Some(parent) = destination.parent() { fs::create_dir_all(parent).map_err(|error| error.to_string())?; }
    let temp = destination.with_extension(format!("{}.download", destination.extension().and_then(|v| v.to_str()).unwrap_or("part")));
    let response = client.get(url).send().await.map_err(|error| format!("Не удалось начать загрузку {component}: {error}"))?.error_for_status().map_err(|error| error.to_string())?;
    let total = response.content_length().unwrap_or(0);
    let mut stream = response.bytes_stream();
    let mut file = File::create(&temp).map_err(|error| error.to_string())?;
    let mut downloaded = 0u64;
    emit_progress(app, component, "Скачиваем", 0, total, false, None);
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| error.to_string())?;
        file.write_all(&chunk).map_err(|error| error.to_string())?;
        downloaded += chunk.len() as u64;
        emit_progress(app, component, "Скачиваем", downloaded, total, false, None);
    }
    file.flush().map_err(|error| error.to_string())?;
    fs::rename(&temp, destination).map_err(|error| error.to_string())?;
    emit_progress(app, component, "Готово", downloaded, total, true, None);
    Ok(())
}

#[cfg(windows)]
fn find_7zip() -> Option<PathBuf> {
    [env::var("ProgramFiles").ok(), env::var("ProgramFiles(x86)").ok()]
        .into_iter().flatten().map(|root| PathBuf::from(root).join("7-Zip/7z.exe")).find(|path| path.is_file())
        .or_else(|| Command::new("where").arg("7z.exe").output().ok().filter(|o| o.status.success()).and_then(|o| String::from_utf8(o.stdout).ok()).and_then(|s| s.lines().next().map(PathBuf::from)))
}

#[cfg(windows)]
fn ensure_7zip() -> Result<PathBuf, String> {
    if let Some(path) = find_7zip() { return Ok(path); }
    let mut command = hidden_command(Path::new("winget.exe"));
    let status = command.args(["install", "--id", "7zip.7zip", "-e", "--silent", "--accept-package-agreements", "--accept-source-agreements"])
        .status().map_err(|error| format!("7-Zip нужен для распаковки ComfyUI, но winget не запустился: {error}"))?;
    if !status.success() { return Err("Не удалось автоматически установить 7-Zip через winget.".to_string()); }
    find_7zip().ok_or_else(|| "7-Zip установлен, но 7z.exe не найден.".to_string())
}

#[cfg(windows)]
fn extract_archive(archive: &Path, destination: &Path) -> Result<(), String> {
    let seven = ensure_7zip()?;
    fs::create_dir_all(destination).map_err(|error| error.to_string())?;
    let output_arg = format!("-o{}", destination.display());
    let status = hidden_command(&seven).args(["x", archive.to_string_lossy().as_ref(), &output_arg, "-y"]).status().map_err(|error| error.to_string())?;
    if status.success() { Ok(()) } else { Err("7-Zip не смог распаковать архив.".to_string()) }
}

fn gpu_portable_url() -> &'static str {
    #[cfg(windows)]
    {
        if Command::new("nvidia-smi").stdout(Stdio::null()).stderr(Stdio::null()).status().map(|s| s.success()).unwrap_or(false) { return COMFY_NVIDIA_URL; }
        if let Ok(output) = Command::new("powershell.exe").args(["-NoProfile", "-Command", "(Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name) -join ';'"]).output() {
            let names = String::from_utf8_lossy(&output.stdout).to_ascii_lowercase();
            if names.contains("amd") || names.contains("radeon") { return COMFY_AMD_URL; }
            if names.contains("intel") { return COMFY_INTEL_URL; }
        }
        COMFY_NVIDIA_URL
    }
    #[cfg(not(windows))]
    { COMFY_NVIDIA_URL }
}

#[tauri::command]
pub async fn install_comfyui(app: AppHandle) -> Result<GenerationStatus, String> {
    #[cfg(not(windows))]
    {
        let _ = app;
        return Err("Автоустановка ComfyUI в Galen 0.5 сейчас поддерживается на Windows. На Linux Galen автоматически подхватит уже установленный ComfyUI.".to_string());
    }
    #[cfg(windows)]
    {
        let client = Client::builder().redirect(reqwest::redirect::Policy::limited(10)).build().map_err(|e| e.to_string())?;
        if discover_comfy_root().is_none() {
            let base = managed_root().ok_or_else(|| "Не удалось определить LOCALAPPDATA".to_string())?;
            fs::create_dir_all(&base).map_err(|error| error.to_string())?;
            let archive = base.join("comfyui-portable.7z");
            download_file(&client, &app, "ComfyUI", gpu_portable_url(), &archive).await?;
            emit_progress(&app, "ComfyUI", "Распаковываем", 0, 0, false, None);
            extract_archive(&archive, &base)?;
            let _ = fs::remove_file(&archive);
        }
        let root = discover_comfy_root().ok_or_else(|| "ComfyUI распакован, но main.py не найден.".to_string())?;
        install_gguf_node(&client, &app, &root).await?;
        start_process(&root)?;
        for _ in 0..180 {
            tokio::time::sleep(Duration::from_millis(500)).await;
            if health(&client).await { break; }
        }
        let result = status(&client).await;
        if !result.running { return Err("ComfyUI установлен, но не запустился. Проверь драйвер GPU и свободное место.".to_string()); }
        Ok(result)
    }
}

#[tauri::command]
pub async fn start_comfyui_engine() -> Result<GenerationStatus, String> {
    let client = Client::new();
    ensure_running(&client).await?;
    Ok(status(&client).await)
}

#[tauri::command]
pub async fn get_generation_status() -> Result<GenerationStatus, String> {
    Ok(status(&Client::new()).await)
}

#[cfg(windows)]
async fn install_gguf_node(client: &Client, app: &AppHandle, root: &Path) -> Result<(), String> {
    let nodes = root.join("custom_nodes");
    let target = nodes.join("ComfyUI-GGUF");
    if target.join("__init__.py").is_file() { return Ok(()); }
    fs::create_dir_all(&nodes).map_err(|error| error.to_string())?;
    let zip = nodes.join("ComfyUI-GGUF.zip");
    download_file(client, app, "ComfyUI-GGUF", GGUF_NODE_ZIP, &zip).await?;
    extract_archive(&zip, &nodes)?;
    let extracted = nodes.join("ComfyUI-GGUF-main");
    if extracted.exists() && !target.exists() { fs::rename(&extracted, &target).map_err(|error| error.to_string())?; }
    let _ = fs::remove_file(&zip);
    if let Some(python) = portable_python(root) {
        let requirements = target.join("requirements.txt");
        if requirements.is_file() {
            let status = hidden_command(&python).args(["-s", "-m", "pip", "install", "-r", requirements.to_string_lossy().as_ref()]).status().map_err(|e| e.to_string())?;
            if !status.success() { return Err("Не удалось установить Python-зависимости ComfyUI-GGUF.".to_string()); }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn install_generation_pack(pack: String, app: AppHandle) -> Result<GenerationStatus, String> {
    let client = Client::builder().redirect(reqwest::redirect::Policy::limited(12)).build().map_err(|e| e.to_string())?;
    let root = ensure_running(&client).await.or_else(|_| discover_comfy_root().ok_or_else(|| "Сначала установи ComfyUI.".to_string()))?;
    let models = root.join("models");
    match pack.as_str() {
        "image" => {
            #[cfg(windows)]
            install_gguf_node(&client, &app, &root).await?;
            #[cfg(not(windows))]
            if !root.join("custom_nodes/ComfyUI-GGUF").exists() {
                return Err("Для Qwen Rapid установи city96/ComfyUI-GGUF в custom_nodes, затем повтори установку пакета.".to_string());
            }
            download_file(&client, &app, "Qwen Rapid AIO v19", QWEN_GGUF_URL, &models.join("unet/Qwen-Rapid-AIO-NSFW-v19_Q4_K.gguf")).await?;
            download_file(&client, &app, "Qwen 2.5 VL encoder", QWEN_CLIP_URL, &models.join("text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors")).await?;
            download_file(&client, &app, "Qwen Image VAE", QWEN_VAE_URL, &models.join("vae/qwen_image_vae.safetensors")).await?;
        }
        "video" => {
            let diffusion = models.join("diffusion_models");
            let files = [
                ("WAN I2V high", "wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors"),
                ("WAN I2V low", "wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors"),
                ("WAN T2V high", "wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors"),
                ("WAN T2V low", "wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors"),
            ];
            for (label, name) in files {
                let url = format!("{WAN_REPO}/diffusion_models/{name}?download=true");
                download_file(&client, &app, label, &url, &diffusion.join(name)).await?;
            }
            download_file(&client, &app, "WAN UMT5 encoder", WAN_CLIP_URL, &models.join("text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors")).await?;
            download_file(&client, &app, "WAN VAE", WAN_VAE_URL, &models.join("vae/wan_2.1_vae.safetensors")).await?;
        }
        _ => return Err("Неизвестный generation pack. Доступны image и video.".to_string()),
    }
    let _ = client.post(format!("{COMFYUI_API}/free")).json(&json!({"unload_models": true, "free_memory": true})).send().await;
    emit_progress(&app, &format!("{pack}-pack"), "Установлено. Если это первый image-pack, перезапусти ComfyUI один раз для загрузки GGUF node.", 1, 1, true, None);
    Ok(status(&client).await)
}

fn get_model(status: &GenerationStatus, key: &str) -> Result<String, String> {
    status.models.get(key).and_then(|value| value.clone()).ok_or_else(|| format!("Не найдена модель {key}"))
}

fn random_seed() -> u64 {
    let bytes = Uuid::new_v4().into_bytes();
    u64::from_le_bytes(bytes[0..8].try_into().unwrap()) & 0x7fff_ffff_ffff_ffff
}
