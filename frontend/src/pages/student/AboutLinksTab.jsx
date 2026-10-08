import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api'
import { Spinner } from './profileParts'
import { errText, inputCls } from './profileUtils'

// About & links (8 Oct, Mr Au): the words and links shown at the top of My Profile, and two switches for employers.
// Your name comes from Account settings and is not asked again here (each thing is typed in one place only).

const EMPTY = { headline: '', about: '', linkedin_url: '', portfolio_url: '', github_url: '',
                visible_to_employers: false, show_grades_to_employers: false }

function Toggle({ id, checked, onChange, label, hint }) {
  return (
    <div className="flex items-start gap-3">
      <button type="button" id={id} role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={`mt-0.5 relative w-9 h-5 rounded-full shrink-0 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${checked ? 'bg-blue-600' : 'bg-gray-300'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${checked ? 'left-4.5' : 'left-0.5'}`} />
      </button>
      <label htmlFor={id} className="cursor-pointer">
        <span className="block text-sm font-medium text-gray-800">{label}</span>
        <span className="block text-xs text-gray-500 mt-0.5">{hint}</span>
      </label>
    </div>
  )
}

function LinkField({ id, label, placeholder, value, onChange }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-gray-600 mb-1.5">
        {label} <span className="text-gray-300 font-normal">(optional)</span>
      </label>
      <input id={id} type="url" value={value} onChange={onChange} placeholder={placeholder} maxLength={300} className={inputCls} />
    </div>
  )
}

export default function AboutLinksTab({ onUnsavedChange }) {
  const [saved, setSaved] = useState(null)      // what the server has
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    api.get('/profile/about')
      .then(res => { setSaved(res.data); setForm(res.data) })
      .catch(() => setError("Couldn't load your details. Please refresh the page."))
  }, [])

  const unsaved = saved !== null && JSON.stringify(form) !== JSON.stringify(saved)
  useEffect(() => { onUnsavedChange?.(unsaved) }, [unsaved, onUnsavedChange])

  const set = (key) => (e) => { setForm(f => ({ ...f, [key]: e.target.value })); setDone(false) }
  const setFlag = (key) => (value) => { setForm(f => ({ ...f, [key]: value })); setDone(false) }

  const save = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const res = await api.put('/profile/about', form)
      setSaved(res.data); setForm(res.data); setDone(true)
    } catch (err) {
      setError(errText(err, "Couldn't save. Please try again."))
    } finally { setBusy(false) }
  }

  if (saved === null && !error) return <div className="flex justify-center py-16 text-blue-600"><Spinner /></div>

  return (
    // Wide screens: this tab scrolls inside itself, like the other tabs (the page header stays put)
    <div tabIndex={-1} className="lg:h-full lg:overflow-y-auto -mx-1 px-1 pb-1">
    {/* Two columns on wide screens, so the page has no empty right half (her rule: no large blank spaces) */}
    <form onSubmit={save} className="grid lg:grid-cols-2 gap-5 items-start">
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4 min-w-0">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">About you</h3>
          <p className="text-xs text-gray-500 mt-0.5">Shown at the top of <Link to="/my-profile" className="text-blue-700 hover:underline">My Profile</Link>. Your name comes from Account settings.</p>
        </div>
        <div>
          <label htmlFor="about-headline" className="block text-xs font-medium text-gray-600 mb-1.5">
            Headline <span className="text-gray-300 font-normal">(optional)</span>
          </label>
          <input id="about-headline" value={form.headline} onChange={set('headline')} maxLength={120} className={inputCls}
            placeholder="e.g. Final-year Software Engineering student · aspiring backend developer" />
        </div>
        <div>
          <label htmlFor="about-text" className="block text-xs font-medium text-gray-600 mb-1.5">
            About <span className="text-gray-300 font-normal">(optional)</span>
          </label>
          <textarea id="about-text" value={form.about} onChange={set('about')} rows={9} maxLength={1000}
            className={`${inputCls} resize-none`}
            placeholder="A few sentences: what you enjoy building, what kind of role you are looking for" />
          <p className="text-xs text-gray-400 mt-1 text-right tabular-nums">{form.about.length} / 1000</p>
        </div>
      </div>

      <div className="space-y-5 min-w-0">

      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">Links</h3>
        <LinkField id="link-linkedin" label="LinkedIn" value={form.linkedin_url} onChange={set('linkedin_url')}
          placeholder="https://www.linkedin.com/in/your-name" />
        <LinkField id="link-portfolio" label="Portfolio or personal website" value={form.portfolio_url} onChange={set('portfolio_url')}
          placeholder="https://your-site.com" />
        <LinkField id="link-github" label="GitHub profile" value={form.github_url} onChange={set('github_url')}
          placeholder="https://github.com/your-name" />
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">What employers see</h3>
        <Toggle id="flag-visible" checked={form.visible_to_employers} onChange={setFlag('visible_to_employers')}
          label="Let employers see my profile"
          hint="Approved employers can find you and view My Profile. Turn it off when you are not looking for a job." />
        <Toggle id="flag-grades" checked={form.show_grades_to_employers} onChange={setFlag('show_grades_to_employers')}
          label="Show my grades to employers"
          hint="Off: employers see your modules and skills, but not the grades." />
      </div>
      </div>

      {error && <p role="alert" className="lg:col-span-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <div className="lg:col-span-2 flex items-center justify-end gap-3">
        {done && !unsaved && <span role="status" className="text-sm text-green-700">Saved</span>}
        <button type="submit" disabled={busy || !unsaved}
          className="bg-blue-700 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-blue-800 disabled:opacity-40 transition flex items-center gap-2">
          {busy ? <><Spinner size="sm" />Saving…</> : 'Save'}
        </button>
      </div>
    </form>
    </div>
  )
}
