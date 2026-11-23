import { useState, useEffect } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import api from '../../api'
import { useAuth } from '../../context/useAuth'
import { AuthShell, AUTH_FIELD, AUTH_TONE, Notice, RevealButton } from '../../components/ui'
import { PressButton } from '../../components/ui'
import { Busy } from '../../components/Spinner'

// Toast: shows the message the previous page passed ("Account created…", "Password changed…"); it used to be
// hard-coded to "Account created!" (4 Oct)
const Toast = ({ message, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 8000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div
      role="status"
      className="fixed inset-x-4 top-4 z-50 mx-auto flex max-w-sm items-start gap-2.5 rounded-tile border border-have/30 bg-card px-3.5 py-2.5 shadow-lifted sm:inset-x-auto sm:right-6 sm:mx-0"
    >
      <span aria-hidden="true" className="mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full bg-have-soft text-have-strong">
        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.6} d="M5 13l4 4L19 7" />
        </svg>
      </span>
      <p className="m-0 min-w-0 flex-1 text-small font-medium leading-snug text-ink-soft">{message}</p>
      <button
        onClick={onClose}
        aria-label="Dismiss"
        className="-mr-1 -mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-chip text-muted transition-colors duration-150 hover:bg-well hover:text-ink-soft"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()
  const [form, setForm] = useState({ email: location.state?.email || '', password: '' })
  const justVerified = location.state?.verified   // 23 Nov: arrived from Check your email
  const expiredReason = new URLSearchParams(location.search).get('expired')
  const sessionExpired = !!expiredReason
  const [error, setError] = useState(!sessionExpired ? ''
    : expiredReason === 'password' ? 'Your password was changed, so you were signed out. Please sign in again.'
    : expiredReason === 'deactivated' ? 'This account has been deactivated. Please contact the career office.'
    : 'Your session has expired. Please sign in again.')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  // 13 Oct: after "Delete my account" the page opens as /login?deleted=1 (a fresh load, so no navigate state)
  const deleted = new URLSearchParams(location.search).get('deleted') === '1'
  const toastMessage = deleted ? 'Your account and its data were deleted.' : location.state?.message
  const [showToast, setShowToast] = useState(!!toastMessage)

  // Show "session expired" once, then tidy the URL so a refresh doesn't show it again
  useEffect(() => {
    if (sessionExpired || deleted) navigate('/login', { replace: true, state: deleted ? { message: toastMessage } : undefined })
  }, [sessionExpired, deleted, toastMessage, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post('/auth/login', form)
      await login(res.data.access_token)
      navigate('/dashboard')
    } catch (err) {
      // 23 Nov: the right password for an account whose email isn't verified yet: back to Check your email
      const d = err.response?.data?.detail
      if (err.response?.status === 403 && d?.code === 'email_not_verified') {
        navigate('/verify-email', { state: { ticket: d.ticket, verification: d.verification, from: 'signin' } })
        return
      }
      setError(err.response?.data?.detail
        || (err.response ? 'Invalid email or password' : "Can't reach the server. Is the backend running?"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      sub="Sign in to see your jobs and skills."
      // 19 Nov: returning people are greeted; on a phone the form comes first
      intro={{ headline: <>Your next step is <em>waiting</em>.</> }}
      formFirst
    >
      {showToast && <Toast message={toastMessage || location.state?.message} onClose={() => setShowToast(false)} />}

      {justVerified && !error && (
        <Notice tone="good"><span role="status"><b>Email verified.</b> Sign in to continue.{location.state?.role === 'employer'
          && ' Next, the career office reviews your company; you can post jobs once they approve it.'}</span></Notice>
      )}

      {error && (
        <p role="alert" className="m-0 rounded-[11px] border border-missing/30 bg-missing-soft px-3.5 py-2.5 text-body leading-snug text-missing-strong">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        {/* 22 Oct (found by the browser tests): each box updates from the latest form (f => ...), so filling both
            at once (a password manager, autofill) no longer empties the other; labels linked for screen readers */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="login-email" className="text-small font-semibold text-ink-soft">Username or Email</label>
          <input
            id="login-email" type="text" autoComplete="username"
            value={form.email}
            onChange={e => { const v = e.target.value; setForm(f => ({ ...f, email: v })) }}
            placeholder="Enter your username or email"
            className={`${AUTH_FIELD} ${AUTH_TONE.idle}`}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="login-password" className="text-small font-semibold text-ink-soft">Password</label>
            <Link to="/forgot-password" className="text-small font-semibold text-accent hover:underline">Forgot password?</Link>
          </div>
          <div className="relative">
            <input
              id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password"
              value={form.password}
              onChange={e => { const v = e.target.value; setForm(f => ({ ...f, password: v })) }}
              className={`${AUTH_FIELD} ${AUTH_TONE.idle} pr-11`}
              placeholder="••••••••"
              required
            />
            <RevealButton shown={showPassword} onToggle={() => setShowPassword(v => !v)} />
          </div>
        </div>

        <PressButton type="submit" disabled={loading} className="mt-1.5">
          {loading ? <Busy>Signing in…</Busy> : 'Sign in'}
        </PressButton>
      </form>

      <div className="mt-1 flex flex-col gap-2 border-t border-line pt-3.5 text-center">
        <p className="m-0 text-small text-muted">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-semibold text-accent hover:underline">Create account</Link>
        </p>
        {/* 14 Oct: the notice can be read at any time, not only at sign-up (NN/g: a link on every entry page) */}
        <p className="m-0">
          <Link to="/privacy" className="text-small text-muted hover:text-accent hover:underline">Privacy notice</Link>
        </p>
      </div>
    </AuthShell>
  )
}
