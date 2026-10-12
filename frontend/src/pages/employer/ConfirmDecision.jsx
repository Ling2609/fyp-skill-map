import { useEffect } from 'react'

// The "are you sure" for Accepted / Rejected (statusChange.jsx): says what the student will see; Esc or a click
// outside cancels; the action button names the action (as ReasonDialog.jsx, Primer)
export default function ConfirmDecision({ app, d, busy, onConfirm, onCancel }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCancel])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30" onMouseDown={() => { if (!busy) onCancel() }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="decide-title" aria-describedby="decide-text"
        onMouseDown={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 pt-5 pb-4">
          <h2 id="decide-title" className="text-base font-semibold text-slate-900">{d.action.replace('Mark as', `Mark ${app.name} as`)}?</h2>
          <p id="decide-text" className="text-sm text-slate-600 mt-1.5 leading-relaxed">
            They will see <b>"{d.see}"</b> for {app.job_title} on their My applications page straight away.{d.extra || ''}
          </p>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl">
          <button type="button" onClick={onCancel} disabled={busy}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="button" autoFocus onClick={onConfirm} disabled={busy}
            className={`px-4 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-40 ${d.danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
            {busy ? 'Saving…' : d.action}
          </button>
        </div>
      </div>
    </div>
  )
}
