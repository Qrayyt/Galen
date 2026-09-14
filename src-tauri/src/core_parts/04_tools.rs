fn tool_definitions(request: &AgentRequest) -> Vec<Value> {
    let mut tools = Vec::new();
    if request.web_enabled {
        tools.push(json!({"type":"function","function":{"name":"web_search","description":"Ищет актуальную информацию в интернете. Используй для новостей, текущих фактов, цен, документации и незнакомых тем.","parameters":{"type":"object","properties":{"query":{"type":"string","description":"Точный поисковый запрос"}},"required":["query"]}}}));
        tools.push(json!({"type":"function","function":{"name":"read_webpage","description":"Читает содержимое найденной веб-страницы по URL.","parameters":{"type":"object","properties":{"url":{"type":"string"}},"required":["url"]}}}));
    }
    if request.terminal_enabled {
        tools.push(json!({"type":"function","function":{"name":"run_terminal","description":"Запускает команду в терминале компьютера после явного подтверждения пользователя.","parameters":{"type":"object","properties":{"command":{"type":"string","description":"Полная команда для shell"},"cwd":{"type":"string","description":"Рабочая папка, если нужна"},"reason":{"type":"string","description":"Коротко зачем нужна команда"},"timeoutSeconds":{"type":"integer","description":"Таймаут 10-600 секунд; для сборок можно увеличить"}},"required":["command","reason"]}}}));
    }
    if request.terminal_enabled && request.workspace_directory.as_deref().map(str::trim).filter(|v| !v.is_empty()).is_some() {
        tools.push(json!({"type":"function","function":{"name":"list_directory","description":"Показывает дерево файлов внутри выбранного workspace без запуска shell.","parameters":{"type":"object","properties":{"path":{"type":"string","description":"Путь относительно workspace; по умолчанию ."},"depth":{"type":"integer","description":"Глубина 1-5"}},"required":[]}}}));
        tools.push(json!({"type":"function","function":{"name":"read_file","description":"Читает текстовый файл внутри workspace с номерами строк. Для больших файлов указывай диапазон.","parameters":{"type":"object","properties":{"path":{"type":"string"},"startLine":{"type":"integer"},"endLine":{"type":"integer"}},"required":["path"]}}}));
        tools.push(json!({"type":"function","function":{"name":"search_files","description":"Ищет точный текст по файлам workspace, пропуская node_modules/.git/target и бинарные файлы.","parameters":{"type":"object","properties":{"query":{"type":"string"},"path":{"type":"string","description":"Подпапка, по умолчанию ."}},"required":["query"]}}}));
        tools.push(json!({"type":"function","function":{"name":"write_file","description":"Создаёт или полностью перезаписывает текстовый файл внутри workspace после подтверждения пользователя.","parameters":{"type":"object","properties":{"path":{"type":"string"},"content":{"type":"string"},"reason":{"type":"string"}},"required":["path","content","reason"]}}}));
        tools.push(json!({"type":"function","function":{"name":"replace_in_file","description":"Делает точную замену фрагмента в файле workspace после подтверждения. Предпочтительнее полного rewrite для небольших правок.","parameters":{"type":"object","properties":{"path":{"type":"string"},"find":{"type":"string"},"replace":{"type":"string"},"replaceAll":{"type":"boolean"},"reason":{"type":"string"}},"required":["path","find","replace","reason"]}}}));
    }
    tools.push(json!({"type":"function","function":{"name":"generate_image","description":"Генерирует реальное изображение через локальный ComfyUI/Qwen pipeline. Если в последнем сообщении есть изображения, использует их как references.","parameters":{"type":"object","properties":{"prompt":{"type":"string","description":"Подробный prompt результата"}},"required":["prompt"]}}}));
    tools.push(json!({"type":"function","function":{"name":"generate_video","description":"Генерирует реальное видео через локальный ComfyUI/WAN 2.2. При наличии reference image использует I2V, иначе T2V.","parameters":{"type":"object","properties":{"prompt":{"type":"string"},"seconds":{"type":"integer","minimum":2,"maximum":8}},"required":["prompt"]}}}));
    tools
}

async fn ollama_step(state: &AppState, request: &AgentRequest, messages: &[Value], tools: &[Value]) -> Result<OllamaResponse, String> {
    let (num_ctx, temperature, num_predict, think) = match request.reasoning.as_str() { "light" => (4096, 0.30, 768, false), "heavy" => (24576, 0.50, 6144, true), _ => (12288, 0.42, 3072, true) };
    let mut body = json!({"model":request.model,"messages":messages,"stream":false,"think":think,"keep_alive":"30m","options":{"temperature":temperature,"num_ctx":num_ctx,"num_predict":num_predict}});
    if !tools.is_empty() { body["tools"] = Value::Array(tools.to_vec()); }
    state.client.post(format!("{OLLAMA_API}/chat")).json(&body).send().await.map_err(|error| format!("Не удалось обратиться к модели: {error}"))?.error_for_status().map_err(|error| format!("Ollama вернула ошибку: {error}"))?.json::<OllamaResponse>().await.map_err(|error| format!("Не удалось прочитать ответ модели: {error}"))
}

fn is_fast_conversation(request: &AgentRequest) -> bool {
    if request.reasoning != "light" || request.messages.iter().any(|message| !message.images.is_empty()) {
        return false;
    }
    let latest = request.messages.iter().rev().find(|message| message.role == "user").map(|message| message.content.trim()).unwrap_or_default();
    if latest.is_empty() || latest.chars().count() > 280 { return false; }
    let lower = latest.to_lowercase();
    let action_words = [
        "найди", "поищи", "сегодня", "новост", "актуаль", "открой", "файл", "папк", "команд",
        "терминал", "создай", "запиши", "измени", "удали", "запусти", "проверь", "проанализ",
        "сгенер", "нарис", "видео", "фото", "изображ", "search", "find", "open", "file", "run ",
        "create", "write", "edit", "delete", "generate", "latest", "today", "http://", "https://",
    ];
    !action_words.iter().any(|word| lower.contains(word))
}

fn compact_system_prompt(request: &AgentRequest) -> String {
    let memories = request.memories.iter().take(12)
        .map(|item| format!("- {}: {}", item.label, item.value))
        .collect::<Vec<_>>()
        .join("\n");
    let custom = request.custom_instructions.as_deref().map(str::trim).filter(|value| !value.is_empty()).unwrap_or("Нет");
    format!(
        "Ты Galen — локальный персональный ассистент. Отвечай сразу, естественно и по делу на языке пользователя. Не показывай chain-of-thought и служебные теги. Для приветствия или короткой реплики отвечай кратко.\n\nПостоянные инструкции:\n{custom}\n\nПамять:\n{}",
        if memories.is_empty() { "Нет" } else { &memories },
    )
}

async fn ollama_stream_answer(
    state: &AppState,
    request: &AgentRequest,
    messages: &[Value],
    app: &AppHandle,
) -> Result<(), String> {
    let body = json!({
        "model": request.model,
        "messages": messages,
        "stream": true,
        "think": false,
        "keep_alive": "30m",
        "options": { "temperature": 0.30, "num_ctx": 4096, "num_predict": 768 }
    });
    let response = state.client.post(format!("{OLLAMA_API}/chat"))
        .json(&body).send().await
        .map_err(|error| format!("Не удалось обратиться к модели: {error}"))?
        .error_for_status().map_err(|error| format!("Ollama вернула ошибку: {error}"))?;
    let mut stream = response.bytes_stream();
    let mut buffer = Vec::<u8>::new();
    let mut answer = String::new();
    let mut thinking = String::new();
    let mut eval_count = None;
    let mut eval_duration = None;
    let mut writing = false;

    while let Some(bytes) = stream.next().await {
        if is_cancelled(state, &request.request_id).await { return Ok(()); }
        buffer.extend_from_slice(&bytes.map_err(|error| error.to_string())?);
        while let Some(position) = buffer.iter().position(|byte| *byte == b'\n') {
            let line = buffer.drain(..=position).collect::<Vec<_>>();
            let line = String::from_utf8_lossy(&line);
            if line.trim().is_empty() { continue; }
            let chunk: OllamaStreamChunk = serde_json::from_str(line.trim()).map_err(|error| format!("Некорректный streaming-ответ Ollama: {error}"))?;
            thinking.push_str(&chunk.message.thinking);
            if !chunk.message.content.is_empty() {
                if !writing { emit_status(app, &request.request_id, "writing", "Отвечаю"); writing = true; }
                answer.push_str(&chunk.message.content);
                app.emit("agent-event", AgentEvent {
                    request_id: request.request_id.clone(), kind: "token".to_string(), phase: Some("writing".to_string()), label: None,
                    content: Some(chunk.message.content), sources: None, approval: None, tokens_per_second: None, reasoning_seconds: None, error: None,
                }).map_err(|error| error.to_string())?;
            }
            if chunk.eval_count.is_some() { eval_count = chunk.eval_count; }
            if chunk.eval_duration.is_some() { eval_duration = chunk.eval_duration; }
        }
    }
    if !buffer.is_empty() {
        let line = String::from_utf8_lossy(&buffer);
        if let Ok(chunk) = serde_json::from_str::<OllamaStreamChunk>(line.trim()) {
            thinking.push_str(&chunk.message.thinking);
            if !chunk.message.content.is_empty() {
                answer.push_str(&chunk.message.content);
                app.emit("agent-event", AgentEvent {
                    request_id: request.request_id.clone(), kind: "token".to_string(), phase: Some("writing".to_string()), label: None,
                    content: Some(chunk.message.content), sources: None, approval: None, tokens_per_second: None, reasoning_seconds: None, error: None,
                }).map_err(|error| error.to_string())?;
            }
            eval_count = chunk.eval_count.or(eval_count);
            eval_duration = chunk.eval_duration.or(eval_duration);
        }
    }
    let (_, hidden) = split_reasoning(&answer, &thinking);
    if !hidden.is_empty() {
        app.emit("agent-event", AgentEvent {
            request_id: request.request_id.clone(), kind: "reasoning".to_string(), phase: Some("thinking".to_string()),
            label: Some("Короткий ответ".to_string()), content: Some(hidden), sources: None, approval: None,
            tokens_per_second: None, reasoning_seconds: None, error: None,
        }).map_err(|error| error.to_string())?;
    }
    if answer.trim().is_empty() {
        app.emit("agent-event", AgentEvent {
            request_id: request.request_id.clone(), kind: "token".to_string(), phase: Some("writing".to_string()), label: None,
            content: Some("Не получилось сформировать ответ. Попробуй ещё раз.".to_string()), sources: None, approval: None,
            tokens_per_second: None, reasoning_seconds: None, error: None,
        }).map_err(|error| error.to_string())?;
    }
    let speed = match (eval_count, eval_duration) {
        (Some(count), Some(duration)) if duration > 0.0 => Some(count / (duration / 1_000_000_000.0)),
        _ => None,
    };
    app.emit("agent-event", AgentEvent {
        request_id: request.request_id.clone(), kind: "done".to_string(), phase: Some("done".to_string()), label: Some("Готово".to_string()),
        content: None, sources: None, approval: None, tokens_per_second: speed, reasoning_seconds: None, error: None,
    }).map_err(|error| error.to_string())?;
    Ok(())
}

async fn is_cancelled(state: &AppState, request_id: &str) -> bool { state.cancelled.lock().await.contains(request_id) }

fn take_arg(arguments: &Value, key: &str) -> String { arguments.get(key).and_then(Value::as_str).unwrap_or_default().trim().to_string() }

fn split_reasoning(content: &str, explicit: &str) -> (String, String) {
    let mut reasoning = explicit.trim().to_string();
    let mut answer = content.to_string();
    let channel = Regex::new(r"(?is)<\|channel\|>\s*(?:analysis|reasoning)(.*?)<\|channel\|>\s*final").expect("valid channel reasoning regex");
    for capture in channel.captures_iter(content) { if let Some(value) = capture.get(1) { let value = value.as_str().trim(); if !value.is_empty() { if !reasoning.is_empty() { reasoning.push_str("\n\n"); } reasoning.push_str(value); } } }
    answer = channel.replace_all(&answer, "").into_owned();
    let tagged = Regex::new(r"(?is)<(think|thinking|analysis|reasoning)\b[^>]*>(.*?)</(?:think|thinking|analysis|reasoning)>").expect("valid reasoning regex");
    for capture in tagged.captures_iter(content) { if let Some(value) = capture.get(2) { let value = value.as_str().trim(); if !value.is_empty() { if !reasoning.is_empty() { reasoning.push_str("\n\n"); } reasoning.push_str(value); } } }
    answer = tagged.replace_all(&answer, "").into_owned();
    let opening = Regex::new(r"(?is)<(?:think|thinking|analysis|reasoning)\b[^>]*>").expect("valid opening reasoning regex");
    if let Some(opening) = opening.find(&answer) { let start = opening.start(); let tail = answer[opening.end()..].trim(); if !tail.is_empty() { if !reasoning.is_empty() { reasoning.push_str("\n\n"); } reasoning.push_str(tail); } answer.truncate(start); }
    let stray = Regex::new(r"(?is)</?(?:think|thinking|analysis|reasoning)\b[^>]*>").expect("valid stray reasoning regex");
    answer = stray.replace_all(&answer, "").into_owned();
    (answer.trim().to_string(), reasoning.trim().to_string())
}

fn format_duration(seconds: f64) -> String {
    let rounded = seconds.max(0.0).round() as u64;
    if rounded < 60 { format!("{rounded} сек") } else { format!("{} мин {} сек", rounded / 60, rounded % 60) }
}
