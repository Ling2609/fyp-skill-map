import { useState } from 'react'
import api from '../api'
import PageHeader from '../components/PageHeader'
import { useAuth } from '../context/useAuth'

// Account settings (4 Oct): login and account details, separate from the Skill Profile (references.md
// "Personal details page"). Two sections, Account information and Security; each row opens its own small form.
// Changing the email or password needs the current password. A real product would also send a confirmation
// email before an email change; SkillMap has no mail service (stated as a limitation in the report).

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

  const start = (what) => {
    setOpen(what)
    setError('')
    setDone('')
    setForm(what === 'name' ? { first_name: user?.first_name || '', last_name: user?.last_name || '' } : {})
  }
  const cancel = () => { setOpen(''); setError('') }
  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }))

  const save = async (e, request, message) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await request()
      if (res.data) setUser(res.data)
      setOpen('')
      setDone(message)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  const saveName = (e) => save(e, () => api.patch('/auth/me', form), 'Name saved')
  const saveEmail = (e) => save(e, () => api.put('/auth/me/email', form), 'Email changed')
  const savePassword = (e) => {
    if (form.new_password !== form.confirm_password) {
      e.preventDefault()
      setError('The new passwords do not match')
      return
    }
    return save(e, () => api.put('/auth/me/password', {
      current_password: form.current_password, new_password: form.new_password,
    }), 'Password changed')
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
            <form onSubmit={saveEmail} className="space-y-3">
              <Field label="New email"><input type="email" className={inputClass} value={form.new_email || ''} onChange={set('new_email')} autoFocus /></Field>
              <Field label="Current password"><input type="password" className={inputClass} value={form.current_password || ''} onChange={set('current_password')} autoComplete="current-password" /></Field>
              {errorBox}
              <FormButtons saving={saving} onCancel={cancel} label="Change email" />
            </form>
          </Row>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl px-6 py-2">
          <h2 className="text-sm font-semibold text-slate-800 pt-4 pb-1">Security</h2>

          <Row label="Password" value="••••••••••" action="Change password" onAction={() => start('password')} open={open === 'password'}>
            <form onSubmit={savePassword} className="space-y-3">
              <Field label="Current password"><input type="password" className={inputClass} value={form.current_password || ''} onChange={set('current_password')} autoComplete="current-password" autoFocus /></Field>
              <Field label="New password (at least 8 characters)"><input type="password" className={inputClass} value={form.new_password || ''} onChange={set('new_password')} autoComplete="new-password" /></Field>
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
