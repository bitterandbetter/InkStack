use crate::models::AiGenerateRequest;

pub const DEFAULT_OPENAI_MODEL: &str = "gpt-4o-mini";
pub const DEFAULT_ANTHROPIC_MODEL: &str = "claude-3-5-sonnet-latest";
pub const DEFAULT_GEMINI_MODEL: &str = "gemini-2.5-flash";
pub const DEFAULT_NVIDIA_MODEL: &str = "meta/llama-3.1-8b-instruct";

pub fn openai_prefers_responses_api(model: &str) -> bool {
    model == "gpt-5.4-pro"
}

pub fn supports_temperature(model: &str) -> bool {
    let model = model.trim();
    !(model.starts_with("gpt-5") || model.starts_with('o'))
}

pub fn system_prompt_from_env() -> Option<String> {
    std::env::var("INKSTACK_AI_SYSTEM_PROMPT")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub fn env_or_default(name: &str, default_value: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| default_value.to_string())
}

pub fn required_env(name: &str) -> Result<String, String> {
    std::env::var(name)
        .map(|value| value.trim().to_string())
        .ok()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("本机环境变量 {name} 未配置。"))
}

pub fn request_model_or_env(
    request: &AiGenerateRequest,
    env_name: &str,
    default_model: &str,
) -> String {
    if !request.model.trim().is_empty() {
        return request.model.trim().to_string();
    }

    env_or_default(env_name, default_model)
}
