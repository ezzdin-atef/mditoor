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

Mditoor is a desktop app (Tauri + React + Rust) for writing posts in your static site's repository. It edits plain `.md` / `.mdx` files in place, gives you a form for frontmatter, manages images, and handles git — so you can write, commit, and publish without a terminal.

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
- **Command palette** — `Ctrl/Cmd + K` to jump anywhere
- **Local-first** — no account, no telemetry, no cloud sync; your files never leave your machine unless you push or upload them

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

1. Push the commit you want to release.
2. On GitHub, publish a release with a tag of the form `vMAJOR.MINOR.PATCH` (e.g. `v1.2.3`).
3. The **Release Windows app** workflow builds that tag and attaches `Mditoor-Setup-1.2.3-Windows-x64.exe` to the release.

The release tag is the source of truth for the app version.

## License

[MIT](LICENSE) © Ezzdin Atef
