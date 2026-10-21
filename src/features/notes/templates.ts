import { invoke } from '@tauri-apps/api/core';
import type { SiteProfile } from '../workspace/types';

/** Starting structure for a new notes workspace. Only applied to a new or empty folder. */
export type NotesTemplate = 'empty' | 'study' | 'journal' | 'research';

export const NOTES_TEMPLATES: NotesTemplate[] = ['empty', 'study', 'journal', 'research'];

export const NOTES_TEMPLATE_ICON: Record<NotesTemplate, string> = {
  empty: '📄',
  study: '🎓',
  journal: '📔',
  research: '🔬',
};

interface StarterNote { path: string; title: string; tags: string[]; body: string }

const pad = (n: number) => String(n).padStart(2, '0');

function today(now: Date) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Folders and a first note for each template (file content stays English; it's the user's data). */
function plan(template: NotesTemplate, now: Date): { folders: string[]; note: StarterNote | null } {
  const date = today(now);
  switch (template) {
    case 'study':
      return {
        folders: ['inbox', 'courses', 'courses/example-course'],
        note: {
          path: 'inbox/welcome',
          title: 'Welcome to your study notes',
          tags: ['getting-started'],
          body: [
            'This workspace keeps one folder per course.',
            '',
            '- **inbox/**: quick notes to sort later',
            '- **courses/<course>/**: lectures, summaries and exercises',
            '',
            'Rename `courses/example-course` to your first course, or delete it.',
          ].join('\n'),
        },
      };
    case 'journal':
      return {
        folders: [`journal/${now.getFullYear()}`],
        note: {
          path: `journal/${now.getFullYear()}/${date}`,
          title: date,
          tags: ['journal'],
          body: '## Today\n\n- \n\n## Notes\n',
        },
      };
    case 'research':
      return {
        folders: ['papers', 'ideas', 'reading-list'],
        note: {
          path: 'ideas/welcome',
          title: 'Research workspace',
          tags: ['getting-started'],
          body: [
            '- **papers/**: one note per paper, with key points and quotes',
            '- **ideas/**: questions and threads to follow',
            '- **reading-list/**: what to read next',
          ].join('\n'),
        },
      };
    default:
      return { folders: [], note: null };
  }
}

/** Creates the template's folders and first note in `mdxPath`. Returns the note path, if any. */
export async function applyNotesTemplate(mdxPath: string, profile: SiteProfile, template: NotesTemplate): Promise<string | null> {
  const { folders, note } = plan(template, new Date());
  for (const folder of folders) await invoke('create_note_folder', { mdxPath, folder });
  if (!note) return null;
  const content = [
    '---',
    `title: ${JSON.stringify(note.title)}`,
    `tags: [${note.tags.map(t => JSON.stringify(t)).join(', ')}]`,
    `created: ${today(new Date())}`,
    'status: todo',
    '---',
    '',
    note.body,
    '',
  ].join('\n');
  await invoke('write_post', { mdxPath, slug: note.path, content, profile });
  return note.path;
}
