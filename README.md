<div align="center">

<img src="src-tauri/icons/128x128@2x.png" width="96" alt="Mditoor logo" />

# Mditoor

**A local-first desktop studio for writing Markdown and MDX content, built for bilingual (RTL + LTR) writers.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/ezzdin-atef/mditoor?include_prereleases)](https://github.com/ezzdin-atef/mditoor/releases)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%20v2-24C8DB)](https://tauri.app)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing)

[Download](#installation) · [Features](#features) · [Getting started](#getting-started) · [Contributing](#contributing)

</div>

---

Mditoor is a desktop app (Tauri + React + Rust) for writing in a static site's repository or directly on DEV.to. Local project workspaces edit plain `.md` / `.mdx` files in place, manage images, and handle git. DEV workspaces keep local Markdown drafts and sync articles to your DEV account.

It is designed for people who write in **both Arabic and English**: text direction is detected per block, and the UI itself is available in English, Arabic, and French.

> **Status:** early and actively developed. Expect rough edges and breaking changes to the workspace config between versions. Bug reports are very welcome.

## Features

- **Editor** — block-based editor and raw Markdown mode, with formatting toolbar and keyboard shortcuts
- **RTL / LTR** — automatic text direction per block, so mixed Arabic/English posts just work
- **Frontmatter forms** — define metadata fields per workspace (`text`, `number`, `boolean`, `date`, `select`, `tags`, `image`) and edit them as a form instead of raw YAML/TOML
- **Framework presets** — post layout, file extension, frontmatter format and image location for common static-site generators
- **Git** — status, diff view, stage, commit, pull, and push from inside the app
- **Images** — drag in images, optional resize/compress on import, and store them next to the post, in a `public/` folder, or on any S3-compatible bucket
- **Asset gallery** — see every image in a workspace and which ones are unused
- **SEO panel** — quick checks on a post before you publish it
- **Ideas board** — capture post ideas and turn them into drafts
- **DEV.to workspaces** — connect an account, import existing articles, write offline, sync drafts, and publish without a personal site
- **Cross-posting** — send a local project post to a connected DEV account with an optional canonical URL
- **Command palette** — `Ctrl/Cmd + K` to jump anywhere
- **Local-first** — local drafts remain available offline; posts go to DEV only when you choose to sync or publish

### DEV.to workspaces

Create a workspace and choose **DEV.to**, then paste an API key from your [DEV settings](https://dev.to/settings/extensions). Mditoor verifies the account and keeps the key encrypted in its local app data. Existing articles are imported when the workspace refreshes. New drafts save locally first; **Save to DEV** and **Publish on DEV** are explicit actions in the editor. If both copies change, the editor asks which version to keep.

DEV's documented article API accepts Markdown and public image URLs. In a DEV workspace, configure an S3 or compatible bucket under **Settings → Image uploads to DEV** to upload cover and inline images from your computer. The objects must be publicly readable, either through the bucket URL or a public URL prefix. Existing cover images appear as previews and can be replaced with a new upload. Convert MDX components and local image paths before syncing. Existing drafts are imported through DEV's older authenticated article list because its current v1 list omits Markdown. Removing a DEV workspace removes its saved API key but keeps local drafts in app data.

<!-- TODO: add a screenshot or GIF here, e.g. docs/screenshot.png -->

## Supported frameworks

When you create a workspace, Mditoor tries to detect the framework and suggest the posts folder. Each preset sets sensible defaults, all of which can be changed later.

| Preset        | Post file                  | Frontmatter | Default image location |
| ------------- | -------------------------- | ----------- | ---------------------- |
| Next.js       | `<slug>/index.mdx`         | YAML        | `public/images`        |
| Astro         | `<slug>.md`                | YAML        | next to the post       |
| Hugo          | `<slug>/index.md`          | TOML        | next to the post       |
| Jekyll        | `YYYY-MM-DD-<slug>.md`     | YAML        | `assets/images`        |
| Docusaurus    | `<slug>/index.md`          | YAML        | next to the post       |
| Eleventy      | `<slug>.md`                | YAML        | next to the post       |
| Nuxt Content  | `<slug>.md`                | YAML        | `public/images`        |
| Generic       | `<slug>/index.mdx`         | YAML        | next to the post       |

Next.js is the most tested. If your setup does not fit a preset, please [open an issue](https://github.com/ezzdin-atef/mditoor/issues) with an example repo layout.

## Supported platforms

| Platform | Status                                                  |
| -------- | ------------------------------------------------------- |
| Windows  | Prebuilt installer on the Releases page                 |
| macOS    | Builds from source; not yet packaged or regularly tested |
| Linux    | Builds from source; not yet packaged or regularly tested |

Help testing and packaging macOS and Linux builds is one of the most useful contributions right now.

## Installation

### Windows

Download the latest `Mditoor-Setup-<version>-Windows-x64.exe` from the [Releases page](https://github.com/ezzdin-atef/mditoor/releases) and run it.

The installer is not code-signed yet, so Windows SmartScreen may warn you. Choose **More info → Run anyway** if you trust the source, or [build it yourself](#building-from-source).

### macOS / Linux

Build from source for now — see below.

## Getting started

1. **Create a workspace.** Pick your project root (Mditoor detects the framework and suggests the posts folder) or pick the posts folder directly.
2. **Define your metadata fields** in the workspace settings, e.g. `title`, `date`, `status`, `tags`.
3. **Write.** Create a post, fill the frontmatter form, and add images.
4. **Commit and push** from the Git panel.

### Workspace config

Mditoor stores per-workspace settings in a `.mditoor.json` file inside the posts folder, and post ideas in `.mditoor-ideas.json`:

```text
content/posts/              <- workspace path (your posts folder)
├── .mditoor.json           <- fields, framework profile, storage settings
├── .mditoor-ideas.json     <- ideas board
├── my-first-post/
│   └── index.mdx
└── another-post/
    └── index.mdx
```

Metadata fields look like this:

```json
{
  "metadataFields": [
    { "name": "title", "type": "text", "required": true },
    { "name": "date", "type": "date", "required": true },
    { "name": "status", "type": "select", "options": ["draft", "published"] },
    { "name": "tags", "type": "tags" },
    { "name": "featured", "type": "boolean" }
  ]
}
```

You can commit `.mditoor.json` so teammates share the same fields and profile.

### Credentials and privacy

- The `storage` section (including S3 access keys) is **encrypted** in `.mditoor.json` with a random key kept in the app's data folder on your machine. It is therefore safe to commit the file, but the storage settings will only be readable on the machine that wrote them — each teammate enters their own S3 credentials.
- Mditoor makes no network requests of its own except git operations you trigger and uploads to the S3 endpoint you configure.
- Use S3 keys scoped to a single bucket with only the permissions Mditoor needs (uploading objects).

## Building from source

### Prerequisites

- [Node.js](https://nodejs.org) 20+
- [pnpm](https://pnpm.io) (npm also works)
- [Rust](https://rustup.rs) stable toolchain
- The Tauri system dependencies for your OS — see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
  (on Windows: Microsoft C++ Build Tools and WebView2; on Linux: `webkit2gtk` and friends; on macOS: Xcode Command Line Tools)

### Commands

```bash
# Install dependencies
pnpm install

# Run the desktop app in development mode (hot reload)
pnpm tauri dev

# Type-check and build the frontend only
pnpm build

# Build a production installer for your OS
pnpm tauri build
```

Installers are written to `src-tauri/target/release/bundle/` (for example `nsis/Mditoor_<version>_x64-setup.exe` on Windows).

The first build takes several minutes because Rust compiles all dependencies; later builds are incremental.

`pnpm dev` starts only the Vite frontend in a browser. Most features call into Rust through Tauri, so they will not work there — use `pnpm tauri dev` for real testing.

### Regenerating app icons

After editing `src-tauri/icons/icon-source.svg` (at least 1024×1024):

```bash
pnpm tauri icon src-tauri/icons/icon-source.svg
```

## Project structure

```text
src/                    React frontend
├── features/           feature modules (editor, posts, git, assets, workspace, settings, ideas)
├── components/         shared UI components
├── i18n/locales/       translations (en, ar, fr)
├── store/              global Zustand stores
└── lib/                helpers
src-tauri/              Rust backend (Tauri commands: file I/O, git, S3 upload, image processing)
├── src/lib.rs
└── tauri.conf.json
.github/workflows/      release pipeline
```

| Layer    | Technology                        |
| -------- | --------------------------------- |
| Desktop  | Tauri v2, Rust                    |
| Frontend | React 19, TypeScript, Vite        |
| UI       | Tailwind CSS v4                   |
| State    | Zustand, TanStack Query           |
| i18n     | i18next (English, Arabic, French) |

## Contributing

Contributions of all sizes are welcome — bug reports, docs, translations, framework presets, and code.

**Before you start**

- For bugs, [open an issue](https://github.com/ezzdin-atef/mditoor/issues) with your OS, Mditoor version, framework, and steps to reproduce.
- For features or larger changes, open an issue first so we can agree on the approach before you spend time on it.
- Small fixes (typos, obvious bugs) can go straight to a pull request.

**Workflow**

1. Fork the repo and create a branch from `main` (e.g. `fix/rtl-list-indent`).
2. Make your change and run the app with `pnpm tauri dev` to check it.
3. Make sure `pnpm build` passes (TypeScript type-check) and, for Rust changes, `cargo fmt` and `cargo clippy` are clean inside `src-tauri/`.
4. Use [Conventional Commits](https://www.conventionalcommits.org/) for messages, e.g. `feat: add Hugo page bundles`, `fix: keep cursor position after save`.
5. Open a pull request describing what changed and why. Include screenshots for UI changes, and check both LTR and RTL layouts.

**Good first contributions**

- **Translations** — add or improve a locale in `src/i18n/locales/`. Keep keys in sync with `en.json`.
- **Framework presets** — add or refine a preset in `src/features/workspace/types.ts`.
- **macOS / Linux** — test builds, report issues, help with packaging.

**Guidelines**

- Keep the app local-first: no telemetry, no required accounts, no new network calls without discussion.
- Keep user-facing strings in the locale files, not hard-coded.
- Keep PRs focused; unrelated refactors are easier to review separately.

## Releasing (maintainers)

From a clean `main`:

```bash
pnpm release patch        # or minor / major / an explicit version like 2.1.0-beta.1
```

This bumps the version in `package.json`, `Cargo.toml` and `Cargo.lock`, commits `chore(release): vX.Y.Z`, tags it and pushes. The tag starts the **Release Windows app** workflow, which:

1. Checks the tag matches `package.json` (fails otherwise).
2. Creates a draft release with a changelog grouped from `feat:` / `fix:` commits since the previous tag.
3. Builds and uploads `Mditoor-Setup-X.Y.Z-Windows-x64.exe` plus the signed `latest.json` for the in-app updater.
4. Publishes the release. Versions with a `-suffix` are marked pre-release, so the updater does not offer them to stable users.

Use `--dry-run` to preview the next version, or `--no-push` to commit and tag without pushing.

`package.json` is the single source of truth for the version; `tauri.conf.json` reads it, so the version shown in the app always matches.

## License

[MIT](LICENSE) © Ezzdin Atef
