import { invoke } from '@tauri-apps/api/core';
import type { Workspace } from '../workspace/types';
import { buildContent, parseFrontmatter, type MetaValues } from '../editor/utils/frontmatter';

export interface DevArticle {
  id: number;
  title: string;
  body_markdown?: string;
  description?: string;
  tag_list?: string[] | string;
  cover_image?: string | null;
  main_image?: string | null;
  canonical_url?: string | null;
  series?: string | null;
  published: boolean;
  edited_at?: string | null;
  published_at?: string | null;
  url?: string;
}

export interface DevEntry {
  articleId: number;
  published: boolean;
  url?: string;
  canonicalUrl?: string;
  remoteVersion: string;
  localHash: string;
  conflict?: boolean;
}

type Manifest = Record<string, DevEntry>;
const manifestFile = (id: string) => `dev/${id}/sync.json`;
const versionOf = (a: DevArticle) => a.edited_at || a.published_at || '';

async function hash(content: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export async function readDevManifest(id: string): Promise<Manifest> {
  const raw = await invoke<string>('read_app_data', { file: manifestFile(id) });
  return raw ? JSON.parse(raw) as Manifest : {};
}

async function writeDevManifest(id: string, manifest: Manifest): Promise<void> {
  await invoke('write_app_data', { file: manifestFile(id), content: JSON.stringify(manifest, null, 2) });
}

export async function listDevArticles(id: string): Promise<DevArticle[]> {
  const all: DevArticle[] = [];
  for (let page = 1; page <= 100; page++) {
    const batch = await invoke<DevArticle[]>('dev_list_articles', { workspaceId: id, page });
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

function remoteContent(workspace: Workspace, article: DevArticle): string | null {
  if (typeof article.body_markdown !== 'string') return null;
  const parsed = parseFrontmatter(article.body_markdown);
  const meta: MetaValues = {
    ...parsed.meta,
    title: article.title,
    description: article.description ?? '',
    tags: Array.isArray(article.tag_list) ? article.tag_list : (article.tag_list ?? '').split(',').map(tag => tag.trim()).filter(Boolean),
    main_image: article.main_image || article.cover_image || '',
    series: article.series ?? '',
    canonical_url: article.canonical_url ?? '',
    draft: !article.published,
  };
  return buildContent(workspace.metadataFields, meta, parsed.body, 'yaml', '');
}

/** Pull remote articles into the private workspace folder without overwriting local edits. */
export async function importDevArticles(workspace: Workspace): Promise<{ imported: number; conflicts: number; skipped: number }> {
  const articles = await listDevArticles(workspace.id);
  const manifest = await readDevManifest(workspace.id);
  let imported = 0;
  let conflicts = 0;
  let skipped = 0;
  for (const summary of articles) {
    const article = typeof summary.body_markdown === 'string'
      ? summary
      : summary.published
        ? await invoke<DevArticle>('dev_get_article', { workspaceId: workspace.id, articleId: summary.id }).catch(() => summary)
        : summary;
    const content = remoteContent(workspace, article);
    if (content === null) { skipped++; continue; }
    const slug = `dev-${article.id}`;
    const entry = manifest[slug];
    const remoteVersion = versionOf(article);
    const local = await invoke<string>('read_post', { mdxPath: workspace.mdxPath, slug, profile: workspace.profile }).catch(() => '');
    const localChanged = Boolean(entry && local && await hash(local) !== entry.localHash);
    const remoteChanged = Boolean(entry && remoteVersion && remoteVersion !== entry.remoteVersion);
    if (localChanged && remoteChanged) {
      manifest[slug] = { ...entry, conflict: true };
      conflicts++;
      continue;
    }
    if (!local || (!localChanged && (remoteChanged || !entry))) {
      await invoke('write_post', { mdxPath: workspace.mdxPath, slug, content, profile: workspace.profile });
      manifest[slug] = { articleId: article.id, published: article.published, url: article.url, remoteVersion, localHash: await hash(content) };
      imported++;
    } else if (entry) {
      manifest[slug] = { ...entry, published: article.published, url: article.url, remoteVersion };
    }
  }
  await writeDevManifest(workspace.id, manifest);
  return { imported, conflicts, skipped };
}

export async function syncDevArticle(workspace: Workspace, slug: string, content: string, publish: boolean): Promise<DevEntry> {
  const parsed = parseFrontmatter(content);
  const meta = parsed.meta;
  const title = String(meta.title ?? '').trim();
  if (!title) throw new Error('Add a title before syncing to DEV.');
  if (/^\s*(?:import|export)\s/m.test(parsed.body) || /<[A-Z][\w.]*(?:\s|\/?>)/.test(parsed.body)) {
    throw new Error('DEV supports Markdown, but this post contains MDX components or imports. Convert them before syncing.');
  }
  if (/!\[[^\]]*\]\((?!https?:\/\/)[^)]+\)/i.test(parsed.body)) {
    throw new Error('DEV needs public image URLs. Replace local image links before syncing.');
  }
  const tags = Array.isArray(meta.tags) ? meta.tags.map(String).filter(Boolean) : [];
  if (tags.length > 4) throw new Error('DEV allows up to four tags.');
  const mainImage = String(meta.main_image ?? '').trim();
  if (mainImage && !/^https?:\/\//i.test(mainImage)) throw new Error('Use a public URL for the DEV cover image.');
  const canonicalUrl = String(meta.canonical_url ?? '').trim();
  if (canonicalUrl && !/^https?:\/\//i.test(canonicalUrl)) throw new Error('The canonical URL must start with https:// or http://.');

  const manifest = await readDevManifest(workspace.id);
  const previous = manifest[slug];
  if (previous?.conflict) throw new Error('This article changed on DEV and locally. Resolve the conflict before syncing.');
  if (previous) {
    const remote = (await listDevArticles(workspace.id)).find(a => a.id === previous.articleId);
    if (!remote) throw new Error('The linked DEV article could not be found. Refresh the workspace before syncing.');
    if (previous.remoteVersion && versionOf(remote) && previous.remoteVersion !== versionOf(remote)) {
      manifest[slug] = { ...previous, conflict: true };
      await writeDevManifest(workspace.id, manifest);
      throw new Error('This article changed on DEV. Refresh the workspace to review the conflict.');
    }
  }

  const article = {
    title, body_markdown: parsed.body, published: publish,
    description: String(meta.description ?? '').trim(), tags: tags.join(', '),
    main_image: mainImage || null, series: String(meta.series ?? '').trim() || null,
    canonical_url: canonicalUrl || null,
  };
  const remote = await invoke<DevArticle>('dev_upsert_article', { workspaceId: workspace.id, articleId: previous?.articleId ?? null, article });
  const nextMeta = { ...meta, draft: !remote.published };
  const nextContent = buildContent(workspace.metadataFields, nextMeta, parsed.body, parsed.format ?? 'yaml', parsed.raw);
  const entry: DevEntry = {
    articleId: remote.id, published: remote.published, url: remote.url,
    remoteVersion: versionOf(remote), localHash: await hash(nextContent),
  };
  manifest[slug] = entry;
  // Record the remote ID first. If the local rewrite fails, retrying must update
  // the same DEV article rather than creating a duplicate.
  await writeDevManifest(workspace.id, manifest);
  await invoke('write_post', { mdxPath: workspace.mdxPath, slug, content: nextContent, profile: workspace.profile });
  return entry;
}

export async function resolveDevConflict(workspace: Workspace, slug: string, choice: 'local' | 'remote'): Promise<DevEntry> {
  const manifest = await readDevManifest(workspace.id);
  const entry = manifest[slug];
  if (!entry?.conflict) throw new Error('No DEV conflict was found for this post.');
  const summary = (await listDevArticles(workspace.id)).find(a => a.id === entry.articleId);
  if (!summary) throw new Error('The linked DEV article could not be found.');
  const article = choice === 'remote' && typeof summary.body_markdown !== 'string' && summary.published
    ? await invoke<DevArticle>('dev_get_article', { workspaceId: workspace.id, articleId: summary.id })
    : summary;
  if (choice === 'remote') {
    const content = remoteContent(workspace, article);
    if (content === null) throw new Error('DEV did not return readable Markdown for this article.');
    await invoke('write_post', { mdxPath: workspace.mdxPath, slug, content, profile: workspace.profile });
    manifest[slug] = { articleId: article.id, published: article.published, url: article.url, remoteVersion: versionOf(article), localHash: await hash(content) };
  } else {
    // Keep the original base hash so a refresh still recognizes unsynced local edits.
    manifest[slug] = { ...entry, remoteVersion: versionOf(article), conflict: false };
  }
  await writeDevManifest(workspace.id, manifest);
  return manifest[slug];
}

/** Publish a repository post to a connected DEV account while keeping its file in the repository. */
export async function crosspostDevArticle(source: Workspace, target: Workspace, slug: string, content: string, canonicalUrl: string, published: boolean): Promise<DevEntry> {
  const parsed = parseFrontmatter(content);
  const meta = parsed.meta;
  if (/^\s*(?:import|export)\s/m.test(parsed.body) || /<[A-Z][\w.]*(?:\s|\/?>)/.test(parsed.body)) {
    throw new Error('Convert MDX components and imports to Markdown before publishing on DEV.');
  }
  if (/!\[[^\]]*\]\((?!https?:\/\/)[^)]+\)/i.test(parsed.body)) {
    throw new Error('Replace local image links with public URLs before publishing on DEV.');
  }
  if (canonicalUrl && !/^https?:\/\//i.test(canonicalUrl)) throw new Error('The canonical URL must start with https:// or http://.');
  const rawTags = meta.tags ?? meta.categories ?? [];
  const tags = Array.isArray(rawTags) ? rawTags.map(String) : String(rawTags).split(',').map(s => s.trim()).filter(Boolean);
  if (tags.length > 4) throw new Error('DEV allows up to four tags.');
  const cover = String(meta.main_image ?? meta.cover ?? meta.coverImage ?? meta.image ?? '').trim();
  if (cover && !/^https?:\/\//i.test(cover)) throw new Error('Use a public URL for the DEV cover image.');

  const file = `dev-crossposts/${source.id}.json`;
  const raw = await invoke<string>('read_app_data', { file });
  const links: Record<string, DevEntry> = raw ? JSON.parse(raw) : {};
  const key = `${target.id}:${slug}`;
  const previous = links[key];
  if (previous) {
    const remote = (await listDevArticles(target.id)).find(a => a.id === previous.articleId);
    if (!remote || (previous.remoteVersion && versionOf(remote) && previous.remoteVersion !== versionOf(remote))) {
      throw new Error('The DEV copy changed or is missing. Review it on DEV before sending more changes.');
    }
  }
  const remote = await invoke<DevArticle>('dev_upsert_article', {
    workspaceId: target.id, articleId: previous?.articleId ?? null,
    article: {
      title: String(meta.title ?? slug).trim(), body_markdown: parsed.body, published,
      description: String(meta.description ?? meta.excerpt ?? meta.summary ?? '').trim(),
      tags: tags.join(', '), main_image: cover || null,
      canonical_url: canonicalUrl || null,
    },
  });
  const entry: DevEntry = {
    articleId: remote.id, published: remote.published, url: remote.url,
    canonicalUrl, remoteVersion: versionOf(remote), localHash: await hash(content),
  };
  links[key] = entry;
  await invoke('write_app_data', { file, content: JSON.stringify(links, null, 2) });
  return entry;
}

export async function readCrosspostLink(sourceId: string, targetId: string, slug: string): Promise<DevEntry | null> {
  const raw = await invoke<string>('read_app_data', { file: `dev-crossposts/${sourceId}.json` });
  if (!raw) return null;
  const links = JSON.parse(raw) as Record<string, DevEntry>;
  return links[`${targetId}:${slug}`] ?? null;
}
