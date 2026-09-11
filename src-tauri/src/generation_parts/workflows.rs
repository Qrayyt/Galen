fn decode_reference(encoded: &str) -> Result<(Vec<u8>, &'static str, &'static str), String> {
    let raw = BASE64.decode(encoded.trim()).map_err(|_| "Reference image содержит некорректный base64".to_string())?;
    if raw.len() > 24 * 1024 * 1024 { return Err("Reference image больше 24 МБ".to_string()); }
    if raw.starts_with(&[0x89, b'P', b'N', b'G']) { Ok((raw, "image/png", "png")) }
    else if raw.starts_with(&[0xff, 0xd8, 0xff]) { Ok((raw, "image/jpeg", "jpg")) }
    else if raw.len() > 12 && &raw[0..4] == b"RIFF" && &raw[8..12] == b"WEBP" { Ok((raw, "image/webp", "webp")) }
    else { Err("Поддерживаются reference PNG, JPG и WebP".to_string()) }
}

async fn upload_reference(client: &Client, encoded: &str) -> Result<String, String> {
    let (raw, mime, ext) = decode_reference(encoded)?;
    let name = format!("galen-{}.{}", Uuid::new_v4(), ext);
    let part = multipart::Part::bytes(raw).file_name(name.clone()).mime_str(mime).map_err(|e| e.to_string())?;
    let form = multipart::Form::new().part("image", part).text("type", "input").text("subfolder", "galen").text("overwrite", "true");
    let response = client.post(format!("{COMFYUI_API}/upload/image")).multipart(form).timeout(Duration::from_secs(90)).send().await.map_err(|e| e.to_string())?.error_for_status().map_err(|e| e.to_string())?;
    let value: Value = response.json().await.map_err(|e| e.to_string())?;
    let stored = value.get("name").and_then(Value::as_str).unwrap_or(&name);
    let subfolder = value.get("subfolder").and_then(Value::as_str).unwrap_or("galen").trim_matches(&['/', '\\'][..]);
    Ok(if subfolder.is_empty() { stored.to_string() } else { format!("{subfolder}/{stored}") })
}

fn qwen_workflow(prompt: &str, refs: &[String], state: &GenerationStatus) -> Result<Value, String> {
    let unet = get_model(state, "qwen_unet")?;
    let clip = get_model(state, "qwen_clip")?;
    let vae = get_model(state, "qwen_vae")?;
    let loader = if state.qwen_loader.as_deref() == Some("standard") { "UNETLoader" } else { "UnetLoaderGGUF" };
    let loader_inputs = if loader == "UNETLoader" { json!({"unet_name": unet, "weight_dtype": "default"}) } else { json!({"unet_name": unet}) };
    let mut graph = serde_json::Map::new();
    graph.insert("1".into(), json!({"class_type": loader, "inputs": loader_inputs}));
    graph.insert("2".into(), json!({"class_type":"CLIPLoader","inputs":{"clip_name":clip,"type":"qwen_image","device":"default"}}));
    graph.insert("3".into(), json!({"class_type":"VAELoader","inputs":{"vae_name":vae}}));
    graph.insert("4".into(), json!({"class_type":"EmptyLatentImage","inputs":{"width":1024,"height":1024,"batch_size":1}}));
    let mut positive = serde_json::Map::new();
    positive.insert("clip".into(), json!(["2",0])); positive.insert("vae".into(), json!(["3",0])); positive.insert("prompt".into(), json!(prompt)); positive.insert("target_latent".into(), json!(["4",0]));
    for (index, file) in refs.iter().take(3).enumerate() {
        let node = format!("{}", 11 + index);
        graph.insert(node.clone(), json!({"class_type":"LoadImage","inputs":{"image":file}}));
        positive.insert(format!("image{}", index + 1), json!([node,0]));
    }
    graph.insert("20".into(), json!({"class_type":"TextEncodeQwenImageEditPlus","inputs":Value::Object(positive)}));
    graph.insert("21".into(), json!({"class_type":"TextEncodeQwenImageEditPlus","inputs":{"clip":["2",0],"prompt":""}}));
    graph.insert("22".into(), json!({"class_type":"KSampler","inputs":{"model":["1",0],"seed":random_seed(),"steps":6,"cfg":1.0,"sampler_name":"er_sde","scheduler":"beta","positive":["20",0],"negative":["21",0],"latent_image":["4",0],"denoise":1.0}}));
    graph.insert("23".into(), json!({"class_type":"VAEDecode","inputs":{"samples":["22",0],"vae":["3",0]}}));
    graph.insert("24".into(), json!({"class_type":"SaveImage","inputs":{"images":["23",0],"filename_prefix":"Galen/qwen"}}));
    Ok(Value::Object(graph))
}

fn wan_workflow(prompt: &str, refs: &[String], seconds: u32, state: &GenerationStatus) -> Result<Value, String> {
    let i2v = !refs.is_empty();
    let high = get_model(state, if i2v { "wan_i2v_high" } else { "wan_t2v_high" })?;
    let low = get_model(state, if i2v { "wan_i2v_low" } else { "wan_t2v_low" })?;
    let clip = get_model(state, "wan_clip")?; let vae = get_model(state, "wan_vae")?;
    let frames = seconds.clamp(2, 8) * 16 + 1;
    let shift = if i2v { 8.0 } else { 5.0 };
    let mut graph = serde_json::Map::new();
    graph.insert("1".into(), json!({"class_type":"UNETLoader","inputs":{"unet_name":high,"weight_dtype":"fp8_e4m3fn"}}));
    graph.insert("2".into(), json!({"class_type":"ModelSamplingSD3","inputs":{"model":["1",0],"shift":shift}}));
    graph.insert("7".into(), json!({"class_type":"UNETLoader","inputs":{"unet_name":low,"weight_dtype":"fp8_e4m3fn"}}));
    graph.insert("8".into(), json!({"class_type":"ModelSamplingSD3","inputs":{"model":["7",0],"shift":shift}}));
    graph.insert("3".into(), json!({"class_type":"CLIPLoader","inputs":{"clip_name":clip,"type":"wan","device":"default"}}));
    graph.insert("4".into(), json!({"class_type":"VAELoader","inputs":{"vae_name":vae}}));
    graph.insert("5".into(), json!({"class_type":"CLIPTextEncode","inputs":{"text":prompt,"clip":["3",0]}}));
    graph.insert("6".into(), json!({"class_type":"CLIPTextEncode","inputs":{"text":"oversaturated, overexposed, static, blurry, subtitles, watermark, worst quality, deformed hands, extra fingers, duplicate people","clip":["3",0]}}));
    let (positive, negative, latent) = if i2v {
        graph.insert("10".into(), json!({"class_type":"LoadImage","inputs":{"image":refs[0]}}));
        graph.insert("20".into(), json!({"class_type":"WanImageToVideo","inputs":{"positive":["5",0],"negative":["6",0],"vae":["4",0],"width":832,"height":480,"length":frames,"batch_size":1,"start_image":["10",0]}}));
        (json!(["20",0]), json!(["20",1]), json!(["20",2]))
    } else {
        graph.insert("20".into(), json!({"class_type":"EmptyHunyuanLatentVideo","inputs":{"width":832,"height":480,"length":frames,"batch_size":1}}));
        (json!(["5",0]), json!(["6",0]), json!(["20",0]))
    };
    graph.insert("21".into(), json!({"class_type":"KSamplerAdvanced","inputs":{"model":["2",0],"add_noise":"enable","noise_seed":random_seed(),"steps":12,"cfg":1.0,"sampler_name":"euler","scheduler":"simple","positive":positive,"negative":negative,"latent_image":latent,"start_at_step":0,"end_at_step":10,"return_with_leftover_noise":"enable"}}));
    graph.insert("22".into(), json!({"class_type":"KSamplerAdvanced","inputs":{"model":["8",0],"add_noise":"disable","noise_seed":0,"steps":12,"cfg":1.0,"sampler_name":"euler","scheduler":"simple","positive":positive,"negative":negative,"latent_image":["21",0],"start_at_step":10,"end_at_step":10000,"return_with_leftover_noise":"disable"}}));
    graph.insert("23".into(), json!({"class_type":"VAEDecode","inputs":{"samples":["22",0],"vae":["4",0]}}));
    graph.insert("24".into(), json!({"class_type":"CreateVideo","inputs":{"images":["23",0],"fps":16.0}}));
    graph.insert("25".into(), json!({"class_type":"SaveVideo","inputs":{"video":["24",0],"filename_prefix":"Galen/wan","format":"mp4","codec":{"codec":"h264"}}}));
    Ok(Value::Object(graph))
}

fn find_output(item: &Value) -> Option<(String, String, String, String)> {
    let outputs = item.get("outputs")?.as_object()?;
    for output in outputs.values() {
        for key in ["images", "videos", "gifs", "files"] {
            let values = output.get(key).and_then(Value::as_array).cloned().unwrap_or_default();
            for value in values {
                let name = value.get("filename").and_then(Value::as_str)?.to_string();
                let subfolder = value.get("subfolder").and_then(Value::as_str).unwrap_or("").to_string();
                let kind_type = value.get("type").and_then(Value::as_str).unwrap_or("output").to_string();
                let ext = Path::new(&name).extension().and_then(|v| v.to_str()).unwrap_or("").to_ascii_lowercase();
                let kind = if ["mp4","webm","mkv","mov"].contains(&ext.as_str()) { "video" } else { "image" };
                return Some((kind.to_string(), name, subfolder, kind_type));
            }
        }
    }
    None
}

pub async fn generate(client: &Client, prompt: &str, images: &[String], mode: &str, seconds: u32) -> Result<GeneratedMedia, String> {
    if prompt.trim().is_empty() { return Err("Пустой prompt для генерации".to_string()); }
    if images.len() > 3 { return Err("Для генерации поддерживается до трёх reference-изображений.".to_string()); }
    ensure_running(client).await?;
    let state = status(client).await;
    let mut uploaded = Vec::new();
    for image in images { uploaded.push(upload_reference(client, image).await?); }
    let (graph, engine, timeout_seconds) = match mode {
        "image" => {
            if !state.image_ready { return Err(format!("Image pipeline не готов. Не хватает: {}{}", state.missing_image.join(", "), if state.missing_nodes.is_empty() { "".to_string() } else { format!("; nodes: {}", state.missing_nodes.join(", ")) })); }
            (qwen_workflow(prompt, &uploaded, &state)?, "Qwen Image Edit / Rapid AIO".to_string(), 900u64)
        }
        "video" => {
            let ready = if uploaded.is_empty() { state.video_t2v_ready } else { state.video_i2v_ready };
            if !ready { return Err(format!("WAN pipeline не готов. Не хватает: {}", if uploaded.is_empty() { state.missing_video_t2v.join(", ") } else { state.missing_video_i2v.join(", ") })); }
            (wan_workflow(prompt, &uploaded, seconds, &state)?, "WAN 2.2".to_string(), 2400u64)
        }
        _ => return Err("mode должен быть image или video".to_string()),
    };
    let response = client.post(format!("{COMFYUI_API}/prompt")).json(&json!({"prompt":graph})).timeout(Duration::from_secs(60)).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        let status_code = response.status(); let text = response.text().await.unwrap_or_default();
        return Err(format!("ComfyUI отклонил workflow ({status_code}): {}", text.chars().take(2400).collect::<String>()));
    }
    let payload: Value = response.json().await.map_err(|e| e.to_string())?;
    let prompt_id = payload.get("prompt_id").and_then(Value::as_str).ok_or_else(|| "ComfyUI не вернул prompt_id".to_string())?.to_string();
    let started = std::time::Instant::now();
    let output = loop {
        if started.elapsed() > Duration::from_secs(timeout_seconds) { return Err("Генерация превысила допустимое время.".to_string()); }
        let history: Value = client.get(format!("{COMFYUI_API}/history/{prompt_id}")).timeout(Duration::from_secs(20)).send().await.map_err(|e| e.to_string())?.error_for_status().map_err(|e| e.to_string())?.json().await.map_err(|e| e.to_string())?;
        if let Some(item) = history.get(&prompt_id) {
            if item.get("status").and_then(|s| s.get("status_str")).and_then(Value::as_str) == Some("error") {
                return Err(format!("ComfyUI завершил генерацию с ошибкой: {}", item.get("status").unwrap_or(&Value::Null)));
            }
            if let Some(output) = find_output(item) { break output; }
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    };
    let (kind, name, subfolder, kind_type) = output;
    let bytes = client.get(format!("{COMFYUI_API}/view")).query(&[("filename", name.as_str()), ("subfolder", subfolder.as_str()), ("type", kind_type.as_str())]).timeout(Duration::from_secs(180)).send().await.map_err(|e| e.to_string())?.error_for_status().map_err(|e| e.to_string())?.bytes().await.map_err(|e| e.to_string())?;
    let root = generated_root(); fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let ext = Path::new(&name).extension().and_then(|v| v.to_str()).unwrap_or(if kind == "video" { "mp4" } else { "png" });
    let filename = format!("galen-{}.{}", Uuid::new_v4(), ext);
    let path = root.join(&filename); fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    let mime = if kind == "video" { if ext == "webm" { "video/webm" } else { "video/mp4" } } else { match ext { "jpg" | "jpeg" => "image/jpeg", "webp" => "image/webp", _ => "image/png" } }.to_string();
    let data_url = if kind == "image" && bytes.len() <= 25 * 1024 * 1024 { Some(format!("data:{mime};base64,{}", BASE64.encode(&bytes))) } else { None };
    let _ = client.post(format!("{COMFYUI_API}/free")).json(&json!({"unload_models":true,"free_memory":true})).send().await;
    Ok(GeneratedMedia { kind, name: filename, mime, path: path.to_string_lossy().to_string(), data_url, engine })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn model_match_accepts_subfolders() {
        let values = vec!["NSFW/foo.safetensors".to_string(), "qwen_image_vae.safetensors".to_string()];
        assert_eq!(match_choice(&values, &["foo.safetensors"]), Some("NSFW/foo.safetensors".to_string()));
    }
    #[test]
    fn image_workflow_is_built_for_donor_model() {
        let mut models = HashMap::new();
        models.insert("qwen_unet".to_string(), Some("Qwen-Rapid-AIO-NSFW-v19_Q4_K.gguf".to_string()));
        models.insert("qwen_clip".to_string(), Some("qwen_2.5_vl_7b_fp8_scaled.safetensors".to_string()));
        models.insert("qwen_vae".to_string(), Some("qwen_image_vae.safetensors".to_string()));
        let state = GenerationStatus { installed:true,running:true,root:None,endpoint:String::new(),image_ready:true,video_i2v_ready:false,video_t2v_ready:false,qwen_loader:Some("gguf".into()),models,missing_image:vec![],missing_video_i2v:vec![],missing_video_t2v:vec![],missing_nodes:vec![],error:None };
        let graph = qwen_workflow("test", &[], &state).unwrap();
        assert_eq!(graph["1"]["class_type"], "UnetLoaderGGUF");
        assert_eq!(graph["24"]["class_type"], "SaveImage");
    }
}
