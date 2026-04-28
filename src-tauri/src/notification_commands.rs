use std::process::Command;

#[tauri::command]
pub async fn show_desktop_notification(title: String, body: String) -> Result<(), String> {
    if title.trim().is_empty() && body.trim().is_empty() {
        return Ok(());
    }

    show_platform_notification(&title, &body).await
}

#[cfg(target_os = "macos")]
async fn show_platform_notification(title: &str, body: &str) -> Result<(), String> {
    let script = format!(
        "display notification {} with title {}",
        apple_script_string(body),
        apple_script_string(title)
    );

    let status = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .status()
        .map_err(|error| format!("无法发送桌面通知：{error}"))?;

    if status.success() {
        Ok(())
    } else {
        Err("桌面通知发送失败".to_string())
    }
}

#[cfg(not(target_os = "macos"))]
async fn show_platform_notification(_title: &str, _body: &str) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "macos")]
fn apple_script_string(value: &str) -> String {
    let escaped = value.replace('\\', "\\\\").replace('"', "\\\"");
    format!("\"{escaped}\"")
}
