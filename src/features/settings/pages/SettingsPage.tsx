import { useRouter } from '../../../router';
import {
  useSettings,
  type EditorFont,
  type EditorFontSize,
  type EditorLineHeight,
  type Theme,
} from '../store';

type OptionItem<T> = { value: T; label: string; desc?: string; icon?: string };

const THEMES: OptionItem<Theme>[] = [
  { value: 'light',  label: 'Light',  desc: 'Always bright',    icon: '☀️' },
  { value: 'dark',   label: 'Dark',   desc: 'Always cozy',      icon: '🌙' },
  { value: 'system', label: 'System', desc: 'Follows your OS',  icon: '💻' },
];

const FONTS: OptionItem<EditorFont>[] = [
  { value: 'mono', label: 'Monospace', desc: 'Great for code',  icon: '⌨️' },
  { value: 'sans', label: 'Sans-serif', desc: 'Easy to read',   icon: '📖' },
];

const SIZES: OptionItem<EditorFontSize>[] = [
  { value: 'sm', label: 'Small',  desc: '13 px', icon: '🔹' },
  { value: 'md', label: 'Medium', desc: '15 px', icon: '🔷' },
  { value: 'lg', label: 'Large',  desc: '17 px', icon: '🔵' },
];

const LINE_HEIGHTS: OptionItem<EditorLineHeight>[] = [
  { value: 'compact',     label: 'Compact',     desc: '1.5',  icon: '≡' },
  { value: 'comfortable', label: 'Comfortable', desc: '1.75', icon: '☰' },
  { value: 'relaxed',     label: 'Relaxed',     desc: '2.0',  icon: '≣' },
];

export function SettingsPage() {
  const { navigate } = useRouter();
  const settings = useSettings();

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      {/* Header */}
      <header
        className="flex items-center gap-4 px-8 py-4 border-b-2"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <button
          onClick={() => navigate({ page: 'workspace' })}
          className="joy-btn flex items-center gap-2 text-sm font-black"
          style={{ color: 'var(--text-muted)' }}
        >
          ← Back
        </button>
        <div className="w-px h-5" style={{ background: 'var(--border-2)' }} />
        <div className="flex items-center gap-2">
          <span className="text-xl">⚙️</span>
          <span className="text-base font-black" style={{ color: 'var(--text)' }}>Settings</span>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-8 py-10 space-y-8 animate-slide-up">
        {/* Appearance */}
        <Section title="Appearance" icon="🎨">
          <SettingGroup label="Color Scheme" hint="Choose how mditoor looks on your screen">
            <RadioGroup
              options={THEMES}
              value={settings.theme}
              onChange={v => settings.update('theme', v)}
            />
          </SettingGroup>
        </Section>

        {/* Editor */}
        <Section title="Editor" icon="✏️">
          <SettingGroup label="Font Family" hint="The font used in the editor textarea">
            <RadioGroup
              options={FONTS}
              value={settings.editorFont}
              onChange={v => settings.update('editorFont', v)}
            />
          </SettingGroup>

          <SettingGroup label="Font Size">
            <RadioGroup
              options={SIZES}
              value={settings.editorFontSize}
              onChange={v => settings.update('editorFontSize', v)}
            />
          </SettingGroup>

          <SettingGroup label="Line Height">
            <RadioGroup
              options={LINE_HEIGHTS}
              value={settings.editorLineHeight}
              onChange={v => settings.update('editorLineHeight', v)}
            />
          </SettingGroup>

          {/* Live preview */}
          <SettingGroup label="Preview">
            <div
              className="rounded-2xl border-2 p-5 text-sm leading-relaxed transition-all duration-300"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--surface-2)',
                fontFamily:
                  settings.editorFont === 'mono'
                    ? "'JetBrains Mono', 'Cascadia Code', monospace"
                    : "'Nunito', system-ui, sans-serif",
                fontSize: { sm: '13px', md: '15px', lg: '17px' }[settings.editorFontSize],
                lineHeight: { compact: '1.5', comfortable: '1.75', relaxed: '2' }[settings.editorLineHeight],
              }}
            >
              The quick brown fox jumps over the lazy dog.{' '}
              <span style={{ color: 'var(--accent)', fontWeight: 800 }}>
                Write your MDX here.
              </span>
            </div>
          </SettingGroup>
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-5">
        <div
          className="w-9 h-9 rounded-2xl flex items-center justify-center text-lg"
          style={{ background: 'var(--accent-faint)' }}
        >
          {icon}
        </div>
        <h2 className="text-base font-black" style={{ color: 'var(--text)' }}>
          {title}
        </h2>
      </div>
      <div
        className="rounded-3xl border-2 overflow-hidden"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
        {children}
      </div>
    </section>
  );
}

function SettingGroup({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-6 py-5 border-b-2 last:border-b-0" style={{ borderColor: 'var(--border)' }}>
      <p
        className="text-[10px] font-black uppercase tracking-[0.18em] mb-1"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </p>
      {hint && (
        <p className="text-xs font-bold mb-3" style={{ color: 'var(--text-faint)' }}>
          {hint}
        </p>
      )}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function RadioGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: OptionItem<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className="joy-btn flex items-center gap-2 px-4 py-2.5 rounded-2xl border-2 text-left transition-all duration-200"
            style={
              active
                ? {
                    background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)',
                    borderColor: 'transparent',
                    color: '#fff',
                    boxShadow: '0 4px 16px rgba(124,58,237,0.4)',
                  }
                : {
                    background: 'var(--surface-2)',
                    borderColor: 'var(--border)',
                    color: 'var(--text)',
                  }
            }
          >
            {opt.icon && (
              <span className="text-base leading-none select-none">{opt.icon}</span>
            )}
            <div>
              <p className="text-sm font-black">{opt.label}</p>
              {opt.desc && (
                <p
                  className="text-[11px] mt-0.5 font-semibold"
                  style={{ color: active ? 'rgba(255,255,255,0.75)' : 'var(--text-faint)' }}
                >
                  {opt.desc}
                </p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
