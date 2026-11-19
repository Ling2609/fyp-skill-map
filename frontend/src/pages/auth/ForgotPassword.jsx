import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../../api'
import PasswordStrength from '../../components/PasswordStrength'
import { Busy } from '../../components/Spinner'
import { AuthShell, AUTH_FIELD, PressButton, Field, Input, Notice } from '../../components/ui'

// Forgot password (4 Oct; OWASP Forgot Password Cheat Sheet + OTP screen patterns, references.md).
// Step 1: username or email -> a 6-digit code is emailed. Step 2: the code is checked. Step 3: new password.
// The page never says whether the account exists (OWASP): it shows what the student typed, not the account's email.
// Resend: a 60-second countdown that turns into a "Resend code" button (the backend allows one code a minute).

const RESEND_SECONDS = 60
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/                        // something@something.something
const USERNAME_SHAPE = /^[a-zA-Z0-9][a-zA-Z0-9._]{1,28}[a-zA-Z0-9]$/      // Register's username rule

const STEPS = ['Your account', 'The code', 'New password']
const STEP_OF = { ask: 0, code: 1, password: 2 }

const errorText = (err) => {
  const detail = err.response?.data?.detail
  if (Array.isArray(detail)) return (detail[0]?.msg || 'Please check the form').replace(/^Value error, /, '')
  return detail || (err.response ? 'Something went wrong. Please try again.' : "Can't reach the server. Is the backend running?")
}

export default function ForgotPassword() {
  const navigate = useNavigate()
  const [step, setStep] = useState('ask')        // 'ask' | 'code' | 'password'
  const [form, setForm] = useState({ identifier: '', code: '', new_password: '', confirm: '' })
  const [resetToken, setResetToken] = useState('')  // from a correct code; lets step 3 set the password
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendAt, setResendAt] = useState(0)   // time (ms) when "Resend code" is allowed again
  const [now, setNow] = useState(() => Date.now())
  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }))

  // Counted from a fixed end time, so it stays right even if the tab was in the background (browsers slow timers there)
  useEffect(() => {
    if (resendAt <= Date.now()) return
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [resendAt])
  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000))

  const sendCode = async (e) => {
    e?.preventDefault()
    setError('')
    // Format only, same rules as Register: says nothing about whether the account exists
    const ident = form.identifier.trim()
    if (!(EMAIL_SHAPE.test(ident) || USERNAME_SHAPE.test(ident))) { setError('Enter a valid username or email.'); return }
    setLoading(true)
    try {
      await api.post('/auth/forgot-password', { identifier: form.identifier.trim() })
      setForm(f => ({ ...f, code: '' }))
      setStep('code')
      setResendAt(Date.now() + RESEND_SECONDS * 1000)
      setNow(Date.now())
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoading(false)
    }
  }

  const verifyCode = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post('/auth/verify-reset-code', { identifier: form.identifier.trim(), code: form.code })
      setResetToken(res.data.reset_token)
      setStep('password')
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoading(false)
    }
  }

  const resetPassword = async (e) => {
    e.preventDefault()
    setError('')
    if (form.new_password !== form.confirm) { setError("The passwords don't match."); return }
    setLoading(true)
    try {
      await api.post('/auth/reset-password', { reset_token: resetToken, new_password: form.new_password })
      navigate('/login', { state: { message: 'Password changed. Sign in with your new password.' } })
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoading(false)
    }
  }

  const changeAccount = () => { setStep('ask'); setError('') }
  const countdown = `${Math.floor(wait / 60)}:${String(wait % 60).padStart(2, '0')}`

  const HEAD = {
    ask: { title: 'Reset password', sub: "We'll email you a 6-digit code." },
    code: { title: 'Enter the code', sub: 'It expires 15 minutes after it was sent.' },
    password: { title: 'New password', sub: 'Code verified. Choose a new password.' },
  }[step]

  return (
    <AuthShell
      title={HEAD.title}
      sub={HEAD.sub}
      steps={STEPS}
      step={STEP_OF[step]}
      intro={{ headline: <>Pick up where you <em>left off</em>.</> }}
      formFirst
    >
      {step === 'ask' && (
        <>
          {error && <Notice tone="bad"><span role="alert">{error}</span></Notice>}
          <form onSubmit={sendCode} className="flex flex-col gap-4">
            <Field label="Username or Email" id="fp-identifier" required>
              <Input id="fp-identifier" type="text" value={form.identifier} onChange={set('identifier')}
                placeholder="Enter your username or email" required autoFocus />
            </Field>
            <PressButton type="submit" disabled={loading} className="w-full">
              {loading ? <Busy>Sending…</Busy> : 'Send code'}
            </PressButton>
          </form>
        </>
      )}

      {step === 'code' && (
        <>
          <p className="m-0 text-small leading-relaxed text-muted">
            If <span className="font-medium text-ink">{form.identifier.trim()}</span> has a SkillMap account, we&apos;ve emailed it a code.{' '}
            <button type="button" onClick={changeAccount} className="font-medium text-accent hover:underline">Change</button>
          </p>
          {error && <Notice tone="bad"><span role="alert">{error}</span></Notice>}
          <form onSubmit={verifyCode} className="flex flex-col gap-4">
            <Field label="Code" id="fp-code" required hint="Expires in 15 minutes · one code a minute">
              <input
                id="fp-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value.replace(/\D/g, '') }))}
                className={`${AUTH_FIELD} tabular tracking-[0.4em]`} placeholder="000000" required autoFocus
              />
            </Field>
            <PressButton type="submit" disabled={loading || form.code.length !== 6} className="w-full">
              {loading ? <Busy>Checking…</Busy> : 'Verify'}
            </PressButton>
          </form>
          <p className="m-0 border-t border-line pt-3.5 text-center text-small">
            {wait > 0
              ? <span className="text-muted">Resend code in <span className="tabular text-ink-soft">{countdown}</span></span>
              : <button type="button" onClick={sendCode} disabled={loading} className="font-medium text-accent hover:underline">Resend code</button>}
          </p>
        </>
      )}

      {step === 'password' && (
        <>
          {error && <Notice tone="bad"><span role="alert">{error}</span></Notice>}
          <form onSubmit={resetPassword} className="flex flex-col gap-4">
            <Field label="New password" id="fp-password" required>
              <input
                id="fp-password" type="password" autoComplete="new-password" value={form.new_password}
                onChange={set('new_password')} className={AUTH_FIELD} required autoFocus
              />
            </Field>
            <PasswordStrength password={form.new_password}
              {...(EMAIL_SHAPE.test(form.identifier.trim()) ? { email: form.identifier.trim() } : { username: form.identifier.trim() })} />
            <Field label="Confirm password" id="fp-confirm" required>
              <input
                id="fp-confirm" type="password" autoComplete="new-password" value={form.confirm}
                onChange={set('confirm')} className={AUTH_FIELD} required
              />
            </Field>
            <PressButton type="submit" disabled={loading} className="w-full">
              {loading ? <Busy>Saving…</Busy> : 'Change password'}
            </PressButton>
          </form>
        </>
      )}

      <p className="m-0 border-t border-line pt-3.5 text-center text-small text-muted">
        <Link to="/login" className="font-medium text-accent hover:underline">Back to sign in</Link>
      </p>
    </AuthShell>
  )
}
