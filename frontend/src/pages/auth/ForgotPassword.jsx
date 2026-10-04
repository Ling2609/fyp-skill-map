import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../../api'

// Forgot password (4 Oct; OWASP Forgot Password Cheat Sheet + OTP screen patterns, references.md).
// Step 1: username or email -> a 6-digit code is emailed. Step 2: the code is checked. Step 3: new password.
// The page never says whether the account exists (OWASP): it shows what the student typed, not the account's email.
// Resend: a 60-second countdown that turns into a "Resend code" button (the backend allows one code a minute).

const RESEND_SECONDS = 60
const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

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
    if (form.new_password !== form.confirm) { setError('Passwords do not match.'); return }
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

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">

        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 bg-blue-700 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <span className="text-lg font-bold text-gray-900">SkillMap</span>
        </div>

        {step === 'ask' ? (
          <>
            <h1 className="text-2xl font-bold text-gray-900 leading-tight">Reset password</h1>
            <p className="text-gray-500 text-sm mt-1 mb-6">We&apos;ll email you a 6-digit code.</p>
            {error && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg mb-4">{error}</div>}
            <form onSubmit={sendCode} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username or Email</label>
                <input type="text" value={form.identifier} onChange={set('identifier')} className={inputClass}
                  placeholder="Enter your username or email" required autoFocus />
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-blue-700 text-white py-2.5 rounded-lg font-medium hover:bg-blue-800 transition disabled:opacity-50">
                {loading ? 'Sending…' : 'Send code'}
              </button>
            </form>
          </>
        ) : step === 'code' ? (
          <>
            <h1 className="text-2xl font-bold text-gray-900 leading-tight">Enter the code</h1>
            <p className="text-gray-500 text-sm mt-1 mb-6">
              If <span className="font-medium text-gray-800">{form.identifier.trim()}</span> has a SkillMap account, we&apos;ve emailed it a code.{' '}
              <button type="button" onClick={changeAccount} className="text-blue-700 font-medium hover:underline">Change</button>
            </p>
            {error && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg mb-4">{error}</div>}
            <form onSubmit={verifyCode} className="space-y-4">
              <div>
                <div className="flex items-baseline justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">Code</label>
                  <span className="text-xs text-gray-400">Expires in 15 minutes</span>
                </div>
                <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value.replace(/\D/g, '') }))}
                  className={`${inputClass} tracking-[0.4em] font-medium`} placeholder="000000" required autoFocus />
              </div>
              <button type="submit" disabled={loading || form.code.length !== 6}
                className="w-full bg-blue-700 text-white py-2.5 rounded-lg font-medium hover:bg-blue-800 transition disabled:opacity-50">
                {loading ? 'Checking…' : 'Verify'}
              </button>
            </form>
            <p className="text-sm text-center mt-4">
              {wait > 0
                ? <span className="text-gray-400">Resend code in {countdown}</span>
                : <button type="button" onClick={sendCode} disabled={loading} className="text-blue-700 font-medium hover:underline">Resend code</button>}
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-gray-900 leading-tight">New password</h1>
            <p className="text-gray-500 text-sm mt-1 mb-6">Code verified. Choose a new password.</p>
            {error && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg mb-4">{error}</div>}
            <form onSubmit={resetPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
                <input type="password" autoComplete="new-password" value={form.new_password} onChange={set('new_password')}
                  className={inputClass} placeholder="At least 8 characters" required autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
                <input type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')}
                  className={inputClass} required />
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-blue-700 text-white py-2.5 rounded-lg font-medium hover:bg-blue-800 transition disabled:opacity-50">
                {loading ? 'Saving…' : 'Change password'}
              </button>
            </form>
          </>
        )}

        <p className="text-sm text-center text-gray-500 mt-5">
          <Link to="/login" className="text-blue-700 font-medium hover:underline">Back to sign in</Link>
        </p>
      </div>
    </div>
  )
}
