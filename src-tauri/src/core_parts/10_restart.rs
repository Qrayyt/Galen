#[cfg(unix)]
fn set_executable(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let mut permissions = fs::metadata(path).map_err(|error| error.to_string())?.permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(path, permissions).map_err(|error| error.to_string())
}

#[cfg(not(unix))]
fn set_executable(_path: &Path) -> Result<(), String> { Ok(()) }

#[cfg(target_os = "linux")]
#[tauri::command]
fn restart_into_update(path: String, app: AppHandle) -> Result<(), String> {
    let current = env::var("APPIMAGE").map(PathBuf::from).map_err(|_| "Перезапуск обновления доступен для AppImage".to_string())?;
    let pending = PathBuf::from(path);
    if !pending.exists() { return Err("Файл обновления не найден".to_string()); }
    let backup = current.with_extension("AppImage.old");
    if backup.exists() { fs::remove_file(&backup).map_err(|error| error.to_string())?; }
    fs::rename(&current, &backup).map_err(|error| format!("Не удалось сохранить предыдущую версию: {error}"))?;
    if let Err(error) = fs::rename(&pending, &current) { let _ = fs::rename(&backup, &current); return Err(format!("Не удалось установить обновление: {error}")); }
    set_executable(&current)?;
    Command::new(&current).spawn().map_err(|error| format!("Не удалось запустить новую версию: {error}"))?;
    app.exit(0); Ok(())
}

#[cfg(windows)]
#[tauri::command]
fn restart_into_update(path: String, app: AppHandle) -> Result<(), String> {
    let installer = PathBuf::from(path);
    if !installer.is_file() || installer.extension().and_then(|value| value.to_str()) != Some("exe") { return Err("Установщик обновления не найден".to_string()); }
    let current_exe = env::current_exe().map_err(|error| error.to_string())?;
    let pid = std::process::id();
    let script_path = installer.with_extension("update.ps1");
    let escape = |value: &str| value.replace('\'', "''");
    let script = format!(
        "$ErrorActionPreference='Stop'\n\
$pidToWait={pid}\n\
$installer='{installer}'\n\
$app='{app_path}'\n\
try {{\n\
  while (Get-Process -Id $pidToWait -ErrorAction SilentlyContinue) {{ Start-Sleep -Milliseconds 200 }}\n\
  $process = Start-Process -FilePath $installer -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru\n\
  if ($process.ExitCode -ne 0) {{ exit $process.ExitCode }}\n\
  if (Test-Path $app) {{ Start-Process -FilePath $app }}\n\
}} finally {{\n\
  Remove-Item -LiteralPath $installer -Force -ErrorAction SilentlyContinue\n\
  Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue\n\
}}",
        installer = escape(&installer.to_string_lossy()), app_path = escape(&current_exe.to_string_lossy()),
    );
    fs::write(&script_path, script).map_err(|error| format!("Не удалось подготовить тихое обновление: {error}"))?;
    hidden_command("powershell.exe").args(["-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-WindowStyle","Hidden","-File"]).arg(&script_path).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().map_err(|error| format!("Не удалось запустить тихое обновление: {error}"))?;
    app.exit(0); Ok(())
}

#[cfg(not(any(windows, target_os = "linux")))]
#[tauri::command]
fn restart_into_update(_path: String, _app: AppHandle) -> Result<(), String> { Err("Автообновление пока поддерживается на Windows и Linux".to_string()) }

fn cleanup_completed_update() {
    #[cfg(target_os = "linux")]
    if let Ok(current) = env::var("APPIMAGE") {
        let backup = PathBuf::from(current).with_extension("AppImage.old");
        if backup.is_file() { let _ = fs::remove_file(backup); }
    }
}
