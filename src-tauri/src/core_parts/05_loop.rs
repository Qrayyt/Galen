#[tauri::command]
async fn agent_chat(
    request: AgentRequest,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.cancelled.lock().await.remove(&request.request_id);
    let fast_conversation = is_fast_conversation(&request);
    let mut messages = vec![json!({ "role": "system", "content": if fast_conversation { compact_system_prompt(&request) } else { system_prompt(&request) } })];
    let history_start = if fast_conversation { request.messages.len().saturating_sub(12) } else { 0 };
    messages.extend(request.messages[history_start..].iter().map(|message| {
        let mut value = json!({ "role": message.role, "content": message.content });
        if !message.images.is_empty() { value["images"] = json!(message.images); }
        value
    }));
    if fast_conversation {
        emit_status(&app, &request.request_id, "thinking", "Готовлю ответ");
        let result = ollama_stream_answer(&state, &request, &messages, &app).await;
        state.cancelled.lock().await.remove(&request.request_id);
        if let Err(error) = &result { emit_error(&app, &request.request_id, error); }
        return result;
    }
    let tools = tool_definitions(&request);
    let max_steps = match request.reasoning.as_str() { "light" => 6, "heavy" => 24, _ => 12 };
    let mut all_sources = Vec::<SourceLink>::new();
    let mut all_reasoning = Vec::<String>::new();
    let mut reasoning_seconds = 0.0;

    for _ in 0..max_steps {
        if is_cancelled(&state, &request.request_id).await {
            state.cancelled.lock().await.remove(&request.request_id);
            return Ok(());
        }
        emit_status(&app, &request.request_id, "thinking", "Думаю");
        let reasoning_started = Instant::now();
        let reply = match ollama_step(&state, &request, &messages, &tools).await {
            Ok(reply) => reply,
            Err(error) => { emit_error(&app, &request.request_id, &error); return Err(error); }
        };
        reasoning_seconds += reasoning_started.elapsed().as_secs_f64();
        let (clean_content, reasoning) = split_reasoning(&reply.message.content, &reply.message.thinking);
        if !reasoning.is_empty() { all_reasoning.push(reasoning); }
        let calls = reply.message.tool_calls.clone();
        if calls.is_empty() {
            emit_status(&app, &request.request_id, "writing", "Формулирую ответ");
            let answer = if clean_content.trim().is_empty() {
                "Не получилось сформировать ответ. Попробуй переформулировать запрос или выбрать более сильную модель.".to_string()
            } else { clean_content };
            if !all_reasoning.is_empty() {
                app.emit("agent-event", AgentEvent {
                    request_id: request.request_id.clone(), kind: "reasoning".to_string(), phase: Some("thinking".to_string()),
                    label: Some(format!("Думал {}", format_duration(reasoning_seconds))), content: Some(all_reasoning.join("\n\n")),
                    sources: None, approval: None, tokens_per_second: None, reasoning_seconds: Some(reasoning_seconds), error: None,
                }).map_err(|error| error.to_string())?;
            }
            for chunk in chunk_text(&answer, 28) {
                if is_cancelled(&state, &request.request_id).await { return Ok(()); }
                app.emit("agent-event", AgentEvent {
                    request_id: request.request_id.clone(), kind: "token".to_string(), phase: Some("writing".to_string()), label: None,
                    content: Some(chunk), sources: None, approval: None, tokens_per_second: None, reasoning_seconds: None, error: None,
                }).map_err(|error| error.to_string())?;
                tokio::time::sleep(Duration::from_millis(8)).await;
            }
            let speed = match (reply.eval_count, reply.eval_duration) {
                (Some(count), Some(duration)) if duration > 0.0 => Some(count / (duration / 1_000_000_000.0)),
                _ => None,
            };
            if !all_sources.is_empty() {
                app.emit("agent-event", AgentEvent {
                    request_id: request.request_id.clone(), kind: "sources".to_string(), phase: None, label: None, content: None,
                    sources: Some(deduplicate_sources(all_sources)), approval: None, tokens_per_second: None, reasoning_seconds: None, error: None,
                }).map_err(|error| error.to_string())?;
            }
            app.emit("agent-event", AgentEvent {
                request_id: request.request_id.clone(), kind: "done".to_string(), phase: Some("done".to_string()), label: Some("Готово".to_string()),
                content: None, sources: None, approval: None, tokens_per_second: speed, reasoning_seconds: Some(reasoning_seconds), error: None,
            }).map_err(|error| error.to_string())?;
            state.cancelled.lock().await.remove(&request.request_id);
            return Ok(());
        }

        messages.push(json!({ "role": reply.message.role, "content": clean_content, "tool_calls": calls.clone() }));
        for call in calls {
            let name = call.function.name.clone();
            let result = execute_agent_tool(&call, &request, &app, &state, &mut all_sources).await;
            messages.push(json!({ "role": "tool", "tool_name": name, "content": result }));
        }
    }

    let error = "Агент исчерпал лимит шагов. Переключи режим на «Тяжёлый» или уточни задачу.";
    emit_error(&app, &request.request_id, error);
    Err(error.to_string())
}
