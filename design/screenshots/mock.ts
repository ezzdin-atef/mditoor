// Fake Tauri backend so the real UI can run in a plain browser for marketing screenshots.
// Open http://localhost:1420/design/screenshots/app.html while `pnpm dev` is running.
// Query params: ?theme=dark  ?lang=ar  ?post=<slug>  (opens the editor on that post)
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { useRouter } from '../../src/router';

const params = new URLSearchParams(location.search);
const COVERS = '/design/screenshots/covers';
const ROOT = 'C:\\Users\\you\\code\\my-blog';
const POSTS_DIR = `${ROOT}\\content\\posts`;
const DAY = 86_400_000;
const now = Date.now();

const workspaces = [
  { id: 'ws-blog', name: 'Personal blog', icon: '📝', mdxPath: POSTS_DIR, rootPath: ROOT, colorIdx: 0, createdAt: '2026-06-01T10:00:00Z' },
  { id: 'ws-docs', name: 'Docs site', icon: '📚', mdxPath: 'C:\\Users\\you\\code\\docs\\docs', rootPath: 'C:\\Users\\you\\code\\docs', colorIdx: 2, createdAt: '2026-07-01T10:00:00Z' },
  { id: 'ws-dev', kind: 'dev', devUsername: 'you', name: 'DEV · @you', icon: '✍️', mdxPath: 'C:\\dev-drafts', colorIdx: 4, createdAt: '2026-08-01T10:00:00Z' },
];

const config = {
  profile: { framework: 'nextjs', layout: 'folder', extension: '.mdx', frontmatter: 'yaml' },
  storage: { provider: 'local', local: { mode: 'colocated', dir: 'public/images', urlPrefix: '/images' } },
  metadataFields: [
    { id: 'f1', name: 'title', type: 'text', required: true },
    { id: 'f2', name: 'description', type: 'text', required: false },
    { id: 'f3', name: 'date', type: 'date', required: true },
    { id: 'f4', name: 'category', type: 'select', required: false, options: ['Engineering', 'Writing', 'Notes', 'Tutorial'] },
    { id: 'f5', name: 'tags', type: 'tags', required: false },
    { id: 'f6', name: 'cover', type: 'image', required: false },
    { id: 'f7', name: 'draft', type: 'boolean', required: false },
  ],
};

interface MockPost { slug: string; title: string; description: string; date: string; category: string; tags: string[]; cover: string; draft?: boolean; words: number; body: string; age: number }

const posts: MockPost[] = [
  {
    slug: 'shipping-react-server-components', title: 'Shipping React Server Components to production',
    description: 'What changed in our bundle, our caching, and our mental model after six months of RSC.',
    date: '2026-10-14', category: 'Engineering', tags: ['react', 'nextjs', 'performance'], cover: 'rsc', words: 1840, age: 0.1,
    body: `Six months ago we moved our marketing site and docs to **React Server Components**. This post is the honest version of how it went: the wins, the regressions, and the things I would do differently.

## Why we moved

Our client bundle had grown to 410 KB, and most of it rendered content that never changed after build. Server Components let that code stay on the server.

> The fastest JavaScript is the JavaScript you never send.

## What actually changed

- The client bundle dropped from **410 KB to 96 KB**
- Time to interactive on mid-range Android improved by 1.8 s
- Data fetching moved next to the components that use it

\`\`\`tsx
export default async function Post({ slug }: { slug: string }) {
  const post = await getPost(slug);
  return <Article title={post.title}>{post.body}</Article>;
}
\`\`\`

## لماذا يهمّ هذا للكتّاب العرب؟

عندما يُعرض المحتوى على الخادم، يصل النص العربي إلى القارئ كاملًا ومنسّقًا من أول طلب، دون انتظار تحميل الخطوط والسكربتات.

## What I would do differently

Start with the leaf components, measure every step, and keep a written list of every \`"use client"\` boundary you add.
`,
  },
  {
    slug: 'arabic-typography-on-the-web', title: 'الطباعة العربية على الويب: دليل عملي',
    description: 'كيف تختار الخط العربي المناسب، وتضبط ارتفاع السطر، وتتعامل مع النصوص المختلطة.',
    date: '2026-10-09', category: 'Writing', tags: ['arabic', 'typography', 'css'], cover: 'arabic', words: 1320, age: 2,
    body: `الكتابة بالعربية على الويب ليست مجرد تغيير اتجاه النص. هذا دليل عملي لما تعلمته خلال سنتين من نشر المقالات بالعربية والإنجليزية.

## اختيار الخط

اختر خطًا صُمّم للشاشة أولًا، مثل **Noto Sans Arabic** أو **Readex Pro**، وتجنّب الخطوط المطبعية الثقيلة في النص الأساسي.

## ارتفاع السطر

الحروف العربية تحتاج مساحة أكبر فوق السطر وتحته. ابدأ بقيمة \`1.8\` للنص الأساسي ثم عدّلها حسب الخط.

> النص العربي الجيد يتنفّس.

## النصوص المختلطة

عندما تكتب عن React أو CSS داخل فقرة عربية، اترك للمحرر تحديد اتجاه كل فقرة تلقائيًا، ولا تُجبر الصفحة كلها على اتجاه واحد.

- استخدم \`dir="auto"\` للفقرات
- اجعل كتل الشيفرة دائمًا من اليسار إلى اليمين
- راجع علامات الترقيم في نهاية الأسطر
`,
  },
  {
    slug: 'postgres-indexes-i-actually-use', title: 'Postgres indexes I actually use',
    description: 'B-tree, partial, and covering indexes, plus the two I removed after a year.',
    date: '2026-09-28', category: 'Engineering', tags: ['postgres', 'database'], cover: 'postgres', words: 2210, age: 9, body: 'Most of my queries are served by four kinds of index.',
  },
  {
    slug: 'building-a-desktop-app-with-tauri', title: 'Building a desktop app with Tauri v2',
    description: 'A 6 MB installer, a Rust core, and a React UI. Notes from building Mditoor.',
    date: '2026-10-16', category: 'Tutorial', tags: ['tauri', 'rust', 'react'], cover: 'tauri', draft: true, words: 960, age: 0.02, body: 'Tauri gives you a native window and a Rust backend.',
  },
  {
    slug: 'static-sites-are-enough', title: 'A static site is probably enough',
    description: 'Why my blog has no database, no CMS, and no build server, and what I gained.',
    date: '2026-09-12', category: 'Notes', tags: ['astro', 'jamstack'], cover: 'static', words: 880, age: 24, body: 'Static sites are fast, cheap, and boring in the best way.',
  },
  {
    slug: 'git-for-writers', title: 'Git for writers who are not engineers',
    description: 'Commit, push, and roll back your drafts without opening a terminal.',
    date: '2026-08-30', category: 'Writing', tags: ['git', 'workflow'], cover: 'git', words: 1105, age: 40, body: 'Git is a time machine for your drafts.',
  },
];

const frontmatter = (p: MockPost) => [
  `title: "${p.title}"`,
  `description: "${p.description}"`,
  `date: ${p.date}`,
  `category: ${p.category}`,
  `tags:\n${p.tags.map(t => `  - ${t}`).join('\n')}`,
  `cover: ./cover.png`,
  `draft: ${p.draft ? 'true' : 'false'}`,
].join('\n');

const summary = (p: MockPost) => ({
  slug: p.slug, file: `${p.slug}/index.mdx`, frontmatter: frontmatter(p), frontmatter_format: 'yaml',
  excerpt: p.description, first_image: null, words: p.words, modified: now - p.age * DAY,
});

const ideas = {
  version: 1,
  ideas: [
    { id: 'i1', title: 'Why I stopped using a CMS', notes: 'Markdown + git covers 95% of it.', tags: ['writing'], status: 'next', starred: true },
    { id: 'i2', title: 'كيف أكتب مقالًا تقنيًا في ساعة', notes: 'المخطط أولًا، ثم الأمثلة، ثم المقدمة.', tags: ['arabic', 'writing'], status: 'inbox', starred: false },
    { id: 'i3', title: 'Image compression that does not ruin screenshots', notes: '', tags: ['images'], status: 'inbox', starred: false },
    { id: 'i4', title: 'RSC caching gotchas', notes: 'Follow-up to the RSC post.', tags: ['react'], status: 'next', starred: false },
    { id: 'i5', title: 'Building a desktop app with Tauri v2', notes: '', tags: ['tauri'], status: 'drafted', starred: false, slug: 'building-a-desktop-app-with-tauri' },
    { id: 'i6', title: 'Bilingual SEO: hreflang in practice', notes: '', tags: ['seo'], status: 'inbox', starred: true },
  ].map((i, n) => ({ ...i, createdAt: new Date(now - n * 3 * DAY).toISOString(), updatedAt: new Date(now - n * DAY).toISOString() })),
};

const gitStatus = {
  is_repo: true, branch: 'main', detached: false, has_commits: true,
  remote: 'git@github.com:you/my-blog.git', upstream: 'origin/main', ahead: 1, behind: 0,
  files: [
    { path: 'building-a-desktop-app-with-tauri/index.mdx', orig_path: null, staged: '?', unstaged: '?', staged_stat: null, unstaged_stat: [42, 0] },
    { path: 'building-a-desktop-app-with-tauri/cover.png', orig_path: null, staged: '?', unstaged: '?', staged_stat: null, unstaged_stat: null },
    { path: 'shipping-react-server-components/index.mdx', orig_path: null, staged: 'M', unstaged: ' ', staged_stat: [18, 6], unstaged_stat: null },
    { path: 'arabic-typography-on-the-web/index.mdx', orig_path: null, staged: ' ', unstaged: 'M', staged_stat: null, unstaged_stat: [7, 2] },
  ],
};

const commitMsgs = [
  'Publish: Shipping React Server Components to production', 'Fix typos in the Arabic typography post',
  'Add cover for Postgres indexes', 'Draft: Static sites are enough', 'Update tags across posts',
  'Publish: Git for writers', 'Compress old images',
];
const gitLog = commitMsgs.map((message, i) => {
  const ts = Math.floor((now - (i * 1.7 + 0.2) * DAY) / 1000);
  const hash = (0xa1b2c3d4e5 + i * 0x1f2e3d).toString(16).padEnd(40, '0');
  return { hash, short: hash.slice(0, 7), date: new Date(ts * 1000).toISOString(), timestamp: ts, author: 'You', email: 'you@example.com', refs: i === 0 ? 'HEAD -> main' : i === 1 ? 'origin/main' : '', message };
});

const diff = `diff --git a/shipping-react-server-components/index.mdx b/shipping-react-server-components/index.mdx
@@ -12,9 +12,15 @@ Our client bundle had grown to 410 KB
-- The client bundle dropped a lot
+- The client bundle dropped from **410 KB to 96 KB**
+- Time to interactive on mid-range Android improved by 1.8 s
 - Data fetching moved next to the components that use it
`;

const images = posts.map((p, i) => ({
  path: `${COVERS}/${p.cover}.svg`, rel_path: `${p.slug}/${p.cover}-cover.${i % 3 ? 'png' : 'jpg'}`,
  name: `${p.cover}-cover.${i % 3 ? 'png' : 'jpg'}`, ext: i % 3 ? 'png' : 'jpg',
  size: 180_000 + i * 53_000, modified: now - p.age * DAY,
}));

const appData: Record<string, string> = {
  'settings.json': JSON.stringify({
    theme: params.get('theme') ?? 'light', language: params.get('lang') ?? 'en',
    editorFont: 'inter', autoSave: true, autoSaveInterval: 5000,
  }),
  'workspaces.json': JSON.stringify(workspaces),
};

const bySlug = (slug: unknown) => posts.find(p => p.slug === slug);

mockWindows('main');
mockIPC((cmd, args) => {
  const a = (args ?? {}) as Record<string, unknown>;
  switch (cmd) {
    case 'read_app_data': return appData[a.file as string] ?? '';
    case 'write_app_data': return null;
    case 'read_workspace_config': return JSON.stringify(config);
    case 'list_posts': return a.path === POSTS_DIR ? posts.map(summary) : [];
    case 'list_mdx_slugs': return posts.map(p => p.slug);
    case 'read_post': {
      const p = bySlug(a.slug);
      return p ? `---\n${frontmatter(p)}\n---\n\n${p.body}` : '';
    }
    case 'resolve_post_image': {
      const p = bySlug(a.slug);
      return { path: p ? `${COVERS}/${p.cover}.svg` : null, size: 240_000, modified: 1, tried: [] };
    }
    case 'post_path': return `${POSTS_DIR}\\${a.slug}\\index.mdx`;
    case 'post_files': return ['index.mdx', 'cover.png'];
    case 'read_ideas': return a.mdxPath === POSTS_DIR ? JSON.stringify(ideas) : JSON.stringify({ version: 1, ideas: [] });
    case 'git_status': return gitStatus;
    case 'git_log': return gitLog;
    case 'git_branches': return [{ name: 'main', current: true, remote: false, upstream: 'origin/main', updated: now / 1000 }];
    case 'git_diff_file': return diff;
    case 'git_show_commit': return diff;
    case 'list_images': return a.mdxPath === POSTS_DIR ? images : [];
    case 'analyze_image_usage': return images.map(i => i.name).slice(0, 5);
    case 'config_locations': return {};
    default:
      if (cmd.startsWith('plugin:updater')) return null;
      if (cmd.startsWith('plugin:event')) return 0;
      if (cmd.startsWith('plugin:window')) return false;
      return null;
  }
});

// Local "files" are already served by Vite, so asset URLs pass straight through.
(window as unknown as { __TAURI_INTERNALS__: { convertFileSrc: (p: string) => string } })
  .__TAURI_INTERNALS__.convertFileSrc = p => p;

localStorage.setItem('mditoor:workspaces', JSON.stringify(workspaces));
localStorage.setItem('mditoor:settings', appData['settings.json']);

const post = params.get('post');
if (post) useRouter.setState({ route: { page: 'editor', workspaceId: 'ws-blog', slug: post, isNew: false } });
