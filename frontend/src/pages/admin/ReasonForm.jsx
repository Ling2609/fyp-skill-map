import { useState } from 'react'

// Inline "why?" box for an admin decision (7 Oct; references.md "Deactivating and reactivating accounts"): every
// decision is kept in the account's history. A reason is required to deactivate and to reactivate (GitHub's rule),
// optional to reject an employer. Enter confirms, Esc cancels.
export default function ReasonForm({ action, required, danger, busy, onConfirm, onCancel }) {
  const [reason, setReason] = useState('')
  const ready = !required || reason.trim().length >= 3
  const submit = (e) => { e.preventDefault(); if (ready && !busy) onConfirm(reason.trim()) }
  return (
    <form onSubmit={submit} className="flex flex-wrap items-center justify-end gap-2"
      onKeyDown={e => { if (e.key === 'Escape') onCancel() }}>
      <label className="sr-only" htmlFor={`reason-${action}`}>Reason</label>
      <input id={`reason-${action}`} autoFocus value={reason} onChange={e => setReason(e.target.value)} maxLength={300}
        placeholder={required ? 'Reason (kept in history)' : 'Reason (optional)'}
        className="w-60 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <button type="submit" disabled={!ready || busy}
        className={`px-3 py-1.5 text-xs font-medium rounded-lg text-white disabled:opacity-40 whitespace-nowrap ${
          danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
        {action}
      </button>
      <button type="button" onClick={onCancel}
        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50">
        Cancel
      </button>
    </form>
  )
}
