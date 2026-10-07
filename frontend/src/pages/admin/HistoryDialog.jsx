import { useEffect, useState } from 'react'
import api from '../../api'

// "View history" for one account (7 Oct): every admin decision kept in admin_actions, newest first, with who, when
// and why (OWASP logging: "when, where, who and what"; references.md "Deactivating and reactivating accounts").
// The list itself shows only the status, so rows stay one height; the reasons live here.
const LABEL = { approve: 'Approved', reject: 'Rejected', deactivate: 'Deactivated', reactivate: 'Reactivated' }
const DOT = { approve: 'bg-emerald-600', reactivate: 'bg-emerald-600', reject: 'bg-slate-400', deactivate: 'bg-rose-600' }
const when = (iso) => new Date(iso).toLocaleString('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
})

export default function HistoryDialog({ user, name, onClose }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get(`/admin/users/${user.id}/history`).then(res => setRows(res.data))
      .catch(() => setError("Couldn't load the history. Try again."))
  }, [user.id])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="history-title" onMouseDown={e => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="min-w-0">
            <h2 id="history-title" className="text-base font-semibold text-slate-900 truncate">History · {name}</h2>
            <p className="text-sm text-slate-500 mt-0.5 truncate">{user.email}</p>
          </div>
          <button type="button" autoFocus onClick={onClose} aria-label="Close"
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-2">
          {error && <p role="alert" className="text-sm text-rose-600 py-4">{error}</p>}
          {!error && rows === null && <p className="text-sm text-slate-500 py-4">Loading…</p>}
          {rows?.length === 0 && <p className="text-sm text-slate-500 py-4">No admin decisions on this account yet.</p>}
          {rows?.length > 0 && (
            <ol className="divide-y divide-slate-100">
              {rows.map((r, i) => (
                <li key={i} className="flex gap-3 py-3">
                  <span aria-hidden="true" className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${DOT[r.action] || 'bg-slate-400'}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{LABEL[r.action] || r.action}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{when(r.at)} · by {r.by}</p>
                    {r.reason && <p className="text-sm text-slate-700 mt-1.5 bg-slate-50 rounded-lg px-2.5 py-1.5 break-words">{r.reason}</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  )
}
