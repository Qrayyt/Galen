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
    app.emit("agent-event", AgentEvent {
        request_id: request_id.to_string(), kind: "approval".to_string(), phase: Some("waiting".to_string()), label: Some("Нужно подтверждение".to_string()),
        content: None, sources: None,
        approval: Some(ToolApproval { request_id: request_id.to_string(), approval_id: approval_id.clone(), command: command.to_string(), cwd: cwd.map(str::to_string), reason: if reason.is_empty() { None } else { Some(reason.to_string()) } }),
        tokens_per_second: None, reasoning_seconds: None, error: None,
    }).map_err(|error| error.to_string())?;
    let resolved = tokio::time::timeout(Duration::from_secs(300), receiver).await;
    state.approvals.lock().await.remove(&key);
    match resolved { Ok(Ok(value)) => Ok(value), Ok(Err(_)) => Err("канал подтверждения закрыт".to_string()), Err(_) => Err("время подтверждения истекло".to_string()) }
}

#[tauri::command]
async fn resolve_tool_approval(request_id: String, approval_id: String, approved: bool, state: State<'_, AppState>) -> Result<(), String> {
    let key = format!("{request_id}:{approval_id}");
    let sender = state.approvals.lock().await.remove(&key).ok_or_else(|| "Запрос подтверждения уже закрыт".to_string())?;
    sender.send(approved).map_err(|_| "Не удалось передать подтверждение".to_string())
}

#[tauri::command]
async fn cancel_agent(request_id: String, state: State<'_, AppState>) -> Result<(), String> {
    state.cancelled.lock().await.insert(request_id.clone());
    let prefix = format!("{request_id}:");
    let keys = state.approvals.lock().await.keys().filter(|key| key.starts_with(&prefix)).cloned().collect::<Vec<_>>();
    let mut approvals = state.approvals.lock().await;
    for key in keys { if let Some(sender) = approvals.remove(&key) { let _ = sender.send(false); } }
    Ok(())
}

async fn run_terminal(command: &str, cwd: Option<&str>, timeout_seconds: u64) -> Result<String, String> {
    if command.trim().is_empty() { return Err("Пустая команда".to_string()); }
    let mut process = if cfg!(windows) {
        let mut value = tokio::process::Command::new("cmd.exe"); value.args(["/D", "/S", "/C", command]); value
    } else {
        let mut value = tokio::process::Command::new("sh"); value.args(["-lc", command]); value
    };
    process.kill_on_drop(true);
    if let Some(directory) = cwd.filter(|value| !value.trim().is_empty()) {
        let path = PathBuf::from(directory);
        if !path.is_dir() { return Err(format!("Рабочая папка не найдена: {directory}")); }
        process.current_dir(path);
    }
    let timeout_seconds = timeout_seconds.clamp(10, 600);
    let output = tokio::time::timeout(Duration::from_secs(timeout_seconds), process.output()).await
        .map_err(|_| format!("Команда остановлена по таймауту {timeout_seconds} секунд"))?.map_err(|error| error.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined = format!("Код завершения: {}\n\nSTDOUT:\n{}\n\nSTDERR:\n{}", output.status.code().unwrap_or(-1), stdout, stderr);
    Ok(truncate(&combined, MAX_TOOL_OUTPUT))
}
