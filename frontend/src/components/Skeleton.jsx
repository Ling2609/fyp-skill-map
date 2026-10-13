// Loading placeholders (9 Oct, her review: an empty box or a lone spinner "doesn't look nice"). Grey bars in the
// shape of the real page, so nothing jumps when the content arrives (NN/g, "Skeleton Screens 101"). The pulse stops
// for anyone who asks their system for reduced motion (motion-safe:).

// One grey bar. `className` sets its size, e.g. "h-4 w-40".
export function Bar({ className = '' }) {
  return <span aria-hidden="true" className={`block rounded-md bg-slate-200 motion-safe:animate-pulse ${className}`} />
}

// A list row: two lines of text on the left, a small pill on the right (job rows, skill rows)
export function RowSkeleton({ pill = true }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3" aria-hidden="true">
      <div className="space-y-2 flex-1 min-w-0">
        <Bar className="h-3.5 w-3/5" />
        <Bar className="h-3 w-2/5" />
      </div>
      {pill && <Bar className="h-5 w-10 rounded-full" />}
    </div>
  )
}

// Screen-reader text for a loading region (the bars themselves are hidden from screen readers)
export function LoadingLabel({ children = 'Loading…' }) {
  return <span className="sr-only" role="status">{children}</span>
}

// 13 Oct (her review: admin and employer pages still said "Loading…"): the same grey bars on every role's pages.
// A white card with a heading and list rows (lists, panels)
export function CardSkeleton({ rows = 4, className = '' }) {
  return (
    <section aria-hidden="true" className={`bg-white rounded-2xl border border-slate-200 ${className}`}>
      <div className="px-5 py-3.5 border-b border-slate-100 space-y-2"><Bar className="h-4 w-40" /><Bar className="h-3 w-56" /></div>
      <div className="px-5 divide-y divide-slate-100">{[...Array(rows)].map((_, i) => <RowSkeleton key={i} />)}</div>
    </section>
  )
}

// Table rows with a grey bar in each cell (goes inside <tbody>)
export function TableRowsSkeleton({ cols, rows = 6 }) {
  return [...Array(rows)].map((_, r) => (
    <tr key={r} aria-hidden="true" className="border-b border-slate-100">
      {[...Array(cols)].map((_, c) => <td key={c} className="px-4 py-3.5"><Bar className={`h-3.5 ${c === 0 ? 'w-44' : c === cols - 1 ? 'w-8' : 'w-20'}`} /></td>)}
    </tr>
  ))
}

// Small number cards in a row (dashboards)
export function StatsSkeleton({ n = 4, className = 'grid grid-cols-2 lg:grid-cols-4 gap-4' }) {
  return (
    <div aria-hidden="true" className={className}>
      {[...Array(n)].map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-slate-200 px-4 py-3.5 space-y-2.5">
          <Bar className="h-3 w-20" /><Bar className="h-6 w-12" /><Bar className="h-3 w-36" />
        </div>
      ))}
    </div>
  )
}
