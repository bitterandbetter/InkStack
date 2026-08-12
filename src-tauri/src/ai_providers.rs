use std::{
    io::Write,
    process::{Command, Stdio},
};

use crate::ai_config::{
    env_or_default, openai_prefers_responses_api, request_model_or_env, required_env,
    supports_temperature, system_prompt_from_env, DEFAULT_ANTHROPIC_MODEL, DEFAULT_GEMINI_MODEL,
    DEFAULT_NVIDIA_MODEL, DEFAULT_OPENAI_MODEL,
};
use crate::models::{AiGenerateRequest, AiGenerateResult};

pub enum AiStreamParser {
    OpenAiChat,
    OpenAiResponses,
    Anthropic,
    Gemini,
}

pub struct AiStreamSpec {
    pub provider: String,
    pub model: String,
    pub url: String,
    pub headers: Vec<(String, String)>,
    pub body: String,
    pub parser: AiStreamParser,
}

pub fn build_ai_stream_spec(request: &AiGenerateRequest) -> Result<AiStreamSpec, String> {
    match request.kind.as_str() {
        "openai" => build_openai_stream_spec(request),
        "openai-compatible" => build_openai_compatible_stream_spec(request),
        "anthropic" => build_anthropic_stream_spec(request),
        "gemini" => build_gemini_stream_spec(request),
        "nvidia" => build_nvidia_stream_spec(request),
        _ => Err("Unsupported AI provider kind".to_string()),
    }
}

fn resolve_base_url(request: &AiGenerateRequest, default_env: &str, default_url: &str) -> String {
    if let Some(url) = request.base_url.as_deref().filter(|url| !url.trim().is_empty()) {
        return url.trim().to_string();
    }
    let env_name = request.base_url_env.as_deref().unwrap_or(default_env);
    env_or_default(env_name, default_url)
}

fn resolve_api_key(request: &AiGenerateRequest, default_env: &str) -> Result<String, String> {
    let env_name = request.api_key_env.as_deref().unwrap_or(default_env);
    required_env(env_name)
}

fn resolve_model(request: &AiGenerateRequest, default_env: &str, default_model: &str) -> String {
    request_model_or_env(
        request,
        request.model_env.as_deref().unwrap_or(default_env),
        default_model,
    )
}

pub async fn request_openai_compatible(
    request: AiGenerateRequest,
) -> Result<AiGenerateResult, String> {
    let base_url = resolve_base_url(
        &request,
        "OPENAI_BASE_URL",
        "https://api.openai.com/v1",
    );
    let api_key = resolve_api_key(&request, "OPENAI_API_KEY")?;
    let model = resolve_model(&request, "OPENAI_MODEL", DEFAULT_OPENAI_MODEL);
    let use_responses = openai_prefers_responses_api(&model);
    let url = if use_responses {
        format!("{}/responses", base_url.trim_end_matches('/'))
    } else {
        format!("{}/chat/completions", base_url.trim_end_matches('/'))
    };
    let body = build_openai_body(&request, &model, use_responses);
    let body = serde_json::to_string(&body).map_err(|error| error.to_string())?;

    let text = tokio::task::spawn_blocking(move || {
        post_json_with_curl(
            &url,
            vec![
                ("Content-Type".to_string(), "application/json".to_string()),
                ("Authorization".to_string(), format!("Bearer {api_key}")),
            ],
            &body,
        )
    })
    .await
    .map_err(|error| error.to_string())??;
    let data = serde_json::from_str::<serde_json::Value>(&text).unwrap_or(serde_json::Value::Null);

    if let Some(error) = data.get("error") {
        let message = error
            .get("message")
            .and_then(|message| message.as_str())
            .unwrap_or("AI 请求失败");
        return Err(format!("AI 请求失败：{message}"));
    }

    let content = if use_responses {
        extract_openai_responses_text(&data)
    } else {
        extract_openai_chat_text(&data)
    }
    .ok_or_else(|| "AI 返回为空。".to_string())?;

    Ok(AiGenerateResult {
        text: content.to_string(),
        model: data
            .get("model")
            .and_then(|model| model.as_str())
            .map(|model| model.to_string()),
    })
}

pub async fn request_nvidia_compatible(
    request: AiGenerateRequest,
) -> Result<AiGenerateResult, String> {
    let base_url = env_or_default("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1");
    let api_key = required_env("NVIDIA_API_KEY")?;
    let model = request_model_or_env(&request, "NVIDIA_MODEL", DEFAULT_NVIDIA_MODEL);
    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
    let body = build_openai_body(&request, &model, false);
    let body = serde_json::to_string(&body).map_err(|error| error.to_string())?;

    let text = tokio::task::spawn_blocking(move || {
        post_json_with_curl(
            &url,
            vec![
                ("Content-Type".to_string(), "application/json".to_string()),
                ("Authorization".to_string(), format!("Bearer {api_key}")),
            ],
            &body,
        )
    })
    .await
    .map_err(|error| error.to_string())??;
    let data = serde_json::from_str::<serde_json::Value>(&text).unwrap_or(serde_json::Value::Null);

    if let Some(error) = data.get("error") {
        let message = error
            .get("message")
            .and_then(|message| message.as_str())
            .unwrap_or("AI 请求失败");
        return Err(format!("AI 请求失败：{message}"));
    }

    let content = extract_openai_chat_text(&data).ok_or_else(|| "NVIDIA 返回为空。".to_string())?;

    Ok(AiGenerateResult {
        text: content.to_string(),
        model: data
            .get("model")
            .and_then(|model| model.as_str())
            .map(|model| model.to_string()),
    })
}

pub async fn request_anthropic(request: AiGenerateRequest) -> Result<AiGenerateResult, String> {
    let base_url = env_or_default("ANTHROPIC_BASE_URL", "https://api.anthropic.com");
    let api_key = required_env("ANTHROPIC_API_KEY")?;
    let model = request_model_or_env(&request, "ANTHROPIC_MODEL", DEFAULT_ANTHROPIC_MODEL);
    let url = anthropic_messages_url(&base_url);
    let body = build_anthropic_body(&request, &model, false)?;

    let text = tokio::task::spawn_blocking(move || {
        post_json_with_curl(
            &url,
            vec![
                ("Content-Type".to_string(), "application/json".to_string()),
                ("x-api-key".to_string(), api_key),
                ("anthropic-version".to_string(), "2023-06-01".to_string()),
            ],
            &body,
        )
    })
    .await
    .map_err(|error| error.to_string())??;
    let data = serde_json::from_str::<serde_json::Value>(&text).unwrap_or(serde_json::Value::Null);

    if let Some(error) = data.get("error") {
        let message = error
            .get("message")
            .and_then(|message| message.as_str())
            .unwrap_or("AI 请求失败");
        return Err(format!("AI 请求失败：{message}"));
    }

    let content = data
        .get("content")
        .and_then(|content| content.as_array())
        .map(|parts| {
            parts
                .iter()
                .filter_map(|part| part.get("text").and_then(|text| text.as_str()))
                .collect::<String>()
        })
        .map(|content| content.trim().to_string())
        .filter(|content| !content.is_empty())
        .ok_or_else(|| "Claude 返回为空。".to_string())?;

    Ok(AiGenerateResult {
        text: content,
        model: data
            .get("model")
            .and_then(|model| model.as_str())
            .map(|model| model.to_string()),
    })
}

pub async fn request_gemini(request: AiGenerateRequest) -> Result<AiGenerateResult, String> {
    let api_key = required_env("GEMINI_API_KEY")?;
    let model = request_model_or_env(&request, "GEMINI_MODEL", DEFAULT_GEMINI_MODEL);
    let url = format!(
        "{}/v1beta/models/{}:generateContent",
        gemini_base_url(),
        model
    );
    let body = build_gemini_body(&request, &model, false)?;

    let text = tokio::task::spawn_blocking(move || {
        post_json_with_curl(
            &url,
            vec![
                ("Content-Type".to_string(), "application/json".to_string()),
                ("x-goog-api-key".to_string(), api_key),
            ],
            &body,
        )
    })
    .await
    .map_err(|error| error.to_string())??;
    let data = serde_json::from_str::<serde_json::Value>(&text).unwrap_or(serde_json::Value::Null);

    if let Some(error) = data.get("error") {
        let message = error
            .get("message")
            .and_then(|message| message.as_str())
            .unwrap_or("AI 请求失败");
        return Err(format!("AI 请求失败：{message}"));
    }

    let content = data
        .get("candidates")
        .and_then(|candidates| candidates.get(0))
        .and_then(|candidate| candidate.get("content"))
        .and_then(|content| content.get("parts"))
        .and_then(|parts| parts.as_array())
        .map(|parts| {
            parts
                .iter()
                .filter_map(|part| part.get("text").and_then(|text| text.as_str()))
                .collect::<String>()
        })
        .map(|content| content.trim().to_string())
        .filter(|content| !content.is_empty())
        .ok_or_else(|| "Gemini 返回为空。".to_string())?;

    Ok(AiGenerateResult {
        text: content,
        model: data
            .get("modelVersion")
            .or_else(|| data.get("model"))
            .and_then(|model| model.as_str())
            .map(|model| model.to_string()),
    })
}

pub fn extract_stream_delta(data: &serde_json::Value, parser: &AiStreamParser) -> Option<String> {
    let text = match parser {
        AiStreamParser::OpenAiChat => data
            .get("choices")
            .and_then(|choices| choices.get(0))
            .and_then(|choice| choice.get("delta"))
            .and_then(|delta| delta.get("content"))
            .and_then(|content| content.as_str()),
        AiStreamParser::OpenAiResponses => extract_openai_responses_stream_delta(data),
        AiStreamParser::Anthropic => data
            .get("delta")
            .and_then(|delta| delta.get("text"))
            .and_then(|text| text.as_str()),
        AiStreamParser::Gemini => {
            let delta = data
                .get("candidates")
                .and_then(|candidates| candidates.get(0))
                .and_then(|candidate| candidate.get("content"))
                .and_then(|content| content.get("parts"))
                .and_then(|parts| parts.as_array())
                .into_iter()
                .flatten()
                .filter_map(|part| part.get("text").and_then(|text| text.as_str()))
                .collect::<String>();
            return if delta.is_empty() { None } else { Some(delta) };
        }
    }?;

    if text.is_empty() {
        None
    } else {
        Some(text.to_string())
    }
}

fn build_openai_stream_spec(request: &AiGenerateRequest) -> Result<AiStreamSpec, String> {
    let base_url = resolve_base_url(
        request,
        "OPENAI_BASE_URL",
        "https://api.openai.com/v1",
    );
    let api_key = resolve_api_key(request, "OPENAI_API_KEY")?;
    let model = resolve_model(request, "OPENAI_MODEL", DEFAULT_OPENAI_MODEL);
    let use_responses = openai_prefers_responses_api(&model);
    let url = if use_responses {
        format!("{}/responses", base_url.trim_end_matches('/'))
    } else {
        format!("{}/chat/completions", base_url.trim_end_matches('/'))
    };
    let mut body = build_openai_body(request, &model, use_responses);
    body["stream"] = serde_json::json!(true);

    Ok(AiStreamSpec {
        provider: "openai".to_string(),
        model,
        url,
        headers: vec![
            ("Content-Type".to_string(), "application/json".to_string()),
            ("Authorization".to_string(), format!("Bearer {api_key}")),
        ],
        body: serde_json::to_string(&body).map_err(|error| error.to_string())?,
        parser: if use_responses {
            AiStreamParser::OpenAiResponses
        } else {
            AiStreamParser::OpenAiChat
        },
    })
}

fn build_openai_compatible_stream_spec(request: &AiGenerateRequest) -> Result<AiStreamSpec, String> {
    let base_url = resolve_base_url(
        request,
        "OPENAI_BASE_URL",
        "https://api.deepseek.com/v1",
    );
    let api_key = resolve_api_key(request, "OPENAI_API_KEY")?;
    let model = resolve_model(request, "OPENAI_MODEL", DEFAULT_OPENAI_MODEL);
    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
    let mut body = build_openai_body(request, &model, false);
    body["stream"] = serde_json::json!(true);

    Ok(AiStreamSpec {
        provider: "openai-compatible".to_string(),
        model,
        url,
        headers: vec![
            ("Content-Type".to_string(), "application/json".to_string()),
            ("Authorization".to_string(), format!("Bearer {api_key}")),
        ],
        body: serde_json::to_string(&body).map_err(|error| error.to_string())?,
        parser: AiStreamParser::OpenAiChat,
    })
}

fn build_anthropic_stream_spec(request: &AiGenerateRequest) -> Result<AiStreamSpec, String> {
    let base_url = env_or_default("ANTHROPIC_BASE_URL", "https://api.anthropic.com");
    let api_key = required_env("ANTHROPIC_API_KEY")?;
    let model = request_model_or_env(request, "ANTHROPIC_MODEL", DEFAULT_ANTHROPIC_MODEL);
    let body = build_anthropic_body(request, &model, true)?;

    Ok(AiStreamSpec {
        provider: "anthropic".to_string(),
        model,
        url: anthropic_messages_url(&base_url),
        headers: vec![
            ("Content-Type".to_string(), "application/json".to_string()),
            ("x-api-key".to_string(), api_key),
            ("anthropic-version".to_string(), "2023-06-01".to_string()),
        ],
        body,
        parser: AiStreamParser::Anthropic,
    })
}

fn anthropic_messages_url(base_url: &str) -> String {
    let base_url = base_url.trim_end_matches('/');
    if base_url.ends_with("/messages") {
        base_url.to_string()
    } else if base_url.ends_with("/v1") {
        format!("{base_url}/messages")
    } else {
        format!("{base_url}/v1/messages")
    }
}

fn build_gemini_stream_spec(request: &AiGenerateRequest) -> Result<AiStreamSpec, String> {
    let api_key = required_env("GEMINI_API_KEY")?;
    let model = request_model_or_env(request, "GEMINI_MODEL", DEFAULT_GEMINI_MODEL);
    let body = build_gemini_body(request, &model, true)?;

    Ok(AiStreamSpec {
        provider: "gemini".to_string(),
        model: model.clone(),
        url: format!(
            "{}/v1beta/models/{}:streamGenerateContent?alt=sse",
            gemini_base_url(),
            model
        ),
        headers: vec![
            ("Content-Type".to_string(), "application/json".to_string()),
            ("x-goog-api-key".to_string(), api_key),
        ],
        body,
        parser: AiStreamParser::Gemini,
    })
}

fn gemini_base_url() -> &'static str {
    // Gemini official REST endpoint.
    "https://generativelanguage.googleapis.com"
}

fn build_nvidia_stream_spec(request: &AiGenerateRequest) -> Result<AiStreamSpec, String> {
    let base_url = env_or_default("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1");
    let api_key = required_env("NVIDIA_API_KEY")?;
    let model = request_model_or_env(request, "NVIDIA_MODEL", DEFAULT_NVIDIA_MODEL);
    let mut body = build_openai_body(request, &model, false);
    body["stream"] = serde_json::json!(true);

    Ok(AiStreamSpec {
        provider: "nvidia".to_string(),
        model,
        url: format!("{}/chat/completions", base_url.trim_end_matches('/')),
        headers: vec![
            ("Content-Type".to_string(), "application/json".to_string()),
            ("Authorization".to_string(), format!("Bearer {api_key}")),
        ],
        body: serde_json::to_string(&body).map_err(|error| error.to_string())?,
        parser: AiStreamParser::OpenAiChat,
    })
}

fn build_anthropic_body(
    request: &AiGenerateRequest,
    model: &str,
    stream: bool,
) -> Result<String, String> {
    let mut body = serde_json::json!({
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": build_ai_user_prompt(request)
            }
        ],
        "max_tokens": 1024,
        "temperature": request.temperature,
        "stream": stream
    });
    if let Some(system_prompt) = system_prompt_from_env() {
        body["system"] = serde_json::json!(system_prompt);
    }

    serde_json::to_string(&body).map_err(|error| error.to_string())
}

fn build_gemini_body(
    request: &AiGenerateRequest,
    _model: &str,
    _stream: bool,
) -> Result<String, String> {
    let mut body = serde_json::json!({
        "contents": [
            {
                "parts": [{ "text": build_ai_user_prompt(request) }]
            }
        ],
        "generationConfig": {
            "temperature": request.temperature,
            "maxOutputTokens": 1024
        }
    });
    if let Some(system_prompt) = system_prompt_from_env() {
        body["systemInstruction"] = serde_json::json!({
            "parts": [{ "text": system_prompt }]
        });
    }

    serde_json::to_string(&body).map_err(|error| error.to_string())
}

fn post_json_with_curl(
    url: &str,
    headers: Vec<(String, String)>,
    body: &str,
) -> Result<String, String> {
    let mut command = Command::new("curl");
    command
        .arg("-sS")
        .arg("--fail-with-body")
        .arg("--connect-timeout")
        .arg("15")
        .arg("--max-time")
        .arg("60")
        .arg("--http1.1")
        .arg("-X")
        .arg("POST")
        .arg(url);

    for (name, value) in headers {
        command.arg("-H").arg(format!("{name}: {value}"));
    }

    let mut child = command
        .arg("--data-binary")
        .arg("@-")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("无法启动 curl：{error}"))?;

    if let Some(stdin) = child.stdin.as_mut() {
        stdin
            .write_all(body.as_bytes())
            .map_err(|error| format!("写入 AI 请求失败：{error}"))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|error| format!("AI 请求等待失败：{error}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();

    if output.status.success() {
        return Ok(stdout);
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    let message = if stdout.trim().is_empty() {
        stderr.trim().to_string()
    } else {
        stdout.trim().to_string()
    };
    Err(format!("AI 请求失败：{message}"))
}

fn build_ai_messages(request: &AiGenerateRequest) -> Vec<serde_json::Value> {
    let mut messages = Vec::new();
    if let Some(system_prompt) = system_prompt_from_env() {
        messages.push(serde_json::json!({
            "role": "system",
            "content": system_prompt
        }));
    }
    messages.push(serde_json::json!({
        "role": "user",
        "content": build_ai_user_prompt(request)
    }));
    messages
}

fn build_openai_body(
    request: &AiGenerateRequest,
    model: &str,
    use_responses: bool,
) -> serde_json::Value {
    if use_responses {
        let mut body = serde_json::json!({
            "model": model,
            "input": build_ai_user_prompt(request),
            "max_output_tokens": 1024,
            "stream": false
        });
        if let Some(system_prompt) = system_prompt_from_env() {
            body["instructions"] = serde_json::json!(system_prompt);
        }
        if supports_temperature(model) {
            body["temperature"] = serde_json::json!(request.temperature);
        }
        return body;
    }

    let mut body = serde_json::json!({
        "model": model,
        "messages": build_ai_messages(request),
        "max_tokens": 1024,
        "stream": false
    });
    if supports_temperature(model) {
        body["temperature"] = serde_json::json!(request.temperature);
    }
    body
}

fn extract_openai_chat_text(data: &serde_json::Value) -> Option<String> {
    data.get("choices")
        .and_then(|choices| choices.get(0))
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(|content| content.as_str())
        .map(str::trim)
        .filter(|content| !content.is_empty())
        .map(|content| content.to_string())
}

fn extract_openai_responses_text(data: &serde_json::Value) -> Option<String> {
    if let Some(text) = data
        .get("output_text")
        .and_then(|content| content.as_str())
        .map(str::trim)
        .filter(|content| !content.is_empty())
    {
        return Some(text.to_string());
    }

    let content = data
        .get("output")
        .and_then(|output| output.as_array())
        .into_iter()
        .flatten()
        .flat_map(|item| {
            item.get("content")
                .and_then(|content| content.as_array())
                .into_iter()
                .flatten()
        })
        .filter_map(|part| {
            part.get("text")
                .or_else(|| part.get("output_text"))
                .and_then(|text| text.as_str())
        })
        .collect::<String>()
        .trim()
        .to_string();

    if content.is_empty() {
        None
    } else {
        Some(content)
    }
}

fn extract_openai_responses_stream_delta(data: &serde_json::Value) -> Option<&str> {
    data.get("delta")
        .and_then(|delta| delta.as_str())
        .or_else(|| data.get("text").and_then(|text| text.as_str()))
        .or_else(|| {
            data.get("item")
                .and_then(|item| item.get("content"))
                .and_then(|content| content.get(0))
                .and_then(|part| part.get("text"))
                .and_then(|text| text.as_str())
        })
}

fn build_ai_user_prompt(request: &AiGenerateRequest) -> String {
    const MAX_CONTEXT_CHARS: usize = 30000;
    let context = request.context.as_deref().unwrap_or("").trim();
    let trimmed_context = context.chars().take(MAX_CONTEXT_CHARS).collect::<String>();
    let mode = request.mode.as_deref().unwrap_or("chat");

    if mode == "rewrite" {
        return [
            format!("Instruction: {}", request.prompt),
            String::new(),
            "Apply the instruction to the Markdown below.".to_string(),
            "Only output the modified Markdown. Do not explain your changes.".to_string(),
            String::new(),
            trimmed_context,
        ]
        .join("\n");
    }

    if trimmed_context.is_empty() {
        return request.prompt.clone();
    }

    [
        "Current Markdown context:".to_string(),
        trimmed_context,
        String::new(),
        format!("User question: {}", request.prompt),
    ]
    .join("\n")
}
