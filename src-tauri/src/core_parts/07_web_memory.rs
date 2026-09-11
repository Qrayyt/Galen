async fn web_search(client: &reqwest::Client, query: &str) -> Result<(String, Vec<SourceLink>), String> {
    if query.trim().is_empty() { return Err("Пустой поисковый запрос".to_string()); }
    let response = client.get("https://html.duckduckgo.com/html/").query(&[("q", query)]).header("User-Agent", "Mozilla/5.0 (compatible; Galen/0.3)").timeout(Duration::from_secs(15)).send().await.map_err(|error| error.to_string())?.error_for_status().map_err(|error| error.to_string())?;
    let html = response.text().await.map_err(|error| error.to_string())?;
    let sources = parse_search_results(&html);
    if sources.is_empty() { return Err("Поиск не вернул результатов".to_string()); }
    let text = sources.iter().enumerate().map(|(index, source)| format!("{}. {}\nURL: {}\n{}", index + 1, source.title, source.url, source.snippet.clone().unwrap_or_default())).collect::<Vec<_>>().join("\n\n");
    Ok((text, sources))
}

fn parse_search_results(html: &str) -> Vec<SourceLink> {
    let link_re = Regex::new(r#"(?s)<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>"#).unwrap();
    let snippet_re = Regex::new(r#"(?s)<a[^>]+class="result__snippet"[^>]*>(.*?)</a>|<div[^>]+class="result__snippet"[^>]*>(.*?)</div>"#).unwrap();
    let snippets = snippet_re.captures_iter(html).map(|capture| strip_html(capture.get(1).or_else(|| capture.get(2)).map(|m| m.as_str()).unwrap_or_default())).collect::<Vec<_>>();
    link_re.captures_iter(html).take(8).enumerate().filter_map(|(index, capture)| {
        let raw_url = html_escape::decode_html_entities(capture.get(1).map(|m| m.as_str()).unwrap_or_default()).to_string();
        let url = unwrap_duckduckgo_url(&raw_url);
        validate_public_url(&url).ok()?;
        Some(SourceLink { title: strip_html(capture.get(2).map(|m| m.as_str()).unwrap_or_default()), url, snippet: snippets.get(index).cloned().filter(|value| !value.is_empty()) })
    }).collect()
}

async fn read_webpage(client: &reqwest::Client, input: &str) -> Result<(String, SourceLink), String> {
    let url = validate_public_url(input)?;
    let response = client.get(url.clone()).header("User-Agent", "Mozilla/5.0 (compatible; Galen/0.3)").timeout(Duration::from_secs(20)).send().await.map_err(|error| error.to_string())?;
    let final_url = validate_public_url(response.url().as_str())?;
    let response = response.error_for_status().map_err(|error| error.to_string())?;
    let mime = response.headers().get(reqwest::header::CONTENT_TYPE).and_then(|value| value.to_str().ok()).unwrap_or_default().to_string();
    if !mime.contains("text") && !mime.contains("json") && !mime.contains("xml") { return Err(format!("Неподдерживаемый тип страницы: {mime}")); }
    let html = response.text().await.map_err(|error| error.to_string())?;
    let title_re = Regex::new(r"(?is)<title[^>]*>(.*?)</title>").unwrap();
    let title = title_re.captures(&html).and_then(|capture| capture.get(1)).map(|value| strip_html(value.as_str())).filter(|value| !value.is_empty()).unwrap_or_else(|| final_url.to_string());
    let script_re = Regex::new(r"(?is)<(script|style|svg|noscript)[^>]*>.*?</(script|style|svg|noscript)>").unwrap();
    let cleaned = script_re.replace_all(&html, " ");
    let text = truncate(&strip_html(&cleaned), MAX_WEB_CHARS);
    Ok((format!("Заголовок: {title}\nURL: {final_url}\n\n{text}"), SourceLink { title, url: final_url.to_string(), snippet: Some(truncate(&text, 260)) }))
}

fn validate_public_url(input: &str) -> Result<Url, String> {
    let url = Url::parse(input).map_err(|_| "Некорректный URL".to_string())?;
    if !matches!(url.scheme(), "http" | "https") { return Err("Разрешены только http/https ссылки".to_string()); }
    let host = url.host_str().ok_or_else(|| "В URL нет домена".to_string())?.to_ascii_lowercase();
    if host == "localhost" || host.ends_with(".local") { return Err("Локальные адреса запрещены веб-инструменту".to_string()); }
    if let Ok(ip) = host.parse::<IpAddr>() {
        let private = match ip { IpAddr::V4(value) => value.is_private() || value.is_loopback() || value.is_link_local() || value.is_unspecified(), IpAddr::V6(value) => value.is_loopback() || value.is_unspecified() || value.is_unique_local() };
        if private { return Err("Приватные IP-адреса запрещены веб-инструменту".to_string()); }
    }
    Ok(url)
}

fn unwrap_duckduckgo_url(input: &str) -> String {
    let absolute = if input.starts_with("//") { format!("https:{input}") } else { input.to_string() };
    Url::parse(&absolute).ok().and_then(|url| url.query_pairs().find(|(key, _)| key == "uddg").map(|(_, value)| value.to_string())).unwrap_or(absolute)
}

fn strip_html(input: &str) -> String {
    let tags = Regex::new(r"(?s)<[^>]+>").unwrap();
    let spaced = tags.replace_all(input, " ");
    html_escape::decode_html_entities(&spaced).split_whitespace().collect::<Vec<_>>().join(" ")
}

fn truncate(input: &str, limit: usize) -> String {
    if input.chars().count() <= limit { return input.to_string(); }
    format!("{}\n…[обрезано]", input.chars().take(limit).collect::<String>())
}

fn chunk_text(input: &str, target: usize) -> Vec<String> {
    let mut chunks = Vec::new(); let mut current = String::new();
    for word in input.split_inclusive(char::is_whitespace) { current.push_str(word); if current.chars().count() >= target { chunks.push(std::mem::take(&mut current)); } }
    if !current.is_empty() { chunks.push(current); }
    if chunks.is_empty() { chunks.push(input.to_string()); }
    chunks
}

fn deduplicate_sources(sources: Vec<SourceLink>) -> Vec<SourceLink> {
    let mut seen = HashSet::new(); sources.into_iter().filter(|source| seen.insert(source.url.clone())).take(10).collect()
}

#[tauri::command]
async fn extract_memories(model: String, user_message: String, assistant_message: String, state: State<'_, AppState>) -> Result<Vec<MemoryCandidate>, String> {
    if user_message.trim().is_empty() { return Ok(Vec::new()); }
    let body = json!({
        "model": model, "stream": false, "think": false, "keep_alive": "15m", "format": "json",
        "messages": [
            {"role":"system","content":"Извлеки только долговременные факты о пользователе, которые пригодятся в других диалогах: имя, предпочтения, постоянные настройки, проекты и важные ограничения. Не сохраняй разовые вопросы, пароли, токены, медицинские и финансовые тайны. Верни строго JSON: {\"memories\":[{\"label\":\"короткое название\",\"value\":\"факт\",\"category\":\"profile|preference|project|other\"}]}. Если сохранять нечего, верни {\"memories\":[]}."},
            {"role":"user","content":format!("Сообщение пользователя:\n{}\n\nОтвет ассистента:\n{}", truncate(&user_message, 5000), truncate(&assistant_message, 3000))}
        ],
        "options": {"temperature":0.1,"num_ctx":4096,"num_predict":600}
    });
    let response = state.client.post(format!("{OLLAMA_API}/chat")).json(&body).send().await.map_err(|error| error.to_string())?.error_for_status().map_err(|error| error.to_string())?.json::<OllamaResponse>().await.map_err(|error| error.to_string())?;
    let content = response.message.content;
    let start = content.find('{').unwrap_or(0); let end = content.rfind('}').map(|value| value + 1).unwrap_or(content.len());
    let parsed = serde_json::from_str::<MemoryEnvelope>(&content[start..end]).unwrap_or(MemoryEnvelope { memories: Vec::new() });
    Ok(parsed.memories.into_iter().filter(|item| !item.label.trim().is_empty() && !item.value.trim().is_empty()).take(8).collect())
}
