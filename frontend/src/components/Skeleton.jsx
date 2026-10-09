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
