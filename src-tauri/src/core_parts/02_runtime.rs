async fn query_ollama_status(client: &reqwest::Client) -> OllamaStatus {
    let api_result = client
        .get(format!("{OLLAMA_API}/version"))
        .timeout(Duration::from_secs(2))
        .send()
        .await;
    match api_result {
        Ok(response) if response.status().is_success() => {
            let version = response.json::<VersionResponse>().await.ok().map(|value| value.version);
            OllamaStatus { installed: true, running: true, version, error: None }
        }
        result => {
            let installed = Command::new(ollama_executable()).arg("--version").output().map(|output| output.status.success()).unwrap_or(false);
            let error = match result { Ok(response) => format!("Ollama ответила кодом {}", response.status()), Err(error) => error.to_string() };
            OllamaStatus { installed, running: false, version: None, error: Some(if installed { error } else { "Ollama не найдена в PATH и стандартной папке установки".to_string() }) }
        }
    }
}

#[tauri::command]
async fn get_ollama_status(state: State<'_, AppState>) -> Result<OllamaStatus, String> { Ok(query_ollama_status(&state.client).await) }

#[tauri::command]
async fn start_ollama(state: State<'_, AppState>) -> Result<OllamaStatus, String> {
    let current = query_ollama_status(&state.client).await;
    if current.running || !current.installed { return Ok(current); }
    Command::new(ollama_executable()).arg("serve").stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().map_err(|error| format!("Не удалось запустить Ollama: {error}"))?;
    for _ in 0..20 {
        tokio::time::sleep(Duration::from_millis(250)).await;
        let status = query_ollama_status(&state.client).await;
        if status.running { return Ok(status); }
    }
    Ok(query_ollama_status(&state.client).await)
}

fn comfyui_installed() -> bool {
    if generation::is_installed() { return true; }
    if Command::new("comfy").arg("--version").stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).status().map(|status| status.success()).unwrap_or(false) { return true; }
    #[cfg(windows)]
    if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
        let root = PathBuf::from(local_app_data);
        let candidates = [root.join("Programs").join("ComfyUI").join("ComfyUI.exe"), root.join("Programs").join("ComfyUI Desktop").join("ComfyUI.exe"), root.join("ComfyUI").join("ComfyUI.exe")];
        if candidates.iter().any(|path| path.is_file()) { return true; }
    }
    false
}

#[tauri::command]
async fn get_comfyui_status(state: State<'_, AppState>) -> Result<ContentEngineStatus, String> {
    let response = state.client.get(format!("{COMFYUI_API}/system_stats")).timeout(Duration::from_secs(2)).send().await;
    let running = response.as_ref().map(|value| value.status().is_success()).unwrap_or(false);
    Ok(ContentEngineStatus { installed: running || comfyui_installed(), running, name: "ComfyUI".to_string(), endpoint: COMFYUI_API.to_string(), error: if running { None } else { Some("ComfyUI не запущен на 127.0.0.1:8188".to_string()) } })
}

#[tauri::command]
fn open_comfyui() -> Result<(), String> { open::that(COMFYUI_API).map_err(|error| format!("Не удалось открыть ComfyUI: {error}")) }

#[tauri::command]
async fn list_models(state: State<'_, AppState>) -> Result<Vec<InstalledModel>, String> {
    let tags = state.client
        .get(format!("{OLLAMA_API}/tags"))
        .timeout(Duration::from_secs(5))
        .send().await
        .map_err(|error| format!("Ollama недоступна: {error}"))?
        .error_for_status().map_err(|error| error.to_string())?
        .json::<TagsResponse>().await
        .map_err(|error| format!("Не удалось прочитать список моделей: {error}"))?;
    let installed = join_all(tags.models.into_iter().map(|model| {
        let client = state.client.clone();
        async move {
            let capabilities = client
                .post(format!("{OLLAMA_API}/show"))
                .json(&json!({ "model": &model.name }))
                .timeout(Duration::from_secs(3))
                .send()
                .await
                .ok()
                .and_then(|response| response.error_for_status().ok());
            let capabilities = match capabilities {
                Some(response) => response.json::<ShowResponse>().await.map(|value| value.capabilities).unwrap_or_default(),
                None => Vec::new(),
            };
            InstalledModel {
                name: model.name,
                size: model.size,
                modified_at: model.modified_at,
                parameter_size: model.details.as_ref().and_then(|details| details.parameter_size.clone()),
                quantization: model.details.and_then(|details| details.quantization_level),
                capabilities,
            }
        }
    })).await;
    Ok(installed)
}

#[tauri::command]
async fn warm_model(model: String, state: State<'_, AppState>) -> Result<(), String> {
    state.client
        .post(format!("{OLLAMA_API}/generate"))
        .json(&json!({ "model": model, "prompt": "", "stream": false, "keep_alive": "30m" }))
        .timeout(Duration::from_secs(180))
        .send()
        .await
        .map_err(|error| format!("Не удалось прогреть модель: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Ollama не прогрела модель: {error}"))?;
    Ok(())
}

#[tauri::command]
async fn delete_model(model: String, state: State<'_, AppState>) -> Result<(), String> {
    state.client.delete(format!("{OLLAMA_API}/delete")).json(&json!({ "model": model })).send().await.map_err(|error| error.to_string())?.error_for_status().map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
async fn pull_model(model: String, app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let response = state.client.post(format!("{OLLAMA_API}/pull")).json(&json!({ "model": model, "stream": true })).send().await.map_err(|error| format!("Не удалось начать загрузку: {error}"))?.error_for_status().map_err(|error| error.to_string())?;
    let mut stream = response.bytes_stream();
    let mut buffer = Vec::<u8>::new();
    while let Some(chunk) = stream.next().await {
        buffer.extend_from_slice(&chunk.map_err(|error| error.to_string())?);
        while let Some(position) = buffer.iter().position(|byte| *byte == b'\n') {
            let line = buffer.drain(..=position).collect::<Vec<_>>();
            let line = String::from_utf8_lossy(&line);
            if line.trim().is_empty() { continue; }
            let update: PullChunk = serde_json::from_str(line.trim()).map_err(|error| format!("Некорректный ответ Ollama: {error}"))?;
            let completed = update.completed.unwrap_or_default();
            let total = update.total.unwrap_or_default();
            let status = update.status.unwrap_or_else(|| "Скачиваем".to_string());
            let done = status == "success" || update.error.is_some();
            let percent = if total > 0 { (completed as f64 / total as f64 * 100.0).clamp(0.0, 100.0) } else if done { 100.0 } else { 0.0 };
            app.emit("model-pull-progress", PullProgress { model: model.clone(), status, completed, total, percent, done, error: update.error.clone() }).map_err(|error| error.to_string())?;
            if let Some(error) = update.error { return Err(error); }
        }
    }
    Ok(())
}
