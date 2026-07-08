# Mditoor

> A desktop content studio for MDX, Next.js, and file-based websites — with full RTL and LTR support.

Mditoor is a local-first desktop application built with Tauri, React, and Rust that makes editing MDX content easy while keeping your files inside your own repository.

---

## Features

- Block-based and raw Markdown editor
- Dynamic metadata forms with schema-based field types
- Git integration (stage, commit, push, pull, diff view)
- Image management and S3 upload support
- Asset gallery with used/unused tracking
- SEO analysis panel
- RTL / LTR auto-detection per block
- Local-first — no accounts, no cloud sync

---

## Why Mditoor?

Writing MDX content today usually requires switching between:

- A code editor
- A file explorer
- Frontmatter editing by hand
- Manual image uploads
- S3 tooling
- Git commands

Mditoor brings all of these into a single desktop application.

---

## Philosophy

- **Local first** — your files stay in your repo
- **Git friendly** — built-in staging, commits, and remote sync
- **File based** — plain `.mdx` files, no proprietary format
- **Framework aware** — designed around Next.js MDX conventions
- **Developer focused** — workspace config lives next to your content

---

## Supported Platforms

- Windows
- macOS (Soon)
- Linux (Soon)

---

## Supported Frameworks

Current:

- Next.js (MDX)

Planned:

- Astro
- Nuxt
- Docusaurus

---

## Workspace Structure

Point a workspace at your posts folder. Mditoor creates a `.mditoor.json` config file alongside your content:

```text
content/posts/           ← your posts folder (set as workspace path)
├── .mditoor.json        ← workspace config (auto-created)
├── my-first-post/
│   └── index.mdx
└── another-post/
    └── index.mdx
```

---

## Metadata Schema

Define frontmatter fields per workspace. Supported field types: `text`, `select`, `date`, `tags`, `boolean`, `image`, `number`.

```json
{
  "fields": [
    { "name": "title", "type": "text", "required": true },
    { "name": "date", "type": "date", "required": true },
    { "name": "status", "type": "select", "options": ["draft", "published"] },
    { "name": "tags", "type": "tags" },
    { "name": "featured", "type": "boolean" }
  ]
}
```

---

## Tech Stack

| Layer    | Technology                        |
| -------- | --------------------------------- |
| Desktop  | Tauri v2, Rust                    |
| Frontend | React 19, TypeScript, Vite        |
| UI       | Tailwind CSS v4                   |
| State    | Zustand, TanStack Query           |
| i18n     | i18next (English, Arabic, French) |

---

## Development

### Install dependencies

```bash
npm install
```

### Run in development mode

```bash
npm run tauri dev
```

### Build for production

```bash
npm run tauri build
```

### Build a local Windows installer (.exe)

**Prerequisites**

- [Node.js](https://nodejs.org) 18+
- [Rust](https://rustup.rs) (stable toolchain)
- [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (required by Tauri on Windows)

**Steps**

```bash
# 1. Install dependencies
npm install

# 2. Build
npm run tauri build
```

The installer is created at:

```
src-tauri/target/release/bundle/nsis/Mditoor_<version>_x64-setup.exe
```

Run that file to install the app on any Windows machine.

> **Tip:** The first build takes several minutes because Rust compiles from scratch.
> Subsequent builds are faster thanks to incremental compilation.

### Frontend only (without Tauri window)

```bash
npm run dev
```

### Regenerate app icons

After editing `src-tauri/icons/icon-source.svg` (must be at least 1024×1024):

```bash
npm run tauri -- icon src-tauri/icons/icon-source.svg
```

---

## Contributing

Contributions are welcome. Please open an issue before submitting large changes.

---

Built with React, Rust, and Tauri.
