#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    validate_public_url(&url)?;
    open::that(url).map_err(|error| error.to_string())
}

fn speech_chunks(input: &str, max_chars: usize) -> Vec<String> {
    let clean = Regex::new(r"(?s)```.*?```").expect("valid code regex").replace_all(input, " Кодовый блок пропущен. ");
    let clean = Regex::new(r"[*_#>`|]").expect("valid markdown regex").replace_all(&clean, "");
    let mut chunks = Vec::new(); let mut current = String::new();
    for sentence in clean.split_inclusive(['.', '!', '?', '\n']) {
        if current.chars().count() + sentence.chars().count() > max_chars && !current.is_empty() { chunks.push(current.trim().to_string()); current.clear(); }
        current.push_str(sentence);
    }
    if !current.trim().is_empty() { chunks.push(current.trim().to_string()); }
    chunks
}

#[tauri::command]
async fn synthesize_speech(text: String, voice: String, rate: f64) -> Result<String, String> {
    if text.trim().is_empty() { return Err("Нечего озвучивать".to_string()); }
    init_tls();
    let voice = if voice.trim().is_empty() { "ru-RU-DmitryNeural" } else { voice.trim() };
    let rate_percent = ((rate.clamp(0.65, 1.45) - 1.0) * 100.0).round() as i32;
    let rate = format!("{rate_percent:+}%");
    let mut audio = Vec::new();
    for chunk in speech_chunks(&text, 2800).into_iter().take(8) {
        let events = EdgeTts.synthesize(&chunk, voice, &rate, "ru-RU").await.map_err(|error| format!("Нейронный голос недоступен: {error}"))?;
        for event in events { if let TtsEvent::Audio(bytes) = event { audio.extend_from_slice(&bytes); } }
    }
    if audio.is_empty() { return Err("Голосовой сервис не вернул аудио".to_string()); }
    Ok(BASE64.encode(audio))
}

#[cfg(windows)]
#[tauri::command]
async fn transcribe_once() -> Result<String, String> {
    let script = r#"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
Add-Type -AssemblyName System.Speech
$culture = [System.Globalization.CultureInfo]::GetCultureInfo('ru-RU')
$recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine($culture)
$recognizer.SetInputToDefaultAudioDevice()
$recognizer.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
$result = $recognizer.Recognize([TimeSpan]::FromSeconds(20))
if ($null -ne $result) { [Console]::Write($result.Text) }
"#;
    let mut process = tokio::process::Command::new("powershell.exe");
    process.args(["-NoProfile", "-NonInteractive", "-Command", script]).kill_on_drop(true);
    let output = tokio::time::timeout(Duration::from_secs(25), process.output()).await.map_err(|_| "Распознавание речи остановлено по таймауту".to_string())?.map_err(|error| format!("Не удалось запустить распознавание речи: {error}"))?;
    if !output.status.success() { return Err(String::from_utf8_lossy(&output.stderr).trim().to_string()); }
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() { return Err("Речь не распознана. Проверь микрофон и русский речевой пакет Windows.".to_string()); }
    Ok(text)
}

#[cfg(not(windows))]
#[tauri::command]
async fn transcribe_once() -> Result<String, String> { Err("Нативное распознавание сейчас доступно на Windows".to_string()) }
