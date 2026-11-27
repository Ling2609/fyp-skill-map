import { useEffect, useState } from 'react'
import api from '../api'
import { useAuth } from '../context/useAuth'
import { VERSIONS } from '../pages/privacyText'
import { Busy } from './Spinner'
import { NewRays } from './NewTag'

// 21 Oct (her pick "2+3"; references.md "Telling users the privacy notice changed"): a student who agreed to an older
// privacy notice is told what changed, once per visit, in a pop-up devoted to the change ("actively brought to the
// attention of the data subject", WP260). "I agree" records the new version; "Not now" closes it until the next visit,
// and a banner stays in the Dashboard's header until they agree.
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
      {/* 27 Nov (phone pass, so every screen reads the same on a phone): full width, scrolls inside if the text is
          long, and the buttons stack at 44px so a thumb can hit them */}
      <div role="dialog" aria-modal="true" aria-labelledby="pn-title"
        className="w-full max-w-152 max-h-[calc(100dvh-2rem)] overflow-y-auto bg-white rounded-2xl shadow-xl p-5 sm:p-7">
        <h2 id="pn-title" className="text-base sm:text-lg font-semibold text-slate-900">We updated our privacy notice</h2>
        <p className="text-sm text-slate-500">{LATEST.label.en}</p>
        <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
          {/* 27 Nov (her review): the mark alone, after the words and turned the same way as the Contents mark,
              so the pop-up and the notice page read alike */}
          <p className="flex items-center gap-1.5 text-xs font-semibold text-accent-strong">
            What's new<NewRays mirrored className="h-3 w-3" /></p>
          <p className="text-sm text-slate-800 mt-1">{LATEST.changes.en}</p>
        </div>
        <p className="text-sm text-slate-600 mt-3">Everything else is the same.{' '}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-blue-700 underline underline-offset-2">Read the full notice ↗</a></p>
        {/* 27 Nov: the "all optional" line belongs to a version that added optional fields (21 Oct), not to every update */}
        <p className="text-sm text-slate-600 mt-2">{LATEST.note?.en && <>{LATEST.note.en}{' '}</>}Questions? Email the career office at <a href={`mailto:${CONTACT}`} className="text-blue-700 underline underline-offset-2">{CONTACT}</a>.</p>
        {error && <p role="alert" className="text-sm text-rose-700 bg-rose-50 rounded-lg px-3 py-2 mt-3">{error}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={later}
            className="min-h-11 w-full sm:w-auto text-sm font-medium text-slate-700 border border-slate-300 rounded-lg px-4 py-2 hover:bg-slate-50">Not now</button>
          <button type="button" onClick={agree} disabled={busy} autoFocus
            className="min-h-11 w-full sm:w-auto text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg px-5 py-2 disabled:opacity-50">
            {busy ? <Busy>Saving…</Busy> : 'I agree'}</button>
        </div>
      </div>
    </div>
  )
}

// 21 Oct (her review: the sidebar box was easy to miss): after "Not now", a banner in the Dashboard's header, in the
// empty space to the right of the greeting, so it adds no height and pages still fit the screen
export function PrivacyBanner() {
  const { user } = useAuth()
  if (!stale(user)) return null
  return (
    <div role="status" className="flex items-center gap-x-3 rounded-xl bg-partial-soft border border-partial/45 px-3 py-2 sm:px-4 sm:py-2.5 text-sm">
      {/* a phone keeps this to one line: the date and the summary are for wider screens, where there is room for them */}
      <p className="min-w-0 flex-1 text-partial-strong"><b className="font-semibold">Privacy notice updated</b>
        <span className="hidden sm:inline"> on {LATEST.label.en}: {LATEST.short}</span></p>
      {/* 27 Nov (her review): looks like a button, so it is obviously clickable */}
      <button type="button" onClick={() => window.dispatchEvent(new Event(PRIVACY_REVIEW))}
        className="shrink-0 rounded-lg border border-partial/60 bg-white px-3 py-1 text-xs font-semibold text-partial-strong shadow-card transition hover:bg-partial-soft active:translate-y-px sm:px-3.5 sm:py-1.5 sm:text-sm">
        Review and agree</button>
    </div>
  )
}
