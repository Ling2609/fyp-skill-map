import { useEffect, useState } from 'react'
import api from '../api'
import { useAuth } from '../context/useAuth'
import { VERSIONS } from '../pages/privacyText'
import { Busy } from './Spinner'

// 21 Oct (her pick "2+3"; references.md "Telling users the privacy notice changed"): a student who agreed to an older
// privacy notice is told what changed, once per visit, in a pop-up devoted to the change ("actively brought to the
// attention of the data subject", WP260). "I agree" records the new version; "Not now" closes it until the next visit,
// and a small reminder stays in the sidebar (a strip at the top would push every full-height page down a line).
// Not rude on purpose (her review): the new items are optional, so it says so; no "or delete your account".
const CONTACT = import.meta.env.VITE_PRIVACY_CONTACT || 'careers@university.example'
const LATEST = VERSIONS[0]
const NOT_NOW = 'privacyNotNow'          // sessionStorage: "Not now" for this visit only
export const PRIVACY_REVIEW = 'privacy-review'

const stale = (user) => user?.role === 'student' && user.privacy_version !== LATEST.date
const skipped = () => { try { return sessionStorage.getItem(NOT_NOW) === LATEST.date } catch { return false } }

export default function PrivacyUpdate() {
  const { user, setUser } = useAuth()
  const [open, setOpen] = useState(() => stale(user) && !skipped())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const show = () => setOpen(true)
    window.addEventListener(PRIVACY_REVIEW, show)
    return () => window.removeEventListener(PRIVACY_REVIEW, show)
  }, [])
  if (!stale(user) || !open) return null

  const later = () => { try { sessionStorage.setItem(NOT_NOW, LATEST.date) } catch { /* blocked: asked again next page load */ } setOpen(false) }
  const agree = () => {
    setBusy(true); setError('')
    api.post('/auth/me/privacy', { version: LATEST.date })
      .then(res => setUser(u => ({ ...u, ...res.data })))
      .catch(err => setError(err.response?.data?.detail || "Couldn't save. Please try again."))
      .finally(() => setBusy(false))
  }
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/30 flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="pn-title" className="w-full max-w-[38rem] bg-white rounded-2xl shadow-xl p-7">
        <h2 id="pn-title" className="text-lg font-semibold text-slate-900">We updated our privacy notice</h2>
        <p className="text-sm text-slate-500">{LATEST.label.en}</p>
        <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
          <p className="text-xs font-semibold text-slate-600">What's new</p>
          <p className="text-sm text-slate-800 mt-1">{LATEST.changes.en}</p>
        </div>
        <p className="text-sm text-slate-600 mt-3">Everything else is the same.{' '}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-blue-700 hover:underline">Read the full notice ↗</a></p>
        <p className="text-sm text-slate-600 mt-2">All of these are optional. If you'd rather not share them, just leave them empty.
          Questions? Email the career office at <a href={`mailto:${CONTACT}`} className="text-blue-700 hover:underline">{CONTACT}</a>.</p>
        {error && <p role="alert" className="text-sm text-rose-700 bg-rose-50 rounded-lg px-3 py-2 mt-3">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={later} className="text-sm font-medium text-slate-700 border border-slate-300 rounded-lg px-4 py-2 hover:bg-slate-50">Not now</button>
          <button type="button" onClick={agree} disabled={busy} autoFocus className="text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg px-5 py-2 disabled:opacity-50">
            {busy ? <Busy>Saving…</Busy> : 'I agree'}</button>
        </div>
      </div>
    </div>
  )
}

// The reminder in the sidebar while the new notice isn't agreed to yet (after "Not now")
export function PrivacyReminder({ collapsed }) {
  const { user } = useAuth()
  if (!stale(user)) return null
  const review = () => window.dispatchEvent(new Event(PRIVACY_REVIEW))
  return collapsed ? (
    <button type="button" onClick={review} title="Privacy notice updated: review" aria-label="Privacy notice updated: review"
      className="mx-auto mb-2 w-8 h-8 rounded-lg bg-blue-50 text-blue-700 text-sm font-semibold">i</button>
  ) : (
    <div className="mx-2 mb-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2">
      <p className="text-xs text-blue-900"><b className="font-semibold">Privacy notice updated</b> on {LATEST.label.en}.</p>
      <button type="button" onClick={review} className="text-xs font-medium text-blue-700 hover:underline">Review and agree</button>
    </div>
  )
}
