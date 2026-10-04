import { useEffect, useState } from 'react'
import api from '../api'
import PageHeader from '../components/PageHeader'
import PasswordStrength from '../components/PasswordStrength'
import { useAuth } from '../context/useAuth'

// Account settings (4 Oct): login and account details, separate from the Skill Profile (references.md
// "Personal details page"). Two sections, Account information and Security; each row opens its own small form.
// Changing the email or password needs the current password. A new email only counts once the 6-digit code sent to
// it is entered (the old address is told afterwards). Changing the password signs out other devices; this one gets
// a new token (4 Oct, references.md "Account security fixes").

const RESEND_SECONDS = 60

const errorText = (err) => {
  const detail = err.response?.data?.detail
  if (Array.isArray(detail)) return (detail[0]?.msg || 'Please check the form').replace(/^Value error, /, '')
  return detail || 'Something went wrong. Please try again.'
}

const inputClass = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100'

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  )
}

// One line of a section: label, current value, and a button that opens the row's form
function Row({ label, value, action, onAction, note, open, children }) {
  return (
    <div className="py-4 border-t border-slate-100 first:border-t-0">
      <div className="flex items-center gap-4">
        <p className="w-32 shrink-0 text-sm text-slate-500">{label}</p>
        <p className="flex-1 min-w-0 text-sm text-slate-800 truncate">{value}</p>
        {action && !open && (
          <button onClick={onAction}
            className="text-sm font-medium text-blue-600 hover:text-blue-800 px-2 py-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-200">
            {action}
          </button>
        )}
        {note && <span className="text-xs text-slate-400">{note}</span>}
      </div>
      {open && <div className="mt-4 ml-36 max-w-md">{children}</div>}
    </div>
  )
}

function FormButtons({ saving, onCancel, label }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <button type="submit" disabled={saving}
        className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50">
        {saving ? 'Saving…' : label}
      </button>
      <button type="button" onClick={onCancel} className="px-3 py-2 text-sm text-slate-500 hover:text-slate-800">Cancel</button>
    </div>
  )
}

export default function AccountSettings() {
  const { user, setUser } = useAuth()
  const [open, setOpen] = useState('')          // 'name' | 'email' | 'password' | ''
  const [form, setForm] = useState({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState('')           // short confirmation after a save
  const [emailStep, setEmailStep] = useState('form')   // 'form' | 'code'
  const [resendAt, setResendAt] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  // Resend countdown from a fixed end time (same as Forgot password)
  useEffect(() => {
    if (resendAt <= Date.now()) return
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [resendAt])
  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000))

  const start = (what) => {
    setOpen(what)
    setError('')
    setDone('')
    setEmailStep('form')
    setForm(what === 'name' ? { first_name: user?.first_name || '', last_name: user?.last_name || '' } : {})
  }
  const cancel = () => { setOpen(''); setError(''); setEmailStep('form') }
  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }))

  const save = async (e, request, message) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await request()
      if (res.data?.access_token) localStorage.setItem('token', res.data.access_token)   // password change
      else if (res.data) setUser(res.data)
      setOpen('')
      setEmailStep('form')
      setDone(message)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  const saveName = (e) => save(e, () => api.patch('/auth/me', form), 'Name saved')
  // Email, step 1: password + new address -> code sent to the new address (nothing changes yet)
  const sendEmailCode = async (e) => {
    e?.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api.put('/auth/me/email', { new_email: form.new_email, current_password: form.current_password })
      setForm(f => ({ ...f, code: '' }))
      setEmailStep('code')
      setResendAt(Date.now() + RESEND_SECONDS * 1000)
      setNow(Date.now())
    } catch (err) {
      setError(errorText(err))
    } finally {
      setSaving(false)
    }
  }
  // Email, step 2: the code from the new inbox
  const verifyEmail = (e) => save(e, () => api.post('/auth/me/email/verify', { code: form.code }),
    'Email changed. We let your old address know.')
  const countdown = `${Math.floor(wait / 60)}:${String(wait % 60).padStart(2, '0')}`
  const savePassword = (e) => {
    if (form.new_password !== form.confirm_password) {
      e.preventDefault()
      setError("The new passwords don't match")
      return
    }
    return save(e, () => api.put('/auth/me/password', {
      current_password: form.current_password, new_password: form.new_password,
    }), 'Password changed. Other devices were signed out.')
  }

  const errorBox = error && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{error}</p>

  return (
    <div className="min-h-screen bg-slate-50">
      <PageHeader>
        <div className="pb-5 pt-1">
          <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-widest mb-2">Account</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Account settings</h1>
          <p className="text-sm text-slate-500 mt-1">Your name and login details</p>
        </div>
      </PageHeader>

      <div className="px-8 py-6 space-y-5">
        {done && (
          <p role="status" className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-2.5">{done}</p>
        )}

        <section className="bg-white border border-slate-200 rounded-xl px-6 py-2">
          <h2 className="text-sm font-semibold text-slate-800 pt-4 pb-1">Account information</h2>

          <Row label="Name" value={[user?.first_name, user?.last_name].filter(Boolean).join(' ')}
            action="Edit" onAction={() => start('name')} open={open === 'name'}>
            <form onSubmit={saveName} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="First name"><input className={inputClass} value={form.first_name || ''} onChange={set('first_name')} autoFocus /></Field>
                <Field label="Last name"><input className={inputClass} value={form.last_name || ''} onChange={set('last_name')} /></Field>
              </div>
              {errorBox}
              <FormButtons saving={saving} onCancel={cancel} label="Save name" />
            </form>
          </Row>

          <Row label="Username" value={user?.username} note="Can't be changed: you log in with it" />

          <Row label="Email" value={user?.email} action="Change" onAction={() => start('email')} open={open === 'email'}>
            {emailStep === 'form' ? (
              <form onSubmit={sendEmailCode} className="space-y-3">
                <Field label="New email"><input type="email" className={inputClass} value={form.new_email || ''} onChange={set('new_email')} autoFocus /></Field>
                <Field label="Current password"><input type="password" className={inputClass} value={form.current_password || ''} onChange={set('current_password')} autoComplete="current-password" /></Field>
                {errorBox}
                <FormButtons saving={saving} onCancel={cancel} label="Send code" />
              </form>
            ) : (
              <form onSubmit={verifyEmail} className="space-y-3">
                <p className="text-sm text-slate-500">
                  Code sent to <span className="font-medium text-slate-800">{form.new_email.trim().toLowerCase()}</span>.{' '}
                  <button type="button" onClick={() => { setEmailStep('form'); setError('') }}
                    className="text-blue-600 font-medium hover:text-blue-800">Change</button>
                </p>
                <div>
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-xs font-medium text-slate-500">Code</span>
                    <span className="text-xs text-slate-400">Expires in 15 minutes</span>
                  </div>
                  <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={form.code || ''}
                    onChange={e => setForm(f => ({ ...f, code: e.target.value.replace(/\D/g, '') }))}
                    className={`${inputClass} tracking-[0.4em] font-medium`} placeholder="000000" aria-label="Code" autoFocus />
                </div>
                {errorBox}
                <div className="flex items-center gap-2 pt-1">
                  <button type="submit" disabled={saving || (form.code || '').length !== 6}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50">
                    {saving ? 'Checking…' : 'Verify'}
                  </button>
                  <button type="button" onClick={cancel} className="px-3 py-2 text-sm text-slate-500 hover:text-slate-800">Cancel</button>
                  <span className="ml-auto text-sm">
                    {wait > 0
                      ? <span className="text-slate-400">Resend code in {countdown}</span>
                      : <button type="button" onClick={sendEmailCode} disabled={saving} className="text-blue-600 font-medium hover:text-blue-800">Resend code</button>}
                  </span>
                </div>
              </form>
            )}
          </Row>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl px-6 py-2">
          <h2 className="text-sm font-semibold text-slate-800 pt-4 pb-1">Security</h2>

          <Row label="Password" value="••••••••••" action="Change password" onAction={() => start('password')} open={open === 'password'}>
            <form onSubmit={savePassword} className="space-y-3">
              <Field label="Current password"><input type="password" className={inputClass} value={form.current_password || ''} onChange={set('current_password')} autoComplete="current-password" autoFocus /></Field>
              <div>
                <Field label="New password"><input type="password" className={inputClass} value={form.new_password || ''} onChange={set('new_password')} autoComplete="new-password" placeholder="At least 8 characters" /></Field>
                <PasswordStrength password={form.new_password} username={user?.username} email={user?.email} />
              </div>
              <Field label="Confirm new password"><input type="password" className={inputClass} value={form.confirm_password || ''} onChange={set('confirm_password')} autoComplete="new-password" /></Field>
              {errorBox}
              <FormButtons saving={saving} onCancel={cancel} label="Change password" />
            </form>
          </Row>
        </section>
      </div>
    </div>
  )
}
