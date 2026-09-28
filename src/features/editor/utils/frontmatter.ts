import { parse as parseTomlDoc } from 'smol-toml';
import type { FrontmatterFormat, MetadataField } from '../../workspace/types';

export type MetaValues = Record<string, string | boolean | number | string[]>;

const FENCES: Record<FrontmatterFormat, RegExp> = {
  yaml: /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/,
  toml: /^\+\+\+\r?\n([\s\S]*?)\r?\n\+\+\+\r?\n?([\s\S]*)$/,
};

export interface ParsedFile {
  meta: MetaValues;
  body: string;
  /** null when the file has no frontmatter. */
  format: FrontmatterFormat | null;
  /** The frontmatter text between the fences; passed back to buildContent to keep fields outside the schema. */
  raw: string;
}

/** Parse frontmatter (YAML `---`, or TOML `+++` as Hugo uses) and the MDX body from a file string. */
export function parseFrontmatter(content: string): ParsedFile {
  for (const format of ['yaml', 'toml'] as const) {
    const match = content.match(FENCES[format]);
    if (!match) continue;
    const meta = parseFrontmatterBlock(match[1], format);
    // Unparseable TOML stays in the body, so saving can't wipe it.
    if (!meta) break;
    return { meta, body: match[2], format, raw: match[1] };
  }
  return { meta: {}, body: content, format: null, raw: '' };
}

/** Parse the text between the fences. Returns null for invalid TOML. */
export function parseFrontmatterBlock(raw: string, format: FrontmatterFormat): MetaValues | null {
  return format === 'toml' ? parseToml(raw) : parseYaml(raw);
}

function parseToml(raw: string): MetaValues | null {
  let doc: Record<string, unknown>;
  try {
    doc = parseTomlDoc(raw);
  } catch {
    return null;
  }
  // smol-toml keeps date-only values as `2024-01-15`; drop the zero milliseconds it adds to datetimes.
  const dateString = (d: Date) => d.toISOString().replace('.000Z', 'Z');
  const meta: MetaValues = {};
  for (const [key, value] of Object.entries(doc)) {
    if (value instanceof Date) meta[key] = dateString(value);
    else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') meta[key] = value;
    else if (Array.isArray(value) && value.every(v => typeof v !== 'object' || v instanceof Date)) {
      meta[key] = value.map(v => (v instanceof Date ? dateString(v) : String(v)));
    }
    // Tables ([params]) and arrays of tables have no field type to edit them with.
  }
  return meta;
}

function parseYaml(raw: string): MetaValues {
  const meta: MetaValues = {};
  const lines = raw.split('\n');
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

  return meta;
}

// ─── Preserving fields outside the schema ───────────────────────────────────
// Saving rewrites the schema fields; every other top-level entry of the original
// frontmatter is copied back verbatim (comments, nested maps, multi-line arrays, tables).

interface RawEntry {
  /** Top-level key, or null for lines before the first key (comments). */
  key: string | null;
  lines: string[];
}

const unquote = (k: string) => k.trim().replace(/^(["'])(.*)\1$/, '$2');

/**
 * Groups lines into entries. Comment and blank lines are held until the next line decides
 * where they belong: before a key they lead that entry (so a comment stays with the field it
 * describes); before a continuation line they are part of the previous entry.
 */
function entryBuilder() {
  const entries: RawEntry[] = [];
  let pending: string[] = [];
  return {
    entries,
    push(key: string | null, line: string) {
      if (key === null && /^\s*(#.*)?$/.test(line)) { pending.push(line); return; }
      if (key !== null || entries.length === 0) {
        entries.push({ key, lines: [...pending, line] });
      } else {
        entries[entries.length - 1].lines.push(...pending, line);
      }
      pending = [];
    },
    finish() {
      if (pending.length) entries.push({ key: null, lines: pending });
      return entries;
    },
  };
}

// A top-level YAML entry starts at an unindented `key:`; list items, indented and blank lines continue it.
function yamlEntries(raw: string): RawEntry[] {
  const b = entryBuilder();
  for (const line of raw.split(/\r?\n/)) {
    const m = /^([^\s#-][^:]*?)\s*:(?:\s|$)/.exec(line);
    b.push(m ? unquote(m[1]) : null, line);
  }
  return b.finish();
}

// Tracks open arrays and multi-line strings so their inner lines aren't read as keys or table headers.
function scanToml(line: string, state: { depth: number; multi: string | null }) {
  let i = 0;
  while (i < line.length) {
    if (state.multi) {
      const end = line.indexOf(state.multi, i);
      if (end < 0) return;
      i = end + 3;
      state.multi = null;
      continue;
    }
    const c = line[i];
    if (line.startsWith('"""', i) || line.startsWith("'''", i)) { state.multi = line.slice(i, i + 3); i += 3; continue; }
    if (c === '#') return;
    if (c === '"') {
      i++;
      while (i < line.length && line[i] !== '"') i += line[i] === '\\' ? 2 : 1;
      i++;
      continue;
    }
    if (c === "'") { const end = line.indexOf("'", i + 1); i = end < 0 ? line.length : end + 1; continue; }
    if (c === '[') state.depth++;
    else if (c === ']') state.depth--;
    i++;
  }
}

// Top-level TOML entries (`key = ...`, dotted keys by their first part), plus everything
// from the first table header on, which has to stay after the top-level keys.
function tomlEntries(raw: string): { entries: RawEntry[]; tables: string } {
  const lines = raw.split(/\r?\n/);
  const b = entryBuilder();
  const state = { depth: 0, multi: null as string | null };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const atTop = state.depth === 0 && state.multi === null;
    if (atTop && /^\s*\[/.test(line)) return { entries: b.finish(), tables: lines.slice(i).join('\n') };
    const m = atTop ? /^\s*("(?:[^"\\]|\\.)*"|'[^']*'|[A-Za-z0-9_-]+)\s*[.=]/.exec(line) : null;
    // Held blank/# lines inside an open string or array rejoin their entry at the closing line.
    b.push(m ? unquote(m[1]) : null, line);
    scanToml(line, state);
  }
  return { entries: b.finish(), tables: '' };
}

/** Original entries whose key isn't a schema field, as text blocks. */
const keptEntries = (entries: RawEntry[], fields: MetadataField[]) => {
  const schema = new Set(fields.map(f => f.name));
  return entries
    .filter(e => e.key === null || !schema.has(e.key))
    .map(e => e.lines.join('\n').trimEnd())
    .filter(text => text.trim() !== '');
};

/**
 * Serialize metadata + body back into a full MDX file string.
 * `raw` is the original frontmatter (ParsedFile.raw); its fields outside the schema are kept.
 */
export function buildContent(
  fields: MetadataField[],
  values: MetaValues,
  body: string,
  format: FrontmatterFormat = 'yaml',
  raw = '',
): string {
  if (format === 'toml') return buildToml(fields, values, raw) + body;
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

  lines.push(...keptEntries(yamlEntries(raw), fields));
  lines.push('---', '');
  return lines.join('\n') + body;
}

// TOML dates are written bare so Hugo reads them as dates, not strings.
const TOML_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

// JSON string escapes are a subset of TOML basic-string escapes.
const tomlString = (v: string) => JSON.stringify(v);
const tomlKey = (k: string) => (/^[A-Za-z0-9_-]+$/.test(k) ? k : tomlString(k));

function buildToml(fields: MetadataField[], values: MetaValues, raw: string): string {
  const lines: string[] = ['+++'];

  for (const field of fields) {
    const value = values[field.name];
    if (value === undefined || value === '') continue;
    const key = tomlKey(field.name);

    if (field.type === 'tags' && Array.isArray(value)) {
      if (value.length > 0) lines.push(`${key} = [${value.map(v => tomlString(v)).join(', ')}]`);
    } else if (field.type === 'boolean' || field.type === 'number') {
      lines.push(`${key} = ${value}`);
    } else if (field.type === 'date' && TOML_DATE.test(String(value))) {
      lines.push(`${key} = ${value}`);
    } else {
      lines.push(`${key} = ${tomlString(String(value))}`);
    }
  }

  const { entries, tables } = tomlEntries(raw);
  lines.push(...keptEntries(entries, fields));
  if (tables.trim()) lines.push('', tables.trimEnd());
  lines.push('+++', '');
  return lines.join('\n');
}

/** Build a default MetaValues object from a field schema. */
export function defaultMeta(fields: MetadataField[]): MetaValues {
  const meta: MetaValues = {};
  for (const f of fields) {
    meta[f.name] = f.type === 'boolean' ? false : f.type === 'tags' ? [] : '';
  }
  return meta;
}
