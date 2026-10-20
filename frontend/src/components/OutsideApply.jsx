import { Link } from 'react-router-dom'

// The two parts of the outside-application question (logic in useOutsideApplication.js).
// Under the Apply button
export function OutsideStatus({ o }) {
  if (o.rec) {
    return (
      <p className="text-xs text-emerald-700">
        ✓ You recorded applying · <Link to="/applications" state={{ from: 'Job Detail' }} className="font-medium underline underline-offset-2">My Applications</Link>
      </p>
    )
  }
  // 20 Oct (her review): not while the question is showing (it asked the same thing twice), and worded so it reads as
  // a way to record an earlier application, not as a second button next to Apply
  if (o.asking) return null
  return (
    <button type="button" onClick={o.record} disabled={o.busy}
      className="text-xs text-slate-500 hover:text-blue-700 disabled:opacity-40">
      Already applied? <span className="font-medium text-blue-700 underline underline-offset-2">Record it</span>
    </button>
  )
}

// The question, in the job header
export function OutsideBanner({ o, site, company }) {
  if (!o.asking || o.rec) return null
  return (
    <div className="mt-4">
      <div role="region" aria-label="Did you apply?" className="flex flex-wrap items-center justify-between gap-3 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
        <p className="text-sm text-slate-800">Did you apply on {site || 'the employer\'s site'}?</p>
        <div className="flex gap-2">
          <button type="button" onClick={o.record} disabled={o.busy}
            className="text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg px-3 py-1.5 disabled:opacity-40">Yes, I applied</button>
          <button type="button" onClick={o.notYet}
            className="text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg px-3 py-1.5">Not yet</button>
        </div>
      </div>
      <p className="text-xs text-slate-500 mt-1.5">It goes in your My Applications. Only you see it: {company || 'the employer'} won't see or update it.</p>
    </div>
  )
}
