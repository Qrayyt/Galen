async fn execute_agent_tool(
    call: &OllamaToolCall,
    request: &AgentRequest,
    app: &AppHandle,
    state: &AppState,
    all_sources: &mut Vec<SourceLink>,
) -> String {
    let name = call.function.name.as_str();
    match name {
        "web_search" if request.web_enabled => {
            emit_status(app, &request.request_id, "searching", "Ищу в интернете");
            let query = take_arg(&call.function.arguments, "query");
            match web_search(&state.client, &query).await {
                Ok((text, sources)) => { all_sources.extend(sources); text }
                Err(error) => format!("Ошибка поиска: {error}"),
            }
        }
        "read_webpage" if request.web_enabled => {
            emit_status(app, &request.request_id, "reading", "Читаю страницу");
            let url = take_arg(&call.function.arguments, "url");
            match read_webpage(&state.client, &url).await {
                Ok((text, source)) => { all_sources.push(source); text }
                Err(error) => format!("Ошибка чтения страницы: {error}"),
            }
        }
        "run_terminal" if request.terminal_enabled => {
            let command = take_arg(&call.function.arguments, "command");
            let requested_cwd = take_arg(&call.function.arguments, "cwd");
            let reason = take_arg(&call.function.arguments, "reason");
            let timeout_seconds = call.function.arguments.get("timeoutSeconds").and_then(Value::as_u64).unwrap_or(120).clamp(10, 600);
            let cwd = if requested_cwd.is_empty() { request.workspace_directory.clone() } else { Some(requested_cwd) };
            match ask_terminal_approval(app, state, &request.request_id, &command, cwd.as_deref(), &reason).await {
                Ok(true) => {
                    emit_status(app, &request.request_id, "terminal", "Выполняю команду");
                    run_terminal(&command, cwd.as_deref(), timeout_seconds).await.unwrap_or_else(|error| format!("Ошибка команды: {error}"))
                }
                Ok(false) => "Пользователь отклонил выполнение команды. Не утверждай, что она выполнена.".to_string(),
                Err(error) => format!("Подтверждение команды не получено: {error}"),
            }
        }
        "list_directory" if request.terminal_enabled => {
            emit_status(app, &request.request_id, "reading", "Смотрю файлы проекта");
            let path = take_arg(&call.function.arguments, "path");
            let depth = call.function.arguments.get("depth").and_then(Value::as_u64).unwrap_or(2) as usize;
            coding_tools::list_directory(request.workspace_directory.as_deref(), if path.is_empty() { "." } else { &path }, depth)
                .unwrap_or_else(|error| format!("Ошибка чтения дерева: {error}"))
        }
        "read_file" if request.terminal_enabled => {
            emit_status(app, &request.request_id, "reading", "Читаю файл");
            let path = take_arg(&call.function.arguments, "path");
            let start = call.function.arguments.get("startLine").and_then(Value::as_u64).unwrap_or(1) as usize;
            let end = call.function.arguments.get("endLine").and_then(Value::as_u64).unwrap_or(0) as usize;
            coding_tools::read_file(request.workspace_directory.as_deref(), &path, start, end)
                .unwrap_or_else(|error| format!("Ошибка чтения файла: {error}"))
        }
        "search_files" if request.terminal_enabled => {
            emit_status(app, &request.request_id, "searching", "Ищу по проекту");
            let query = take_arg(&call.function.arguments, "query");
            let path = take_arg(&call.function.arguments, "path");
            coding_tools::search_files(request.workspace_directory.as_deref(), &query, if path.is_empty() { "." } else { &path })
                .unwrap_or_else(|error| format!("Ошибка поиска: {error}"))
        }
        "write_file" if request.terminal_enabled => {
            let path = take_arg(&call.function.arguments, "path");
            let content = call.function.arguments.get("content").and_then(Value::as_str).unwrap_or_default().to_string();
            let reason = take_arg(&call.function.arguments, "reason");
            let action = format!("write_file {path}");
            match ask_terminal_approval(app, state, &request.request_id, &action, request.workspace_directory.as_deref(), &reason).await {
                Ok(true) => coding_tools::write_file(request.workspace_directory.as_deref(), &path, &content)
                    .unwrap_or_else(|error| format!("Ошибка записи файла: {error}")),
                Ok(false) => "Пользователь отклонил изменение файла. Не утверждай, что оно выполнено.".to_string(),
                Err(error) => format!("Подтверждение изменения не получено: {error}"),
            }
        }
        "replace_in_file" if request.terminal_enabled => {
            let path = take_arg(&call.function.arguments, "path");
            let find = call.function.arguments.get("find").and_then(Value::as_str).unwrap_or_default().to_string();
            let replace = call.function.arguments.get("replace").and_then(Value::as_str).unwrap_or_default().to_string();
            let replace_all = call.function.arguments.get("replaceAll").and_then(Value::as_bool).unwrap_or(false);
            let reason = take_arg(&call.function.arguments, "reason");
            let action = format!("replace_in_file {path}");
            match ask_terminal_approval(app, state, &request.request_id, &action, request.workspace_directory.as_deref(), &reason).await {
                Ok(true) => coding_tools::replace_in_file(request.workspace_directory.as_deref(), &path, &find, &replace, replace_all)
                    .unwrap_or_else(|error| format!("Ошибка изменения файла: {error}")),
                Ok(false) => "Пользователь отклонил изменение файла. Не утверждай, что оно выполнено.".to_string(),
                Err(error) => format!("Подтверждение изменения не получено: {error}"),
            }
        }
        "generate_image" => {
            emit_status(app, &request.request_id, "generating", "Генерирую изображение");
            let prompt = take_arg(&call.function.arguments, "prompt");
            let references = request.messages.iter().rev().find(|message| !message.images.is_empty())
                .map(|message| message.images.iter().take(3).cloned().collect::<Vec<_>>()).unwrap_or_default();
            match generation::generate(&state.client, &prompt, &references, "image", 4).await {
                Ok(media) => {
                    let _ = app.emit("generated-media", json!({"requestId": request.request_id.clone(), "media": &media}));
                    format!("Изображение реально сгенерировано и сохранено: {}. Engine: {}.", media.path, media.engine)
                }
                Err(error) => format!("Ошибка генерации изображения: {error}"),
            }
        }
        "generate_video" => {
            emit_status(app, &request.request_id, "generating", "Генерирую видео");
            let prompt = take_arg(&call.function.arguments, "prompt");
            let seconds = call.function.arguments.get("seconds").and_then(Value::as_u64).unwrap_or(4).clamp(2, 8) as u32;
            let references = request.messages.iter().rev().find(|message| !message.images.is_empty())
                .map(|message| message.images.iter().take(1).cloned().collect::<Vec<_>>()).unwrap_or_default();
            match generation::generate(&state.client, &prompt, &references, "video", seconds).await {
                Ok(media) => {
                    let _ = app.emit("generated-media", json!({"requestId": request.request_id.clone(), "media": &media}));
                    format!("Видео реально сгенерировано и сохранено: {}. Engine: {}.", media.path, media.engine)
                }
                Err(error) => format!("Ошибка генерации видео: {error}"),
            }
        }
        _ => format!("Инструмент {name} недоступен."),
    }
}
