import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

type LineKind = 'file' | 'hunk' | 'add' | 'del' | 'ctx' | 'note';

interface DiffLine {
  kind: LineKind;
  text: string;
  oldLn?: number;
  newLn?: number;
}

const MAX_LINES = 4000;

function parseDiff(text: string): { preamble: string; lines: DiffLine[] } {
  const out: DiffLine[] = [];
  const preamble: string[] = [];
  let oldLn = 0;
  let newLn = 0;
  let inFile = false;

  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.startsWith('diff --git ')) {
      inFile = true;
      const m = / b\/(.+)$/.exec(line);
      out.push({ kind: 'file', text: m ? m[1] : line.slice(11) });
      continue;
    }
    if (!inFile) {
      preamble.push(line);
      continue;
    }
    if (line.startsWith('@@')) {
      const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(line);
      if (m) {
        oldLn = Number(m[1]);
        newLn = Number(m[2]);
      }
      out.push({ kind: 'hunk', text: line });
      continue;
    }
    if (/^(index |--- |\+\+\+ |new file mode|deleted file mode|old mode|new mode|similarity index|rename from|rename to|dissimilarity)/.test(line)) {
      continue;
    }
    if (line.startsWith('Binary files')) { out.push({ kind: 'note', text: line }); continue; }
    if (line.startsWith('\\')) { out.push({ kind: 'note', text: line }); continue; }
    if (line.startsWith('+')) { out.push({ kind: 'add', text: line.slice(1), newLn: newLn++ }); continue; }
    if (line.startsWith('-')) { out.push({ kind: 'del', text: line.slice(1), oldLn: oldLn++ }); continue; }
    if (line.startsWith(' ')) { out.push({ kind: 'ctx', text: line.slice(1), oldLn: oldLn++, newLn: newLn++ }); continue; }
  }
  return { preamble: preamble.join('\n').trim(), lines: out };
}

export function DiffView({ diff, showFileHeaders = true }: { diff: string; showFileHeaders?: boolean }) {
  const { t } = useTranslation();
  const { preamble, lines } = useMemo(() => parseDiff(diff), [diff]);

  if (!diff.trim()) {
    return <p className="text-[12px] px-4 py-6 text-center" style={{ color: 'var(--text-faint)' }}>{t('git.noDiff')}</p>;
  }

  const truncated = lines.length > MAX_LINES;
  const shown = truncated ? lines.slice(0, MAX_LINES) : lines;

  return (
    <div className="diff-view">
      {preamble && (
        <pre className="m-0 px-4 py-3 text-[12px] whitespace-pre-wrap" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', fontFamily: 'inherit' }}>
          {preamble}
        </pre>
      )}
      {shown.map((l, i) => {
        if (l.kind === 'file') {
          return showFileHeaders ? <div key={i} className="diff-file-header">{l.text}</div> : null;
        }
        if (l.kind === 'note') {
          return <div key={i} className="px-4 py-1 text-[11px] italic" style={{ color: 'var(--text-faint)' }}>{l.text}</div>;
        }
        return (
          <div key={i} className={`diff-line ${l.kind}`}>
            <span className="ln">{l.kind === 'hunk' ? '…' : l.oldLn ?? ''}</span>
            <span className="ln">{l.kind === 'hunk' ? '…' : l.newLn ?? ''}</span>
            <span className="code">{l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : l.kind === 'hunk' ? '' : ' '}{l.text || ' '}</span>
          </div>
        );
      })}
      {truncated && (
        <p className="text-[12px] px-4 py-3" style={{ color: 'var(--text-faint)' }}>
          {t('git.diffTruncated', { n: lines.length - MAX_LINES })}
        </p>
      )}
    </div>
  );
}
