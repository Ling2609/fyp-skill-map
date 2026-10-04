import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../../api'

// Forgot password (4 Oct; OWASP Forgot Password Cheat Sheet, references.md). Step 1: username or email ->
// a 6-digit code is emailed (same reply whether or not the account exists). Step 2: code + new password.

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

const errorText = (err) => {
  const detail = err.response?.data?.detail
  if (Array.isArray(detail)) return (detail[0]?.msg || 'Please check the form').replace(/^Value error, /, '')
  return detail || (err.response ? 'Something went wrong. Please try again.' : "Can't reach the server. Is the backend running?")
}

export default function ForgotPassword() {
  const navigate = useNavigate()
  const [step, setStep] = useState('ask')        // 'ask' | 'reset'
  const [form, setForm] = useState({ identifier: '', code: '', new_password: '', confirm: '' })
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }))

  const askForCode = async (e) => {
    e?.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post('/auth/forgot-password', { identifier: form.identifier })
      setNote(res.data.message)
      setStep('reset')
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoading(false)
    }
  }

  const resetPassword = async (e) => {
    e.preventDefault()
    setError('')
    if (form.new_password !== form.confirm) { setError('The new passwords do not match'); return }
    setLoading(true)
    try {
      await api.post('/auth/reset-password', {
        identifier: form.identifier, code: form.code, new_password: form.new_password,
      })
      navigate('/login', { state: { message: 'Password changed. Sign in with your new password.' } })
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoading(false)
    }
  }

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

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 leading-tight">Reset your password</h1>
          <p className="text-gray-500 text-sm mt-1">
            {step === 'ask' ? "We'll email you a 6-digit code" : 'Enter the code and choose a new password'}
          </p>
        </div>

        {step === 'reset' && note && (
          <div className="bg-blue-50 text-blue-800 text-sm px-4 py-3 rounded-lg mb-4">
            {note} It expires in 15 minutes.
          </div>
        )}
        {error && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg mb-4">{error}</div>}

        {step === 'ask' ? (
          <form onSubmit={askForCode} className="space-y-4">
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
        ) : (
          <form onSubmit={resetPassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">6-digit code</label>
              <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value.replace(/\D/g, '') }))}
                className={`${inputClass} tracking-[0.4em] font-medium`} placeholder="000000" required autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New password (at least 8 characters)</label>
              <input type="password" autoComplete="new-password" value={form.new_password} onChange={set('new_password')}
                className={inputClass} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
              <input type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')}
                className={inputClass} required />
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-blue-700 text-white py-2.5 rounded-lg font-medium hover:bg-blue-800 transition disabled:opacity-50">
              {loading ? 'Saving…' : 'Change password'}
            </button>
            <p className="text-sm text-center text-gray-500">
              No email?{' '}
              <button type="button" onClick={askForCode} disabled={loading} className="text-blue-700 font-medium hover:underline">
                Send a new code
              </button>
              {' '}(check spam; one code a minute)
            </p>
          </form>
        )}

        <p className="text-sm text-center text-gray-500 mt-5">
          <Link to="/login" className="text-blue-700 font-medium hover:underline">Back to sign in</Link>
        </p>
      </div>
    </div>
  )
}
