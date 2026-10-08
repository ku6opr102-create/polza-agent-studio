use serde::{Deserialize, Serialize};
use std::{fs, path::{Path, PathBuf}, process::Command};

const MAX_OUTPUT: usize = 1_000_000;

#[derive(Serialize)]
struct CommandResult { code: i32, stdout: String, stderr: String }

#[derive(Serialize)]
struct WorkspaceFile { path: String, size: u64 }

#[derive(Serialize, Deserialize, Clone)]
struct AgentMessage { role: String, content: String }

#[derive(Deserialize)]
struct ChatRequest { model: String, messages: Vec<AgentMessage>, temperature: f32 }

#[derive(Deserialize)]
struct ChatChoice { message: AgentMessage }

#[derive(Deserialize)]
struct ChatResponse { choices: Vec<ChatChoice> }

fn truncate(mut s: String) -> String {
    if s.len() > MAX_OUTPUT { s.truncate(MAX_OUTPUT); s.push_str("\n[output truncated]"); }
    s
}

fn workspace_root(workspace: &str) -> Result<PathBuf, String> {
    let root = Path::new(workspace).canonicalize().map_err(|e| format!("Workspace недоступен: {e}"))?;
    if !root.is_dir() { return Err("Workspace должен быть папкой.".into()); }
    Ok(root)
}

fn safe_path(workspace: &str, relative: &str) -> Result<PathBuf, String> {
    let root = workspace_root(workspace)?;
    let rel = Path::new(relative);
    if rel.as_os_str().is_empty() || rel.is_absolute() { return Err("Путь должен быть относительным.".into()); }
    if rel.components().any(|c| matches!(c, std::path::Component::ParentDir)) { return Err("Переходы .. запрещены.".into()); }
    let candidate = root.join(rel);
    if candidate.exists() {
        let canonical = candidate.canonicalize().map_err(|e| e.to_string())?;
        if !canonical.starts_with(&root) { return Err("Путь выходит за пределы workspace.".into()); }
    } else if let Some(parent) = candidate.parent() {
        if parent.exists() {
            let canonical_parent = parent.canonicalize().map_err(|e| e.to_string())?;
            if !canonical_parent.starts_with(&root) { return Err("Путь выходит за пределы workspace.".into()); }
        }
    }
    Ok(candidate)
}

fn safe_command(command: &str) -> Result<(), String> {
    let lower = command.to_ascii_lowercase();
    let blocked = [
        "rm -rf", "rm -r /", "format c:", "del /s /q", "shutdown", "reboot",
        "mkfs", "diskpart", "reg delete", "sudo rm", "chmod 777 /", "cipher /w",
        "bcdedit", "takeown /f c:\\", "icacls c:\\ /grant",
    ];
    if blocked.iter().any(|x| lower.contains(x)) {
        return Err("Команда заблокирована политикой безопасности агента.".into());
    }
    Ok(())
}

fn keyring_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new("polza-agent-studio", "polza-api-key").map_err(|e| e.to_string())
}

#[tauri::command]
fn run_shell(command: String, cwd: String) -> Result<CommandResult, String> {
    safe_command(&command)?;
    let root = workspace_root(&cwd)?;
    #[cfg(target_os = "windows")]
    let mut cmd = { let mut c = Command::new("cmd"); c.args(["/C", &command]); c };
    #[cfg(not(target_os = "windows"))]
    let mut cmd = { let mut c = Command::new("sh"); c.args(["-lc", &command]); c };
    let out = cmd.current_dir(root).output().map_err(|e| e.to_string())?;
    Ok(CommandResult {
        code: out.status.code().unwrap_or(-1),
        stdout: truncate(String::from_utf8_lossy(&out.stdout).into_owned()),
        stderr: truncate(String::from_utf8_lossy(&out.stderr).into_owned()),
    })
}

#[tauri::command]
fn read_text_file(workspace: String, path: String) -> Result<String, String> {
    fs::read_to_string(safe_path(&workspace, &path)?).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_text_file(workspace: String, path: String, content: String) -> Result<(), String> {
    let p = safe_path(&workspace, &path)?;
    if p.exists() && p.is_dir() { return Err("Нельзя записать содержимое в директорию.".into()); }
    if let Some(parent) = p.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    fs::write(p, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_text_file(workspace: String, path: String) -> Result<(), String> {
    let p = safe_path(&workspace, &path)?;
    if p.is_dir() { return Err("Удаление директорий через агент запрещено.".into()); }
    fs::remove_file(p).map_err(|e| e.to_string())
}

fn collect_files(root: &Path, dir: &Path, out: &mut Vec<WorkspaceFile>) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if entry.file_type().map_err(|e| e.to_string())?.is_symlink() { continue; }
        if path.is_dir() {
            if matches!(name.as_str(), "node_modules" | ".git" | "target" | "dist" | "build") { continue; }
            collect_files(root, &path, out)?;
        } else if path.is_file() {
            let rel = path.strip_prefix(root).map_err(|e| e.to_string())?.to_string_lossy().replace('\\', "/");
            let size = fs::metadata(&path).map_err(|e| e.to_string())?.len();
            out.push(WorkspaceFile { path: rel, size });
        }
    }
    Ok(())
}

#[tauri::command]
fn list_workspace_files(workspace: String) -> Result<Vec<WorkspaceFile>, String> {
    let root = workspace_root(&workspace)?;
    let mut files = Vec::new();
    collect_files(&root, &root, &mut files)?;
    files.sort_by(|a,b| a.path.cmp(&b.path));
    files.truncate(5000);
    Ok(files)
}

#[tauri::command]
async fn choose_workspace(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    Ok(app.dialog().file().blocking_pick_folder().map(|p| p.to_string()))
}

#[tauri::command]
fn save_api_key(key: String) -> Result<(), String> {
    let entry = keyring_entry()?;
    if key.trim().is_empty() { let _ = entry.delete_credential(); } else { entry.set_password(&key).map_err(|e| e.to_string())?; }
    Ok(())
}

#[tauri::command]
fn has_api_key() -> Result<bool, String> {
    let entry = keyring_entry()?;
    match entry.get_password() { Ok(_) => Ok(true), Err(keyring::Error::NoEntry) => Ok(false), Err(e) => Err(e.to_string()) }
}

#[tauri::command]
async fn polza_chat(base_url: String, model: String, messages: Vec<AgentMessage>) -> Result<String, String> {
    let key = keyring_entry()?.get_password().map_err(|_| "API-ключ Polza.AI не настроен. Откройте Settings и сохраните ключ.".to_string())?;
    if model.trim().is_empty() { return Err("Модель не указана.".into()); }
    let base = base_url.trim().trim_end_matches('/');
    if !(base.starts_with("https://") || base.starts_with("http://localhost") || base.starts_with("http://127.0.0.1")) {
        return Err("Разрешены только HTTPS API URL (или localhost для локального провайдера).".into());
    }
    let url = if base.ends_with("/chat/completions") { base.to_string() } else { format!("{base}/chat/completions") };
    let body = ChatRequest { model, messages, temperature: 0.15 };
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(120)).build().map_err(|e| e.to_string())?;
    let response = client.post(url).bearer_auth(key).json(&body).send().await.map_err(|e| format!("Ошибка сети: {e}"))?;
    let status = response.status();
    let text = response.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() { return Err(format!("Polza.AI вернул HTTP {}: {}", status.as_u16(), truncate(text))); }
    let parsed: ChatResponse = serde_json::from_str(&text).map_err(|e| format!("Некорректный ответ AI: {e}"))?;
    parsed.choices.first().map(|c| c.message.content.clone()).filter(|s| !s.trim().is_empty()).ok_or_else(|| "AI не вернул текстовый ответ.".into())
}

#[tauri::command]
fn app_info() -> String { "Polza Agent Studio 1.1".into() }

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            run_shell, read_text_file, write_text_file, delete_text_file, list_workspace_files,
            choose_workspace, save_api_key, has_api_key, polza_chat, app_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running application");
}
