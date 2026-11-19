import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../../api'
import PasswordStrength from '../../components/PasswordStrength'
import PrivacySummary from '../../components/PrivacySummary'
import { Busy } from '../../components/Spinner'
import { AuthShell, AUTH_FIELD, AUTH_TONE, RevealButton, PressButton, Field, Input, Notice } from '../../components/ui'


// 20 Nov: the same rules as the server (schemas/user.py), so mistakes show before Create account
const websiteOk = (v) => /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(v.trim())
const ssmOk = (v) => /^(\d{12}|\d{1,7}-?[A-Z])$/i.test(v.replace(/\s+/g, ''))

const validateName = (name) => {
  if (!name || name.trim().length < 1) return 'This field is required'
  if (name.trim().length > 50) return 'Must be under 50 characters'
  if (!/^[a-zA-Z\s\-']+$/.test(name.trim())) return 'Only letters, spaces, hyphens and apostrophes allowed'
  return ''
}

export default function Register() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    username: '', first_name: '', last_name: '',
    email: '', password: '', confirm_password: '', role: 'student', company_name: '', company_website: '', company_ssm: ''
  })
  const [accepted, setAccepted] = useState(false)     // 14 Oct: privacy notice (PDPA)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [focused, setFocused] = useState('')
  const [attemptedSubmit, setAttemptedSubmit] = useState(false)

  const [usernameStatus, setUsernameStatus] = useState('idle')
  const [usernameMessage, setUsernameMessage] = useState('')
  const debounceRef = useRef(null)

  useEffect(() => {
    const username = form.username
    if (!username) {
      setTimeout(() => { setUsernameStatus('idle'); setUsernameMessage('') }, 0)
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (username.length < 3) {
      setTimeout(() => { setUsernameStatus('invalid'); setUsernameMessage('At least 3 characters required') }, 0)
      return
    }
    if (!/^[a-zA-Z0-9]/.test(username)) {
      setTimeout(() => { setUsernameStatus('invalid'); setUsernameMessage('Must start with a letter or number') }, 0)
      return
    }
    if (!/^[a-zA-Z0-9._]+$/.test(username)) {
      setTimeout(() => { setUsernameStatus('invalid'); setUsernameMessage('Only letters, numbers, dots and underscores allowed') }, 0)
      return
    }

    setTimeout(() => { setUsernameStatus('checking'); setUsernameMessage('Checking availability...') }, 0)

    // 23 Oct: an answer that arrives after the name has changed again is ignored, so a slow check of an older name
    // can't overwrite the newer one (React's "ignore" pattern for effects that fetch, react.dev/learn/synchronizing-with-effects)
    let stale = false
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get(`/auth/check-username/${encodeURIComponent(username)}`)
        if (stale) return
        if (res.data.available) {
          setUsernameStatus('available')
          setUsernameMessage('Username is available')
        } else {
          setUsernameStatus('taken')
          setUsernameMessage(res.data.message)
        }
      } catch {
        if (stale) return
        setUsernameStatus('unknown')
        setUsernameMessage("Couldn't check this name right now. If it's taken, you'll be told when you create the account.")
      }
    }, 500)

    return () => { stale = true; if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [form.username])


  const getUsernameIcon = () => {
    if (usernameStatus === 'checking') return (
      <span aria-hidden="true" className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    )
    if (usernameStatus === 'available') return (
      <span aria-hidden="true" className="grid h-6 w-6 place-items-center rounded-full bg-have text-white">
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
      </span>
    )
    if (usernameStatus === 'taken' || usernameStatus === 'invalid') return (
      <button type="button" aria-label="Clear username" title="Clear"
        onClick={() => { setForm(f => ({ ...f, username: '' })); document.getElementById('reg-username')?.focus() }}
        className="grid h-6 w-6 place-items-center rounded-full bg-missing-strong text-white hover:bg-[#86301a] focus-visible:outline-2 focus-visible:outline-offset-2">
        <svg aria-hidden="true" className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.2} d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    )
    return null
  }

  const isFormValid = () => {
    // 'unknown': the check failed (network); the server still refuses a taken name when the account is created
    return (usernameStatus === 'available' || usernameStatus === 'unknown') &&
      !validateName(form.first_name) &&
      !validateName(form.last_name) &&
      form.email.length > 0 &&
      form.password.length >= 8 &&
      form.password === form.confirm_password &&
      (form.role !== 'employer' || (form.company_name.trim().length >= 2 && (!form.company_website.trim() || websiteOk(form.company_website)) && ssmOk(form.company_ssm))) &&
      accepted
  }

  const handleBlur = (field) => {
    setFocused('')
    const newErrors = { ...errors }
    if (field === 'first_name') newErrors.first_name = validateName(form.first_name)
    if (field === 'last_name') newErrors.last_name = validateName(form.last_name)
    setErrors(newErrors)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setAttemptedSubmit(true)

    const newErrors = {
      first_name: validateName(form.first_name),
      last_name: validateName(form.last_name),
    }
    setErrors(newErrors)

    if (!isFormValid()) return

    setError('')
    setLoading(true)
    try {
      await api.post('/auth/register', {
        username: form.username,
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        password: form.password,
        role: form.role,
        company_name: form.role === 'employer' ? form.company_name.trim() : null,
        company_website: form.role === 'employer' ? (form.company_website.trim() || null) : null,
        company_ssm: form.role === 'employer' ? form.company_ssm.trim() : null,
        accept_privacy: accepted,
      })
      navigate('/login', { state: { message: 'Account created successfully! Please sign in.' } })
    } catch (err) {
      // FastAPI sends a string for our own errors, but a list for validation (422) errors
      const detail = err.response?.data?.detail
      setError(
        Array.isArray(detail)
          ? detail.map(d => (d.msg || '').replace(/^Value error, /, '')).join('. ')
          : detail || 'Registration failed'
      )
    } finally {
      setLoading(false)
    }
  }

  // ── what the username box is saying right now ─────────────────────────────
  const usernameBad = usernameStatus === 'taken' || usernameStatus === 'invalid' ||
    (attemptedSubmit && usernameStatus !== 'available' && usernameStatus !== 'unknown')
  const usernameTone = usernameStatus === 'available' ? AUTH_TONE.ok : usernameBad ? AUTH_TONE.bad : AUTH_TONE.idle
  const usernameNote =
    usernameStatus === 'available' ? { text: usernameMessage, tone: 'ok' }
    : usernameStatus === 'checking' || usernameStatus === 'unknown' ? { text: usernameMessage, tone: 'idle' }
    : usernameBad ? { text: usernameMessage || 'Please enter a valid available username', tone: 'bad' }
    : focused === 'username' ? { text: 'Letters, numbers, dots and underscores only', tone: 'idle' }
    : null

  const NOTE_TONE = { ok: 'text-have-strong', bad: 'text-missing-strong', idle: 'text-faint' }
  const pass = form.password, confirm = form.confirm_password

  return (
    <AuthShell
      title="Create account"
      sub="Start mapping your skills to your career"
      wide
      // 19 Nov: the story follows the role picked: what SkillMap does for a student, or for an employer
      intro={form.role === 'employer'
        ? { story: 'e', headline: <>Graduates, matched by <em>proven skills</em>.</> }
        : { story: 's', headline: <>Your degree, mapped to <em>real jobs</em>.</> }}
    >
      {error && (
        <Notice tone="bad">
          <span role="alert">{error}</span>
        </Notice>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* Role first: it decides which fields exist, so it is the first decision */}
        <div>
          <span className="mb-1.5 block text-small font-semibold text-ink-soft">I am a</span>
          <div role="group" aria-label="Role" className="grid grid-cols-2 gap-1 rounded-[12px] border border-line bg-well p-1">
            {[['student', 'Student / Graduate'], ['employer', 'Employer']].map(([value, label]) => {
              const on = form.role === value
              return (
                <button
                  key={value} type="button" aria-pressed={on}
                  onClick={() => setForm(f => ({ ...f, role: value }))}
                  className={`rounded-[9px] px-3 py-2 text-small font-semibold transition-[background,box-shadow,color] duration-150 ${
                    on ? 'bg-card text-ink shadow-card' : 'text-muted hover:text-ink'}`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="First Name" id="reg-first" required error={errors.first_name}>
              <Input
                id="reg-first" autoComplete="given-name" type="text"
                value={form.first_name}
                onChange={e => { const v = e.target.value; setForm(f => ({ ...f, first_name: v })) }}
                onFocus={() => setFocused('first_name')}
                onBlur={() => handleBlur('first_name')}
                placeholder="John" required
              />
          </Field>
          <Field label="Last Name" id="reg-last" required error={errors.last_name}>
              <Input
                id="reg-last" autoComplete="family-name" type="text"
                value={form.last_name}
                onChange={e => { const v = e.target.value; setForm(f => ({ ...f, last_name: v })) }}
                onFocus={() => setFocused('last_name')}
                onBlur={() => handleBlur('last_name')}
                placeholder="Doe" required
              />
          </Field>
        </div>

        {/* 19 Nov (approved mock): Username | Email and Password | Confirm side by side, so the whole form fits one
            laptop screen even with every message showing */}
        <div className="grid grid-cols-2 items-start gap-3">
        {/* Username — its own block: the live availability answer needs a colour the shared Field can't carry */}
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="reg-username" className="text-small font-medium text-ink-soft">Username</label>
          <div className="relative">
            <input
              id="reg-username"
              autoComplete="username"
              type="text"
              value={form.username}
              onChange={e => { const v = e.target.value; setForm(f => ({ ...f, username: v })) }}
              onFocus={() => setFocused('username')}
              onBlur={() => setFocused('')}
              aria-describedby={usernameNote ? 'reg-username-note' : undefined}
              aria-invalid={usernameBad || undefined}
              className={`${AUTH_FIELD} pr-11 ${usernameTone}`}
              placeholder="johndoe_123"
              required
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 flex">{getUsernameIcon()}</span>
          </div>
          {usernameNote && (
            <p id="reg-username-note" aria-live="polite" className={`m-0 text-small leading-snug font-medium ${NOTE_TONE[usernameNote.tone]}`}>
              {usernameNote.tone === 'ok' ? '✓ ' : usernameNote.tone === 'bad' ? '✕ ' : ''}{usernameNote.text}</p>
          )}
        </div>

        <Field label="Email" id="reg-email" required error={attemptedSubmit && !form.email ? 'Email is required' : ''}>
          <Input
            id="reg-email" autoComplete="email" type="email"
            value={form.email}
            onChange={e => { const v = e.target.value; setForm(f => ({ ...f, email: v })) }}
            onFocus={() => setFocused('email')}
            onBlur={() => setFocused('')}
            placeholder="jane@example.com" required
          />
        </Field>
        </div>

        <div className="grid grid-cols-2 items-start gap-3">
        <Field label="Password" id="reg-password" required error={attemptedSubmit && pass.length < 8 ? 'Use at least 8 characters' : ''}>
          <div className="relative">
            <input
              id="reg-password" autoComplete="new-password"
              type={showPassword ? 'text' : 'password'}
              value={pass}
              onChange={e => { const v = e.target.value; setForm(f => ({ ...f, password: v })) }}
              onFocus={() => setFocused('password')}
              onBlur={() => setFocused('')}
              className={`${AUTH_FIELD} pr-10 ${attemptedSubmit && pass.length < 8 ? AUTH_TONE.bad : AUTH_TONE.idle}`}
              placeholder="••••••••" required minLength={8} maxLength={72}
            />
            <RevealButton shown={showPassword} onToggle={() => setShowPassword(v => !v)} />
          </div>
        </Field>

        <Field label="Confirm password" id="reg-confirm" required>
          <div className="relative">
            <input
              id="reg-confirm" autoComplete="new-password"
              type={showConfirm ? 'text' : 'password'}
              value={confirm}
              onChange={e => { const v = e.target.value; setForm(f => ({ ...f, confirm_password: v })) }}
              onFocus={() => setFocused('confirm_password')}
              onBlur={() => setFocused('')}
              className={`${AUTH_FIELD} pr-10 ${
                confirm && pass === confirm ? AUTH_TONE.ok
                : (confirm && pass !== confirm) || (attemptedSubmit && !confirm) ? AUTH_TONE.bad
                : AUTH_TONE.idle
              }`}
              placeholder="••••••••" required
            />
            <RevealButton shown={showConfirm} onToggle={() => setShowConfirm(v => !v)} />
          </div>
        </Field>
        </div>
        {/* the strength bar under both boxes, the match answer at the end of the same line: messages never add a row
            beside a label, so the two boxes always line up (her review, 19 Nov) */}
        <div className="-mt-1 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 [&>div]:mt-0"><PasswordStrength password={pass} username={form.username} email={form.email} /></div>
          {(confirm && pass !== confirm) && <p className="m-0 mt-1 shrink-0 whitespace-nowrap text-small font-semibold text-missing-strong" aria-live="polite">The passwords don&apos;t match</p>}
          {(confirm && pass === confirm) && <p className="m-0 mt-1 shrink-0 whitespace-nowrap text-small font-semibold text-have-strong" aria-live="polite">✓ Passwords match</p>}
          {(attemptedSubmit && !confirm) && <p className="m-0 mt-1 shrink-0 whitespace-nowrap text-small font-semibold text-missing-strong">Please confirm your password</p>}
        </div>

        {/* Company (12 Oct): employers only; the career office checks it before approving the account */}
        {form.role === 'employer' && (
          <Field
            label="Company name" id="reg-company"
            error={attemptedSubmit && form.company_name.trim().length < 2 ? 'Company name is required' : ''}
          >
            <Input
              id="reg-company"
              value={form.company_name}
              onChange={e => { const v = e.target.value; setForm(f => ({ ...f, company_name: v })) }}
              maxLength={120}
              placeholder="e.g. Kayu Digital Sdn Bhd"
            />
          </Field>
        )}
        {/* 20 Nov (her call, as real systems do): website and SSM number, so the career office can check the
            company is real before approving it; side by side so the form still fits one screen */}
        {form.role === 'employer' && (<>
          <div className="grid grid-cols-2 items-start gap-3">
            {/* 20 Nov (her review): optional, as a small company may have no website */}
            <Field label="Company website (optional)" id="reg-website"
              error={form.company_website.trim() && !websiteOk(form.company_website) && (attemptedSubmit || form.company_website.length > 4) ? 'e.g. kayu.com.my' : ''}>
              <Input id="reg-website" value={form.company_website} maxLength={200} placeholder="e.g. kayu.com.my" autoComplete="url"
                onChange={e => { const v = e.target.value; setForm(f => ({ ...f, company_website: v })) }} />
            </Field>
            <Field label="SSM registration number" id="reg-ssm"
              error={(attemptedSubmit || form.company_ssm.length > 6) && !ssmOk(form.company_ssm) ? '12 digits, e.g. 202301012345' : ''}>
              <Input id="reg-ssm" value={form.company_ssm} maxLength={20} placeholder="e.g. 202301012345"
                onChange={e => { const v = e.target.value; setForm(f => ({ ...f, company_ssm: v })) }} />
            </Field>
          </div>
          <p className="-mt-1.5 m-0 text-xs text-muted">Checked by the career office. SSM: 12 digits, as on your certificate.</p>
        </>)}

        <div><PrivacySummary accepted={accepted} onChange={setAccepted} showError={attemptedSubmit} /></div>

        <PressButton type="submit" disabled={loading} className="mt-1 w-full">
          {loading ? <Busy>Creating account…</Busy> : 'Create account'}
        </PressButton>
      </form>

      <p className="m-0 border-t border-line pt-3 text-center text-small text-muted">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-accent hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  )
}
