export type FieldType = 'text' | 'number' | 'boolean' | 'date' | 'select' | 'tags' | 'image';

export interface MetadataField {
  id: string;
  name: string;
  type: FieldType;
  required: boolean;
  options?: string[];
}

export interface S3StorageConfig {
  endpoint: string;
  bucket: string;
  region: string;
  accessKey: string;
  secretKey: string;
  publicUrlPrefix: string;
  keyPrefix: string;
}

export type StorageProvider = 'local' | 's3';

/**
 * colocated: images sit next to the post (`<slug>/cover.png`, linked as `./cover.png`).
 * public:    images go to a static folder in the project (`public/images`), linked by URL (`/images/cover.png`).
 */
export type LocalAssetMode = 'colocated' | 'public';

export interface LocalStorageConfig {
  mode: LocalAssetMode;
  /** public mode: folder relative to the project root, e.g. `public/images`. */
  dir: string;
  /** public mode: URL the site serves `dir` at, e.g. `/images`. */
  urlPrefix: string;
}

/** Applied when an image is added (any provider). Also available per image from the gallery. */
export interface ImageOptimizeConfig {
  enabled: boolean;
  /** Wider images are scaled down to this width; 0 keeps the size. */
  maxWidth: number;
  /** JPEG quality, 1-100. */
  quality: number;
  sharpen: boolean;
}

export interface StorageConfig {
  provider: StorageProvider;
  local: LocalStorageConfig;
  s3: S3StorageConfig;
  optimize: ImageOptimizeConfig;
}

export const DEFAULT_S3: S3StorageConfig = {
  endpoint: '',
  bucket: '',
  region: 'us-east-1',
  accessKey: '',
  secretKey: '',
  publicUrlPrefix: '',
  keyPrefix: 'images/',
};

export const DEFAULT_STORAGE: StorageConfig = {
  provider: 'local',
  local: { mode: 'colocated', dir: 'public/images', urlPrefix: '/images' },
  s3: DEFAULT_S3,
  optimize: { enabled: true, maxWidth: 2000, quality: 82, sharpen: true },
};

/**
 * Fills in missing fields. Configs written before providers existed only had `s3`,
 * so they keep uploading to S3 when a bucket was set and fall back to local otherwise.
 */
export function normalizeStorage(raw?: Partial<StorageConfig> | null): StorageConfig {
  const s3 = { ...DEFAULT_S3, ...raw?.s3 };
  return {
    provider: raw?.provider ?? (s3.bucket ? 's3' : 'local'),
    local: { ...DEFAULT_STORAGE.local, ...raw?.local },
    s3,
    optimize: { ...DEFAULT_STORAGE.optimize, ...raw?.optimize },
  };
}

export type Framework = 'nextjs' | 'astro' | 'hugo' | 'jekyll' | 'docusaurus' | 'eleventy' | 'nuxt' | 'generic';

/** folder: `<slug>/index.mdx` · flat: `<slug>.md` · dated: `2026-09-28-<slug>.md` (Jekyll). */
export type PostLayout = 'folder' | 'flat' | 'dated';

export type FrontmatterFormat = 'yaml' | 'toml';

/** How the site generator lays out posts. Stored in `.mditoor.json`. */
export interface SiteProfile {
  framework: Framework;
  layout: PostLayout;
  extension: '.mdx' | '.md';
  frontmatter: FrontmatterFormat;
}

interface FrameworkPreset {
  label: string;
  profile: SiteProfile;
  /** Default local asset setup for this framework. */
  local: LocalStorageConfig;
}

const preset = (
  framework: Framework, label: string,
  layout: PostLayout, extension: SiteProfile['extension'], frontmatter: FrontmatterFormat,
  local: LocalStorageConfig,
): FrameworkPreset => ({ label, profile: { framework, layout, extension, frontmatter }, local });

const colocated: LocalStorageConfig = { mode: 'colocated', dir: 'public/images', urlPrefix: '/images' };

export const FRAMEWORK_PRESETS: Record<Framework, FrameworkPreset> = {
  nextjs:     preset('nextjs', 'Next.js', 'folder', '.mdx', 'yaml', { mode: 'public', dir: 'public/images', urlPrefix: '/images' }),
  astro:      preset('astro', 'Astro', 'flat', '.md', 'yaml', colocated),
  hugo:       preset('hugo', 'Hugo', 'folder', '.md', 'toml', colocated),
  jekyll:     preset('jekyll', 'Jekyll', 'dated', '.md', 'yaml', { mode: 'public', dir: 'assets/images', urlPrefix: '/assets/images' }),
  docusaurus: preset('docusaurus', 'Docusaurus', 'folder', '.md', 'yaml', colocated),
  eleventy:   preset('eleventy', 'Eleventy', 'flat', '.md', 'yaml', colocated),
  nuxt:       preset('nuxt', 'Nuxt Content', 'flat', '.md', 'yaml', { mode: 'public', dir: 'public/images', urlPrefix: '/images' }),
  generic:    preset('generic', 'Markdown', 'folder', '.mdx', 'yaml', colocated),
};

/** Workspaces created before profiles existed all used the Next.js `<slug>/index.mdx` layout. */
export const DEFAULT_PROFILE: SiteProfile = FRAMEWORK_PRESETS.nextjs.profile;

export function normalizeProfile(raw?: Partial<SiteProfile> | null): SiteProfile {
  const framework = raw?.framework && raw.framework in FRAMEWORK_PRESETS ? raw.framework : DEFAULT_PROFILE.framework;
  return { ...FRAMEWORK_PRESETS[framework].profile, ...raw, framework };
}

/** Result of the `detect_project` command. */
export interface ProjectInfo {
  /** Nearest folder (the path itself or an ancestor) that looks like a project root. */
  root: string | null;
  /** True when the picked path is itself the project root, so a content folder still has to be chosen. */
  isRoot: boolean;
  framework: Framework;
  /** Likely posts folders, relative to `root`, best first. */
  contentDirs: { path: string; posts: number }[];
}

export interface Workspace {
  id: string;
  name: string;
  icon: string;
  /** Posts folder (absolute). All post, git and config commands run against it. */
  mdxPath: string;
  /** Project root (absolute) — resolves `public`-mode asset folders. Missing on workspaces created before this existed. */
  rootPath?: string;
  colorIdx: number;
  metadataFields: MetadataField[];
  storage: StorageConfig;
  profile: SiteProfile;
  createdAt: string;
}
