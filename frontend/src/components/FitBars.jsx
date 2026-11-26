import { FIT_BANDS, countBands } from '../fitBands'

// The fit chart, the same on the Dashboard and on Job Matches: one column per band (fitBands.js), its count on top,
// its name below. Each column is a button that picks that band; the picked one is outlined. Empty bands can't be
// picked. `fill` lets the bars take the card's spare height (Dashboard); otherwise they are a fixed 48px (Job Matches).
export default function FitBars({ shares, active = 'all', onPick, fill = false, className = '' }) {
  const counts = countBands(shares)
  const max = Math.max(1, ...counts)
  return (
    <div className={`grid grid-cols-5 gap-2 ${fill ? 'min-h-21' : ''} ${className}`}>
      {FIT_BANDS.map((b, i) => {
        const n = counts[i]
        const on = active === b.key || (active === 'half' && (b.key === 'mid' || b.key === 'top'))
        return (
          <button key={b.key} type="button" disabled={!n} onClick={() => onPick(on && active === b.key ? 'all' : b.key)}
            aria-pressed={on}
            aria-label={`${n} ${n === 1 ? 'job' : 'jobs'} where you have ${b.key === 'none' ? 'none' : b.label.toLowerCase()} of the skills${on ? ' (shown)' : ''}`}
            className={`group flex min-h-0 flex-col rounded-lg px-0.5 text-center transition-colors enabled:hover:bg-well/70 disabled:cursor-default ${on ? 'bg-accent-soft/60 ring-2 ring-accent/50' : ''}`}>
            <span className={`relative flex min-h-0 items-end border-b border-line-strong px-1 pt-5 ${fill ? 'flex-1' : 'h-16'}`}>
              <span style={{ height: `${(n / max) * 100}%`, '--k': i }} className={`dash-rise relative block w-full min-h-1.25 rounded-t-md ${b.tone}`}>
                <span className="absolute -top-4.5 inset-x-0 text-[12.5px] font-extrabold tabular-nums text-ink">{n}</span>
              </span>
            </span>
            <span className={`mt-1 whitespace-nowrap text-[11px] leading-tight ${b.key === 'mid' || b.key === 'top' ? 'font-bold text-have-strong' : 'text-muted'} group-enabled:group-hover:underline`}>{b.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// 20 Nov (her review: the bar chart took the card's height from the job list): the Dashboard's compact form, one
// segmented bar (each band as wide as its share of the jobs) and a key with the counts. Each part picks its band.
export function FitStrip({ shares, onPick, className = '' }) {
  const counts = countBands(shares)
  const total = Math.max(1, shares.length)
  const pick = (b, n) => n && onPick(b.key)
  return (
    <div className={className}>
      <div className="fit-strip" role="group" aria-label="How well you fit these jobs">
        {FIT_BANDS.map((b, i) => counts[i] > 0 && (
          <button key={b.key} type="button" onClick={() => pick(b, counts[i])} style={{ flexGrow: counts[i] / total }}
            aria-label={`${counts[i]} ${counts[i] === 1 ? 'job' : 'jobs'} where you have ${b.key === 'none' ? 'none' : b.label.toLowerCase()} of the skills`}
            className={`fit-seg ${b.tone}`} />
        ))}
      </div>
      <ul className="fit-key" aria-hidden="true">
        {FIT_BANDS.map((b, i) => (
          <li key={b.key} className={b.key === 'mid' || b.key === 'top' ? 'hi' : ''} title={b.label}><i className={b.tone} />{b.short} <b>{counts[i]}</b></li>
        ))}
      </ul>
    </div>
  )
}
