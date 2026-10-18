// An application's progress, Applied -> Viewed -> Shortlisted -> Decision, each with its date (12 Oct). Used on
// My Applications and Job Detail. A step passed over (not selected without a shortlist) is an empty circle with "—"
// (12 Oct, her review: "Shortlisted: skipped" read oddly).
const fmtDay = (iso) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''

export default function ApplicationSteps({ steps, decided }) {
  return (
    <ol className="flex items-start mt-4" aria-label="Progress">
      {steps.map((s, i) => {
        const done = !!s.at
        const skipped = !done && decided && s.key !== 'decision'     // e.g. not selected without a shortlist
        const last = steps.findLastIndex(x => x.at) === i
        return (
          <li key={s.key} className="flex-1 flex flex-col items-center text-center relative">
            {i > 0 && <span aria-hidden="true" className={`absolute top-2.75 right-1/2 w-full h-0.5 ${done || skipped ? 'bg-blue-500' : 'bg-slate-200'}`} />}
            <span aria-hidden="true" className={`relative z-1 w-6 h-6 rounded-full border-2 flex items-center justify-center text-[11px] text-white ${
              done ? 'bg-blue-600 border-blue-600' : skipped ? 'bg-white border-slate-300' : 'bg-white border-slate-300'}`}>{done ? '✓' : ''}</span>
            <span className={`text-xs mt-1.5 ${last ? 'font-semibold text-slate-900' : done ? 'text-slate-600' : 'text-slate-400'}`}>
              {s.label}
            </span>
            <span className="text-[11px] text-slate-400">{done ? fmtDay(s.at) : skipped ? '—' : ''}</span>
            <span className="sr-only">{done ? `done ${fmtDay(s.at)}` : skipped ? 'skipped' : 'not yet'}</span>
          </li>
        )
      })}
    </ol>
  )
}

