mod backend_bridge;

use backend_bridge::BackendBridge;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Serialize)]
struct OkResponse {
    ok: bool,
}

#[tauri::command]
fn app_open_devtools(app: AppHandle) -> Result<OkResponse, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window was not found.".to_string())?;

    window.open_devtools();

    Ok(OkResponse { ok: true })
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SessionItem {
    id: String,
    name: String,
    group: SessionGroup,
    host: String,
    port: u16,
    username: String,
    password: String,
    auth_method: SessionAuthMethod,
    key_source: SshKeySource,
    private_key_path: String,
    passphrase: String,
    status: SessionStatus,
    icon: SessionIcon,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CreateSessionPayload {
    name: String,
    group: SessionGroup,
    host: String,
    port: u16,
    username: String,
    password: String,
    auth_method: SessionAuthMethod,
    key_source: SshKeySource,
    private_key_path: String,
    passphrase: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct UpdateSessionPayload {
    id: String,
    name: String,
    group: SessionGroup,
    host: String,
    port: u16,
    username: String,
    password: String,
    auth_method: SessionAuthMethod,
    key_source: SshKeySource,
    private_key_path: String,
    passphrase: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AgentProviderSettings {
    provider_code: AgentProviderCode,
    provider_name: String,
    base_url: String,
    api_key: String,
    model_name: String,
    updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SaveAgentProviderPayload {
    provider_code: AgentProviderCode,
    provider_name: String,
    base_url: String,
    api_key: String,
    model_name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AgentThreadMessage {
    id: String,
    role: AgentMessageRole,
    content: String,
    created_at: String,
    tool_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AgentStateSnapshot {
    messages: Vec<AgentThreadMessage>,
    pending_approval: Option<serde_json::Value>,
    running: bool,
    configured: bool,
    last_error: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct HarmlessAgentRunPayload {
    session_id: String,
    prompt: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ResolveApprovalPayload {
    session_id: String,
    approval_id: String,
    approve: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AgentWhitelistItem {
    id: String,
    pattern: String,
    description: String,
    created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CreateWhitelistPayload {
    pattern: String,
    description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
enum SessionAuthMethod {
    Password,
    SystemKey,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
enum SshKeySource {
    Default,
    Custom,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
enum SessionGroup {
    Production,
    Staging,
    Local,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
enum SessionStatus {
    Online,
    Warning,
    Offline,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
enum SessionIcon {
    Server,
    Database,
    HardDrive,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "kebab-case")]
enum AgentProviderCode {
    Openai,
    AzureOpenai,
    Anthropic,
    GoogleGemini,
    Deepseek,
    Qwen,
    Zhipu,
    Moonshot,
    BaiduQianfan,
    Siliconflow,
    Groq,
    Mistral,
    Openrouter,
    Ollama,
    LmStudio,
    Xai,
    Perplexity,
    Fireworks,
    Together,
    VolcengineArk,
    TencentHunyuan,
    Minimax,
    #[serde(rename = "302ai")]
    Ai302,
    Custom,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
enum AgentMessageRole {
    User,
    Assistant,
    Tool,
    System,
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

fn data_file(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join(name))
}

fn read_json<T>(app: &AppHandle, name: &str, default: T) -> Result<T, String>
where
    T: DeserializeOwned,
{
    let path = data_file(app, name)?;
    if !path.exists() {
        return Ok(default);
    }

    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&content).map_err(|error| error.to_string())
}

fn write_json<T>(app: &AppHandle, name: &str, value: &T) -> Result<(), String>
where
    T: Serialize,
{
    let path = data_file(app, name)?;
    let content = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
    fs::write(path, content).map_err(|error| error.to_string())
}

fn ok() -> OkResponse {
    OkResponse { ok: true }
}

fn now_token(prefix: &str) -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("{prefix}-{millis}")
}

fn default_model_name(provider_code: &AgentProviderCode) -> &'static str {
    match provider_code {
        AgentProviderCode::Openai => "gpt-4.1-mini",
        AgentProviderCode::AzureOpenai => "gpt-4.1-mini",
        AgentProviderCode::Anthropic => "claude-3-5-sonnet-latest",
        AgentProviderCode::GoogleGemini => "gemini-2.5-flash",
        AgentProviderCode::Deepseek => "deepseek-chat",
        AgentProviderCode::Qwen => "qwen-plus",
        AgentProviderCode::Zhipu => "glm-4.7",
        AgentProviderCode::Moonshot => "moonshot-v1-8k",
        AgentProviderCode::BaiduQianfan => "ernie-4.0-8k",
        AgentProviderCode::Siliconflow => "deepseek-ai/DeepSeek-V3",
        AgentProviderCode::Groq => "llama-3.3-70b-versatile",
        AgentProviderCode::Mistral => "mistral-large-latest",
        AgentProviderCode::Openrouter => "openai/gpt-4.1-mini",
        AgentProviderCode::Ollama => "qwen2.5:7b",
        AgentProviderCode::LmStudio => "local-model",
        AgentProviderCode::Xai => "grok-3-mini",
        AgentProviderCode::Perplexity => "sonar",
        AgentProviderCode::Fireworks => "accounts/fireworks/models/llama-v3p3-70b-instruct",
        AgentProviderCode::Together => "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        AgentProviderCode::VolcengineArk => "doubao-seed-1-6-flash-250715",
        AgentProviderCode::TencentHunyuan => "hunyuan-lite",
        AgentProviderCode::Minimax => "MiniMax-Text-01",
        AgentProviderCode::Ai302 => "gpt-4.1-mini",
        AgentProviderCode::Custom => "gpt-4.1-mini",
    }
}

fn create_session_status(group: &SessionGroup) -> SessionStatus {
    match group {
        SessionGroup::Production => SessionStatus::Online,
        SessionGroup::Staging => SessionStatus::Warning,
        SessionGroup::Local => SessionStatus::Offline,
    }
}

fn create_session_icon(group: &SessionGroup) -> SessionIcon {
    match group {
        SessionGroup::Production => SessionIcon::Server,
        SessionGroup::Staging => SessionIcon::Database,
        SessionGroup::Local => SessionIcon::HardDrive,
    }
}

fn default_agent_settings() -> AgentProviderSettings {
    AgentProviderSettings {
        provider_code: AgentProviderCode::Openai,
        provider_name: "OpenAI".to_string(),
        base_url: "https://api.openai.com/v1".to_string(),
        api_key: String::new(),
        model_name: "gpt-4.1-mini".to_string(),
        updated_at: None,
    }
}

fn placeholder_agent_state(session_id: &str, last_error: &str) -> AgentStateSnapshot {
    AgentStateSnapshot {
        messages: vec![AgentThreadMessage {
            id: now_token("tauri-migration"),
            role: AgentMessageRole::System,
            content: format!(
                "Tauri shell is wired up for session {session_id}, but the harmless-agent runtime is still pending migration."
            ),
            created_at: now_token("created"),
            tool_name: None,
        }],
        pending_approval: None,
        running: false,
        configured: true,
        last_error: last_error.to_string(),
    }
}

#[tauri::command]
fn app_get_locale(app: AppHandle) -> Result<String, String> {
    read_json(&app, "locale.json", "zh-CN".to_string())
}

#[tauri::command]
fn app_set_locale(app: AppHandle, locale: String) -> Result<OkResponse, String> {
    write_json(&app, "locale.json", &locale)?;
    Ok(ok())
}

#[tauri::command]
fn sessions_list(app: AppHandle) -> Result<Vec<SessionItem>, String> {
    read_json(&app, "sessions.json", Vec::<SessionItem>::new())
}

#[tauri::command]
fn sessions_create(app: AppHandle, payload: CreateSessionPayload) -> Result<SessionItem, String> {
    let mut sessions = read_json(&app, "sessions.json", Vec::<SessionItem>::new())?;
    let session = SessionItem {
        id: now_token("session"),
        name: payload.name,
        group: payload.group.clone(),
        host: payload.host,
        port: payload.port,
        username: payload.username,
        password: payload.password,
        auth_method: payload.auth_method,
        key_source: payload.key_source,
        private_key_path: payload.private_key_path,
        passphrase: payload.passphrase,
        status: create_session_status(&payload.group),
        icon: create_session_icon(&payload.group),
    };
    sessions.push(session.clone());
    write_json(&app, "sessions.json", &sessions)?;
    Ok(session)
}

#[tauri::command]
/// 更新已保存的会话信息。
/// @param app Tauri 应用句柄，用于读取与写回会话数据文件
/// @param payload 会话更新参数，包含目标会话 id 与最新连接配置
/// @return Result<SessionItem, String> 返回更新后的会话对象，失败时返回错误信息
fn sessions_update(app: AppHandle, payload: UpdateSessionPayload) -> Result<SessionItem, String> {
    let mut sessions = read_json(&app, "sessions.json", Vec::<SessionItem>::new())?;
    let session_index = sessions
        .iter()
        .position(|item| item.id == payload.id)
        .ok_or_else(|| "Session not found.".to_string())?;

    let updated_session = SessionItem {
        id: sessions[session_index].id.clone(),
        name: payload.name,
        group: payload.group.clone(),
        host: payload.host,
        port: payload.port,
        username: payload.username,
        password: payload.password,
        auth_method: payload.auth_method,
        key_source: payload.key_source,
        private_key_path: payload.private_key_path,
        passphrase: payload.passphrase,
        status: create_session_status(&payload.group),
        icon: create_session_icon(&payload.group),
    };

    sessions[session_index] = updated_session.clone();
    write_json(&app, "sessions.json", &sessions)?;
    Ok(updated_session)
}

#[tauri::command]
fn sessions_delete(app: AppHandle, session_id: String) -> Result<OkResponse, String> {
    let mut sessions = read_json(&app, "sessions.json", Vec::<SessionItem>::new())?;
    sessions.retain(|item| item.id != session_id);
    write_json(&app, "sessions.json", &sessions)?;
    Ok(ok())
}

#[tauri::command]
fn agent_settings_get_provider(app: AppHandle) -> Result<AgentProviderSettings, String> {
    read_json(&app, "agent-provider.json", default_agent_settings())
}

#[tauri::command]
fn agent_settings_save_provider(
    app: AppHandle,
    payload: SaveAgentProviderPayload,
) -> Result<AgentProviderSettings, String> {
    let saved = AgentProviderSettings {
        provider_code: payload.provider_code.clone(),
        provider_name: payload.provider_name.trim().to_string(),
        base_url: payload.base_url.trim().to_string(),
        api_key: payload.api_key.trim().to_string(),
        model_name: if payload.model_name.trim().is_empty() {
            default_model_name(&payload.provider_code).to_string()
        } else {
            payload.model_name.trim().to_string()
        },
        updated_at: Some(now_token("updated")),
    };
    write_json(&app, "agent-provider.json", &saved)?;
    Ok(saved)
}

#[tauri::command]
fn harmless_agent_get_state(session_id: String) -> AgentStateSnapshot {
    placeholder_agent_state(&session_id, "")
}

#[tauri::command]
fn harmless_agent_run(payload: HarmlessAgentRunPayload) -> AgentStateSnapshot {
    let _ = payload.prompt;
    placeholder_agent_state(
        &payload.session_id,
        "Harmless agent runtime is pending migration to Tauri.",
    )
}

#[tauri::command]
fn harmless_agent_resolve_approval(payload: ResolveApprovalPayload) -> AgentStateSnapshot {
    let _ = payload.approval_id;
    let _ = payload.approve;
    placeholder_agent_state(&payload.session_id, "")
}

#[tauri::command]
fn harmless_agent_list_whitelist(app: AppHandle) -> Result<Vec<AgentWhitelistItem>, String> {
    read_json(&app, "agent-whitelist.json", Vec::<AgentWhitelistItem>::new())
}

#[tauri::command]
fn harmless_agent_create_whitelist_item(
    app: AppHandle,
    payload: CreateWhitelistPayload,
) -> Result<AgentWhitelistItem, String> {
    let mut items = read_json(&app, "agent-whitelist.json", Vec::<AgentWhitelistItem>::new())?;
    let item = AgentWhitelistItem {
        id: now_token("whitelist"),
        pattern: payload.pattern.trim().to_string(),
        description: payload.description.unwrap_or_default().trim().to_string(),
        created_at: now_token("created"),
    };
    items.insert(0, item.clone());
    write_json(&app, "agent-whitelist.json", &items)?;
    Ok(item)
}

#[tauri::command]
fn harmless_agent_delete_whitelist_item(
    app: AppHandle,
    id: String,
) -> Result<Vec<AgentWhitelistItem>, String> {
    let mut items = read_json(&app, "agent-whitelist.json", Vec::<AgentWhitelistItem>::new())?;
    items.retain(|item| item.id != id);
    write_json(&app, "agent-whitelist.json", &items)?;
    Ok(items)
}

#[tauri::command]
fn backend_invoke(
    bridge: State<'_, BackendBridge>,
    method: String,
    args: Option<Value>,
) -> Result<Value, String> {
    bridge.invoke(&method, args.unwrap_or(Value::Null))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let bridge = BackendBridge::new(app.handle().clone())?;
            app.manage(bridge);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_get_locale,
            app_open_devtools,
            app_set_locale,
            sessions_list,
            sessions_create,
            sessions_update,
            sessions_delete,
            agent_settings_get_provider,
            agent_settings_save_provider,
            harmless_agent_get_state,
            harmless_agent_run,
            harmless_agent_resolve_approval,
            harmless_agent_list_whitelist,
            harmless_agent_create_whitelist_item,
            harmless_agent_delete_whitelist_item,
            backend_invoke
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
