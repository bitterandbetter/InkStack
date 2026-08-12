use std::{
    io::{BufRead, BufReader, Write},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};

#[cfg(target_family = "unix")]
use std::os::unix::process::CommandExt;

use tauri::{Emitter, Manager};

use crate::ai_config::{
    request_model_or_env, DEFAULT_ANTHROPIC_MODEL, DEFAULT_GEMINI_MODEL, DEFAULT_NVIDIA_MODEL,
    DEFAULT_OPENAI_MODEL,
};
use crate::ai_providers::{
    build_ai_stream_spec, extract_stream_delta, request_anthropic, request_gemini,
    request_nvidia_compatible, request_openai_compatible, AiStreamSpec,
};
use crate::models::{
    AiGenerateRequest, AiGenerateResult, AiModelTestResult, AiStreamDeltaPayload,
    AiStreamEndPayload, AiStreamErrorPayload, AiStreamStartPayload,
};
use crate::{AiStreamControl, AppState};

#[tauri::command]
pub async fn generate_ai_text(request: AiGenerateRequest) -> Result<AiGenerateResult, String> {
    let request = normalize_ai_request(request)?;

    match request.kind.as_str() {
        "openai" | "openai-compatible" => request_openai_compatible(request)
            .await
            .map(|response| AiGenerateResult {
                text: response.text,
                model: None,
            }),
        "anthropic" => request_anthropic(request)
            .await
            .map(|response| AiGenerateResult {
                text: response.text,
                model: None,
            }),
        "gemini" => request_gemini(request)
            .await
            .map(|response| AiGenerateResult {
                text: response.text,
                model: None,
            }),
        "nvidia" => request_nvidia_compatible(request)
            .await
            .map(|response| AiGenerateResult {
                text: response.text,
                model: None,
            }),
        _ => Err("Unsupported AI provider kind".to_string()),
    }
}

#[tauri::command]
pub async fn generate_ai_text_stream(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    request_id: String,
    request: AiGenerateRequest,
) -> Result<(), String> {
    let request_id = request_id.trim().to_string();
    if request_id.is_empty() {
        return Err("AI stream request id is missing.".to_string());
    }

    let request = normalize_ai_request(request)?;
    let spec = build_ai_stream_spec(&request)?;
    let cancelled = Arc::new(AtomicBool::new(false));

    {
        let mut streams = state
            .ai_streams
            .lock()
            .map_err(|_| "AI stream state is unavailable.".to_string())?;
        if let Some(previous) = streams.remove(&request_id) {
            previous.cancelled.store(true, Ordering::SeqCst);
            terminate_process(previous.pid);
        }
        streams.insert(
            request_id.clone(),
            AiStreamControl {
                cancelled: cancelled.clone(),
                pid: None,
            },
        );
    }

    tauri::async_runtime::spawn_blocking(move || {
        if let Err(error) = stream_ai_with_curl(app.clone(), request_id.clone(), spec, cancelled) {
            let _ = app.emit(
                "inkstack://ai-stream-error",
                AiStreamErrorPayload {
                    request_id: request_id.clone(),
                    error,
                },
            );
        }
        remove_ai_stream_control(&app, &request_id);
    });

    Ok(())
}

#[tauri::command]
pub async fn cancel_ai_stream(
    state: tauri::State<'_, AppState>,
    request_id: String,
) -> Result<(), String> {
    let control = state
        .ai_streams
        .lock()
        .map_err(|_| "AI stream state is unavailable.".to_string())?
        .remove(request_id.trim());

    if let Some(control) = control {
        control.cancelled.store(true, Ordering::SeqCst);
        terminate_process(control.pid);
    }

    Ok(())
}

#[tauri::command]
pub async fn test_ai_model(request: AiGenerateRequest) -> Result<AiModelTestResult, String> {
    let mut request = normalize_ai_request(request)?;
    request.context = None;
    request.mode = Some("model_test".to_string());

    let provider = request.kind.clone();
    let requested_model = match request.kind.as_str() {
        "openai" | "openai-compatible" => {
            request_model_or_env(&request, "OPENAI_MODEL", DEFAULT_OPENAI_MODEL)
        }
        "anthropic" => request_model_or_env(&request, "ANTHROPIC_MODEL", DEFAULT_ANTHROPIC_MODEL),
        "gemini" => request_model_or_env(&request, "GEMINI_MODEL", DEFAULT_GEMINI_MODEL),
        "nvidia" => request_model_or_env(&request, "NVIDIA_MODEL", DEFAULT_NVIDIA_MODEL),
        _ => return Err("Unsupported AI provider kind".to_string()),
    };

    let result = match request.kind.as_str() {
        "openai" | "openai-compatible" => request_openai_compatible(request).await,
        "anthropic" => request_anthropic(request).await,
        "gemini" => request_gemini(request).await,
        "nvidia" => request_nvidia_compatible(request).await,
        _ => return Err("Unsupported AI provider kind".to_string()),
    };

    Ok(match result {
        Ok(response) => AiModelTestResult {
            ok: true,
            provider,
            requested_model,
            response_model: response.model,
            answer: Some(response.text),
            error: None,
        },
        Err(error) => AiModelTestResult {
            ok: false,
            provider,
            requested_model,
            response_model: None,
            answer: None,
            error: Some(error),
        },
    })
}

fn normalize_ai_request(mut request: AiGenerateRequest) -> Result<AiGenerateRequest, String> {
    request.kind = request.kind.trim().to_string();
    request.model = request.model.trim().to_string();
    request.prompt = request.prompt.trim().to_string();

    if request.prompt.is_empty() {
        return Err("请输入 AI 指令。".to_string());
    }

    request.temperature = request.temperature.clamp(0.0, 2.0);
    Ok(request)
}

fn stream_ai_with_curl(
    app: tauri::AppHandle,
    request_id: String,
    spec: AiStreamSpec,
    cancelled: Arc<AtomicBool>,
) -> Result<(), String> {
    let mut command = Command::new("curl");
    command
        .arg("-sS")
        .arg("--fail-with-body")
        .arg("--connect-timeout")
        .arg("15")
        .arg("--max-time")
        .arg("120")
        .arg("--http1.1")
        .arg("-N")
        .arg("-X")
        .arg("POST")
        .arg(&spec.url);

    for (name, value) in &spec.headers {
        command.arg("-H").arg(format!("{name}: {value}"));
    }

    let child = command
        .arg("--data-binary")
        .arg("@-")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_family = "unix")]
    child.process_group(0);

    let mut child = child
        .spawn()
        .map_err(|error| format!("无法启动 curl：{error}"))?;

    let pid = child.id();
    update_ai_stream_pid(&app, &request_id, pid);

    if cancelled.load(Ordering::SeqCst) {
        let _ = child.kill();
        return Ok(());
    }

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(spec.body.as_bytes())
            .map_err(|error| format!("写入 AI 请求失败：{error}"))?;
    }

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "无法读取 AI 流式响应。".to_string())?;
    let mut reader = BufReader::new(stdout);
    let mut line = String::new();

    let _ = app.emit(
        "inkstack://ai-stream-start",
        AiStreamStartPayload {
            request_id: request_id.clone(),
            provider: spec.provider.clone(),
            model: spec.model.clone(),
        },
    );

    loop {
        if cancelled.load(Ordering::SeqCst) {
            let _ = child.kill();
            break;
        }

        line.clear();
        let bytes = reader
            .read_line(&mut line)
            .map_err(|error| format!("读取 AI 流式响应失败：{error}"))?;
        if bytes == 0 {
            break;
        }

        let Some(data) = sse_data_payload(&line) else {
            continue;
        };
        if data == "[DONE]" {
            break;
        }

        let parsed = serde_json::from_str::<serde_json::Value>(&data)
            .map_err(|error| format!("解析 AI 流式响应失败：{error}"))?;
        if let Some(error) = parsed.get("error") {
            return Err(format!("AI 请求失败：{}", stream_error_message(error)));
        }

        if let Some(delta) = extract_stream_delta(&parsed, &spec.parser) {
            let _ = app.emit(
                "inkstack://ai-stream-delta",
                AiStreamDeltaPayload {
                    request_id: request_id.clone(),
                    text: delta,
                },
            );
        }
    }

    let output = child
        .wait_with_output()
        .map_err(|error| format!("AI 请求等待失败：{error}"))?;
    if cancelled.load(Ordering::SeqCst) {
        return Ok(());
    }

    if output.status.success() {
        let _ = app.emit(
            "inkstack://ai-stream-end",
            AiStreamEndPayload {
                request_id,
                model: Some(spec.model),
            },
        );
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    let error_message = if stderr.trim().is_empty() {
        "stream closed with an HTTP error".to_string()
    } else {
        stderr.trim().to_string()
    };
    Err(format!("AI 请求失败：{}", error_message))
}

fn sse_data_payload(line: &str) -> Option<String> {
    line.trim_end()
        .strip_prefix("data:")
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn stream_error_message(error: &serde_json::Value) -> String {
    error
        .get("message")
        .and_then(|message| message.as_str())
        .unwrap_or("AI 请求失败")
        .to_string()
}

fn update_ai_stream_pid(app: &tauri::AppHandle, request_id: &str, pid: u32) {
    if let Ok(mut streams) = app.state::<AppState>().ai_streams.lock() {
        if let Some(control) = streams.get_mut(request_id) {
            control.pid = Some(pid);
        }
    }
}

fn remove_ai_stream_control(app: &tauri::AppHandle, request_id: &str) {
    if let Ok(mut streams) = app.state::<AppState>().ai_streams.lock() {
        streams.remove(request_id);
    }
}

fn terminate_process(pid: Option<u32>) {
    let Some(pid) = pid else {
        return;
    };

    #[cfg(target_family = "unix")]
    {
        let _ = Command::new("kill")
            .arg("-TERM")
            .arg(format!("-{}", pid))
            .status();
    }

    #[cfg(target_family = "windows")]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .status();
    }
}
