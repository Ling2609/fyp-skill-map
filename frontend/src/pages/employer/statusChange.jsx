import { useEffect, useRef, useState } from 'react'
import api from '../../api'
import { ADMIN_COUNTS_CHANGED } from '../../components/Sidebar'
import { errText } from '../student/profileUtils'
import ConfirmDecision from './ConfirmDecision'

// Changing an applicant's status with clear feedback (12 Oct, her review: the status changed with nothing said).
// Research (references.md "Status change feedback"): ask first only when the change is serious, and for a change
// that is easy to take back, do it at once and offer Undo. Accepted and Rejected are what the student is waiting
// for, so they ask first and say what the student will see; Shortlisted and back to Applied happen at once with a
// toast and Undo (Undo removes the change, so the student's progress doesn't show it).
const DECISION = {
  rejected: { see: 'Not selected', action: 'Mark as Rejected', danger: true },
  accepted: { see: 'Accepted', action: 'Mark as Accepted', extra: ' Email them to arrange the next step.' },
}
const DONE = {
  applied: (n) => `${n} is back to Applied.`,
  shortlisted: (n) => `${n} shortlisted. They see "Shortlisted" on My Applications.`,
  accepted: (n) => `${n} marked Accepted. They see "Accepted" on My Applications.`,
  rejected: (n) => `${n} marked Rejected. They see "Not selected" on My Applications.`,
}

// app: { id, name, status, job_title }; onSaved(id, { status, status_changed_at })
export function useStatusChange(onSaved) {
  const [ask, setAsk] = useState(null)          // { app, next }
  const [toast, setToast] = useState(null)      // { text, undo: { app, prev } | null, error }
  const [busy, setBusy] = useState(null)        // application id being saved
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])
  const show = (t) => {
    clearTimeout(timer.current)
    setToast(t)
    timer.current = setTimeout(() => setToast(null), t.undo ? 8000 : 5000)
  }
  const save = (app, status, undo = false, why = {}) => {
    setBusy(app.id)
    return api.patch(`/employer/applications/${app.id}`, { status, undo, ...why })
      .then(res => { onSaved(app.id, res.data); window.dispatchEvent(new Event(ADMIN_COUNTS_CHANGED)); return res.data })
      .catch(err => { show({ text: errText(err, "Couldn't change the status. Try again."), error: true }); throw err })
      .finally(() => setBusy(null))
  }
  const request = (app, next) => {
    if (next === app.status) return
    if (DECISION[next]) { setAsk({ app, next }); return }
    const prev = app.status
    save(app, next).then(() => show({ text: DONE[next](app.name), undo: { app: { ...app, status: next }, prev } })).catch(() => {})
  }
  const confirm = (why) => {
    const { app, next } = ask
    save(app, next, false, next === 'rejected' ? why : {}).then(() => { setAsk(null); show({ text: DONE[next](app.name) }) }).catch(() => setAsk(null))
  }
  const undo = () => {
    const { app, prev } = toast.undo
    setToast(null)
    save(app, prev, true).then(() => show({ text: `Undone: ${app.name} is back to ${prev === 'applied' ? 'Applied' : prev[0].toUpperCase() + prev.slice(1)}.` })).catch(() => {})
  }

  const ui = (
    <>
      {ask && <ConfirmDecision app={ask.app} d={DECISION[ask.next]} busy={busy === ask.app.id} onConfirm={confirm} onCancel={() => setAsk(null)} />}
      {toast && (
        <div role={toast.error ? 'alert' : 'status'}
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-5 rounded-xl px-4 py-3 text-sm shadow-lg ${
            toast.error ? 'bg-rose-700 text-white' : 'bg-slate-900 text-white'}`}>
          <span>{toast.text}</span>
          {toast.undo && <button onClick={undo} className="font-semibold text-blue-300 hover:text-blue-200">Undo</button>}
          <button onClick={() => setToast(null)} aria-label="Close" className="text-slate-500 hover:text-white">×</button>
        </div>
      )}
    </>
  )
  return { request, busy, ui }
}
