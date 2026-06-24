# Mditoor Product Requirements Document

Version: 1.0

Status: Draft

Owner: Ezzdin Atef

---

# 1. Product Overview

Mditoor is a desktop content studio for MDX and file-based websites.

It allows developers, technical writers, and content creators to manage Markdown and MDX content visually while keeping all content stored as files inside their repositories.

Mditoor combines:

- Rich text editing
- Metadata management
- Asset management
- MDX awareness
- Next.js integration
- Git workflows

The product follows a local-first approach where content always remains inside the user's repository.

---

# 2. Problem Statement

Modern developer blogs commonly use:

- MDX
- Next.js
- Astro
- Nextra
- Contentlayer

Content editing currently requires:

- VSCode
- Manual frontmatter editing
- File explorer navigation
- Manual image management
- S3 uploads
- Git commands

These workflows are fragmented and difficult for non-technical authors.

Mditoor aims to provide a dedicated content workspace for these projects.

---

# 3. Vision

> Make file-based content management as easy as modern design tools.

Mditoor should become:

- The editor for MDX.
- The CMS for file-based websites.
- The content workspace for developers.

---

# 4. Goals

## Primary Goals

- Simplify MDX editing.
- Eliminate manual metadata editing.
- Simplify asset management.
- Support modern Next.js blogs.
- Keep content stored locally.

## Secondary Goals

- Improve writing workflows.
- Improve SEO.
- Reduce Git complexity.
- Support teams.

---

# 5. Non-Goals

Mditoor is not:

- A hosted CMS.
- A headless CMS.
- A website builder.
- A page builder.
- A Notion replacement.

---

# 6. Target Users

## Primary Users

### Developer Bloggers

Developers maintaining:

- personal blogs
- technical blogs
- tutorials

---

### Technical Writers

Writers maintaining:

- documentation
- knowledge bases
- changelogs

---

### Indie Hackers

Small teams maintaining:

- content websites
- product blogs

---

# 7. User Personas

## Developer

- Uses Next.js.
- Writes MDX.
- Uses Git.
- Uses S3.

Pain points:

- Frontmatter editing.
- Image uploads.
- Metadata management.

---

## Writer

- Does not know MDX.
- Writes articles.
- Needs visual editing.

Pain points:

- Markdown syntax.
- Components.
- Git.

---

# 8. Success Metrics

Version 1:

- User can edit posts without VSCode.
- User can create posts in under 30 seconds.
- User can upload images without leaving the app.

Version 2:

- User can use MDX components visually.

Version 3:

- User can preview exactly how the website renders.

---

# 9. Functional Requirements

## Workspace Management

The system shall:

- Open local repositories.
- Save workspaces.
- Switch workspaces.

---

## Post Management

The system shall:

- Create posts.
- Edit posts.
- Delete posts.
- Search posts.
- Filter posts.

---

## Metadata System

The system shall:

- Load schemas.
- Generate forms.
- Validate values.

---

## Rich Editor

The system shall:

- Edit Markdown.
- Edit MDX.
- Support images.
- Support code blocks.

---

## Assets

The system shall:

- Upload images.
- Copy images.
- Optimize images.
- Manage assets.

---

## Preview

The system shall:

- Render posts.
- Render components.
- Render themes.

---

# 10. Non-Functional Requirements

## Performance

- Open workspace under 2 seconds.
- Open post under 500ms.
- Save under 100ms.

---

## Security

- Encrypt credentials.
- Never upload files automatically.
- Local-first.

---

## Reliability

- Autosave.
- Recovery.
- Version history.

---

## Portability

Support:

- Windows
- macOS
- Linux

---

# 11. Metadata System

Configuration:

```text id="4gskcb"
.editoorconfig/
    schema.json
```

Example:

```json id="6bpmy0"
{
  "fields": [
    {
      "key": "title",
      "type": "text"
    }
  ]
}
```

---

# 12. Post Formats

Supported:

```text id="3xfxci"
post.md
post.mdx
folder/index.mdx
```

---

# 13. Asset Modes

## Local

```text id="t56b5l"
content/posts/post/images/
```

## Remote

- AWS S3
- Cloudflare R2
- DigitalOcean Spaces

---

# 14. Technology Stack

Frontend:

- React
- TypeScript
- Tailwind
- shadcn/ui

Desktop:

- Tauri

Backend:

- Rust

Editor:

- MDXEditor

State:

- Zustand
- TanStack Query

---

# 15. Release Plan

## 1.0

- Workspace
- Scanner
- Editor
- Metadata
- Search

## 1.5

- Assets
- S3

## 2.0

- Components
- Preview

## 3.0

- SEO
- Git

## 4.0

- AI

---

# 16. Risks

## Complexity of MDX

Custom components may behave differently.

Mitigation:

- Component adapters.

---

## Framework Differences

Next.js and Astro differ.

Mitigation:

- Provider architecture.

---

## Performance

Large repositories may contain thousands of files.

Mitigation:

- Incremental indexing.

---

# 17. Future Opportunities

- Team collaboration.
- Cloud synchronization.
- Plugins.
- Deployment integrations.
- Marketplace.

---

# 18. Product Principles

1. Local-first.
2. File-based.
3. Git-friendly.
4. Framework-aware.
5. Developer-focused.
6. Extensible.
7. Fast.

---

# Mission

> Mditoor gives developers a modern content workspace while keeping their content as plain files.
