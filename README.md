# Mditoor

> A desktop content studio for MDX, Next.js, and file-based websites with supporting of both RTL and LTR Langs.

Mditoor is a local-first desktop application built with Tauri, React, and Rust that makes editing MDX content easy while keeping your files inside your own repository.

---

## Features

- Rich MDX editor
- Dynamic metadata forms
- Schema-based content models
- Image management
- S3 uploads
- Asset gallery
- Next.js preview
- MDX component support
- Git integration
- SEO tools
- Local-first architecture

---

## Why Mditoor?

Writing MDX content today usually requires:

- VSCode
- File explorer
- Frontmatter editing
- Manual image uploads
- S3 management
- Git commands

Mditoor brings all of these into a single desktop application.

---

## Philosophy

- Local first
- Git friendly
- File based
- Framework aware
- Developer focused

Your content always remains:

- Markdown files
- MDX files
- Images
- Git repositories

Mditoor never locks your content into a proprietary format.

---

# Supported Platforms

- Windows
- macOS (Soon)
- Linux (Soon)

---

# Supported Frameworks

Current:

- Next.js (MDX)

Planned:

- Astro
- NuxtJS
- Docusaurus

---

# Example Workspace

```text
my-blog/
├── .editoorconfig/
│   ├── schema.json
│   └── taxonomies.json
│
├── content/
│   └── posts/
│       └── my-post/
│           ├── index.mdx
│           └── images/
```

---

# Metadata Schema

```json
{
  "fields": [
    {
      "key": "title",
      "label": "Title",
      "type": "text",
      "required": true
    },
    {
      "key": "category",
      "type": "select"
    },
    {
      "key": "tags",
      "type": "multiselect"
    }
  ]
}
```

---

# Tech Stack

## Desktop

- Tauri v2
- Rust

## Frontend

- React
- TypeScript
- Vite

## UI

- Tailwind CSS

## State

- Zustand
- TanStack Query

## Editor

- MDXEditor

---

# Development

## Install Dependencies

```bash
npm install
```

## Run Frontend

```bash
npm dev
```

## Run Tauri

```bash
npm tauri dev
```

## Build Application

```bash
npm tauri build
```

---

# Contributing

Contributions are welcome.

Please open an issue before submitting large changes.

---

# Vision

Mditoor aims to become:

> The content workspace for developers.

A place where developers can write, manage, preview, and publish content while keeping everything inside their own repositories.

---

# License

MIT

---

Built with ❤️ using React, Rust, and Tauri.
