async fn ask_terminal_approval(
    app: &AppHandle,
    state: &AppState,
    request_id: &str,
    command: &str,
    cwd: Option<&str>,
    reason: &str,
    kind: &str,
) -> Result<bool, String> {
    let approval_id = Uuid::new_v4().to_string();
    let key = format!("{request_id}:{approval_id}");
    let (sender, receiver) = oneshot::channel();
    state.approvals.lock().await.insert(key.clone(), sender);
    emit_status(app, request_id, "waiting", "Жду подтверждения команды");
    app.emit("agent-event", AgentEvent {
        request_id: request_id.to_string(), kind: "approval".to_string(), phase: Some("waiting".to_string()), label: Some("Нужно подтверждение".to_string()),
        content: None, sources: None,
        approval: Some(ToolApproval { request_id: request_id.to_string(), approval_id: approval_id.clone(), command: command.to_string(), cwd: cwd.map(str::to_string), reason: if reason.is_empty() { None } else { Some(reason.to_string()) }, kind: Some(kind.to_string()) }),
        tokens_per_second: None, reasoning_seconds: None, error: None, tool: None,
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

async fn run_terminal(command: &str, cwd: Option<&str>, shell: &str, timeout_seconds: u64) -> Result<String, String> {
    let result = execute_command_process(command, cwd, shell, timeout_seconds).await?;
    Ok(format!(
        "Shell: {}\nКод завершения: {}\nДлительность: {} мс\n\nSTDOUT:\n{}\n\nSTDERR:\n{}",
        result.shell, result.exit_code, result.duration_ms, result.stdout, result.stderr,
    ))
}
