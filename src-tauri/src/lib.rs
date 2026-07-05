use std::fs;
use std::path::Path;
use std::process::{Command, Stdio};
use chrono::Utc;
use sha2::Digest as _;
use hmac::{Hmac, Mac};
type HmacSha256 = Hmac<sha2::Sha256>;

// ═══ File helpers ════════════════════════════════════════════════════════════

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

#[tauri::command]
fn read_workspace_config(mdx_path: String) -> Result<String, String> {
    let path = Path::new(&mdx_path).join(".mditoor.json");
    if !path.exists() {
        return Ok(String::from("{\"metadataFields\":[]}"));
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    decrypt_workspace_config_for_app(&raw)
}

#[tauri::command]
fn write_workspace_config(mdx_path: String, config: String) -> Result<(), String> {
    let dir = Path::new(&mdx_path);
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let encrypted = encrypt_workspace_config_for_disk(&config)?;
    fs::write(dir.join(".mditoor.json"), encrypted).map_err(|e| e.to_string())
}

// ═══ App-level data (persisted to ~/.mditoor/) ═══════════════════════════════

fn app_data_path(file: &str) -> Result<std::path::PathBuf, String> {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map_err(|_| "Cannot locate home directory".to_string())?;
    Ok(Path::new(&home).join(".mditoor").join(file))
}

#[derive(serde::Serialize, serde::Deserialize)]
struct EncryptedConfigBlob {
    v: u8,
    alg: String,
    nonce: String,
    ciphertext: String,
    mac: String,
}

fn local_config_key() -> Result<Vec<u8>, String> {
    let path = app_data_path("config.key")?;
    if path.exists() {
        let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let key = hex::decode(raw.trim()).map_err(|e| e.to_string())?;
        if key.len() == 32 {
            return Ok(key);
        }
    }

    let mut key = vec![0u8; 32];
    getrandom::getrandom(&mut key).map_err(|e| e.to_string())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, hex::encode(&key)).map_err(|e| e.to_string())?;
    Ok(key)
}

fn config_subkey(master: &[u8], label: &[u8]) -> Vec<u8> {
    hmac256(master, label)
}

fn xor_with_hmac_stream(data: &[u8], key: &[u8], nonce: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(data.len());
    let mut counter = 0u64;
    while out.len() < data.len() {
        let mut msg = Vec::with_capacity(nonce.len() + 8);
        msg.extend_from_slice(nonce);
        msg.extend_from_slice(&counter.to_le_bytes());
        let block = hmac256(key, &msg);
        for b in block {
            if out.len() == data.len() {
                break;
            }
            out.push(data[out.len()] ^ b);
        }
        counter += 1;
    }
    out
}

fn encrypt_storage_value(storage: &serde_json::Value) -> Result<EncryptedConfigBlob, String> {
    let master = local_config_key()?;
    let enc_key = config_subkey(&master, b"mditoor:s3-config:enc:v1");
    let mac_key = config_subkey(&master, b"mditoor:s3-config:mac:v1");
    let mut nonce = [0u8; 16];
    getrandom::getrandom(&mut nonce).map_err(|e| e.to_string())?;

    let plain = serde_json::to_vec(storage).map_err(|e| e.to_string())?;
    let ciphertext = xor_with_hmac_stream(&plain, &enc_key, &nonce);

    let mut mac_input = Vec::with_capacity(nonce.len() + ciphertext.len());
    mac_input.extend_from_slice(&nonce);
    mac_input.extend_from_slice(&ciphertext);
    let mac = hmac256(&mac_key, &mac_input);

    Ok(EncryptedConfigBlob {
        v: 1,
        alg: "HMAC-SHA256-STREAM".to_string(),
        nonce: hex::encode(nonce),
        ciphertext: hex::encode(ciphertext),
        mac: hex::encode(mac),
    })
}

fn decrypt_storage_blob(blob: EncryptedConfigBlob) -> Result<serde_json::Value, String> {
    if blob.v != 1 || blob.alg != "HMAC-SHA256-STREAM" {
        return Err("Unsupported encrypted config format".to_string());
    }

    let master = local_config_key()?;
    let enc_key = config_subkey(&master, b"mditoor:s3-config:enc:v1");
    let mac_key = config_subkey(&master, b"mditoor:s3-config:mac:v1");
    let nonce = hex::decode(blob.nonce).map_err(|e| e.to_string())?;
    let ciphertext = hex::decode(blob.ciphertext).map_err(|e| e.to_string())?;
    let expected_mac = hex::decode(blob.mac).map_err(|e| e.to_string())?;

    let mut mac_input = Vec::with_capacity(nonce.len() + ciphertext.len());
    mac_input.extend_from_slice(&nonce);
    mac_input.extend_from_slice(&ciphertext);
    let actual_mac = hmac256(&mac_key, &mac_input);
    if actual_mac != expected_mac {
        return Err("Encrypted S3 config could not be verified".to_string());
    }

    let plain = xor_with_hmac_stream(&ciphertext, &enc_key, &nonce);
    serde_json::from_slice(&plain).map_err(|e| e.to_string())
}

fn encrypt_workspace_config_for_disk(config: &str) -> Result<String, String> {
    let mut value: serde_json::Value = serde_json::from_str(config).map_err(|e| e.to_string())?;
    let Some(obj) = value.as_object_mut() else {
        return Err("Workspace config must be a JSON object".to_string());
    };

    if let Some(storage) = obj.remove("storage") {
        let encrypted = encrypt_storage_value(&storage)?;
        obj.insert(
            "storageEncrypted".to_string(),
            serde_json::to_value(encrypted).map_err(|e| e.to_string())?,
        );
    }

    serde_json::to_string_pretty(&value).map_err(|e| e.to_string())
}

fn decrypt_workspace_config_for_app(raw: &str) -> Result<String, String> {
    let mut value: serde_json::Value = serde_json::from_str(raw).map_err(|e| e.to_string())?;
    let Some(obj) = value.as_object_mut() else {
        return Err("Workspace config must be a JSON object".to_string());
    };

    if !obj.contains_key("storage") {
        if let Some(encrypted) = obj.get("storageEncrypted").cloned() {
            let blob: EncryptedConfigBlob = serde_json::from_value(encrypted).map_err(|e| e.to_string())?;
            let storage = decrypt_storage_blob(blob)?;
            obj.insert("storage".to_string(), storage);
        }
    }
    obj.remove("storageEncrypted");

    serde_json::to_string(&value).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_app_data(file: String) -> Result<String, String> {
    let path = app_data_path(&file)?;
    if !path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_app_data(file: String, content: String) -> Result<(), String> {
    let path = app_data_path(&file)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| e.to_string())
}

// ═══ Git ═════════════════════════════════════════════════════════════════════

#[derive(serde::Serialize)]
struct GitFile {
    path: String,
    staged: String,   // index status char  (X in "XY path")
    unstaged: String, // work-tree status char (Y in "XY path")
}

#[derive(serde::Serialize)]
struct GitStatus {
    is_repo: bool,
    branch: String,
    remote: Option<String>,
    ahead: u32,
    behind: u32,
    files: Vec<GitFile>,
}

#[derive(serde::Serialize)]
struct GitCommit {
    hash: String,
    date: String,
    author: String,
    message: String,
}

fn git(dir: &str, args: &[&str]) -> Result<String, String> {
    let out = Command::new("git")
        .args(args)
        .current_dir(dir)
        .stdin(Stdio::null())
        .output()
        .map_err(|e| format!("git not found: {}", e))?;

    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    } else {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
        Err(if !err.is_empty() { err } else { stdout })
    }
}

// Collects both stdout and stderr — used for push/pull whose progress goes to
// stderr even on success.
fn git_combined(dir: &str, args: &[&str]) -> Result<String, String> {
    let out = Command::new("git")
        .args(args)
        .current_dir(dir)
        .stdin(Stdio::null())
        .output()
        .map_err(|e| format!("git not found: {}", e))?;

    let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
    let combined = [&stderr, &stdout]
        .iter()
        .filter(|s| !s.is_empty())
        .map(|s| s.as_str())
        .collect::<Vec<_>>()
        .join("\n");

    if out.status.success() {
        Ok(if combined.is_empty() { "Done.".to_string() } else { combined })
    } else {
        Err(if combined.is_empty() { "Unknown error".to_string() } else { combined })
    }
}

#[tauri::command]
fn git_status(mdx_path: String) -> Result<GitStatus, String> {
    if git(&mdx_path, &["rev-parse", "--git-dir"]).is_err() {
        return Ok(GitStatus {
            is_repo: false,
            branch: String::new(),
            remote: None,
            ahead: 0,
            behind: 0,
            files: vec![],
        });
    }

    let branch = git(&mdx_path, &["rev-parse", "--abbrev-ref", "HEAD"])
        .unwrap_or_else(|_| "HEAD".to_string());

    let remote = git(&mdx_path, &["remote", "get-url", "origin"]).ok();

    let (ahead, behind) = if remote.is_some() {
        match git(&mdx_path, &["rev-list", "--left-right", "--count", "@{u}...HEAD"]) {
            Ok(s) => {
                let p: Vec<&str> = s.split_whitespace().collect();
                if p.len() == 2 {
                    (p[1].parse().unwrap_or(0), p[0].parse().unwrap_or(0))
                } else {
                    (0, 0)
                }
            }
            Err(_) => (0, 0),
        }
    } else {
        (0, 0)
    };

    let raw = git(&mdx_path, &["status", "--short"]).unwrap_or_default();
    let files = raw
        .lines()
        .filter(|l| l.len() > 3)
        .map(|line| {
            let mut chars = line.chars();
            let x = chars.next().unwrap_or(' ').to_string();
            let y = chars.next().unwrap_or(' ').to_string();
            GitFile {
                staged: x,
                unstaged: y,
                path: line[3..].to_string(),
            }
        })
        .collect();

    Ok(GitStatus { is_repo: true, branch, remote, ahead, behind, files })
}

#[tauri::command]
fn git_log(mdx_path: String) -> Result<Vec<GitCommit>, String> {
    let raw = git(
        &mdx_path,
        &["log", "--format=%H|%ad|%an|%s", "--date=short", "-50"],
    )?;
    Ok(raw
        .lines()
        .filter(|l| !l.is_empty())
        .map(|line| {
            let p: Vec<&str> = line.splitn(4, '|').collect();
            GitCommit {
                hash: p.first().unwrap_or(&"").to_string(),
                date: p.get(1).unwrap_or(&"").to_string(),
                author: p.get(2).unwrap_or(&"").to_string(),
                message: p.get(3).unwrap_or(&"").to_string(),
            }
        })
        .collect())
}

#[tauri::command]
fn git_commit(mdx_path: String, message: String) -> Result<String, String> {
    git(&mdx_path, &["add", "-A"])?;
    git(&mdx_path, &["commit", "-m", &message])
}

#[tauri::command]
fn git_commit_staged(mdx_path: String, message: String) -> Result<String, String> {
    git(&mdx_path, &["commit", "-m", &message])
}

#[tauri::command]
fn git_stage_file(mdx_path: String, file_path: String) -> Result<(), String> {
    git(&mdx_path, &["add", "--", &file_path]).map(|_| ())
}

#[tauri::command]
fn git_unstage_file(mdx_path: String, file_path: String) -> Result<(), String> {
    git(&mdx_path, &["restore", "--staged", "--", &file_path])
        .or_else(|_| git(&mdx_path, &["reset", "HEAD", "--", &file_path]))
        .map(|_| ())
}

#[tauri::command]
fn git_discard_file(mdx_path: String, file_path: String) -> Result<(), String> {
    git(&mdx_path, &["restore", "--", &file_path])
        .or_else(|_| git(&mdx_path, &["checkout", "--", &file_path]))
        .map(|_| ())
}

#[tauri::command]
fn git_diff_file(mdx_path: String, file_path: String) -> Result<String, String> {
    // HEAD diff covers both staged and unstaged vs last commit
    if let Ok(d) = git(&mdx_path, &["diff", "HEAD", "--", &file_path]) {
        if !d.is_empty() {
            return Ok(d);
        }
    }
    // No HEAD yet — show cached (staged) diff
    if let Ok(d) = git(&mdx_path, &["diff", "--cached", "--", &file_path]) {
        if !d.is_empty() {
            return Ok(d);
        }
    }
    Ok(String::new())
}

#[tauri::command]
fn git_show_commit(mdx_path: String, hash: String) -> Result<String, String> {
    git(&mdx_path, &["show", "--stat", "--patch", &hash])
}

#[tauri::command]
fn git_push(mdx_path: String) -> Result<String, String> {
    git_combined(&mdx_path, &["push"])
}

#[tauri::command]
fn git_pull(mdx_path: String) -> Result<String, String> {
    git_combined(&mdx_path, &["pull"])
}

#[tauri::command]
fn git_init(mdx_path: String) -> Result<String, String> {
    git(&mdx_path, &["init"])
}

// ═══ Image management ════════════════════════════════════════════════════════

const IMAGE_EXTS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp"];

#[derive(serde::Serialize)]
struct ImageAsset {
    path: String,
    rel_path: String,
    name: String,
    ext: String,
    size: u64,
}

fn scan_images(dir: &Path, base: &Path, out: &mut Vec<ImageAsset>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_dir() {
            let n = p.file_name().and_then(|s| s.to_str()).unwrap_or("");
            if !n.starts_with('.') && n != "node_modules" {
                scan_images(&p, base, out);
            }
        } else if p.is_file() {
            let ext = p.extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            if IMAGE_EXTS.contains(&ext.as_str()) {
                let size = fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
                let rel  = p.strip_prefix(base)
                    .map(|r| r.to_string_lossy().replace('\\', "/"))
                    .unwrap_or_default();
                let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
                out.push(ImageAsset { path: p.to_string_lossy().to_string(), rel_path: rel, name, ext, size });
            }
        }
    }
}

#[tauri::command]
fn list_images(mdx_path: String) -> Result<Vec<ImageAsset>, String> {
    let dir = Path::new(&mdx_path);
    if !dir.exists() { return Ok(vec![]); }
    let mut images = Vec::new();
    scan_images(dir, dir, &mut images);
    images.sort_by(|a, b| a.rel_path.cmp(&b.rel_path));
    Ok(images)
}

// Minimal base64 encoder — avoids a crate dependency.
fn to_base64(data: &[u8]) -> String {
    const ALPHA: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((data.len() * 4 + 2) / 3);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = if chunk.len() > 1 { chunk[1] as usize } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as usize } else { 0 };
        out.push(ALPHA[b0 >> 2] as char);
        out.push(ALPHA[((b0 & 3) << 4) | (b1 >> 4)] as char);
        out.push(if chunk.len() > 1 { ALPHA[((b1 & 0xf) << 2) | (b2 >> 6)] as char } else { '=' });
        out.push(if chunk.len() > 2 { ALPHA[b2 & 0x3f] as char } else { '=' });
    }
    out
}

#[tauri::command]
fn delete_image(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.is_file() {
        return Err(format!("Not a file: {}", path));
    }
    fs::remove_file(p).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_image_base64(path: String) -> Result<String, String> {
    let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    if size > 10 * 1024 * 1024 {
        return Err("Image too large for preview (> 10 MB)".into());
    }
    let ext   = Path::new(&path).extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    let ctype = img_content_type(&ext);
    let data  = fs::read(&path).map_err(|e| e.to_string())?;
    Ok(format!("data:{};base64,{}", ctype, to_base64(&data)))
}

// ═══ Image copy (local storage) ══════════════════════════════════════════════

#[tauri::command]
fn copy_image_local(src_path: String, dest_folder: String) -> Result<String, String> {
    let src      = Path::new(&src_path);
    let dest_dir = Path::new(&dest_folder);
    fs::create_dir_all(dest_dir).map_err(|e| e.to_string())?;

    let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("image");
    let ext  = src.extension().and_then(|e| e.to_str()).unwrap_or("");

    let mut dest = dest_dir.join(src.file_name().ok_or("invalid source filename")?);
    let mut counter = 1u32;
    while dest.exists() {
        let name = if ext.is_empty() { format!("{stem}-{counter}") } else { format!("{stem}-{counter}.{ext}") };
        dest = dest_dir.join(name);
        counter += 1;
    }

    fs::copy(src, &dest).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().to_string())
}

// ═══ Image usage analysis ════════════════════════════════════════════════════

fn scan_mdx_content(dir: &Path, out: &mut String) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let p    = entry.path();
        let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if p.is_dir() && !name.starts_with('.') && name != "node_modules" {
            scan_mdx_content(&p, out);
        } else if p.is_file() {
            let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
            if ext == "mdx" || ext == "md" {
                if let Ok(c) = fs::read_to_string(&p) { out.push_str(&c); out.push('\n'); }
            }
        }
    }
}

fn extract_img_refs(line: &str, out: &mut std::collections::HashSet<String>) {
    // Markdown images ![alt](path)
    {
        let mut s = line;
        while let Some(pos) = s.find("![") {
            let after = &s[pos + 2..];
            if let Some(bracket_end) = after.find("](") {
                let path_part = &after[bracket_end + 2..];
                if let Some(paren_end) = path_part.find(')') {
                    let path = path_part[..paren_end].trim();
                    if !path.is_empty() && !path.starts_with("http") && !path.starts_with("data:") {
                        if let Some(name) = Path::new(path).file_name().and_then(|n| n.to_str()) {
                            out.insert(name.to_string());
                        }
                    }
                    s = &path_part[paren_end + 1..];
                    continue;
                }
            }
            s = &s[pos + 2..];
        }
    }
    // src= attributes
    {
        let mut s = line;
        while let Some(pos) = s.find("src=") {
            let rest = &s[pos + 4..];
            let found = if rest.starts_with('"') {
                rest[1..].find('"').map(|e| (rest[1..e + 1].trim().to_string(), e + 2))
            } else if rest.starts_with('\'') {
                rest[1..].find('\'').map(|e| (rest[1..e + 1].trim().to_string(), e + 2))
            } else { None };
            if let Some((path, advance)) = found {
                if !path.is_empty() && !path.starts_with("http") && !path.starts_with("data:") {
                    if let Some(name) = Path::new(&path).file_name().and_then(|n| n.to_str()) {
                        out.insert(name.to_string());
                    }
                }
                s = if advance < rest.len() { &rest[advance..] } else { "" };
            } else {
                s = rest;
            }
        }
    }
}

#[tauri::command]
fn analyze_image_usage(mdx_path: String) -> Result<Vec<String>, String> {
    let mut content = String::new();
    scan_mdx_content(Path::new(&mdx_path), &mut content);
    let mut used = std::collections::HashSet::new();
    for line in content.lines() {
        extract_img_refs(line, &mut used);
    }
    let mut result: Vec<String> = used.into_iter().collect();
    result.sort();
    Ok(result)
}

// ═══ S3 upload ═══════════════════════════════════════════════════════════════

fn img_content_type(ext: &str) -> &'static str {
    match ext {
        "png"         => "image/png",
        "jpg"|"jpeg"  => "image/jpeg",
        "gif"         => "image/gif",
        "webp"        => "image/webp",
        "svg"         => "image/svg+xml",
        "avif"        => "image/avif",
        "bmp"         => "image/bmp",
        _             => "application/octet-stream",
    }
}

fn sha256_hex(data: &[u8]) -> String {
    let mut h = sha2::Sha256::new();
    h.update(data);
    hex::encode(h.finalize())
}

fn hmac256(key: &[u8], data: &[u8]) -> Vec<u8> {
    let mut m = HmacSha256::new_from_slice(key).expect("HMAC accepts any key length");
    m.update(data);
    m.finalize().into_bytes().to_vec()
}

fn sigv4_key(secret: &str, date: &str, region: &str) -> Vec<u8> {
    let k_date    = hmac256(format!("AWS4{secret}").as_bytes(), date.as_bytes());
    let k_region  = hmac256(&k_date,   region.as_bytes());
    let k_service = hmac256(&k_region, b"s3");
    hmac256(&k_service, b"aws4_request")
}

#[tauri::command]
async fn upload_to_s3(
    file_path: String,
    s3_key: String,
    endpoint: String,
    bucket: String,
    region: String,
    access_key: String,
    secret_key: String,
) -> Result<String, String> {
    let data  = fs::read(&file_path).map_err(|e| e.to_string())?;
    let ext   = Path::new(&file_path).extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    let ctype = img_content_type(&ext);
    let body_hash = sha256_hex(&data);
    let size = data.len();

    let now      = Utc::now();
    let datetime = now.format("%Y%m%dT%H%M%SZ").to_string();
    let date     = now.format("%Y%m%d").to_string();

    // Build URL, host, and canonical URI (virtual-hosted for AWS, path-style for others)
    let is_aws = endpoint.is_empty() || endpoint.contains("amazonaws.com");
    let (url, host, canonical_uri) = if is_aws {
        let h = format!("{bucket}.s3.{region}.amazonaws.com");
        (format!("https://{h}/{s3_key}"), h, format!("/{s3_key}"))
    } else {
        let base = endpoint.trim_end_matches('/');
        let h = reqwest::Url::parse(base)
            .ok()
            .and_then(|u| u.host_str().map(|s| s.to_string()))
            .unwrap_or_default();
        let path = format!("/{bucket}/{s3_key}");
        (format!("{base}{path}"), h, path)
    };

    // Canonical headers (alphabetical by header name)
    let signed_headers = "content-length;content-type;host;x-amz-content-sha256;x-amz-date";
    let canon_headers  = format!(
        "content-length:{size}\ncontent-type:{ctype}\nhost:{host}\nx-amz-content-sha256:{body_hash}\nx-amz-date:{datetime}\n"
    );
    // Format: method \n uri \n query(empty) \n headers \n signed_headers \n body_hash
    let canonical_request = format!("PUT\n{canonical_uri}\n\n{canon_headers}\n{signed_headers}\n{body_hash}");

    let scope          = format!("{date}/{region}/s3/aws4_request");
    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{datetime}\n{scope}\n{}",
        sha256_hex(canonical_request.as_bytes())
    );

    let sig_key   = sigv4_key(&secret_key, &date, &region);
    let signature = hex::encode(hmac256(&sig_key, string_to_sign.as_bytes()));
    let auth      = format!(
        "AWS4-HMAC-SHA256 Credential={access_key}/{scope},SignedHeaders={signed_headers},Signature={signature}"
    );

    let resp = reqwest::Client::new()
        .put(&url)
        .header("Content-Length", size.to_string())
        .header("Content-Type", ctype)
        .header("Host", &host)
        .header("x-amz-content-sha256", &body_hash)
        .header("x-amz-date", &datetime)
        .header("Authorization", &auth)
        .body(data)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if resp.status().is_success() {
        Ok(url)
    } else {
        let status = resp.status().as_u16();
        let body   = resp.text().await.unwrap_or_default();
        Err(format!("HTTP {status}: {body}"))
    }
}

// ═══ Entry point ═════════════════════════════════════════════════════════════

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_mdx_slugs,
            read_post,
            write_post,
            read_workspace_config,
            write_workspace_config,
            read_app_data,
            write_app_data,
            git_status,
            git_log,
            git_commit,
            git_commit_staged,
            git_stage_file,
            git_unstage_file,
            git_discard_file,
            git_diff_file,
            git_show_commit,
            git_push,
            git_pull,
            git_init,
            list_images,
            delete_image,
            read_image_base64,
            copy_image_local,
            analyze_image_usage,
            upload_to_s3,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
