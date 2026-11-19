// ── Lane primitives: the warm-paper language, in four small parts ────────────
// Tile / SegBar / SkillChip / FitBadge. Kept apart from the generic kit because
// they carry meaning: a colour here always says something about the data.

const TONES = {
  accent: 'from-[#eef3ff] to-card',
  have: 'from-[#ecfaf6] to-card',
  partial: 'from-[#fdf5e6] to-card',
  plan: 'from-[#f3efff] to-card',
}

const DOTS = {
  accent: 'bg-accent', have: 'bg-have', partial: 'bg-partial', plan: 'bg-[#7c5cff]',
}

// A stat a student can scan: label, the number, and one line saying what it means.
export function Tile({ label, value, suffix, note, tone = 'accent', to, children, ...rest }) {
  const Tag = to ? 'a' : 'div'
  return (
    <Tag
      href={to}
      className={`block rounded-tile border border-line bg-gradient-to-br ${TONES[tone]} px-3.5 pb-3 pt-2.5
        shadow-card transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-lifted
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40`}
      {...rest}
    >
      <p className="m-0 text-small text-muted">{label}</p>
      <p className="m-0 mt-1 font-display text-[26px] font-bold leading-none tracking-[-0.03em] text-ink">
        {value}{suffix && <span className="ml-1 font-mono text-label font-normal tracking-normal text-muted">{suffix}</span>}
      </p>
      {note && (
        <p className="m-0 mt-1.5 flex items-center gap-1.5 text-small text-muted">
          <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOTS[tone]}`} />
          {note}
        </p>
      )}
      {children}
    </Tag>
  )
}

// Ten blocks, one per skill the ads ask for. Colour is the meaning, never decoration.
const SEG = {
  have: 'bg-[image:var(--grad-c2)] border border-have-strong',
  plan: 'bg-[image:var(--grad-c1)] opacity-55',
  gap: 'bg-card border-[1.5px] border-dashed border-field',
}

export function SegBar({ segments, className = '' }) {
  return (
    <div aria-hidden="true" className={`flex gap-[3px] ${className}`}>
      {segments.map((s, i) => (
        <span
          key={`${s.skill || 'seg'}-${i}`}
          title={s.title}
          className={`h-3 flex-1 rounded-[4px] transition-transform duration-150 hover:scale-y-125 ${SEG[s.state] || SEG.gap}`}
        />
      ))}
    </div>
  )
}

const CHIP = {
  have: 'bg-accent-soft text-accent border-accent/20',
  plan: 'bg-partial-soft text-partial-strong border-partial/25',
  gap: 'bg-card text-muted border-dashed border-field',
  neutral: 'bg-well text-ink-soft border-line',
}

export function SkillChip({ tone = 'neutral', children, ...rest }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-pill border px-2.5 py-[3px] text-small ${CHIP[tone]}`} {...rest}>
      {children}
    </span>
  )
}

// "5/10 required": how much of an ad she covers, and on what basis it was counted
export function FitBadge({ have, of, basis }) {
  const word = { unspecified: 'listed', preferred: 'preferred' }[basis] || 'required'
  return (
    <span className="rounded-pill bg-have-soft px-2 py-0.5 font-mono text-label font-medium text-have-strong tabular whitespace-nowrap">
      {have}/{of} {word}
    </span>
  )
}

// The one primary action on an entry screen: a key you can see pressed.
export function PressButton({ className = '', children, ...rest }) {
  return (
    <button
      className={`h-[50px] w-full rounded-[12px] bg-accent font-display text-[16px] font-bold text-white
        shadow-[0_3px_0_var(--color-accent-strong),0_14px_24px_-14px_rgb(47_98_224/.9)] transition-[transform,box-shadow,filter] duration-100
        hover:brightness-105 active:translate-y-[3px] active:shadow-none disabled:opacity-45 disabled:hover:brightness-100 ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

// ── two more chart types, so a page is not four lists ────────────────────────

// Where the live jobs sit: one square per category, area by job count.
// A treemap says "the market is uneven" faster than a list of thirteen numbers.
const TREEMAP = [
  'bg-c1 text-white',
  'bg-c2 text-white',
  'bg-c3 text-white',
  'bg-accent-soft text-accent-strong',
  'bg-have-soft text-have-strong',
  'bg-[#f3eeff] text-[#5b47b8]',
]

export function Treemap({ items, className = '', limit = 4, compact = false }) {
  const shown = [...items].sort((a, b) => b.jobs - a.jobs).slice(0, limit)
  const max = Math.max(1, ...shown.map(i => i.jobs))
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {shown.map((c, i) => {
        const share = c.jobs / max
        const basis = compact
          ? 'grow basis-[30%]'
          : share > 0.8 ? 'grow-[3] basis-[38%]' : share > 0.5 ? 'grow-[2] basis-[28%]' : 'grow basis-[18%]'
        return (
          <span
            key={c.name}
            title={`${c.name} — ${c.jobs} live ${c.jobs === 1 ? 'job' : 'jobs'}`}
            className={`flex min-w-0 ${basis} flex-col justify-between rounded-[9px] ${compact ? 'min-h-[34px] px-1.5 py-1' : 'px-2 py-1.5'} ${TREEMAP[i % TREEMAP.length]}`}
          >
            <span className="truncate text-label font-semibold leading-tight">{c.name}</span>
            <span className="font-mono text-label tabular opacity-80">{c.jobs}</span>
          </span>
        )
      })}
      {items.length > limit && !compact && (
        <span className="flex basis-[100%] items-center gap-1.5 px-0.5 pt-0.5 text-label text-faint">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-line-strong" />
          +{items.length - limit} more categories
        </span>
      )}
    </div>
  )
}

// Applications as one stacked bar: what is still open vs what has an answer.
export function StageBar({ sent = 0, waiting = 0, className = '' }) {
  const answered = Math.max(0, sent - waiting)
  const pct = (n) => (sent ? (n / sent) * 100 : 0)
  return (
    <div className={className}>
      <div aria-hidden="true" className="flex h-2 w-full overflow-hidden rounded-full bg-well">
        {sent > 0 ? (
          <>
            <span className="h-full bg-[image:var(--grad-c1)]" style={{ width: pct(answered) + '%' }} />
            <span className="h-full bg-[image:var(--grad-c4)]" style={{ width: pct(waiting) + '%' }} />
          </>
        ) : <span className="h-full w-full bg-well" />}
      </div>
      <p className="m-0 mt-1.5 flex items-center gap-3 text-label text-muted">
        <span className="flex items-center gap-1"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-c1" />{answered} answered</span>
        <span className="flex items-center gap-1"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-c4" />{waiting} waiting</span>
      </p>
    </div>
  )
}
