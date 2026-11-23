export { default as Logo } from './Logo'
export { AuthShell } from './AuthShell'
export { default as RevealButton } from './RevealButton'
export { AUTH_FIELD, AUTH_TONE } from './authField'

// ── Button: four styles, three sizes, never a hand-written class again ───────
const BTN_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-control font-medium whitespace-nowrap ' +
  'transition-[background,box-shadow,transform] duration-150 focus-visible:outline-none ' +
  'disabled:opacity-45 disabled:cursor-not-allowed'

const BTN_VARIANTS = {
  primary: 'text-on-accent bg-accent shadow-[0_3px_0_var(--color-accent-strong)] hover:bg-accent-strong active:translate-y-[3px] active:shadow-none',
  secondary: 'bg-card text-ink-soft border border-line-strong hover:bg-well hover:border-field active:translate-y-px',
  danger: 'bg-missing-soft text-missing-strong border border-missing/40 hover:bg-missing hover:text-white active:translate-y-px',
  quiet: 'bg-transparent text-accent px-0 hover:underline',
}

const BTN_SIZES = { md: 'h-9 px-4 text-body', sm: 'h-[30px] px-3 text-small', icon: 'h-8 w-8 p-0' }

export function Button({ as: Tag = 'button', variant = 'primary', size = 'md', className = '', type, children, ...rest }) {
  const tagProps = Tag === 'button' ? { type: type ?? 'button' } : {}
  return (
    <Tag
      className={`${BTN_BASE} ${BTN_VARIANTS[variant]} ${variant === 'quiet' ? '' : BTN_SIZES[size]} ${className}`}
      {...tagProps}
      {...rest}
    >
      {children}
    </Tag>
  )
}

// ── Card: one panel, an optional banded head, a body, an optional foot ───────
export function Card({ className = '', children, ...rest }) {
  return (
    <section
      className={`flex flex-col min-h-0 overflow-hidden bg-card border border-line rounded-panel shadow-card ${className}`}
      {...rest}
    >
      {children}
    </section>
  )
}

export function CardHead({ title, sub, action, id, className = '' }) {
  return (
    <div className={`flex items-start justify-between gap-3 px-4 py-3 shrink-0 bg-band border-b border-line ${className}`}>
      <div className="min-w-0">
        {title && <h2 id={id} className="text-body font-semibold text-ink m-0 tracking-[-0.01em]">{title}</h2>}
        {sub && <p className="text-small text-faint m-0 mt-0.5 leading-snug">{sub}</p>}
      </div>
      {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
    </div>
  )
}

export function CardBody({ scroll = false, stretch = false, pad = true, className = '', children }) {
  const layout = stretch ? 'grid content-stretch [grid-auto-rows:minmax(min-content,auto)]' : 'flex flex-col'
  return (
    <div className={`flex-1 min-h-0 ${layout} ${scroll ? 'overflow-y-auto' : ''} ${pad ? 'px-4 py-3' : 'pb-0'} ${className}`}>
      {children}
    </div>
  )
}

export function CardFoot({ className = '', children }) {
  return (
    <div className={`shrink-0 flex items-center justify-between gap-3 px-4 py-2.5 border-t border-line bg-band text-small text-faint ${className}`}>
      {children}
    </div>
  )
}

// ── Badge: a label whose colour says what it means ───────────────────────────
const BADGE_TONES = {
  have: 'bg-have-soft text-have-strong',
  partial: 'bg-partial-soft text-partial-strong',
  missing: 'bg-missing-soft text-missing-strong',
  accent: 'bg-accent-soft text-accent',
  neutral: 'bg-well text-muted',
  outline: 'bg-card text-muted border border-line-strong',
}

export function Badge({ tone = 'neutral', mono = false, className = '', children }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-chip px-2 py-0.5 text-small whitespace-nowrap ${mono ? 'tabular' : ''} ${BADGE_TONES[tone]} ${className}`}>
      {children}
    </span>
  )
}

// ── Field: label, control, hint or error, wired together ─────────────────────
import { useId } from 'react'

const CONTROL =
  'w-full rounded-[11px] border-[1.5px] border-line-strong bg-white text-ink text-body placeholder:text-[#8a8aa0] ' +
  'transition-[border-color,box-shadow,background] duration-150 hover:border-field ' +
  'focus:outline-none focus:border-accent focus:bg-white focus:ring-[4px] focus:ring-accent/15 ' +
  'disabled:bg-well disabled:text-muted'

// Call sites still pass `required`; Field ignores it on purpose. An asterisk in the label joins
// the accessible name and breaks getByLabel('Password', { exact: true }) in the e2e suite.
export function Field({ label, hint, error, id, className = '', children }) {
  const auto = useId()
  const inputId = id ?? auto
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label htmlFor={inputId} className="text-small font-medium text-ink-soft">
          {label}
        </label>
      )}
      {typeof children === 'function'
        ? children({
            id: inputId,
            'aria-describedby': [hint && `${inputId}-hint`, error && `${inputId}-err`].filter(Boolean).join(' ') || undefined,
            'aria-invalid': !!error || undefined,
          })
        : children}
      {hint && !error && <p id={`${inputId}-hint`} className="text-small text-faint m-0 leading-snug">{hint}</p>}
      {error && <p id={`${inputId}-err`} className="text-small text-missing-strong m-0 leading-snug">{error}</p>}
    </div>
  )
}

export const Input = ({ className = '', ...rest }) => <input className={`${CONTROL} h-11 px-3.5 ${className}`} {...rest} />
export const TextArea = ({ rows = 4, className = '', ...rest }) => <textarea rows={rows} className={`${CONTROL} px-3.5 py-2.5 resize-y ${className}`} {...rest} />
export const Select = ({ className = '', children, ...rest }) => (
  <select className={`${CONTROL} h-11 pl-3.5 pr-10 ${className}`} {...rest}>{children}</select>
)

// ── Notice: the one way the app says something that is not data ──────────────
const NOTICE_TONES = {
  info: 'bg-accent-soft border-accent/25 text-accent',
  good: 'bg-have-soft border-have/30 text-have-strong',
  warn: 'bg-partial-soft border-partial/30 text-partial-strong',
  bad: 'bg-missing-soft border-missing/30 text-missing-strong',
}

// 23 Nov (her review): `icon` adds a small mark in the tone's colour (✓ good, i info, ! warn / bad), so the kind of
// message is not told by colour alone (WCAG 1.4.1). Off by default: pages opt in.
const NOTICE_ICONS = {
  good: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" strokeLinecap="round" strokeLinejoin="round" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5h.01" strokeLinecap="round" /></>,
  warn: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5h.01" strokeLinecap="round" /></>,
  bad: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5h.01" strokeLinecap="round" /></>,
}

export function Notice({ tone = 'info', icon = false, className = '', children }) {
  return (
    <div className={`flex items-start gap-2.5 rounded-panel border px-3.5 py-2.5 text-body leading-snug ${NOTICE_TONES[tone]} ${className}`}>
      {icon && (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" className="mt-px h-[18px] w-[18px] shrink-0">
          {NOTICE_ICONS[tone]}
        </svg>
      )}
      {children}
    </div>
  )
}

// ── EmptyState ───────────────────────────────────────────────────────────────
export function EmptyState({ title, action, className = '', children }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center gap-2 px-5 py-8 ${className}`}>
      {title && <h3 className="text-body font-semibold text-ink m-0">{title}</h3>}
      {children && <p className="text-small text-muted m-0 max-w-[34ch] leading-snug">{children}</p>}
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  )
}

// ── Tabs: keeps role="tab" / aria-selected, so the e2e suite still finds it ──
export function Tabs({ items, value, onChange, label, className = '' }) {
  return (
    <div role="tablist" aria-label={label} className={`flex gap-1 border-b border-line shrink-0 ${className}`}>
      {items.map(it => {
        const on = it.key === value
        return (
          <button
            key={it.key} type="button" role="tab" aria-selected={on} onClick={() => onChange?.(it.key)}
            className={`relative px-3.5 py-2 text-body whitespace-nowrap transition-colors duration-150 rounded-t-control ${
              on ? 'text-accent font-semibold after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent'
                 : 'text-muted hover:text-ink hover:bg-well'
            }`}
          >
            {it.label}
            {it.count != null && <span className={`ml-1.5 tabular text-small ${on ? 'text-accent' : 'text-faint'}`}>{it.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

// ── PageHead: the band every page shares. No kicker: the heading speaks ──────
export function PageHead({ title, sub, actions, meta, loading = false, children, className = '' }) {
  const BARS = (
    <>
      <div aria-hidden="true" className="h-8 w-64 max-w-full rounded-control bg-well" />
      <div aria-hidden="true" className="h-4 w-80 max-w-full rounded bg-well mt-2.5" />
    </>
  )
  return (
    <div aria-busy={loading || undefined} className={`shrink-0 px-4 sm:px-6 pt-3 pb-2 ${className}`}>
      {children || (loading ? BARS : (
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h1 className="font-display text-[27px] font-bold tracking-[-0.03em] text-ink m-0 leading-[1.1]">{title}</h1>
            {sub && <p className="text-small text-muted m-0 mt-1 max-w-[78ch] leading-snug">{sub}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      ))}
      {meta}
    </div>
  )
}

export { Tile, SegBar, SkillChip, FitBadge, PressButton, Treemap, StageBar } from './Lane'
