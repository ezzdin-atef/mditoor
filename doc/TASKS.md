# Mditoor Tasks

---

# Milestone 1 — Project Setup

## Task 1.1

- Create Tauri project.
- Configure React.
- Configure TypeScript.

## Task 1.2

- Setup Tailwind.
- Setup shadcn/ui.

## Task 1.3

- Setup ESLint.
- Setup Prettier.

## Task 1.4

- Setup Zustand.

## Task 1.5

- Setup TanStack Query.

---

# Milestone 2 — Workspace

## Task 2.1

Create workspace model.

```ts
interface Workspace {
  id: string;
  name: string;
  path: string;
}
```

## Task 2.2

Open folder dialog.

## Task 2.3

Save workspace.

## Task 2.4

Switch workspace.

---

# Milestone 3 — Settings

## Task 3.1

Create settings schema.

## Task 3.2

Implement Tauri Store.

## Task 3.3

Create settings screen.

---

# Milestone 4 — Scanner

## Task 4.1

Read content directory.

## Task 4.2

Detect:

- md
- mdx
- folder posts

## Task 4.3

Extract frontmatter.

## Task 4.4

Build post model.

```ts
interface Post {
  id: string;
  slug: string;
}
```

---

# Milestone 5 — Post List

## Task 5.1

Sidebar.

## Task 5.2

Search.

## Task 5.3

Filters.

---

# Milestone 6 — Editor

## Task 6.1

Integrate MDX editor.

## Task 6.2

Load content.

## Task 6.3

Save content.

## Task 6.4

Dirty state.

## Task 6.5

Autosave.

---

# Milestone 7 — Metadata

## Task 7.1

Load schema.

## Task 7.2

Generate fields.

## Task 7.3

Validation.

## Task 7.4

Save frontmatter.

---

# Milestone 8 — Create Posts

## Task 8.1

New post dialog.

## Task 8.2

Slug generation.

## Task 8.3

Folder creation.

---

# Milestone 9 — Assets

## Task 9.1

Drag and drop.

## Task 9.2

Image validation.

## Task 9.3

Local copy.

## Task 9.4

Markdown insertion.

---

# Milestone 10 — S3

## Task 10.1

Provider abstraction.

## Task 10.2

AWS provider.

## Task 10.3

Cloudflare provider.

## Task 10.4

DigitalOcean provider.

---

# Milestone 11 — Asset Manager

## Task 11.1

Scan images.

## Task 11.2

Preview.

## Task 11.3

Unused detection.

---

# Milestone 12 — Components

## Task 12.1

Scan components.

## Task 12.2

Extract props.

## Task 12.3

Build component library.

---

# Milestone 13 — Preview

## Task 13.1

Detect Next.js.

## Task 13.2

Start dev server.

## Task 13.3

Embed preview.

---

# Milestone 14 — SEO

## Task 14.1

Title validation.

## Task 14.2

Description validation.

## Task 14.3

Heading analysis.

---

# Milestone 15 — Git

## Task 15.1

Repository detection.

## Task 15.2

Status.

## Task 15.3

Commit.

## Task 15.4

Push.

---

# Milestone 16 — AI

## Task 16.1

Provider abstraction.

## Task 16.2

OpenAI provider.

## Task 16.3

Title generation.

## Task 16.4

Description generation.

---

# Milestone 17 — Plugins

## Task 17.1

Plugin loader.

## Task 17.2

Manifest parser.

## Task 17.3

Plugin API.

---

# Testing

## Unit Tests

- utilities
- metadata
- parser

## Integration Tests

- filesystem
- editor
- commands

## E2E

- workspace creation
- post editing
- image upload

---

# Release 1.0

- workspace
- scanner
- editor
- metadata
- search

---

# Release 1.5

- assets
- S3

---

# Release 2.0

- components
- preview

---

# Release 3.0

- SEO
- Git

---

# Release 4.0

- AI
- plugins
