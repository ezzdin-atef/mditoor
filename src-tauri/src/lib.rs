use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::process::{Command, Output, Stdio};
use chrono::Utc;
use sha2::Digest as _;
use hmac::{Hmac, Mac};
type HmacSha256 = Hmac<sha2::Sha256>;

// ═══ File helpers ════════════════════════════════════════════════════════════

/// How the workspace lays out posts; mirrors `SiteProfile` in the frontend.
/// Missing fields fall back to the original `<slug>/index.mdx` layout.
#[derive(serde::Deserialize, Clone, Default)]
struct PostProfile {
    #[serde(default)]
    layout: String,
    #[serde(default)]
    extension: String,
}

const POST_EXTS: &[&str] = &["mdx", "md", "markdown"];

impl PostProfile {
    /// `folder`: `<slug>/index.<ext>`. `flat` and `dated`: `<slug>.<ext>` (for `dated`
    /// the slug is the whole file stem, date prefix included).
    fn is_folder(&self) -> bool {
        !matches!(self.layout.as_str(), "flat" | "dated")
    }

    /// Extension used when creating a post.
    fn ext(&self) -> &'static str {
        match self.extension.trim_start_matches('.') {
            "md" => "md",
            _ => "mdx",
        }
    }
}

// A slug is a single path segment; reject anything that could escape the workspace.
fn check_slug(slug: &str) -> Result<(), String> {
    if slug.is_empty() || slug == "." || slug == ".." || slug.contains(['/', '\\', ':']) {
        return Err(format!("Invalid post slug: {slug}"));
    }
    Ok(())
}

fn post_ext(p: &Path) -> Option<String> {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .filter(|e| POST_EXTS.contains(&e.as_str()))
}

// The index file inside a post folder, whichever extension it uses.
fn folder_index(dir: &Path) -> Option<std::path::PathBuf> {
    POST_EXTS.iter().map(|ext| dir.join(format!("index.{ext}"))).find(|p| p.is_file())
}

/// The post's markdown file: the existing one, or where a new one should be written.
fn post_file(mdx_path: &str, slug: &str, profile: &PostProfile) -> Result<std::path::PathBuf, String> {
    check_slug(slug)?;
    let root = Path::new(mdx_path);
    if profile.is_folder() {
        let dir = root.join(slug);
        return Ok(folder_index(&dir).unwrap_or_else(|| dir.join(format!("index.{}", profile.ext()))));
    }
    Ok(POST_EXTS
        .iter()
        .map(|ext| root.join(format!("{slug}.{ext}")))
        .find(|p| p.is_file())
        .unwrap_or_else(|| root.join(format!("{slug}.{}", profile.ext()))))
}

/// (slug, file) for every post in the workspace, sorted by slug.
fn find_posts(path: &str, profile: &PostProfile) -> Result<Vec<(String, std::path::PathBuf)>, String> {
    let dir = Path::new(path);
    if !dir.exists() {
        return Err(format!("Directory does not exist: {}", path));
    }
    if !dir.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }
    let mut posts = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())?.flatten() {
        let ep = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if profile.is_folder() {
            if ep.is_dir() {
                if let Some(file) = folder_index(&ep) {
                    posts.push((name, file));
                }
            }
        // `_index.md` (Hugo section pages) and dotfiles are not posts.
        } else if ep.is_file() && post_ext(&ep).is_some() && !name.starts_with(['_', '.']) {
            let stem = ep.file_stem().and_then(|s| s.to_str()).unwrap_or_default().to_string();
            posts.push((stem, ep));
        }
    }
    posts.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(posts)
}

fn list_mdx_slugs(path: String, profile: Option<PostProfile>) -> Result<Vec<String>, String> {
    Ok(find_posts(&path, &profile.unwrap_or_default())?.into_iter().map(|(slug, _)| slug).collect())
}

#[derive(serde::Serialize)]
struct PostSummary {
    slug: String,
    /// Post file relative to the workspace, e.g. `hello/index.mdx` or `hello.md`.
    file: String,
    frontmatter: String,
    /// "yaml", "toml", or "" when the post has no frontmatter.
    frontmatter_format: &'static str,
    excerpt: String,
    first_image: Option<String>,
    words: usize,
    modified: u64,
}

// Splits "---\n...\n---\n body" (YAML) or "+++\n...\n+++\n body" (TOML, Hugo)
// into (frontmatter, body, format). Tolerates CRLF. Format is "" without frontmatter.
fn split_frontmatter(content: &str) -> (String, &str, &'static str) {
    for (fence, format) in [("---", "yaml"), ("+++", "toml")] {
        let rest = content
            .strip_prefix(fence)
            .and_then(|r| r.strip_prefix("\r\n").or_else(|| r.strip_prefix('\n')));
        let Some(rest) = rest else { continue };
        let mut offset = 0;
        for line in rest.split_inclusive('\n') {
            if line.trim_end() == fence {
                return (rest[..offset].to_string(), &rest[offset + line.len()..], format);
            }
            offset += line.len();
        }
    }
    (String::new(), content, "")
}

fn first_body_image(body: &str) -> Option<String> {
    let md = body.find("![").and_then(|pos| {
        let after = &body[pos..];
        let open = after.find("](")?;
        let close = after[open + 2..].find(')')?;
        let inner = after[open + 2..open + 2 + close].trim();
        // ![alt](<path with spaces.png> "title") or ![alt](path.png "title")
        let src = match inner.strip_prefix('<') {
            Some(s) => s.split('>').next().unwrap_or(""),
            None => inner.split_whitespace().next().unwrap_or(""),
        };
        Some((pos, src.to_string()))
    });
    let html = body.find("src=").and_then(|pos| {
        let rest = &body[pos + 4..];
        let quote = rest.chars().next()?;
        if quote != '"' && quote != '\'' { return None; }
        let end = rest[1..].find(quote)?;
        Some((pos, rest[1..end + 1].to_string()))
    });
    match (md, html) {
        (Some(a), Some(b)) => Some(if a.0 <= b.0 { a.1 } else { b.1 }),
        (Some(a), None) => Some(a.1),
        (None, Some(b)) => Some(b.1),
        (None, None) => None,
    }
    .filter(|s| !s.is_empty())
}

fn plain_excerpt(body: &str, max_chars: usize) -> String {
    let mut out = String::new();
    let mut in_code = false;
    for line in body.lines() {
        let t = line.trim();
        if t.starts_with("```") { in_code = !in_code; continue; }
        if in_code || t.is_empty() || t.starts_with('<') || t.starts_with("import ")
            || t.starts_with("export ") || t.starts_with('|') || t.starts_with("![") {
            continue;
        }
        let t = t.trim_start_matches(|c: char| c == '#' || c == '>' || c == '-' || c == '*' || c == ' ');
        let cleaned: String = t.chars().filter(|c| !matches!(c, '*' | '_' | '`')).collect();
        if cleaned.is_empty() { continue; }
        if !out.is_empty() { out.push(' '); }
        out.push_str(&cleaned);
        if out.chars().count() >= max_chars { break; }
    }
    if out.chars().count() > max_chars {
        let cut: String = out.chars().take(max_chars).collect();
        format!("{}…", cut.trim_end())
    } else {
        out
    }
}

fn list_posts(path: String, profile: Option<PostProfile>) -> Result<Vec<PostSummary>, String> {
    let found = find_posts(&path, &profile.unwrap_or_default())?;
    let mut posts = Vec::with_capacity(found.len());
    for (slug, file) in found {
        let file_name = file.strip_prefix(&path).unwrap_or(&file).to_string_lossy().replace('\\', "/");
        let content = fs::read_to_string(&file).unwrap_or_default();
        let modified = fs::metadata(&file)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let (frontmatter, body, frontmatter_format) = split_frontmatter(&content);
        posts.push(PostSummary {
            first_image: first_body_image(body),
            excerpt: plain_excerpt(body, 220),
            words: body.split_whitespace().count(),
            frontmatter,
            frontmatter_format,
            modified,
            slug,
            file: file_name,
        });
    }
    Ok(posts)
}

/// Workspace settings that say where a site serves static files from.
#[derive(serde::Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ImageHints {
    root_path: Option<String>,
    /// Absolute folder behind `url_prefix`, e.g. `<root>/public/images`.
    public_dir: Option<String>,
    /// URL the site serves `public_dir` at, e.g. `/images`.
    url_prefix: Option<String>,
}

#[derive(serde::Serialize)]
struct ImageLookup {
    /// The file on disk, when found.
    path: Option<String>,
    size: u64,
    modified: u64,
    /// Where it looked, most likely first (shown when the image is missing).
    tried: Vec<String>,
}

// Links are URL-encoded (`my%20photo.png`); files on disk are not.
fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            // Byte-slice so a multi-byte char after `%` can't split a UTF-8 boundary.
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok();
            if let Some(b) = hex.and_then(|h| u8::from_str_radix(h, 16).ok()) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

// Resolves an image reference used by a post (cover field or inline image) to a
// file. Tries, in order: the configured public folder for URLs under its prefix,
// the post folder, the posts folder, the project's public/ and static/ folders,
// then each ancestor and its static folders, and finally the path as given if absolute.
fn resolve_post_image(mdx_path: String, slug: String, src: String, hints: Option<ImageHints>) -> Result<ImageLookup, String> {
    let hints = hints.unwrap_or_default();
    let without_query = src.trim().split(['?', '#']).next().unwrap_or_default();
    let decoded = percent_decode(without_query);
    let clean = decoded.trim_start_matches("./");
    let rooted = clean.trim_start_matches('/');
    let root = Path::new(&mdx_path);

    let mut candidates = Vec::new();
    if let (Some(prefix), Some(dir)) = (hints.url_prefix.as_deref(), hints.public_dir.as_deref()) {
        let prefix = prefix.trim_matches('/');
        if !prefix.is_empty() {
            if let Some(rest) = rooted.strip_prefix(prefix).and_then(|r| r.strip_prefix('/')) {
                candidates.push(Path::new(dir).join(rest));
            }
        }
    }
    if !slug.is_empty() {
        candidates.push(root.join(&slug).join(clean));
    }
    candidates.push(root.join(rooted));
    if let Some(project) = hints.root_path.as_deref().map(Path::new) {
        for dir in ["public", "static", ""] {
            candidates.push(project.join(dir).join(rooted));
        }
    }
    for ancestor in root.ancestors().skip(1).take(4) {
        candidates.push(ancestor.join(rooted));
        candidates.push(ancestor.join("public").join(rooted));
        candidates.push(ancestor.join("static").join(rooted));
    }
    if Path::new(clean).is_absolute() {
        candidates.push(Path::new(clean).to_path_buf());
    }

    let mut tried: Vec<String> = Vec::new();
    for c in candidates {
        if let Ok(meta) = fs::metadata(&c) {
            if meta.is_file() {
                let modified = meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0);
                return Ok(ImageLookup { path: Some(c.to_string_lossy().to_string()), size: meta.len(), modified, tried });
            }
        }
        let shown = c.to_string_lossy().to_string();
        if !tried.contains(&shown) {
            tried.push(shown);
        }
    }
    Ok(ImageLookup { path: None, size: 0, modified: 0, tried })
}

fn read_post(mdx_path: String, slug: String, profile: Option<PostProfile>) -> Result<String, String> {
    let path = post_file(&mdx_path, &slug, &profile.unwrap_or_default())?;
    fs::read_to_string(&path).map_err(|e| format!("{}: {}", path.display(), e))
}

fn write_post(mdx_path: String, slug: String, content: String, profile: Option<PostProfile>) -> Result<(), String> {
    let path = post_file(&mdx_path, &slug, &profile.unwrap_or_default())?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| e.to_string())
}

/// Absolute path of the post file (for "Reveal in folder").
fn post_path(mdx_path: String, slug: String, profile: Option<PostProfile>) -> Result<String, String> {
    Ok(post_file(&mdx_path, &slug, &profile.unwrap_or_default())?.to_string_lossy().to_string())
}

fn read_workspace_config(mdx_path: String) -> Result<String, String> {
    let path = Path::new(&mdx_path).join(".mditoor.json");
    if !path.exists() {
        return Ok(String::from("{\"metadataFields\":[]}"));
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    decrypt_workspace_config_for_app(&raw)
}

fn write_workspace_config(mdx_path: String, config: String) -> Result<(), String> {
    let dir = Path::new(&mdx_path);
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let encrypted = encrypt_workspace_config_for_disk(&config)?;
    fs::write(dir.join(".mditoor.json"), encrypted).map_err(|e| e.to_string())
}

// ═══ Project detection ═══════════════════════════════════════════════════════
//
// A workspace can be created from the project root or from the posts folder.
// From either, find the root, guess the framework, and list likely posts folders.

#[derive(serde::Serialize)]
struct ContentDir {
    path: String,
    posts: usize,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectInfo {
    root: Option<String>,
    is_root: bool,
    framework: String,
    content_dirs: Vec<ContentDir>,
}

// Build output, dependencies and asset folders never hold posts.
const SKIP_DIRS: &[&str] = &[
    "node_modules", "dist", "build", "out", "public", "static", "assets", "resources",
    "target", "vendor", "_site", "coverage", "themes", "layouts", "components",
];

// Where each framework conventionally keeps posts, best guesses first.
const CONTENT_CANDIDATES: &[&str] = &[
    "content/posts", "content/blog", "content/articles", "content/post",
    "src/content/blog", "src/content/posts", "src/content/articles",
    "_posts", "blog", "posts", "src/posts", "data/blog", "content",
];

fn has_any(dir: &Path, names: &[&str]) -> bool {
    names.iter().any(|n| dir.join(n).exists())
}

fn package_has_dep(dir: &Path, dep: &str) -> bool {
    let Ok(raw) = fs::read_to_string(dir.join("package.json")) else { return false };
    let Ok(pkg) = serde_json::from_str::<serde_json::Value>(&raw) else { return false };
    ["dependencies", "devDependencies"]
        .iter()
        .any(|k| pkg.get(k).and_then(|d| d.get(dep)).is_some())
}

fn detect_framework(dir: &Path) -> Option<&'static str> {
    let config = |stem: &str| ["js", "mjs", "cjs", "ts", "mts"].iter().any(|ext| dir.join(format!("{stem}.{ext}")).exists());
    if config("astro.config") || package_has_dep(dir, "astro") { return Some("astro"); }
    if config("docusaurus.config") || package_has_dep(dir, "@docusaurus/core") { return Some("docusaurus"); }
    if has_any(dir, &["hugo.toml", "hugo.yaml", "hugo.json"])
        || (dir.join("config.toml").exists() && (dir.join("archetypes").is_dir() || dir.join("themes").is_dir()))
    {
        return Some("hugo");
    }
    if config("next.config") || package_has_dep(dir, "next") { return Some("nextjs"); }
    if config("nuxt.config") || package_has_dep(dir, "nuxt") { return Some("nuxt"); }
    if config("eleventy.config") || config(".eleventy") || package_has_dep(dir, "@11ty/eleventy") { return Some("eleventy"); }
    if dir.join("_config.yml").exists() && (dir.join("_posts").is_dir() || dir.join("Gemfile").exists()) {
        return Some("jekyll");
    }
    None
}

fn is_project_root(dir: &Path) -> bool {
    detect_framework(dir).is_some() || has_any(dir, &["package.json", ".git", "Gemfile", "go.mod"])
}

fn is_markdown(p: &Path) -> bool {
    matches!(
        p.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).as_deref(),
        Some("md" | "mdx" | "markdown")
    )
}

// Posts directly in `dir`: markdown files, or folders holding an index file.
fn count_posts(dir: &Path) -> usize {
    let Ok(entries) = fs::read_dir(dir) else { return 0 };
    entries
        .flatten()
        .filter(|e| {
            let p = e.path();
            if p.is_file() {
                is_markdown(&p)
            } else {
                has_any(&p, &["index.mdx", "index.md", "_index.md"])
            }
        })
        .count()
}

fn scan_content_dirs(dir: &Path, root: &Path, depth: u8, out: &mut Vec<ContentDir>) {
    if depth > 4 || out.len() >= 12 {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let p = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if !p.is_dir() || name.starts_with('.') || SKIP_DIRS.contains(&name.as_str()) {
            continue;
        }
        let posts = count_posts(&p);
        // Two or more posts filters out folders holding a lone README.
        if posts >= 2 {
            let rel = p.strip_prefix(root).unwrap_or(&p).to_string_lossy().replace('\\', "/");
            out.push(ContentDir { path: rel, posts });
        }
        scan_content_dirs(&p, root, depth + 1, out);
    }
}

fn detect_project(path: String) -> Result<ProjectInfo, String> {
    let start = Path::new(&path);
    if !start.is_dir() {
        return Err(format!("Not a folder: {}", path));
    }
    let root = start.ancestors().take(8).find(|d| is_project_root(d));
    let is_root = root == Some(start);
    let framework = root.and_then(detect_framework).unwrap_or("generic").to_string();

    let mut content_dirs = Vec::new();
    if let Some(root) = root.filter(|_| is_root) {
        for rel in CONTENT_CANDIDATES {
            let dir = root.join(rel);
            if dir.is_dir() {
                content_dirs.push(ContentDir { path: rel.to_string(), posts: count_posts(&dir) });
            }
        }
        let mut scanned = Vec::new();
        scan_content_dirs(root, root, 0, &mut scanned);
        scanned.sort_by(|a, b| b.posts.cmp(&a.posts));
        for d in scanned {
            if !content_dirs.iter().any(|c| c.path == d.path) {
                content_dirs.push(d);
            }
        }
        // Folders that already hold posts first; candidate order breaks ties.
        content_dirs.sort_by_key(|d| d.posts == 0);
    }

    Ok(ProjectInfo {
        root: root.map(|r| r.to_string_lossy().to_string()),
        is_root,
        framework,
        content_dirs,
    })
}

// ═══ Post deletion ═══════════════════════════════════════════════════════════

// What deleting a post removes: its whole folder, or just its file for flat layouts.
enum PostTarget {
    Folder(std::path::PathBuf),
    File(std::path::PathBuf),
}

fn post_target(mdx_path: &str, slug: &str, profile: &PostProfile) -> Result<PostTarget, String> {
    let file = post_file(mdx_path, slug, profile)?;
    if !file.is_file() {
        return Err(format!("Not a post: {}", file.display()));
    }
    Ok(if profile.is_folder() {
        PostTarget::Folder(Path::new(mdx_path).join(slug))
    } else {
        PostTarget::File(file)
    })
}

fn collect_files(dir: &Path, base: &Path, out: &mut Vec<String>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_dir() {
            collect_files(&p, base, out);
        } else if let Ok(rel) = p.strip_prefix(base) {
            out.push(rel.to_string_lossy().replace('\\', "/"));
        }
    }
}

/// Files that deleting the post would remove (shown in the confirmation).
fn post_files(mdx_path: String, slug: String, profile: Option<PostProfile>) -> Result<Vec<String>, String> {
    match post_target(&mdx_path, &slug, &profile.unwrap_or_default())? {
        PostTarget::Folder(dir) => {
            let mut files = Vec::new();
            collect_files(&dir, &dir, &mut files);
            files.sort();
            Ok(files)
        }
        PostTarget::File(file) => Ok(vec![file.file_name().unwrap_or_default().to_string_lossy().to_string()]),
    }
}

fn delete_post(mdx_path: String, slug: String, profile: Option<PostProfile>) -> Result<(), String> {
    match post_target(&mdx_path, &slug, &profile.unwrap_or_default())? {
        PostTarget::Folder(dir) => fs::remove_dir_all(&dir).map_err(|e| format!("{}: {}", dir.display(), e)),
        PostTarget::File(file) => fs::remove_file(&file).map_err(|e| format!("{}: {}", file.display(), e)),
    }
}

// ═══ Config file locations (shown in Settings) ═══════════════════════════════

#[derive(serde::Serialize)]
struct ConfigFile {
    key: String,
    path: String,
    exists: bool,
}

#[derive(serde::Serialize)]
struct ConfigLocations {
    app_dir: String,
    app_files: Vec<ConfigFile>,
    workspaces: Vec<Vec<ConfigFile>>,
}

fn describe(key: &str, path: std::path::PathBuf) -> ConfigFile {
    ConfigFile { key: key.to_string(), exists: path.exists(), path: path.to_string_lossy().to_string() }
}

fn config_locations(workspace_paths: Vec<String>) -> Result<ConfigLocations, String> {
    let app_dir = app_data_path("")?;
    let app_files = ["settings.json", "workspaces.json", "config.key"]
        .iter()
        .map(|f| describe(f, app_data_path(f).unwrap_or_default()))
        .collect();
    let workspaces = workspace_paths
        .iter()
        .map(|w| {
            let root = Path::new(w);
            vec![describe("workspace", root.join(".mditoor.json")), describe("ideas", root.join(IDEAS_FILE))]
        })
        .collect();
    Ok(ConfigLocations { app_dir: app_dir.to_string_lossy().trim_end_matches(['/', '\\']).to_string(), app_files, workspaces })
}

// ═══ Post ideas (per workspace, versioned alongside the posts) ═══════════════

const IDEAS_FILE: &str = ".mditoor-ideas.json";

fn read_ideas(mdx_path: String) -> Result<String, String> {
    let path = Path::new(&mdx_path).join(IDEAS_FILE);
    if !path.exists() {
        return Ok(String::from("{\"version\":1,\"ideas\":[]}"));
    }
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

fn write_ideas(mdx_path: String, content: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&content).map_err(|e| format!("Invalid ideas JSON: {e}"))?;
    let dir = Path::new(&mdx_path);
    // Write to a temp file then rename, so a crash mid-write never truncates the list.
    let tmp = dir.join(format!("{IDEAS_FILE}.tmp"));
    fs::write(&tmp, content).map_err(|e| e.to_string())?;
    fs::rename(&tmp, dir.join(IDEAS_FILE)).map_err(|e| e.to_string())
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

fn read_app_data(file: String) -> Result<String, String> {
    let path = app_data_path(&file)?;
    if !path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

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
    orig_path: Option<String>,
    staged: String,   // index status char  (X in "XY path")
    unstaged: String, // work-tree status char (Y in "XY path")
    staged_stat: Option<(u32, u32)>,
    unstaged_stat: Option<(u32, u32)>,
}

#[derive(serde::Serialize)]
struct GitStatus {
    is_repo: bool,
    branch: String,
    detached: bool,
    has_commits: bool,
    remote: Option<String>,
    upstream: Option<String>,
    ahead: u32,
    behind: u32,
    files: Vec<GitFile>,
}

#[derive(serde::Serialize)]
struct GitCommit {
    hash: String,
    short: String,
    date: String,
    timestamp: u64,
    author: String,
    email: String,
    refs: String,
    message: String,
}

#[derive(serde::Serialize)]
struct GitBranch {
    name: String,
    current: bool,
    remote: bool,
    upstream: String,
    updated: u64,
}

// Every git invocation goes through here: no prompts (a credential prompt with
// stdin closed would hang forever), no editor, and no console window on Windows.
fn git_output(dir: &str, args: &[&str]) -> Result<Output, String> {
    let mut cmd = Command::new("git");
    cmd.args(args)
        .current_dir(dir)
        .stdin(Stdio::null())
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_EDITOR", "true")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("LC_ALL", "C");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd.output().map_err(|e| format!("git not found: {}", e))
}

fn git(dir: &str, args: &[&str]) -> Result<String, String> {
    let out = git_output(dir, args)?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    } else {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
        Err(if !err.is_empty() { err } else { stdout })
    }
}

// Raw stdout without trimming — porcelain output is whitespace-significant
// (a leading space is the "unchanged in index" status column).
fn git_raw(dir: &str, args: &[&str]) -> Result<String, String> {
    let out = git_output(dir, args)?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

// Collects both stdout and stderr — used for push/pull whose progress goes to
// stderr even on success.
fn git_combined(dir: &str, args: &[&str]) -> Result<String, String> {
    let out = git_output(dir, args)?;
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

// Parses `git diff --numstat -z` into path -> (added, deleted).
fn parse_numstat(raw: &str) -> HashMap<String, (u32, u32)> {
    let mut map = HashMap::new();
    let mut tokens = raw.split('\0').filter(|t| !t.is_empty()).peekable();
    while let Some(tok) = tokens.next() {
        let mut parts = tok.splitn(3, '\t');
        let add = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
        let del = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
        let path = parts.next().unwrap_or("");
        let path = if path.is_empty() {
            // Rename: the next two tokens are old and new paths.
            let _old = tokens.next();
            tokens.next().unwrap_or("").to_string()
        } else {
            path.to_string()
        };
        map.insert(path, (add, del));
    }
    map
}

fn count_lines(dir: &str, rel: &str) -> Option<(u32, u32)> {
    let p = Path::new(dir).join(rel);
    let meta = fs::metadata(&p).ok()?;
    if !meta.is_file() || meta.len() > 2 * 1024 * 1024 {
        return None;
    }
    let text = fs::read_to_string(&p).ok()?;
    Some((text.lines().count() as u32, 0))
}

fn current_remote(dir: &str) -> Option<String> {
    let remotes = git(dir, &["remote"]).ok()?;
    let names: Vec<&str> = remotes.lines().map(|l| l.trim()).filter(|l| !l.is_empty()).collect();
    if names.contains(&"origin") {
        Some("origin".to_string())
    } else {
        names.first().map(|s| s.to_string())
    }
}

fn git_status(mdx_path: String) -> Result<GitStatus, String> {
    let dir = mdx_path.as_str();
    if git(dir, &["rev-parse", "--git-dir"]).is_err() {
        return Ok(GitStatus {
            is_repo: false,
            branch: String::new(),
            detached: false,
            has_commits: false,
            remote: None,
            upstream: None,
            ahead: 0,
            behind: 0,
            files: vec![],
        });
    }

    let has_commits = git(dir, &["rev-parse", "--verify", "-q", "HEAD"]).is_ok();
    let (branch, detached) = match git(dir, &["symbolic-ref", "--short", "-q", "HEAD"]) {
        Ok(b) if !b.is_empty() => (b, false),
        _ => (git(dir, &["rev-parse", "--short", "HEAD"]).unwrap_or_else(|_| "HEAD".into()), true),
    };

    let remote = current_remote(dir).and_then(|r| git(dir, &["remote", "get-url", &r]).ok());
    let upstream = git(dir, &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]).ok();

    let (ahead, behind) = if upstream.is_some() {
        match git(dir, &["rev-list", "--left-right", "--count", "@{u}...HEAD"]) {
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

    let staged_stats = git_raw(dir, &["diff", "--cached", "--numstat", "-z"])
        .map(|r| parse_numstat(&r))
        .unwrap_or_default();
    let unstaged_stats = git_raw(dir, &["diff", "--numstat", "-z"])
        .map(|r| parse_numstat(&r))
        .unwrap_or_default();

    let raw = git_raw(dir, &["status", "--porcelain=v1", "-z", "-uall"]).unwrap_or_default();
    let mut files = Vec::new();
    let mut entries = raw.split('\0').filter(|e| !e.is_empty());
    while let Some(entry) = entries.next() {
        if entry.len() < 4 {
            continue;
        }
        let mut chars = entry.chars();
        let x = chars.next().unwrap_or(' ');
        let y = chars.next().unwrap_or(' ');
        let path = entry[3..].to_string();
        let orig_path = if x == 'R' || x == 'C' {
            entries.next().map(|s| s.to_string())
        } else {
            None
        };
        let unstaged_stat = if x == '?' {
            count_lines(dir, &path)
        } else {
            unstaged_stats.get(&path).copied()
        };
        files.push(GitFile {
            staged_stat: staged_stats.get(&path).copied(),
            unstaged_stat,
            staged: x.to_string(),
            unstaged: y.to_string(),
            orig_path,
            path,
        });
    }

    Ok(GitStatus { is_repo: true, branch, detached, has_commits, remote, upstream, ahead, behind, files })
}

fn git_log(mdx_path: String, limit: Option<u32>) -> Result<Vec<GitCommit>, String> {
    let n = format!("-{}", limit.unwrap_or(100));
    let raw = match git_raw(
        &mdx_path,
        &["log", "--format=%H%x1f%h%x1f%ad%x1f%at%x1f%an%x1f%ae%x1f%D%x1f%s%x1e", "--date=short", &n],
    ) {
        Ok(r) => r,
        // A fresh repository has no HEAD yet — that's an empty history, not an error.
        Err(e) if e.contains("does not have any commits") || e.contains("bad default revision") => {
            return Ok(vec![]);
        }
        Err(e) => return Err(e),
    };
    Ok(raw
        .split('\x1e')
        .map(|r| r.trim_matches(|c| c == '\n' || c == '\r'))
        .filter(|r| !r.is_empty())
        .map(|rec| {
            let p: Vec<&str> = rec.splitn(8, '\x1f').collect();
            let get = |i: usize| p.get(i).unwrap_or(&"").to_string();
            GitCommit {
                hash: get(0),
                short: get(1),
                date: get(2),
                timestamp: get(3).parse().unwrap_or(0),
                author: get(4),
                email: get(5),
                refs: get(6),
                message: get(7),
            }
        })
        .collect())
}

fn git_branches(mdx_path: String) -> Result<Vec<GitBranch>, String> {
    let raw = git_raw(
        &mdx_path,
        &[
            "for-each-ref",
            "--sort=-committerdate",
            "--format=%(refname)%1f%(refname:short)%1f%(HEAD)%1f%(upstream:short)%1f%(committerdate:unix)",
            "refs/heads",
            "refs/remotes",
        ],
    )?;
    let local: Vec<String> = raw
        .lines()
        .filter(|l| l.starts_with("refs/heads/"))
        .filter_map(|l| l.split('\x1f').nth(1).map(|s| s.to_string()))
        .collect();
    Ok(raw
        .lines()
        .filter_map(|line| {
            let p: Vec<&str> = line.split('\x1f').collect();
            if p.len() < 5 {
                return None;
            }
            let remote = p[0].starts_with("refs/remotes/");
            let name = p[1].to_string();
            if remote {
                // Skip origin/HEAD and remote branches that already have a local twin.
                if p[0].ends_with("/HEAD") {
                    return None;
                }
                let short = name.split_once('/').map(|(_, b)| b).unwrap_or(&name);
                if local.iter().any(|l| l == short) {
                    return None;
                }
            }
            Some(GitBranch {
                name,
                current: p[2] == "*",
                remote,
                upstream: p[3].to_string(),
                updated: p[4].trim().parse().unwrap_or(0),
            })
        })
        .collect())
}

fn git_switch_branch(mdx_path: String, name: String, remote: Option<bool>) -> Result<String, String> {
    if remote.unwrap_or(false) {
        git_combined(&mdx_path, &["switch", "--track", &name])
            .or_else(|_| git_combined(&mdx_path, &["checkout", "--track", &name]))
    } else {
        git_combined(&mdx_path, &["switch", &name])
            .or_else(|_| git_combined(&mdx_path, &["checkout", &name]))
    }
}

fn git_create_branch(mdx_path: String, name: String) -> Result<String, String> {
    git_combined(&mdx_path, &["switch", "-c", &name])
        .or_else(|_| git_combined(&mdx_path, &["checkout", "-b", &name]))
}

fn git_commit(mdx_path: String, message: String) -> Result<String, String> {
    git(&mdx_path, &["add", "-A"])?;
    git(&mdx_path, &["commit", "-m", &message])
}

fn git_commit_staged(mdx_path: String, message: String, amend: Option<bool>) -> Result<String, String> {
    if amend.unwrap_or(false) {
        git(&mdx_path, &["commit", "--amend", "-m", &message])
    } else {
        git(&mdx_path, &["commit", "-m", &message])
    }
}

fn git_stage_file(mdx_path: String, file_path: String) -> Result<(), String> {
    git(&mdx_path, &["add", "-A", "--", &file_path]).map(|_| ())
}

fn git_stage_all(mdx_path: String) -> Result<(), String> {
    git(&mdx_path, &["add", "-A"]).map(|_| ())
}

fn git_unstage_file(mdx_path: String, file_path: String) -> Result<(), String> {
    git(&mdx_path, &["restore", "--staged", "--", &file_path])
        .or_else(|_| git(&mdx_path, &["reset", "-q", "HEAD", "--", &file_path]))
        .or_else(|_| git(&mdx_path, &["rm", "--cached", "-q", "--", &file_path]))
        .map(|_| ())
}

fn git_unstage_all(mdx_path: String) -> Result<(), String> {
    if git(&mdx_path, &["rev-parse", "--verify", "-q", "HEAD"]).is_ok() {
        git(&mdx_path, &["reset", "-q"]).map(|_| ())
    } else {
        git(&mdx_path, &["rm", "-r", "--cached", "-q", "."]).map(|_| ())
    }
}

fn git_discard_file(mdx_path: String, file_path: String) -> Result<(), String> {
    git(&mdx_path, &["restore", "--", &file_path])
        .or_else(|_| git(&mdx_path, &["checkout", "--", &file_path]))
        .map(|_| ())
}

fn git_diff_file(
    mdx_path: String,
    file_path: String,
    staged: Option<bool>,
    untracked: Option<bool>,
) -> Result<String, String> {
    if untracked.unwrap_or(false) {
        // --no-index exits with 1 when files differ, so read stdout regardless.
        let out = git_output(&mdx_path, &["diff", "--no-index", "--", "/dev/null", &file_path])?;
        return Ok(String::from_utf8_lossy(&out.stdout).to_string());
    }
    if staged.unwrap_or(false) {
        return git_raw(&mdx_path, &["diff", "--cached", "--", &file_path]);
    }
    let d = git_raw(&mdx_path, &["diff", "--", &file_path])?;
    if !d.trim().is_empty() {
        return Ok(d);
    }
    // Fall back to everything since HEAD (e.g. staged-only changes).
    Ok(git_raw(&mdx_path, &["diff", "HEAD", "--", &file_path]).unwrap_or_default())
}

fn git_show_commit(mdx_path: String, hash: String) -> Result<String, String> {
    git_raw(&mdx_path, &["show", "--stat", "--patch", "--format=%B", &hash])
}

fn git_fetch(mdx_path: String) -> Result<String, String> {
    git_combined(&mdx_path, &["fetch", "--all", "--prune"])
}

fn git_push(mdx_path: String) -> Result<String, String> {
    let dir = mdx_path.as_str();
    if git(dir, &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]).is_ok() {
        return git_combined(dir, &["push"]);
    }
    // No upstream yet (typical for a new branch): publish it and start tracking.
    let remote = current_remote(dir).ok_or_else(|| "No remote configured".to_string())?;
    let branch = git(dir, &["symbolic-ref", "--short", "HEAD"])?;
    git_combined(dir, &["push", "-u", &remote, &branch])
}

fn git_pull(mdx_path: String) -> Result<String, String> {
    git_combined(&mdx_path, &["pull", "--no-edit"])
}

fn git_sync(mdx_path: String) -> Result<String, String> {
    let dir = mdx_path.as_str();
    let mut log = Vec::new();
    if git(dir, &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]).is_ok() {
        log.push(git_pull(mdx_path.clone())?);
    }
    log.push(git_push(mdx_path.clone())?);
    Ok(log.join("\n"))
}

fn git_set_remote(mdx_path: String, url: String) -> Result<(), String> {
    let dir = mdx_path.as_str();
    if git(dir, &["remote", "get-url", "origin"]).is_ok() {
        git(dir, &["remote", "set-url", "origin", url.trim()]).map(|_| ())
    } else {
        git(dir, &["remote", "add", "origin", url.trim()]).map(|_| ())
    }
}

fn git_init(mdx_path: String) -> Result<String, String> {
    git(&mdx_path, &["init", "-b", "main"]).or_else(|_| git(&mdx_path, &["init"]))
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
    modified: u64,
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
                let meta = fs::metadata(&p).ok();
                let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
                let modified = meta
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0);
                let rel  = p.strip_prefix(base)
                    .map(|r| r.to_string_lossy().replace('\\', "/"))
                    .unwrap_or_default();
                let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
                out.push(ImageAsset { path: p.to_string_lossy().to_string(), rel_path: rel, name, ext, size, modified });
            }
        }
    }
}

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

fn delete_image(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.is_file() {
        return Err(format!("Not a file: {}", path));
    }
    fs::remove_file(p).map_err(|e| e.to_string())
}

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

// ═══ Image optimization ══════════════════════════════════════════════════════
//
// Resize to a max width, fix EXIF orientation, sharpen lightly, and re-encode in
// the same format. Re-encoding drops metadata (camera EXIF, GPS). The result is
// kept only when it is smaller than the original, so optimizing never bloats a file.

#[derive(serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct OptimizeOptions {
    /// Wider images are scaled down to this width; 0 keeps the size.
    max_width: u32,
    /// JPEG quality, 1-100.
    quality: u8,
    sharpen: bool,
}

#[derive(serde::Serialize)]
struct OptimizeResult {
    path: String,
    before: u64,
    after: u64,
}

/// Formats that can be re-encoded; GIF (animation), SVG and AVIF are left untouched.
fn optimizable(ext: &str) -> bool {
    matches!(ext, "jpg" | "jpeg" | "png" | "webp")
}

/// The optimized encoding of `data`, or None when it wouldn't be smaller.
fn optimize_bytes(data: &[u8], ext: &str, opts: &OptimizeOptions) -> Result<Option<Vec<u8>>, String> {
    use image::codecs::{jpeg::JpegEncoder, png::{CompressionType, FilterType as PngFilter, PngEncoder}, webp::WebPEncoder};
    use image::{DynamicImage, ImageDecoder, ImageReader, imageops::FilterType};

    if !optimizable(ext) {
        return Ok(None);
    }
    let reader = ImageReader::new(std::io::Cursor::new(data)).with_guessed_format().map_err(|e| e.to_string())?;
    let mut decoder = reader.into_decoder().map_err(|e| e.to_string())?;
    let orientation = decoder.orientation().map_err(|e| e.to_string())?;
    let mut img = DynamicImage::from_decoder(decoder).map_err(|e| e.to_string())?;
    img.apply_orientation(orientation);

    if opts.max_width > 0 && img.width() > opts.max_width {
        img = img.resize(opts.max_width, u32::MAX, FilterType::Lanczos3);
    }
    if opts.sharpen {
        // Mild unsharp mask: restores crispness lost to downscaling without halos.
        img = img.unsharpen(0.6, 2);
    }

    let mut out = Vec::new();
    let result = match ext {
        "jpg" | "jpeg" => {
            let enc = JpegEncoder::new_with_quality(&mut out, opts.quality.clamp(1, 100));
            DynamicImage::ImageRgb8(img.to_rgb8()).write_with_encoder(enc)
        }
        "png" => {
            let enc = PngEncoder::new_with_quality(&mut out, CompressionType::Best, PngFilter::Adaptive);
            img.write_with_encoder(enc)
        }
        // The built-in WebP encoder is lossless only; the size check below decides if it helps.
        _ => {
            let enc = WebPEncoder::new_lossless(&mut out);
            if img.color().has_alpha() {
                DynamicImage::ImageRgba8(img.to_rgba8()).write_with_encoder(enc)
            } else {
                DynamicImage::ImageRgb8(img.to_rgb8()).write_with_encoder(enc)
            }
        }
    };
    result.map_err(|e| e.to_string())?;
    Ok((out.len() < data.len()).then_some(out))
}

fn lower_ext(p: &Path) -> String {
    p.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase()
}

/// Optimizes an image file in place. `after == before` means it was left as is.
fn optimize_image(path: String, options: OptimizeOptions) -> Result<OptimizeResult, String> {
    let p = Path::new(&path);
    let data = fs::read(p).map_err(|e| format!("{}: {}", p.display(), e))?;
    let before = data.len() as u64;
    let after = match optimize_bytes(&data, &lower_ext(p), &options)? {
        Some(bytes) => {
            fs::write(p, &bytes).map_err(|e| e.to_string())?;
            bytes.len() as u64
        }
        None => before,
    };
    Ok(OptimizeResult { path, before, after })
}

// ═══ Image copy (local storage) ══════════════════════════════════════════════

fn copy_image_local(src_path: String, dest_folder: String, optimize: Option<OptimizeOptions>) -> Result<String, String> {
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

    let data = fs::read(src).map_err(|e| e.to_string())?;
    let optimized = match &optimize {
        Some(opts) => optimize_bytes(&data, &lower_ext(src), opts)?,
        None => None,
    };
    fs::write(&dest, optimized.as_deref().unwrap_or(&data)).map_err(|e| e.to_string())?;
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
                    if !path.is_empty() && !path.starts_with("data:") {
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
                if !path.is_empty() && !path.starts_with("data:") {
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
    // Frontmatter values such as `cover: ./hero.png`
    if let Some((_, value)) = line.split_once(':') {
        let v = value.trim().trim_matches(|c| c == '"' || c == '\'');
        let lower = v.to_lowercase();
        if IMAGE_EXTS.iter().any(|ext| lower.ends_with(&format!(".{ext}"))) {
            if let Some(name) = Path::new(v).file_name().and_then(|n| n.to_str()) {
                out.insert(name.to_string());
            }
        }
    }
}

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
    optimize: Option<OptimizeOptions>,
) -> Result<String, String> {
    let data  = fs::read(&file_path).map_err(|e| e.to_string())?;
    let ext   = Path::new(&file_path).extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    let data = match &optimize {
        Some(opts) => {
            let (bytes, ext, opts) = (data, ext.clone(), opts.clone());
            tauri::async_runtime::spawn_blocking(move || optimize_bytes(&bytes, &ext, &opts).map(|o| o.unwrap_or(bytes)))
                .await
                .map_err(|e| e.to_string())??
        }
        None => data,
    };
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

// ═══ Command wrappers ════════════════════════════════════════════════════════
//
// Tauri runs non-async commands on the main thread, so every git call, folder
// scan and file read above used to freeze the window (tab switches, dragging,
// focus refreshes). Each command here is async and runs its blocking body on
// the blocking thread pool instead.

mod cmd {
    use super::*;

    macro_rules! blocking {
        ($name:ident($($arg:ident: $ty:ty),*) -> $ret:ty) => {
            #[tauri::command]
            pub(crate) async fn $name($($arg: $ty),*) -> Result<$ret, String> {
                tauri::async_runtime::spawn_blocking(move || super::$name($($arg),*))
                    .await
                    .map_err(|e| e.to_string())?
            }
        };
    }

    blocking!(list_mdx_slugs(path: String, profile: Option<PostProfile>) -> Vec<String>);
    blocking!(list_posts(path: String, profile: Option<PostProfile>) -> Vec<PostSummary>);
    blocking!(detect_project(path: String) -> ProjectInfo);
    blocking!(read_post(mdx_path: String, slug: String, profile: Option<PostProfile>) -> String);
    blocking!(write_post(mdx_path: String, slug: String, content: String, profile: Option<PostProfile>) -> ());
    blocking!(post_path(mdx_path: String, slug: String, profile: Option<PostProfile>) -> String);
    blocking!(read_workspace_config(mdx_path: String) -> String);
    blocking!(write_workspace_config(mdx_path: String, config: String) -> ());
    blocking!(read_app_data(file: String) -> String);
    blocking!(write_app_data(file: String, content: String) -> ());
    blocking!(git_status(mdx_path: String) -> GitStatus);
    blocking!(git_log(mdx_path: String, limit: Option<u32>) -> Vec<GitCommit>);
    blocking!(git_branches(mdx_path: String) -> Vec<GitBranch>);
    blocking!(git_switch_branch(mdx_path: String, name: String, remote: Option<bool>) -> String);
    blocking!(git_create_branch(mdx_path: String, name: String) -> String);
    blocking!(git_commit(mdx_path: String, message: String) -> String);
    blocking!(git_commit_staged(mdx_path: String, message: String, amend: Option<bool>) -> String);
    blocking!(git_stage_file(mdx_path: String, file_path: String) -> ());
    blocking!(git_stage_all(mdx_path: String) -> ());
    blocking!(git_unstage_file(mdx_path: String, file_path: String) -> ());
    blocking!(git_unstage_all(mdx_path: String) -> ());
    blocking!(git_discard_file(mdx_path: String, file_path: String) -> ());
    blocking!(git_diff_file(mdx_path: String, file_path: String, staged: Option<bool>, untracked: Option<bool>) -> String);
    blocking!(git_show_commit(mdx_path: String, hash: String) -> String);
    blocking!(git_fetch(mdx_path: String) -> String);
    blocking!(git_push(mdx_path: String) -> String);
    blocking!(git_pull(mdx_path: String) -> String);
    blocking!(git_sync(mdx_path: String) -> String);
    blocking!(git_set_remote(mdx_path: String, url: String) -> ());
    blocking!(git_init(mdx_path: String) -> String);
    blocking!(list_images(mdx_path: String) -> Vec<ImageAsset>);
    blocking!(delete_image(path: String) -> ());
    blocking!(read_image_base64(path: String) -> String);
    blocking!(copy_image_local(src_path: String, dest_folder: String, optimize: Option<OptimizeOptions>) -> String);
    blocking!(optimize_image(path: String, options: OptimizeOptions) -> OptimizeResult);
    blocking!(analyze_image_usage(mdx_path: String) -> Vec<String>);
    blocking!(read_ideas(mdx_path: String) -> String);
    blocking!(post_files(mdx_path: String, slug: String, profile: Option<PostProfile>) -> Vec<String>);
    blocking!(delete_post(mdx_path: String, slug: String, profile: Option<PostProfile>) -> ());
    blocking!(config_locations(workspace_paths: Vec<String>) -> ConfigLocations);
    blocking!(write_ideas(mdx_path: String, content: String) -> ());

    /// Lets the webview load files under `path` through the asset protocol
    /// (thumbnails and covers stream straight from disk instead of base64 over IPC).
    #[tauri::command]
    pub(crate) fn allow_asset_dir(app: tauri::AppHandle, path: String) -> Result<(), String> {
        use tauri::Manager;
        app.asset_protocol_scope()
            .allow_directory(&path, true)
            .map_err(|e| e.to_string())
    }

    /// Resolves a post image reference to a file and grants the asset protocol
    /// access to that one file (images may live outside the workspace).
    #[tauri::command]
    pub(crate) async fn resolve_post_image(
        app: tauri::AppHandle,
        mdx_path: String,
        slug: String,
        src: String,
        hints: Option<ImageHints>,
    ) -> Result<ImageLookup, String> {
        use tauri::Manager;
        let lookup = tauri::async_runtime::spawn_blocking(move || super::resolve_post_image(mdx_path, slug, src, hints))
            .await
            .map_err(|e| e.to_string())??;
        if let Some(path) = &lookup.path {
            app.asset_protocol_scope().allow_file(path).map_err(|e| e.to_string())?;
        }
        Ok(lookup)
    }
}

// ═══ Entry point ═════════════════════════════════════════════════════════════

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            cmd::list_mdx_slugs,
            cmd::list_posts,
            cmd::detect_project,
            cmd::resolve_post_image,
            cmd::allow_asset_dir,
            cmd::read_post,
            cmd::write_post,
            cmd::post_path,
            cmd::read_workspace_config,
            cmd::write_workspace_config,
            cmd::read_app_data,
            cmd::write_app_data,
            cmd::git_status,
            cmd::git_log,
            cmd::git_branches,
            cmd::git_switch_branch,
            cmd::git_create_branch,
            cmd::git_commit,
            cmd::git_commit_staged,
            cmd::git_stage_file,
            cmd::git_stage_all,
            cmd::git_unstage_file,
            cmd::git_unstage_all,
            cmd::git_discard_file,
            cmd::git_diff_file,
            cmd::git_show_commit,
            cmd::git_fetch,
            cmd::git_push,
            cmd::git_pull,
            cmd::git_sync,
            cmd::git_set_remote,
            cmd::git_init,
            cmd::list_images,
            cmd::delete_image,
            cmd::read_image_base64,
            cmd::copy_image_local,
            cmd::optimize_image,
            cmd::analyze_image_usage,
            cmd::read_ideas,
            cmd::post_files,
            cmd::delete_post,
            cmd::config_locations,
            cmd::write_ideas,
            upload_to_s3,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_frontmatter_with_crlf() {
        let (fm, body, format) = split_frontmatter("---\r\ntitle: Hi\r\n---\r\nHello");
        assert_eq!(format, "yaml");
        assert_eq!(fm.trim(), "title: Hi");
        assert_eq!(body, "Hello");
    }

    #[test]
    fn no_frontmatter_returns_whole_body() {
        let (fm, body, _) = split_frontmatter("# Title");
        assert!(fm.is_empty());
        assert_eq!(body, "# Title");
    }

    #[test]
    fn finds_first_image() {
        let body = "Intro\n\n<img src=\"b.png\" />\n![a](./a.png)";
        assert_eq!(first_body_image(body).as_deref(), Some("b.png"));
        assert_eq!(first_body_image("![x](<my img.png> \"t\")").as_deref(), Some("my img.png"));
    }

    #[test]
    fn excerpt_skips_headings_markers_and_code() {
        let ex = plain_excerpt("# Title\n```js\ncode\n```\nSome **bold** text.", 100);
        assert_eq!(ex, "Title Some bold text.");
    }

    #[test]
    fn post_dir_rejects_paths_outside_workspace() {
        for bad in ["", ".", "..", "a/b", "a\\b", "C:evil", "../x"] {
            assert!(check_slug(bad).is_err(), "accepted {bad:?}");
        }
    }

    #[test]
    fn delete_post_removes_only_the_post_folder() {
        let root = std::env::temp_dir().join(format!("mditoor-test-{}", std::process::id()));
        let post = root.join("hello");
        fs::create_dir_all(post.join("img")).unwrap();
        fs::write(post.join("index.mdx"), "# hi").unwrap();
        fs::write(post.join("img").join("a.png"), "x").unwrap();
        fs::write(root.join("keep.txt"), "x").unwrap();
        let ws = root.to_string_lossy().to_string();

        let files = post_files(ws.clone(), "hello".into(), None).unwrap();
        assert_eq!(files, vec!["img/a.png".to_string(), "index.mdx".to_string()]);
        delete_post(ws.clone(), "hello".into(), None).unwrap();
        assert!(!post.exists());
        assert!(root.join("keep.txt").exists());
        // Not a post folder any more -> refuses.
        assert!(delete_post(ws, "hello".into(), None).is_err());
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn numstat_handles_renames() {
        let map = parse_numstat("3\t1\ta.md\0" /* normal */);
        assert_eq!(map.get("a.md"), Some(&(3, 1)));
        let map = parse_numstat("0\t0\t\0old.md\0new.md\0");
        assert_eq!(map.get("new.md"), Some(&(0, 0)));
    }
    #[test]
    fn detects_project_root_and_content_dirs() {
        let root = std::env::temp_dir().join(format!("mditoor-detect-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let blog = root.join("src/content/blog");
        fs::create_dir_all(&blog).unwrap();
        fs::write(root.join("astro.config.mjs"), "export default {}").unwrap();
        fs::write(blog.join("a.md"), "# a").unwrap();
        fs::write(blog.join("b.md"), "# b").unwrap();
        fs::create_dir_all(root.join("node_modules/pkg")).unwrap();
        fs::write(root.join("node_modules/pkg/x.md"), "").unwrap();
        fs::write(root.join("node_modules/pkg/y.md"), "").unwrap();

        let from_root = detect_project(root.to_string_lossy().to_string()).unwrap();
        assert!(from_root.is_root);
        assert_eq!(from_root.framework, "astro");
        assert_eq!(from_root.content_dirs[0].path, "src/content/blog");
        assert_eq!(from_root.content_dirs[0].posts, 2);
        assert!(from_root.content_dirs.iter().all(|d| !d.path.contains("node_modules")));

        let from_posts = detect_project(blog.to_string_lossy().to_string()).unwrap();
        assert!(!from_posts.is_root);
        assert_eq!(from_posts.root.as_deref(), Some(root.to_string_lossy().as_ref()));
        assert_eq!(from_posts.framework, "astro");
        assert!(from_posts.content_dirs.is_empty());

        let _ = fs::remove_dir_all(&root);
    }
    #[test]
    fn flat_layout_reads_writes_and_deletes_single_files() {
        let root = std::env::temp_dir().join(format!("mditoor-flat-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("images")).unwrap();
        fs::write(root.join("first.md"), "---\ntitle: First\n---\nHello").unwrap();
        fs::write(root.join("_index.md"), "section").unwrap();
        fs::write(root.join("images").join("a.png"), "x").unwrap();
        let ws = root.to_string_lossy().to_string();
        let flat = || Some(PostProfile { layout: "flat".into(), extension: ".md".into() });

        write_post(ws.clone(), "second".into(), "# Two".into(), flat()).unwrap();
        assert!(root.join("second.md").is_file());

        let posts = list_posts(ws.clone(), flat()).unwrap();
        let slugs: Vec<_> = posts.iter().map(|p| p.slug.as_str()).collect();
        assert_eq!(slugs, ["first", "second"]);
        assert_eq!(posts[0].file, "first.md");
        assert_eq!(read_post(ws.clone(), "first".into(), flat()).unwrap(), "---\ntitle: First\n---\nHello");

        assert_eq!(post_files(ws.clone(), "first".into(), flat()).unwrap(), vec!["first.md".to_string()]);
        delete_post(ws.clone(), "first".into(), flat()).unwrap();
        assert!(!root.join("first.md").exists());
        assert!(root.join("images").join("a.png").exists());

        // Folder layout accepts index.md as well as index.mdx.
        fs::create_dir_all(root.join("bundle")).unwrap();
        fs::write(root.join("bundle").join("index.md"), "# b").unwrap();
        assert_eq!(list_mdx_slugs(ws, None).unwrap(), vec!["bundle".to_string()]);
        let _ = fs::remove_dir_all(&root);
    }
    #[test]
    fn optimize_shrinks_and_resizes_jpeg_but_never_grows() {
        let opts = OptimizeOptions { max_width: 64, quality: 70, sharpen: true };
        let mut img = image::RgbImage::new(256, 128);
        for (x, y, px) in img.enumerate_pixels_mut() {
            *px = image::Rgb([(x % 256) as u8, (y * 2 % 256) as u8, ((x ^ y) % 256) as u8]);
        }
        let mut jpeg = Vec::new();
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, 100)
            .encode_image(&img)
            .unwrap();

        let out = optimize_bytes(&jpeg, "jpg", &opts).unwrap().expect("smaller output");
        assert!(out.len() < jpeg.len());
        let decoded = image::load_from_memory(&out).unwrap();
        assert_eq!((decoded.width(), decoded.height()), (64, 32));

        // Unsupported formats are left alone.
        assert!(optimize_bytes(b"GIF89a", "gif", &opts).unwrap().is_none());
    }
    #[test]
    fn splits_toml_frontmatter() {
        let (fm, body, format) = split_frontmatter("+++\ntitle = \"Hi\"\ntags = [\n  \"a\",\n]\n+++\nHello");
        assert_eq!(format, "toml");
        assert_eq!(fm, "title = \"Hi\"\ntags = [\n  \"a\",\n]\n");
        assert_eq!(body, "Hello");
        // An unclosed fence is not frontmatter.
        let (_, body, format) = split_frontmatter("+++\ntitle = 1\nno end");
        assert_eq!((body, format), ("+++\ntitle = 1\nno end", ""));
    }
    #[test]
    fn resolves_images_via_public_prefix_post_folder_and_encoding() {
        let root = std::env::temp_dir().join(format!("mditoor-img-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let posts = root.join("content/posts");
        fs::create_dir_all(posts.join("hello")).unwrap();
        fs::create_dir_all(root.join("assets/img")).unwrap();
        fs::write(posts.join("hello/cover photo.png"), "x").unwrap();
        fs::write(root.join("assets/img/a.png"), "xy").unwrap();
        let ws = posts.to_string_lossy().to_string();
        let hints = || Some(ImageHints {
            root_path: Some(root.to_string_lossy().to_string()),
            public_dir: Some(root.join("assets/img").to_string_lossy().to_string()),
            url_prefix: Some("/static-img".into()),
        });

        let colocated = resolve_post_image(ws.clone(), "hello".into(), "./cover%20photo.png".into(), hints()).unwrap();
        assert!(colocated.path.unwrap().ends_with("cover photo.png"));

        let public = resolve_post_image(ws.clone(), "hello".into(), "/static-img/a.png?v=2".into(), hints()).unwrap();
        assert_eq!(public.size, 2);
        assert!(public.path.unwrap().ends_with("a.png"));

        let missing = resolve_post_image(ws, "hello".into(), "/static-img/nope.png".into(), hints()).unwrap();
        assert!(missing.path.is_none());
        assert!(missing.tried[0].ends_with("nope.png") && missing.tried[0].contains("img"));

        assert_eq!(percent_decode("a%20b%2"), "a b%2");
        let _ = fs::remove_dir_all(&root);
    }
}
