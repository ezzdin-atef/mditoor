# Mditoor Roadmap

> Mditoor is a desktop content studio for MDX, Next.js, and file-based blogs built with Tauri, React, and Rust.

---

# Version 1.0 — Core Editing Experience

Goal: Replace manual MDX editing and file management.

---

## Feature: Workspace Management

### Description

Allow users to connect existing blogs to Mditoor.

### User Story

As a user, I want to open my blog repository so that I can manage its content.

### Requirements

- Open local folder.
- Save workspace.
- Reopen last workspace.
- Multiple workspaces.
- Switch between workspaces.

### Future Enhancements

- Workspace icons.
- Workspace groups.

---

## Feature: Schema Configuration

### Description

Blog owners define metadata fields inside:

```text
.editoorconfig/schema.json
```

### Requirements

Supported field types:

- text
- textarea
- number
- boolean
- date
- datetime
- select
- multiselect
- image
- url

### Example

```json
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

## Feature: Content Scanner

### Description

Automatically discover posts.

### Supported Structures

```text
post.mdx
post.md
folder/index.mdx
```

### Metadata

- title
- slug
- date
- tags
- category
- status

---

## Feature: Rich Editor

### Description

Visual MDX editor.

### Capabilities

- headings
- lists
- tables
- blockquotes
- code blocks
- images
- links

### Modes

- visual
- markdown
- split view

---

## Feature: Metadata Sidebar

### Description

Dynamic form generated from schema.

### Examples

- title
- description
- tags
- category
- cover image

---

## Feature: Search

Search by:

- title
- tags
- category
- status

---

# Version 1.5 — Asset Management

Goal: Remove the need for Finder or Explorer.

---

## Feature: Drag and Drop Upload

Drop files into editor.

### Modes

- local copy
- S3 upload

### Result

Automatic markdown insertion.

---

## Feature: Asset Gallery

Displays:

- filename
- dimensions
- size
- usage count

---

## Feature: S3 Support

Providers:

- AWS S3
- DigitalOcean Spaces
- Cloudflare R2
- MinIO

Settings stored locally.

---

## Feature: Image Optimization

Automatically:

- resize
- compress
- convert WebP

---

## Feature: Unused Assets

Detect images not referenced by posts.

---

# Version 2.0 — MDX Features

Goal: Become an MDX-aware editor.

---

## Feature: Component Scanner

Scan:

```text
components/mdx
```

Detect:

- component name
- props
- examples

---

## Feature: Component Library

Sidebar displaying:

- components
- descriptions
- props

Insert with one click.

---

## Feature: Component Autocomplete

Suggestions while typing.

Example:

```mdx
<Callout
```

---

## Feature: Prop Editor

Visual editing of component props.

Example:

```text
Type: warning
Icon: true
```

---

## Feature: Snippets

Reusable blocks.

Examples:

- YouTube
- Callout
- Tweet

---

# Version 3.0 — Next.js Integration

Goal: WYSIWYG experience.

---

## Feature: Live Preview

Connect to local Next.js server.

Render actual website components.

---

## Feature: Route Preview

Display generated URLs.

Example:

```text
/blog/react-hooks
```

---

## Feature: Theme Preview

Render using actual site CSS.

---

## Feature: Dark Mode Preview

Preview light and dark themes.

---

# Version 4.0 — Writing Tools

Goal: Improve content quality.

---

## Feature: Reading Time

Calculate reading duration.

---

## Feature: Word Statistics

Display:

- words
- characters
- paragraphs

---

## Feature: Table of Contents

Generate headings tree.

---

## Feature: Focus Mode

Hide sidebars.

Fullscreen writing.

---

## Feature: Writing Goals

Example:

```text
Target: 1000 words
Current: 620
```

---

# Version 5.0 — SEO Tools

Goal: Help content rank.

---

## Feature: SEO Analyzer

Validate:

- title length
- description length
- heading hierarchy

---

## Feature: Internal Links

Suggest existing posts.

---

## Feature: Broken Link Detection

Check:

- internal links
- images

---

## Feature: OpenGraph Preview

Preview social cards.

---

# Version 6.0 — Git Integration

Goal: Git-native content editing.

---

## Feature: Git Status

Show:

- modified files
- new files
- deleted files

---

## Feature: Commit UI

Commit changes inside app.

---

## Feature: Push

Push to remote repository.

---

## Feature: Version History

Restore previous versions.

---

# Version 7.0 — Publishing Workflow

Goal: Content management.

---

## Feature: Post Status

- Draft
- Published
- Archived

---

## Feature: Scheduling

Future publish dates.

---

## Feature: Content Dashboard

Show:

- drafts
- published
- scheduled

---

# Version 8.0 — AI Features

Goal: Writing assistance.

---

## Feature: Title Suggestions

Generate titles.

---

## Feature: Description Generation

Generate SEO descriptions.

---

## Feature: Tag Suggestions

Analyze content.

---

## Feature: Rewrite

- shorter
- longer
- professional
- casual

---

# Version 9.0 — Advanced Platform

Goal: Team and ecosystem.

---

## Feature: Multi-author

User profiles.

---

## Feature: Content Calendar

Monthly planning.

---

## Feature: Analytics

Content statistics.

---

## Feature: Deployment

Support:

- Vercel
- Netlify

---

## Feature: Plugin System

Third-party extensions.

Examples:

- Mermaid plugin
- Diagram plugin
- Custom blocks

---

# Long-term Vision

Mditoor becomes:

- Desktop CMS
- MDX Studio
- Git-native editor
- Content platform
- Developer writing environment

Its mission:

> Make file-based content management as easy as Figma made design files.
