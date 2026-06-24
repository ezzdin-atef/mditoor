# Mditoor Architecture

## Overview

Mditoor is a desktop content studio built with:

- Tauri v2
- React
- TypeScript
- Rust
- MDX

The application follows a hybrid architecture:

- React handles UI.
- Rust handles system access.
- Tauri provides communication.

---

# Architecture Layers

```text
┌─────────────────────────┐
│ React Application       │
├─────────────────────────┤
│ Feature Modules         │
├─────────────────────────┤
│ Tauri Commands          │
├─────────────────────────┤
│ Rust Services           │
├─────────────────────────┤
│ Filesystem & OS         │
└─────────────────────────┘
```

---

# Frontend Structure

```text
src/
├── app/
├── features/
├── components/
├── layouts/
├── hooks/
├── lib/
├── services/
├── types/
└── stores/
```

---

# Feature Structure

```text
features/
├── workspace/
├── posts/
├── editor/
├── metadata/
├── assets/
├── settings/
├── preview/
├── git/
└── ai/
```

Each feature owns:

- components
- hooks
- services
- state
- types

---

# State Management

Use:

- Zustand
- TanStack Query

Global state:

- workspace
- settings
- selected post

Server state:

- filesystem
- commands

---

# Rust Structure

```text
src-tauri/src/
├── commands/
├── services/
├── models/
├── repositories/
├── utils/
└── config/
```

---

# Commands

Commands expose Rust functionality.

Examples:

```rust
scan_posts()
read_post()
save_post()
upload_image()
save_settings()
```

---

# Services

Business logic.

Examples:

- filesystem
- markdown
- metadata
- s3
- git

---

# Metadata System

Configuration:

```text
.editoorconfig/
    schema.json
    taxonomies.json
```

Post data:

```yaml
---
title:
tags:
category:
---
```

---

# Editor Pipeline

```text
MDX file
↓
Parser
↓
Editor model
↓
React editor
↓
Serializer
↓
MDX file
```

---

# Asset Pipeline

```text
Drop image
↓
Validation
↓
Local copy or S3 upload
↓
URL generation
↓
Markdown insertion
```

---

# Preview Architecture

```text
Next.js
↓
Local dev server
↓
WebView
↓
Preview panel
```

---

# Plugin Architecture

Future:

```text
plugins/
    plugin.json
    manifest.json
```

API:

- editor
- metadata
- commands
- UI

---

# Local Storage

Use Tauri Store.

Stores:

- settings
- recent workspaces
- window state

---

# Security

Sensitive data:

- S3 keys

Encrypted locally.

Never committed.

---

# Future Services

- AI providers
- Git providers
- Deployment providers
- Analytics providers
