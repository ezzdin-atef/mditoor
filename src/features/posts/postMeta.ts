import type { FrontmatterFormat, SiteProfile } from '../workspace/types';
import { parseFrontmatterBlock, type MetaValues } from '../editor/utils/frontmatter';
import type { MetadataField } from '../workspace/types';
import { humanize } from '../../lib/ui';

export interface PostSummary {
  slug: string;
  /** Post file relative to the posts folder, e.g. `hello/index.mdx` or `hello.md`. */
  file: string;
  frontmatter: string;
  /** Empty when the post has no frontmatter. */
  frontmatter_format: FrontmatterFormat | '';
  excerpt: string;
  first_image: string | null;
  words: number;
  modified: number;
}

export interface PostCardData {
  slug: string;
  title: string;
  description: string;
  date: string | null;
  cover: string | null;
  tags: string[];
  draft: boolean;
  words: number;
  modified: number;
  meta: MetaValues;
}

const COVER_KEYS = [
  'cover', 'coverImage', 'cover_image', 'image', 'heroImage', 'hero', 'hero_image',
  'thumbnail', 'thumb', 'banner', 'featuredImage', 'featured_image', 'ogImage', 'og_image',
];
const DESC_KEYS = ['description', 'excerpt', 'summary', 'subtitle', 'metaDescription'];
const DATE_KEYS = ['date', 'publishedAt', 'published_at', 'pubDate', 'publishDate', 'created', 'createdAt'];
const TAG_KEYS = ['tags', 'categories', 'keywords'];

function firstString(meta: MetaValues, keys: string[]): string | null {
  for (const k of keys) {
    const v = meta[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

export function toCardData(p: PostSummary, fields: MetadataField[]): PostCardData {
  const meta = (p.frontmatter_format && parseFrontmatterBlock(p.frontmatter, p.frontmatter_format)) || {};

  const imageFieldValue = fields
    .filter(f => f.type === 'image')
    .map(f => meta[f.name])
    .find((v): v is string => typeof v === 'string' && v.trim() !== '');

  const tagsRaw = TAG_KEYS.map(k => meta[k]).find(v => v !== undefined && v !== '');
  const tags = Array.isArray(tagsRaw)
    ? tagsRaw.map(String)
    : typeof tagsRaw === 'string'
      ? tagsRaw.replace(/^\[|\]$/g, '').split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
      : [];

  const status = typeof meta.status === 'string' ? meta.status : '';
  const draft = meta.draft === true || meta.published === false || /draft/i.test(status);

  return {
    slug: p.slug,
    title: firstString(meta, ['title', 'name', 'seoTitle']) ?? humanize(p.slug),
    description: firstString(meta, DESC_KEYS) ?? p.excerpt,
    date: firstString(meta, DATE_KEYS),
    cover: imageFieldValue ?? firstString(meta, COVER_KEYS) ?? p.first_image ?? null,
    tags,
    draft,
    words: p.words,
    modified: p.modified,
    meta,
  };
}

type LayoutProfile = Pick<SiteProfile, 'layout' | 'extension'>;

/** Where a post with this slug lives, relative to the posts folder. */
export function postFileName(profile: LayoutProfile, slug: string): string {
  return profile.layout === 'folder' ? `${slug}/index${profile.extension}` : `${slug}${profile.extension}`;
}

const DATE_PREFIX = /^\d{4}-\d{2}-\d{2}-/;

/** Slug for a new post. Dated layouts (Jekyll) prefix today's date: `2026-09-28-hello`. */
export function newPostSlug(profile: LayoutProfile, base: string, now = new Date()): string {
  if (profile.layout !== 'dated' || !base || DATE_PREFIX.test(base)) return base;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${base}`;
}

export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}
