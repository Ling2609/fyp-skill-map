import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import api from '../../api'
import { useAuth } from '../../context/useAuth'
import { Busy } from '../../components/Spinner'
import { AuthShell, AUTH_FIELD, AUTH_TONE, Notice, PressButton } from '../../components/ui'

// 23 Nov: "Check your email" (her approved mock review/verify-email.html; behaviour in email-verification-spec.md v3).
// Opened after Create account, or after signing in to an account that isn't verified yet. The page gets a
// verification ticket (not a sign-in token) in the navigation state only: a reload or a new tab has none, so it says
// "This page has expired" and sends the owner to Sign in, which brings them back here with a new ticket.
// The right code verifies the email. After Create account the page goes to Sign in with "Email verified";
// 24 Nov (her review): after Sign in (the password was just checked) the server also signs the owner in, so the page
// goes straight to the app instead of asking for the password a second time.

const clock = (iso) => {
  if (!iso) return ''
  const d = new Date(iso), today = new Date()
  const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (d.toDateString() === today.toDateString()) return t
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  return d.toDateString() === tomorrow.toDateString() ? `${t} tomorrow` : `${t} on ${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}`
}
const secondsUntil = (iso) => (iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 1000)) : 0)
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export default function VerifyEmail() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const { state: nav } = useLocation()
  const ticket = nav?.ticket
  const fromSignIn = nav?.from === 'signin'
  const [v, setV] = useState(nav?.verification || {})          // what the server last said about sending
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [expired, setExpired] = useState(!ticket)
  const [busy, setBusy] = useState('')                            // '' | 'verify' | 'resend'
  const [wait, setWait] = useState(() => secondsUntil(nav?.verification?.next_send_at))
  const [announce, setAnnounce] = useState('')
  const codeRef = useRef(null)
  const headRef = useRef(null)

  const employer = v.role === 'employer'
  const usable = !!v.expires_at && new Date(v.expires_at) > new Date()
  const daily = v.limit === 'daily'

  // countdown to the next allowed send (cooldown or daily limit), from the server's own time
  useEffect(() => {
    if (!v.next_send_at) return undefined
    const tick = () => setWait(secondsUntil(v.next_send_at))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [v.next_send_at])

  // focus after every state change: the code box when it can be used, otherwise the heading
  useEffect(() => {
    if (!expired && usable) codeRef.current?.focus()
    else headRef.current?.focus()
  }, [expired, usable, v.sent_at])

  const pageExpired = () => { setExpired(true); setError('') }

  const verify = async (e) => {
    e.preventDefault()
    if (code.length !== 6) { setError('Enter the 6-digit code from the email.'); codeRef.current?.focus(); return }
    setBusy('verify'); setError('')
    try {
      const r = await api.post('/auth/verify-email', { ticket, code })
      if (r.data.access_token) {          // came from Sign in: signed in now
        await login(r.data.access_token)
        navigate('/dashboard', { replace: true })
      } else {
        navigate('/login', { replace: true, state: { verified: true, role: r.data.role, email: v.email } })
      }
    } catch (err) {
      const d = err.response?.data?.detail
      if (err.response?.status === 409) {
        navigate('/login', { replace: true, state: { verified: true, role: v.role, email: v.email } })
      } else if (typeof d === 'string' && err.response?.status === 400) {
        pageExpired()                       // only the ticket check answers with plain text
      } else if (d && typeof d === 'object') {
        if (d.tries_left === 0) {           // this code can't be used any more: offer a new one
          setV(x => ({ ...x, expires_at: null }))
          setError("This code can't be used any more (too many wrong tries, or it expired). Send a new code.")
        } else {
          setError(`That code isn't right, or it has expired. ${d.tries_left} ${d.tries_left === 1 ? 'try' : 'tries'} left for this code.`)
          codeRef.current?.select()
        }
      } else {
        setError(err.response ? 'Something went wrong. Please try again.' : "Can't reach the server. Is the backend running?")
      }
    } finally {
      setBusy('')
    }
  }

  const resend = async () => {
    setBusy('resend'); setError(''); setAnnounce('')
    try {
      const r = await api.post('/auth/verify-email/resend', { ticket })
      setV(r.data)
      if (r.data.result === 'sent') { setCode(''); setAnnounce('A new code is on its way. Check your email.') }
    } catch (err) {
      if (err.response?.status === 400) pageExpired()
      else setError(err.response ? 'Something went wrong. Please try again.' : "Can't reach the server. Is the backend running?")
    } finally {
      setBusy('')
    }
  }

  if (expired) {
    return (
      <AuthShell title={<span ref={headRef} tabIndex={-1} className="outline-none">This page has expired</span>}
        sub="For your security, a verification page lasts 30 minutes and can't be reopened."
        intro={{ headline: <>One last step: <em>your email</em>.</> }} formFirst>
        <Notice tone="info" icon><span>Sign in again with your username and password, and we&apos;ll bring you back here to finish.</span></Notice>
        <Link to="/login" className="grid h-12.5 place-items-center rounded-x1 bg-accent font-display text-[16px] font-bold text-white no-underline hover:bg-accent-strong">Sign in</Link>
      </AuthShell>
    )
  }

  // the note under the heading: what just happened
  const r = v.result
  const note =
    r === 'send_failed' ? { tone: 'bad', role: 'alert', text: <>Couldn&apos;t send the email. Try again in a minute.{usable && <> Your previous code still works until <b>{clock(v.expires_at)}</b>.</>}</> }
    : r === 'store_failed' ? { tone: 'bad', role: 'alert', text: <>Something went wrong, so the code we just emailed won&apos;t work. Use <b>Send again</b> in a minute, or sign in again.</> }
    : daily ? { tone: 'warn', role: 'status', text: <>You&apos;ve asked for 5 codes in the last 24 hours. You can ask again at <b>{clock(v.next_send_at)}</b>.{usable && <> Your latest code still works until <b>{clock(v.expires_at)}</b>.</>}</> }
    : fromSignIn ? { tone: 'warn', role: 'status', text: <>You need to verify your email before you can sign in. {r === 'sent' ? 'We sent a new code just now.' : usable ? <>Your code from <b>{clock(v.sent_at)}</b> still works, so we didn&apos;t send another.</> : ''}</> }
    : r === 'reused' ? { tone: 'info', role: 'status', text: <>Your code from <b>{clock(v.sent_at)}</b> still works, so we didn&apos;t send another.</> }
    : employer ? { tone: 'info', role: 'status', text: <>After you verify, the career office reviews your company. Until it&apos;s approved, you can sign in but not post jobs.</> }
    : null
  const steps = employer ? ['Account details', 'Verify email', 'Career office review'] : ['Account details', 'Verify email']

  return (
    <AuthShell
      title={<span ref={headRef} tabIndex={-1} className="outline-none">{fromSignIn ? 'Verify your email first' : 'Check your email'}</span>}
      sub={<>We sent a 6-digit code to <span className="inline-flex max-w-full rounded-full bg-well px-2.5 py-0.5 font-semibold text-ink wrap-anywhere">{v.email}</span></>}
      steps={steps} step={1}
      intro={{ headline: <>One last step: <em>your email</em>.</>, story: employer ? 'e' : 's' }}
      formFirst
    >
      {note && <Notice tone={note.tone} icon><span role={note.role}>{note.text}</span></Notice>}
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>

      <form onSubmit={verify} noValidate className="flex flex-col gap-1.5">
        <label htmlFor="verify-code" className="text-small font-semibold text-ink-soft">6-digit code</label>
        <input
          ref={codeRef} id="verify-code" type="text" inputMode="numeric" autoComplete="one-time-code"
          value={code} disabled={!usable}
          // no maxLength: a pasted "123 456" or "123-456" is cleaned first, then cut to 6
          onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }}
          aria-invalid={!!error || undefined} aria-describedby={`verify-times${error ? ' verify-err' : ''}`}
          className={`${AUTH_FIELD} ${error ? AUTH_TONE.bad : AUTH_TONE.idle} h-14.5 text-center font-mono text-[26px] tracking-[0.5em] disabled:bg-well disabled:text-faint`}
        />
        {error && <p id="verify-err" role="alert" className="m-0 text-small font-bold text-missing-strong">{error}</p>}
        <div id="verify-times" className="mb-2 flex flex-wrap justify-between gap-x-3 text-small text-muted">
          {usable
            ? <><span>Sent at <b className="text-ink">{clock(v.sent_at)}</b></span><span>Works until <b className="text-ink">{clock(v.expires_at)}</b> ({v.minutes || 10} minutes)</span></>
            : <span>This code can&apos;t be used any more. Send a new one: it works for {v.minutes || 10} minutes.</span>}
        </div>
        {usable && (
          <PressButton type="submit" disabled={busy === 'verify'}>
            {busy === 'verify' ? <Busy>Checking…</Busy> : 'Verify email'}
          </PressButton>
        )}
      </form>

      {!usable && !daily && (
        <PressButton type="button" onClick={resend} disabled={busy === 'resend' || wait > 0}>
          {busy === 'resend' ? <Busy>Sending…</Busy> : wait > 0 ? `Send a new code in ${mmss(wait)}` : 'Send a new code'}
        </PressButton>
      )}
      {usable && !daily && (
        <p className="m-0 flex flex-wrap items-center justify-center gap-x-2 text-center text-body text-muted">
          Didn&apos;t get it? Check your spam folder, or
          <button type="button" onClick={resend} disabled={busy === 'resend' || wait > 0}
            className="font-bold text-accent underline underline-offset-[3px] disabled:text-faint disabled:no-underline">
            {busy === 'resend' ? 'Sending…' : wait > 0 ? `Send again in ${mmss(wait)}` : 'Send again'}
          </button>
        </p>
      )}
      {daily && <p className="m-0 text-center text-body text-muted">New codes paused until {clock(v.next_send_at)}.</p>}

      <p className="m-0 border-t border-line pt-3.5 text-center text-small text-muted">
        Already verified? <Link to="/login" className="font-semibold text-accent hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  )
}
