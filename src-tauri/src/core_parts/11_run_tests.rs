pub fn run() {
    cleanup_completed_update();
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= 5 { return attempt.stop(); }
            if validate_public_url(attempt.url().as_str()).is_ok() { attempt.follow() } else { attempt.stop() }
        }))
        .build()
        .expect("failed to create HTTP client");
    tauri::Builder::default()
        .manage(AppState {
            client,
            approvals: Arc::new(Mutex::new(HashMap::new())),
            cancelled: Arc::new(Mutex::new(HashSet::new())),
        })
        .invoke_handler(tauri::generate_handler![
            get_hardware_info,
            get_ollama_status,
            start_ollama,
            get_comfyui_status,
            open_comfyui,
            generation::get_generation_status,
            generation::install_comfyui,
            generation::start_comfyui_engine,
            generation::install_generation_pack,
            list_models,
            delete_model,
            pull_model,
            agent_chat,
            resolve_tool_approval,
            cancel_agent,
            extract_memories,
            open_url,
            synthesize_speech,
            transcribe_once,
            check_for_update,
            download_update,
            restart_into_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Galen");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocks_local_web_targets() {
        assert!(validate_public_url("http://127.0.0.1/private").is_err());
        assert!(validate_public_url("http://192.168.1.2/admin").is_err());
        assert!(validate_public_url("http://localhost:11434/api/tags").is_err());
    }

    #[test]
    fn accepts_public_https_targets() { assert!(validate_public_url("https://example.com/docs?q=galen").is_ok()); }

    #[test]
    fn unwraps_duckduckgo_redirects() {
        let input = "https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs&rut=test";
        assert_eq!(unwrap_duckduckgo_url(input), "https://example.com/docs");
    }

    #[test]
    fn answer_chunks_round_trip() {
        let answer = "Короткий ответ, который должен появляться плавно и без потери пробелов.";
        assert_eq!(chunk_text(answer, 12).join(""), answer);
    }

    #[test]
    fn separates_explicit_reasoning_from_answer() {
        let (answer, reasoning) = split_reasoning("Короткий финальный ответ.", "Сначала проверю факты.");
        assert_eq!(answer, "Короткий финальный ответ.");
        assert_eq!(reasoning, "Сначала проверю факты.");
    }

    #[test]
    fn strips_tagged_reasoning_from_answer() {
        let (answer, reasoning) = split_reasoning("<think>Скрытое рассуждение.</think>\n\n## Ответ\nГотово.", "");
        assert_eq!(answer, "## Ответ\nГотово.");
        assert_eq!(reasoning, "Скрытое рассуждение.");
        assert!(!answer.contains("think"));
    }

    #[test]
    fn recognizes_dark_model_profiles() {
        assert!(is_dark_model("huihui_ai/qwen3.5-abliterated:9b"));
        assert!(is_dark_model("community/wan22-dark"));
        assert!(is_dark_model("llama2-uncensored:7b"));
        assert!(!is_dark_model("qwen3.5:9b"));
    }

    #[test]
    fn core_prompt_applies_dark_profile_and_custom_instructions() {
        let request = AgentRequest {
            request_id: "test".to_string(), model: "huihui_ai/qwen3.5-abliterated:9b".to_string(), messages: vec![],
            memories: vec![MemoryRecord { label: "Стиль".to_string(), value: "Кратко".to_string() }],
            reasoning: "heavy".to_string(), web_enabled: true, terminal_enabled: true, workspace_directory: None,
            custom_instructions: Some("Всегда начинай с результата.".to_string()),
        };
        let prompt = system_prompt(&request);
        assert!(prompt.contains("GALEN CORE PROMPT v2"));
        assert!(prompt.contains("ПРОФИЛЬ: DARK"));
        assert!(prompt.contains("РЕЖИМ: ТЯЖЁЛЫЙ"));
        assert!(prompt.contains("Всегда начинай с результата."));
        assert!(prompt.contains("- Стиль: Кратко"));
        assert!(prompt.contains("ЦЕЛЬ → КОНТЕКСТ → ПЛАН → ДЕЙСТВИЕ → ПРОВЕРКА → ИТОГ"));
        assert!(prompt.contains("chain-of-thought остаются скрытыми"));
    }

    #[test]
    fn strips_unfinished_and_channel_reasoning() {
        let (answer, reasoning) = split_reasoning("<|channel|>analysis Скрытый план<|channel|>final Итог.", "");
        assert_eq!(answer, "Итог."); assert_eq!(reasoning, "Скрытый план");
        let (answer, reasoning) = split_reasoning("Ответ.\n<thinking>Незакрытый хвост", "");
        assert_eq!(answer, "Ответ."); assert_eq!(reasoning, "Незакрытый хвост");
    }

    #[test]
    fn speech_omits_code_blocks_and_splits_long_text() {
        let source = "Сначала объяснение.\n```powershell\nRemove-Item C:\\Temp\n```\nПосле кода — вывод.";
        let chunks = speech_chunks(source, 32); let spoken = chunks.join(" ");
        assert!(!spoken.contains("Remove-Item")); assert!(spoken.contains("Кодовый блок пропущен")); assert!(chunks.len() > 1);
    }

    #[test]
    fn parses_duckduckgo_result_markup() {
        let html = r##"<a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs&amp;rut=x">Docs &amp; help</a><a class="result__snippet" href="#">Fresh <b>documentation</b></a>"##;
        let results = parse_search_results(html);
        assert_eq!(results.len(), 1); assert_eq!(results[0].title, "Docs & help"); assert_eq!(results[0].url, "https://example.com/docs"); assert_eq!(results[0].snippet.as_deref(), Some("Fresh documentation"));
    }
}
