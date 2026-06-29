import type { MetadataField } from '../../workspace/types';

export type MetaValues = Record<string, string | boolean | number | string[]>;

/** Parse YAML frontmatter and MDX body from a file string. */
export function parseFrontmatter(content: string): { meta: MetaValues; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const meta: MetaValues = {};
  const lines = match[1].split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const colonIdx = line.indexOf(':');
    if (colonIdx <= 0) { i++; continue; }

    const key = line.slice(0, colonIdx).trim();
    const raw = line.slice(colonIdx + 1).trim();

    if (raw === '') {
      // Possibly a YAML list
      const items: string[] = [];
      i++;
      while (i < lines.length && /^\s+-\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s+-\s/, '').trim());
        i++;
      }
      meta[key] = items;
      continue;
    }

    if (raw === 'true')  { meta[key] = true;  i++; continue; }
    if (raw === 'false') { meta[key] = false; i++; continue; }

    const num = Number(raw);
    if (!isNaN(num) && raw !== '') { meta[key] = num; i++; continue; }

    meta[key] = raw.replace(/^["']|["']$/g, '');
    i++;
  }

  return { meta, body: match[2] };
}

/** Serialize metadata + body back into a full MDX file string. */
export function buildContent(
  fields: MetadataField[],
  values: MetaValues,
  body: string,
): string {
  const lines: string[] = ['---'];

  for (const field of fields) {
    const value = values[field.name];
    if (value === undefined || value === '') continue;

    if (field.type === 'tags' && Array.isArray(value)) {
      if (value.length > 0) {
        lines.push(`${field.name}:`);
        value.forEach(v => lines.push(`  - ${v}`));
      }
    } else if (field.type === 'boolean') {
      lines.push(`${field.name}: ${value}`);
    } else if (field.type === 'number') {
      lines.push(`${field.name}: ${value}`);
    } else {
      lines.push(`${field.name}: "${String(value).replace(/"/g, '\\"')}"`);
    }
  }

  lines.push('---', '');
  return lines.join('\n') + body;
}

/** Build a default MetaValues object from a field schema. */
export function defaultMeta(fields: MetadataField[]): MetaValues {
  const meta: MetaValues = {};
  for (const f of fields) {
    meta[f.name] = f.type === 'boolean' ? false : f.type === 'tags' ? [] : '';
  }
  return meta;
}
