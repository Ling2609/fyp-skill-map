import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../../api'
import BackLink from '../../components/BackLink'
import Popconfirm from '../../components/Popconfirm'
import { Busy } from '../../components/Spinner'
import { Bar, LoadingLabel } from '../../components/Skeleton'
import GithubAccounts from './GithubAccounts'
import { Toggle } from './profileParts'
import { aboutBody, errText, inputCls } from './profileUtils'
import { LANGUAGE_LEVELS } from './experienceKinds'

// Profile & privacy (21 Oct, her rename of "Links & visibility"; mock-up pp.png). It became a page, not a pop-up:
// six groups are too much for a dialog ("If there is too much information for a user to consume in a dialog context,
// consider using a full page instead", Carbon; references.md "Profile & privacy: a page, not a pop-up").
// One Save for the whole page, in an amber bar fixed at the bottom while something is unsaved; Discard asks first
// (her pick: the red button is inside the question, not on the bar). The two columns end on the same line.

const ABOUT_MAX = 300
const box = 'bg-white border border-slate-200 rounded-2xl px-5 py-3.5'
const label = 'block text-xs font-medium text-slate-600 mb-1'
const field = inputCls.replace('px-4 py-2.5', 'px-3 py-2')

function Section({ title, sub, grow, children }) {
  return (
    <section className={`${box} ${grow ? 'flex-1' : ''}`}>
      <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
      {sub && <p className="text-xs text-slate-500 mb-3">{sub}</p>}
      {children}
    </section>
  )
}

export default function ProfilePrivacy() {
  const navigate = useNavigate()
  const [initial, setInitial] = useState(null)
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [asking, setAsking] = useState('')        // '' | 'discard' | 'leave'
  // back from GitHub's sign-in (Connect GitHub): "GitHub connected as …"; the address is tidied so a reload doesn't repeat it
  const [params, setParams] = useSearchParams()
  const [githubNote, setGithubNote] = useState(() => params.get('github') || '')
  const [githubLinked] = useState(() => Number(params.get('linked') || 0))
  useEffect(() => { if (params.get('github')) setParams({}, { replace: true }) }, [params, setParams])

  const load = useCallback(() => api.get('/profile/showcase').then(res => {
    const body = aboutBody(res.data)
    setInitial(body); setForm(body)
  }).catch(() => setError("Couldn't load your profile. Please refresh the page.")), [])
  useEffect(() => { load() }, [load])

  const changed = !!form && JSON.stringify(form) !== JSON.stringify(initial)
  // Closing or reloading the browser tab with changes not saved: the browser's own warning (the only one allowed)
  useEffect(() => {
    const onLeave = (e) => { if (changed) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [changed])

  const set = (key, value) => { setForm(f => ({ ...f, [key]: value })); setSaved(false) }
  const setLang = (i, key, value) => set('languages', form.languages.map((l, j) => (j === i ? { ...l, [key]: value } : l)))
  const back = () => (changed ? setAsking('leave') : navigate('/profile'))

  const save = async () => {
    setBusy(true); setError('')
    const cgpa = form.cgpa.trim()
    const body = { ...form, languages: form.languages.filter(l => l.language.trim()),
                   cgpa: cgpa ? Number(cgpa) : null, clear_cgpa: !cgpa, show_cgpa: cgpa ? form.show_cgpa : false }
    if (cgpa && Number.isNaN(body.cgpa)) { setError('CGPA: a number from 0.00 to 4.00, as on your transcript'); setBusy(false); return }
    try {
      await api.put('/profile/about', body)
      await load()          // what was saved, as the server tidied it (spaces, CGPA to two decimals)
      setSaved(true)
    } catch (err) { setError(errText(err, "Couldn't save. Please try again.")) }
    finally { setBusy(false) }
  }

  if (!form) {
    return (
      <div className="h-screen flex flex-col" aria-busy="true">
        <LoadingLabel>Loading…</LoadingLabel>
        <BackLink label="My Profile" onClick={() => navigate('/profile')} />
        <div className="bg-white border-b border-slate-200 px-8 py-5"><Bar className="h-7 w-56" /></div>
        {error && <p role="alert" className="m-8 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5">{error}</p>}
      </div>
    )
  }

  const cgpaSet = form.cgpa.trim() !== ''
  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <div className="relative">
        <BackLink label="My Profile" onClick={back} />
        {asking === 'leave' && <div className="absolute left-4 sm:left-8 top-9"><Popconfirm text="You have changes that aren't saved."
          confirmLabel="Leave without saving" cancelLabel="Stay" danger onConfirm={() => navigate('/profile')} onCancel={() => setAsking('')} /></div>}
      </div>
      <header className="shrink-0 bg-white border-b border-slate-200 px-4 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Profile &amp; privacy</h1>
          <p className="text-sm text-slate-500 mt-0.5">What employers read about you, and what they can see.</p>
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-5">
            <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
              <Switch checked={form.visible_to_employers} onChange={v => set('visible_to_employers', v)} />
              Visible to employers
            </label>
            <Link to="/profile/preview" className="text-sm font-medium text-blue-700 hover:underline">Preview as employer</Link>
          </div>
          <p className="text-xs text-slate-500 mt-1">{form.visible_to_employers
            ? 'Employers whose jobs fit you can find you and invite you to apply.'
            : "Employers can't find you; a job you apply for still shares your profile."}</p>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-8 py-3">
        {githubNote && (
          <p role="status" className="mb-3 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2 flex justify-between gap-3">
            <span>GitHub connected as <b>{githubNote}</b>.{githubLinked > 0 && ` ${githubLinked} ${githubLinked === 1 ? 'project now shows' : 'projects now show'} as yours.`}</span>
            <button type="button" onClick={() => setGithubNote('')} aria-label="Close" className="text-emerald-700">×</button>
          </p>
        )}
        <div className="grid lg:grid-cols-2 gap-4 items-stretch min-h-full">
          <div className="flex flex-col gap-3">
            <Section title="About you" sub="The first thing employers read, at the top of your profile.">
              <label htmlFor="pp-headline" className={label}>Headline</label>
              <input id="pp-headline" value={form.headline} maxLength={120} className={field}
                placeholder="e.g. Final-year Software Engineering student" onChange={e => set('headline', e.target.value)} />
              <label htmlFor="pp-about" className={`${label} mt-3`}>About you</label>
              <textarea id="pp-about" rows={2} maxLength={ABOUT_MAX} value={form.about} className={`${field} resize-none`}
                placeholder="e.g. Looking for a backend or data role; I enjoy building APIs and working with databases."
                onChange={e => set('about', e.target.value)} />
              <p className="text-[11px] text-slate-400 mt-1 flex justify-between gap-3"><span>What role you want and what you enjoy.</span>
                <span className="tabular-nums">{form.about.length} / {ABOUT_MAX}</span></p>
            </Section>
            <Section grow title="Languages" sub="Employers in Malaysia often ask for English. Test result is optional, e.g. MUET Band 5 or IELTS 7.0.">
              <div className="flex flex-col gap-2">
                {form.languages.map((l, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1.7fr_1fr_auto] gap-2 items-center">
                    <input aria-label="Language" value={l.language} maxLength={40} className={field} placeholder="e.g. English"
                      onChange={e => setLang(i, 'language', e.target.value)} />
                    <select aria-label={`How well you speak ${l.language || 'it'}`} value={l.level} className={field}
                      onChange={e => setLang(i, 'level', e.target.value)}>
                      {LANGUAGE_LEVELS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <input aria-label="Test result" value={l.test} maxLength={40} className={field} placeholder="Test result"
                      onChange={e => setLang(i, 'test', e.target.value)} />
                    <button type="button" aria-label={`Remove ${l.language || 'this language'}`} className="text-slate-400 hover:text-slate-700 text-lg px-1"
                      onClick={() => set('languages', form.languages.filter((_, j) => j !== i))}>×</button>
                  </div>
                ))}
              </div>
              {form.languages.length < 8 && (
                <button type="button" className="mt-2 text-sm font-medium text-blue-700 hover:underline"
                  onClick={() => set('languages', [...form.languages, { language: '', level: 'professional_working', test: '' }])}>+ Add language</button>
              )}
            </Section>
          </div>
          <div className="flex flex-col gap-3">
            <Section title="Results" sub="Shown to employers only if you switch them on.">
              <div className="flex items-center gap-3">
                <label htmlFor="pp-cgpa" className="text-sm font-medium text-slate-800">CGPA</label>
                <input id="pp-cgpa" inputMode="decimal" value={form.cgpa} maxLength={4} placeholder="3.72"
                  className={`${field} !w-20`} onChange={e => set('cgpa', e.target.value.replace(/[^0-9.]/g, ''))} />
                <span className="text-xs text-slate-400">as on your transcript</span>
              </div>
              <div className="mt-2 space-y-1">
                <Toggle id="pp-show-cgpa" checked={cgpaSet && form.show_cgpa} disabled={!cgpaSet} onChange={v => set('show_cgpa', v)}
                  label="Show my CGPA to employers" hint={!cgpaSet ? 'Type your CGPA first.' : form.show_cgpa ? 'Employers see it beside your programme.' : 'Off: employers see no CGPA.'} />
                <Toggle id="pp-show-grades" checked={form.show_grades_to_employers} onChange={v => set('show_grades_to_employers', v)}
                  label="Show my module grades to employers" hint={form.show_grades_to_employers ? 'Employers see your grade for each module.' : 'Off: they see your modules without grades.'} />
              </div>
            </Section>
            <Section title="Contact" sub="Employers see these, with your email, only after they shortlist you.">
              <div className="grid sm:grid-cols-3 gap-3">
                <div><label htmlFor="pp-phone" className={label}>Phone</label>
                  <input id="pp-phone" type="tel" value={form.phone} maxLength={30} className={field} placeholder="012-345 6789" onChange={e => set('phone', e.target.value)} /></div>
                <div><label htmlFor="pp-city" className={label}>City</label>
                  <input id="pp-city" value={form.city} maxLength={80} className={field} placeholder="Kuala Lumpur" onChange={e => set('city', e.target.value)} /></div>
                <div><label htmlFor="pp-from" className={label}>Available from</label>
                  <input id="pp-from" type="month" value={form.available_from} className={field} onChange={e => set('available_from', e.target.value)} /></div>
              </div>
            </Section>
            <Section grow title="Other profiles" sub="Links employers can open.">
              <div className="grid sm:grid-cols-2 gap-3">
                <div><label htmlFor="pp-linkedin" className={label}>LinkedIn</label>
                  <input id="pp-linkedin" type="url" value={form.linkedin_url} maxLength={300} className={field}
                    placeholder="https://www.linkedin.com/in/your-name" onChange={e => set('linkedin_url', e.target.value)} /></div>
                <div><label htmlFor="pp-portfolio" className={label}>Portfolio or website</label>
                  <input id="pp-portfolio" type="url" value={form.portfolio_url} maxLength={300} className={field}
                    placeholder="https://your-site.com" onChange={e => set('portfolio_url', e.target.value)} /></div>
              </div>
              {/* 14 Oct: GitHub is connected by signing in, not typed (GithubAccounts); blocked while other changes
                  aren't saved, because connecting leaves the page for GitHub */}
              <div className="mt-3 pt-3 border-t border-slate-100"><GithubAccounts blocked={changed} compact /></div>
            </Section>
          </div>
        </div>
      </div>

      {(changed || saved || error) && (
        <div className={`shrink-0 border-t-2 px-4 sm:px-8 py-3 flex flex-wrap items-center justify-between gap-3 ${changed || error ? 'bg-amber-50 border-amber-300' : 'bg-emerald-50 border-emerald-300'}`}>
          <p role="status" className={`text-sm font-medium ${error ? 'text-rose-700' : changed ? 'text-amber-900' : 'text-emerald-800'}`}>
            {error || (changed ? "● You have changes that aren't saved" : '✓ Saved')}</p>
          {changed && (
            <div className="relative flex gap-2">
              <button type="button" onClick={() => setAsking('discard')} className="text-sm font-medium text-slate-700 border border-amber-300 bg-white rounded-lg px-4 py-1.5 hover:bg-slate-50">Discard</button>
              <button type="button" onClick={save} disabled={busy} className="text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg px-5 py-1.5 disabled:opacity-50">
                {busy ? <Busy>Saving…</Busy> : 'Save changes'}</button>
              {asking === 'discard' && <Popconfirm text="Discard your changes?" confirmLabel="Discard" cancelLabel="Keep editing" danger
                align="right" above onConfirm={() => { setForm(initial); setAsking(''); setError('') }} onCancel={() => setAsking('')} />}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Switch({ checked, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-slate-300'}`}>
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${checked ? 'right-0.5' : 'left-0.5'}`} />
    </button>
  )
}
