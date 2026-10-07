import { useEffect, useState } from 'react'

// Pop-up for an admin decision that needs a "why" (7 Oct, her review: the in-row box was cramped). Research
// (references.md "Admin decision pop-up"): Carbon uses a danger modal for destructive actions and allows form
// inputs in it; Primer says to state the consequence and name the button after the action ("Deactivate account",
// not "Yes"). Cancel on the left, the action on the right (Carbon). Every decision is kept in the account's history:
// a reason is required to deactivate and to reactivate, optional to reject. Esc or a click outside cancels.
// decision: one of DECISIONS (decisions.js); name: the account's name or company
export default function ReasonDialog({ decision, name, busy, error, onConfirm, onCancel }) {
  const { title, message, example, action, required, danger } = decision
  const [reason, setReason] = useState('')
  const ready = !required || reason.trim().length >= 3
  const submit = (e) => { e.preventDefault(); if (ready && !busy) onConfirm(reason.trim()) }

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30"
      onMouseDown={() => { if (!busy) onCancel() }}>
      <form role="dialog" aria-modal="true" aria-labelledby="reason-title" onSubmit={submit}
        onMouseDown={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 pt-5">
          <h2 id="reason-title" className="text-base font-semibold text-slate-900">{title(name)}</h2>
          <p className="text-sm text-slate-600 mt-1.5">{message}</p>
          <label htmlFor="reason" className="block text-sm font-medium text-slate-700 mt-4 mb-1.5">
            Reason {required ? '' : <span className="font-normal text-slate-500">(optional)</span>}
          </label>
          <textarea id="reason" autoFocus rows={3} maxLength={300} value={reason} onChange={e => setReason(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) submit(e) }}
            placeholder={`e.g. ${example}`}
            className="w-full resize-none px-3 py-2 text-sm border border-slate-300 rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <p className="text-xs text-slate-500 mt-1 flex justify-between">
            <span>Kept in the account's history.</span>
            <span className="tabular-nums">{reason.length}/300</span>
          </p>
          {error && <p role="alert" className="text-sm text-rose-600 mt-2">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 mt-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl">
          <button type="button" onClick={onCancel} disabled={busy}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={!ready || busy}
            className={`px-4 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-40 ${
              danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
            {busy ? 'Saving…' : action}
          </button>
        </div>
      </form>
    </div>
  )
}
