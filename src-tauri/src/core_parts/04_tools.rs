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
    let (num_ctx, temperature, num_predict, think) = match request.reasoning.as_str() { "light" => (12288, 0.35, 3072, false), "heavy" => (32768, 0.50, 8192, true), _ => (24576, 0.42, 6144, true) };
    let mut body = json!({"model":request.model,"messages":messages,"stream":false,"think":think,"keep_alive":"15m","options":{"temperature":temperature,"num_ctx":num_ctx,"num_predict":num_predict}});
    if !tools.is_empty() { body["tools"] = Value::Array(tools.to_vec()); }
    state.client.post(format!("{OLLAMA_API}/chat")).json(&body).send().await.map_err(|error| format!("Не удалось обратиться к модели: {error}"))?.error_for_status().map_err(|error| format!("Ollama вернула ошибку: {error}"))?.json::<OllamaResponse>().await.map_err(|error| format!("Не удалось прочитать ответ модели: {error}"))
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
