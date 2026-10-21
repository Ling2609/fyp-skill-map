import { useEffect, useState } from 'react'
import ReasonPicker from './ReasonPicker'
import { reasonOk } from './reasons'
import { Busy } from '../../components/Spinner'

// The "are you sure" for Accepted / Rejected (statusChange.jsx): says what the student will see; Esc or a click
// outside cancels; the action button names the action (as ReasonDialog.jsx, Primer).
// 14 Oct (transparency flow): Rejected also offers a reason (ReasonPicker). title / see override the wording for
// several applicants at once (Applicants.jsx). onConfirm({ reason, note })
export default function ConfirmDecision({ app, d, busy, onConfirm, onCancel, title, text }) {
  const [why, setWhy] = useState({ reason: null, note: '' })
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
          <h2 id="decide-title" className="text-base font-semibold text-slate-900">{title || `${d.action.replace('Mark as', `Mark ${app.name} as`)}?`}</h2>
          <p id="decide-text" className="text-sm text-slate-600 mt-1.5 leading-relaxed">
            {text || <>They will see <b>"{d.see}"</b> for {app.job_title} on their My Applications page straight away.{d.extra || ''}</>}
          </p>
          {d.danger && <div className="mt-4"><ReasonPicker value={why} onChange={setWhy} /></div>}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 bg-slate-50 border-t border-slate-200 rounded-b-2xl">
          <button type="button" onClick={onCancel} disabled={busy}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="button" autoFocus={!d.danger} onClick={() => onConfirm(why)} disabled={busy || !reasonOk(why)}
            className={`px-4 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-40 ${d.danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
            {busy ? <Busy>Saving…</Busy> : d.action}
          </button>
        </div>
      </div>
    </div>
  )
}
