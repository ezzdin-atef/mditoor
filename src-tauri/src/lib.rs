use std::fs;
use std::path::Path;

#[tauri::command]
fn list_mdx_slugs(path: String) -> Result<Vec<String>, String> {
    let dir = Path::new(&path);
    if !dir.exists() {
        return Err(format!("Directory does not exist: {}", path));
    }
    if !dir.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }
    let mut slugs = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())?.flatten() {
        let ep = entry.path();
        if ep.is_dir() && ep.join("index.mdx").exists() {
            if let Some(name) = ep.file_name().and_then(|n| n.to_str()) {
                slugs.push(name.to_string());
            }
        }
    }
    slugs.sort();
    Ok(slugs)
}

#[tauri::command]
fn read_post(mdx_path: String, slug: String) -> Result<String, String> {
    let path = Path::new(&mdx_path).join(&slug).join("index.mdx");
    fs::read_to_string(&path).map_err(|e| format!("{}: {}", path.display(), e))
}

#[tauri::command]
fn write_post(mdx_path: String, slug: String, content: String) -> Result<(), String> {
    let dir = Path::new(&mdx_path).join(&slug);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(dir.join("index.mdx"), content).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![list_mdx_slugs, read_post, write_post])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
