fn hidden_command(program: &str) -> Command {
    let mut command = Command::new(program);
    #[cfg(windows)] command.creation_flags(0x08000000);
    command
}

fn github_release(tag: Option<&str>) -> Result<GitHubReleaseInfo, String> {
    let endpoint = tag.map(|value| format!("repos/{REPOSITORY}/releases/tags/{value}")).unwrap_or_else(|| format!("repos/{REPOSITORY}/releases/latest"));
    let output = hidden_command("gh").args(["api", &endpoint]).stdin(Stdio::null()).output().map_err(|error| format!("GitHub CLI недоступен: {error}"))?;
    if !output.status.success() {
        let details = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if details.is_empty() { "Не удалось получить данные GitHub Release".to_string() } else { details });
    }
    serde_json::from_slice::<GitHubReleaseInfo>(&output.stdout).map_err(|error| format!("Некорректный ответ GitHub: {error}"))
}

fn select_update_asset(release: &GitHubReleaseInfo) -> Option<GitHubReleaseAsset> {
    let arch = env::consts::ARCH.to_ascii_lowercase();
    let preferred_arch = if arch == "x86_64" { ["x64", "amd64"] } else { [arch.as_str(), arch.as_str()] };
    release.assets.iter().filter(|asset| {
        let name = asset.name.to_ascii_lowercase();
        if cfg!(windows) { name.ends_with("-setup.exe") || name.ends_with("_setup.exe") || name.ends_with("setup.exe") }
        else if cfg!(target_os = "linux") { name.ends_with(".appimage") } else { false }
    }).max_by_key(|asset| { let name = asset.name.to_ascii_lowercase(); preferred_arch.iter().filter(|value| name.contains(*value)).count() }).cloned()
}

fn update_info_error(current_version: String, error: String) -> UpdateInfo {
    UpdateInfo { available:false,current_version,latest_version:None,tag:None,asset_name:None,asset_size:None,error:Some(error) }
}

#[tauri::command]
fn check_for_update() -> UpdateInfo {
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let release = match github_release(None) { Ok(value) => value, Err(error) => return update_info_error(current_version, error) };
    let latest_string = release.tag_name.trim_start_matches('v').to_string();
    let current = Version::parse(&current_version).ok(); let latest = Version::parse(&latest_string).ok();
    let available = matches!((current, latest), (Some(current), Some(latest)) if latest > current);
    let asset = select_update_asset(&release);
    let error = if available && asset.is_none() { Some(format!("В релизе {} нет совместимого установочного файла для {} {}", release.tag_name, env::consts::OS, env::consts::ARCH)) } else { None };
    UpdateInfo { available: available && asset.is_some(), current_version, latest_version:Some(latest_string), tag:Some(release.tag_name), asset_name:asset.as_ref().map(|v| v.name.clone()), asset_size:asset.as_ref().map(|v| v.size), error }
}

fn directory_size(directory: &Path) -> u64 {
    fs::read_dir(directory).ok().into_iter().flat_map(|entries| entries.filter_map(Result::ok)).map(|entry| {
        let path = entry.path(); if path.is_dir() { directory_size(&path) } else { entry.metadata().map(|value| value.len()).unwrap_or_default() }
    }).sum()
}

fn emit_update_progress(app: &AppHandle, status: &str, downloaded: u64, total: u64, done: bool, error: Option<String>) {
    let percent = if total > 0 { (downloaded as f64 / total as f64 * 100.0).clamp(0.0, 100.0) } else if done && error.is_none() { 100.0 } else { 0.0 };
    let _ = app.emit("update-progress", UpdateProgress { status:status.to_string(),downloaded,total,percent,done,error });
}

#[tauri::command]
async fn download_update(tag: String, app: AppHandle) -> Result<String, String> {
    let release = github_release(Some(&tag))?;
    let asset = select_update_asset(&release).ok_or_else(|| format!("В релизе {tag} нет совместимого файла для {} {}", env::consts::OS, env::consts::ARCH))?;
    let download_dir = app.path().temp_dir().map_err(|error| error.to_string())?.join("galen-update");
    if download_dir.exists() { fs::remove_dir_all(&download_dir).map_err(|error| error.to_string())?; }
    fs::create_dir_all(&download_dir).map_err(|error| error.to_string())?;
    emit_update_progress(&app, "Подготавливаю обновление", 0, asset.size, false, None);
    let mut child = hidden_command("gh").args(["release","download",&tag,"--repo",REPOSITORY,"--pattern",&asset.name,"--dir"]).arg(&download_dir).arg("--clobber").stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::piped()).spawn().map_err(|error| format!("Не удалось начать загрузку: {error}"))?;
    loop {
        let downloaded = directory_size(&download_dir).min(asset.size.max(1));
        emit_update_progress(&app, "Скачиваю обновление", downloaded, asset.size, false, None);
        match child.try_wait() {
            Ok(Some(status)) if status.success() => break,
            Ok(Some(_)) => {
                let output = child.wait_with_output().map_err(|error| format!("Не удалось прочитать ошибку загрузки: {error}"))?;
                let error = { let details = String::from_utf8_lossy(&output.stderr).trim().to_string(); if details.is_empty() { "Не удалось скачать обновление".to_string() } else { details } };
                emit_update_progress(&app,"Ошибка обновления",downloaded,asset.size,true,Some(error.clone())); return Err(error);
            }
            Ok(None) => tokio::time::sleep(Duration::from_millis(180)).await,
            Err(error) => { let error = format!("Не удалось проверить загрузку: {error}"); emit_update_progress(&app,"Ошибка обновления",downloaded,asset.size,true,Some(error.clone())); return Err(error); }
        }
    }
    let downloaded = download_dir.join(&asset.name);
    if !downloaded.is_file() { let error = format!("GitHub сообщил об успешной загрузке, но файл {} не найден", asset.name); emit_update_progress(&app,"Ошибка обновления",0,asset.size,true,Some(error.clone())); return Err(error); }
    let actual_size = fs::metadata(&downloaded).map(|value| value.len()).unwrap_or_default();
    if asset.size > 0 && actual_size != asset.size { let error = format!("Размер обновления не совпал: получено {actual_size}, ожидалось {}", asset.size); emit_update_progress(&app,"Ошибка обновления",actual_size,asset.size,true,Some(error.clone())); return Err(error); }
    #[cfg(target_os = "linux")]
    {
        let appimage = env::var("APPIMAGE").map(PathBuf::from).map_err(|_| "Автообновление Linux доступно для AppImage-сборки".to_string())?;
        let pending = appimage.with_extension("AppImage.next"); fs::copy(&downloaded, &pending).map_err(|error| format!("Не удалось подготовить обновление: {error}"))?; set_executable(&pending)?;
        emit_update_progress(&app,"Обновление готово",asset.size,asset.size,true,None); return Ok(pending.to_string_lossy().into_owned());
    }
    #[cfg(windows)] { emit_update_progress(&app,"Обновление готово",asset.size,asset.size,true,None); return Ok(downloaded.to_string_lossy().into_owned()); }
    #[allow(unreachable_code)] Err("Автообновление пока поддерживается на Windows и Linux".to_string())
}
