import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api'
import { DuplicateAsk, Field, FormButtons, SkillChip, Spinner } from './profileParts'
import { aboutBody, errText, inputCls, splitSkills, studyComplete } from './profileUtils'

// Every pop-up form on My Profile (8 Oct, one page). Each one is opened by an "Edit" or "+ Add" on its card and closes
// itself through onDone / onCancel; onDirty tells the pop-up there is something typed, so a stray click outside asks
// first. Project, certificate and award forms moved here unchanged from the old Skill Profile tabs.

// ── Project (moved from Profile.jsx) ──────────────────────────────────────────

export function ProjectForm({ project, onDone, onCancel, onDirty }) {
  const editing = !!project
  const [initial] = useState(() => ({
    name: project?.name || '', description: project?.description || '', github_url: project?.github_url || '',
  }))
  const [form, setForm] = useState(initial)
  useEffect(() => { onDirty?.(JSON.stringify(form) !== JSON.stringify(initial)) }, [form, initial, onDirty])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [dupe, setDupe] = useState('')   // "you already have one called ..." question
  const save = async (allowDuplicate = false) => {
    setLoading(true); setError('')
    const body = { name: form.name.trim(), description: form.description.trim(), github_url: form.github_url.trim() || null,
                   allow_duplicate: allowDuplicate }
    try {
      const res = editing ? await api.put(`/profile/projects/${project.id}`, body) : await api.post('/profile/projects', body)
      onDone(res.data)
    } catch (err) {
      if (err.response?.status === 409) setDupe(err.response.data.detail)
      else setError(errText(err, editing ? "Couldn't save the project" : "Couldn't add the project"))
    } finally { setLoading(false) }
  }
  const submit = (e) => { e.preventDefault(); save() }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Project name">
        <input type="text" value={form.name} onChange={e => { setForm(p => ({ ...p, name: e.target.value })); setDupe('') }}
          placeholder="e.g. Inventory Management System" className={inputCls} maxLength={100} required autoFocus />
      </Field>
      <Field label="Description">
        <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
          placeholder="What you built and the tools you used..." rows={5} className={`${inputCls} resize-none`} maxLength={3000} required />
      </Field>
      <Field label="GitHub URL" optional hint="SkillMap reads the languages used in public repositories only.">
        <input type="url" value={form.github_url} onChange={e => setForm(p => ({ ...p, github_url: e.target.value }))}
          placeholder="https://github.com/username/repo" className={inputCls} maxLength={500} />
      </Field>
      {editing && <p className="text-xs text-gray-400">If you change the text, SkillMap finds the skills again and keeps the ones you added</p>}
      {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {dupe
        ? <DuplicateAsk message={dupe} yesLabel={editing ? 'Yes, save it' : 'Yes, add it'} busy={loading}
            onYes={() => save(true)} onBack={() => setDupe('')} />
        : <FormButtons loading={loading} busyText="Finding skills…" label={editing ? 'Save' : 'Add project'} onCancel={onCancel}
            disabled={!form.name.trim() || !form.description.trim()} />}
    </form>
  )
}

// ── Certificate (moved from Profile.jsx) ──────────────────────────────────────

// Certificate pop-up (4 Oct, her flow): the skills are shown as chips BEFORE saving, so everything saved has been seen
// and checked (Amershi et al. 2019: support efficient correction; references.md "Reviewing AI-suggested skills").
// Type or paste the skills listed on the certificate, or "Suggest skills" from the name; × removes a chip.
// With no skills yet, the main button suggests first, so a certificate is never saved with skills nobody looked at.

export function CertForm({ cert, onDone, onCancel, onDirty }) {
  const editing = !!cert
  const [initial] = useState(() => ({ cert_name: cert?.cert_name || '', issuer: cert?.issuer || '', credly_url: cert?.credly_url || '' }))
  const [form, setForm] = useState(initial)
  const [skills, setSkills] = useState(cert?.mapped_skills || [])
  const [suggested, setSuggested] = useState(false)   // some chips came from "Suggest skills"
  const [triedSuggest, setTriedSuggest] = useState(editing)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState('')                 // '' | 'suggest' | 'save'
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const addChips = (names) => setSkills(prev => {
    const have = new Set(prev.map(s => s.toLowerCase()))
    return [...prev, ...names.filter(n => n.length <= 60 && !have.has(n.toLowerCase()) && have.add(n.toLowerCase()))]
  })
  const takeDraft = () => { if (draft.trim()) { addChips(splitSkills(draft)); setDraft('') } }
  const canSuggest = form.cert_name.trim() && form.issuer.trim()

  const suggest = async () => {
    setBusy('suggest'); setError(''); setNote('')
    try {
      const res = await api.post('/profile/certifications/suggest', { cert_name: form.cert_name.trim(), issuer: form.issuer.trim() })
      const found = res.data.skills || []
      if (found.length) { addChips(found); setSuggested(true) }
      else if (res.data.failed) setNote("Couldn't suggest skills right now. You can add them yourself, or try again later.")
      else setNote("SkillMap doesn't know this certificate well enough to suggest skills. Type the skills shown on your certificate (or its Credly badge) in the box above.")
      setTriedSuggest(true)
    } catch (err) {
      setError(errText(err, "Couldn't suggest skills right now. You can add them yourself."))
      setTriedSuggest(true)
    } finally { setBusy('') }
  }

  const needsSuggest = !skills.length && !draft.trim() && !triedSuggest
  useEffect(() => {
    onDirty?.(JSON.stringify(form) !== JSON.stringify(initial) || draft.trim() !== ''
      || JSON.stringify(skills) !== JSON.stringify(cert?.mapped_skills || []))
  }, [form, initial, draft, skills, cert, onDirty])
  const [dupe, setDupe] = useState('')
  const submit = (e) => { e.preventDefault(); if (needsSuggest) suggest(); else save() }
  const save = async (allowDuplicate = false) => {
    const finalSkills = draft.trim() ? [...skills, ...splitSkills(draft).filter(n => !skills.some(s => s.toLowerCase() === n.toLowerCase()))] : skills
    setBusy('save'); setError('')
    const body = { cert_name: form.cert_name.trim(), issuer: form.issuer.trim(), credly_url: form.credly_url.trim() || null,
                   skills: finalSkills, suggested, allow_duplicate: allowDuplicate }
    try {
      const res = editing ? await api.put(`/profile/certifications/${cert.id}`, body) : await api.post('/profile/certifications', body)
      onDone(res.data)
    } catch (err) {
      if (err.response?.status === 409) setDupe(err.response.data.detail)
      else setError(errText(err, editing ? "Couldn't save the certificate" : "Couldn't add the certificate"))
    } finally { setBusy('') }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Certificate name">
        <input type="text" value={form.cert_name} onChange={e => { setForm(c => ({ ...c, cert_name: e.target.value })); setDupe('') }}
          placeholder="e.g. AWS Certified Cloud Practitioner" className={inputCls} maxLength={150} required autoFocus />
      </Field>
      <Field label="Issuer">
        <input type="text" value={form.issuer} onChange={e => { setForm(c => ({ ...c, issuer: e.target.value })); setDupe('') }}
          placeholder="e.g. Amazon Web Services" className={inputCls} maxLength={100} required />
      </Field>
      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <label htmlFor="cert-skill-input" className="block text-xs font-medium text-gray-600">Skills listed on the certificate</label>
          {/* While the main button is "Suggest skills" this link would repeat it, so it shows only afterwards */}
          {!needsSuggest && (
            <button type="button" onClick={suggest} disabled={!canSuggest || busy !== ''}
              className="text-xs font-medium text-blue-700 hover:underline disabled:text-gray-300 disabled:no-underline">
              {busy === 'suggest' ? 'Finding skills…' : suggested ? 'Suggest more' : 'Suggest skills'}
            </button>
          )}
        </div>
        <div className="w-full border border-gray-200 rounded-xl px-3 py-2.5 flex flex-wrap items-center gap-1.5 focus-within:ring-2 focus-within:ring-blue-500">
          {skills.map(s => (
            <SkillChip key={s} skill={s} onRemove={() => setSkills(prev => prev.filter(x => x !== s))} />
          ))}
          <input id="cert-skill-input" value={draft} onChange={e => setDraft(e.target.value)} onBlur={takeDraft}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); takeDraft() }
              if (e.key === 'Backspace' && !draft && skills.length) setSkills(prev => prev.slice(0, -1))
            }}
            onPaste={e => { const t = e.clipboardData.getData('text'); if (/[,;\n]/.test(t)) { e.preventDefault(); addChips(splitSkills(t)) } }}
            placeholder={skills.length ? 'Add another' : 'e.g. Data Analytics, Data Lakes, Data Warehousing'}
            className="flex-1 min-w-40 text-sm py-0.5 placeholder-gray-300 focus:outline-none" />
        </div>
        <p className="text-xs text-gray-400 mt-1.5">Press Enter after each skill, or paste a list separated by commas.</p>
        {note && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-2">{note}</p>}
      </div>
      <Field label="Credly badge link" optional hint="Adds a link to the badge on your certificate card.">
        <input type="url" value={form.credly_url} onChange={e => setForm(c => ({ ...c, credly_url: e.target.value }))}
          placeholder="https://www.credly.com/badges/..." className={inputCls} maxLength={500} />
      </Field>
      {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {dupe
        ? <DuplicateAsk message={dupe} yesLabel={editing ? 'Yes, save it' : 'Yes, add it'} busy={busy !== ''}
            onYes={() => save(true)} onBack={() => setDupe('')} />
        : <FormButtons loading={busy !== ''} busyText={busy === 'suggest' ? 'Finding skills…' : 'Saving…'}
            label={needsSuggest ? 'Suggest skills' : editing ? 'Save' : 'Add certificate'} onCancel={onCancel} disabled={!canSuggest} />}
    </form>
  )
}

// ── Award (moved from AwardsTab.jsx) ──────────────────────────────────────────
// Fields follow LinkedIn's Honors & awards form (title, issuer, date, description; references.md "Showcase profile").

export function AwardForm({ award, onDone, onCancel, onDirty }) {
  const editing = !!award
  const [initial] = useState(() => ({ title: award?.title || '', issuer: award?.issuer || '',
                                       award_date: award?.award_date || '', description: award?.description || '' }))
  const [form, setForm] = useState(initial)
  const [skills, setSkills] = useState(award?.mapped_skills || [])
  const [triedSuggest, setTriedSuggest] = useState(editing)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState('')                 // '' | 'suggest' | 'save'
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [dupe, setDupe] = useState('')

  const set = (key) => (e) => { setForm(f => ({ ...f, [key]: e.target.value })); setDupe('') }
  const addChips = (names) => setSkills(prev => {
    const have = new Set(prev.map(s => s.toLowerCase()))
    return [...prev, ...names.filter(n => n.length <= 60 && !have.has(n.toLowerCase()) && have.add(n.toLowerCase()))]
  })
  const takeDraft = () => { if (draft.trim()) { addChips(splitSkills(draft)); setDraft('') } }
  const canSuggest = form.title.trim() && form.issuer.trim()

  const suggest = async () => {
    setBusy('suggest'); setError(''); setNote('')
    try {
      const res = await api.post('/profile/awards/suggest', { title: form.title.trim(), issuer: form.issuer.trim(),
                                                              description: form.description.trim() })
      const found = res.data.skills || []
      if (found.length) addChips(found)
      else if (res.data.failed) setNote("Couldn't suggest skills right now. You can add them yourself, or try again later.")
      else setNote('No particular skill found for this award. That is normal for awards like a dean\'s list. Add skills yourself if it shows some.')
      setTriedSuggest(true)
    } catch (err) {
      setError(errText(err, "Couldn't suggest skills right now. You can add them yourself."))
      setTriedSuggest(true)
    } finally { setBusy('') }
  }

  // With no skills yet, the main button suggests first, so an award is never saved with skills nobody looked at
  const needsSuggest = !skills.length && !draft.trim() && !triedSuggest
  useEffect(() => {
    onDirty?.(JSON.stringify(form) !== JSON.stringify(initial) || draft.trim() !== ''
      || JSON.stringify(skills) !== JSON.stringify(award?.mapped_skills || []))
  }, [form, initial, draft, skills, award, onDirty])

  const submit = (e) => { e.preventDefault(); if (needsSuggest) suggest(); else save() }
  const save = async (allowDuplicate = false) => {
    const finalSkills = draft.trim() ? [...skills, ...splitSkills(draft).filter(n => !skills.some(s => s.toLowerCase() === n.toLowerCase()))] : skills
    setBusy('save'); setError('')
    const body = { title: form.title.trim(), issuer: form.issuer.trim(), award_date: form.award_date || null,
                   description: form.description.trim(), skills: finalSkills, allow_duplicate: allowDuplicate }
    try {
      const res = editing ? await api.put(`/profile/awards/${award.id}`, body) : await api.post('/profile/awards', body)
      onDone(res.data)
    } catch (err) {
      if (err.response?.status === 409) setDupe(err.response.data.detail)
      else setError(errText(err, editing ? "Couldn't save the award" : "Couldn't add the award"))
    } finally { setBusy('') }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Award title">
        <input type="text" value={form.title} onChange={set('title')} placeholder="e.g. Champion, APU Hackathon 2025"
          className={inputCls} maxLength={150} required autoFocus />
      </Field>
      <div className="flex gap-3">
        <div className="flex-1 min-w-0">
          <Field label="Given by">
            <input type="text" value={form.issuer} onChange={set('issuer')} placeholder="e.g. Asia Pacific University"
              className={inputCls} maxLength={100} required />
          </Field>
        </div>
        <div className="w-40 shrink-0">
          <Field label="Date" optional>
            <input type="month" value={form.award_date} onChange={set('award_date')} className={inputCls} />
          </Field>
        </div>
      </div>
      <Field label="What it was for" optional hint="A sentence helps SkillMap suggest the skills the award shows.">
        <textarea value={form.description} onChange={set('description')} rows={3} maxLength={1000}
          placeholder="e.g. Built a mobile app for campus evacuation with a team of four in 24 hours"
          className={`${inputCls} resize-none`} />
      </Field>
      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <label htmlFor="award-skill-input" className="block text-xs font-medium text-gray-600">Skills it shows</label>
          {!needsSuggest && (
            <button type="button" onClick={suggest} disabled={!canSuggest || busy !== ''}
              className="text-xs font-medium text-blue-700 hover:underline disabled:text-gray-300 disabled:no-underline">
              {busy === 'suggest' ? 'Finding skills…' : 'Suggest skills'}
            </button>
          )}
        </div>
        <div className="w-full border border-gray-200 rounded-xl px-3 py-2.5 flex flex-wrap items-center gap-1.5 focus-within:ring-2 focus-within:ring-blue-500">
          {skills.map(s => <SkillChip key={s} skill={s} onRemove={() => setSkills(prev => prev.filter(x => x !== s))} />)}
          <input id="award-skill-input" value={draft} onChange={e => setDraft(e.target.value)} onBlur={takeDraft}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); takeDraft() }
              if (e.key === 'Backspace' && !draft && skills.length) setSkills(prev => prev.slice(0, -1))
            }}
            onPaste={e => { const t = e.clipboardData.getData('text'); if (/[,;\n]/.test(t)) { e.preventDefault(); addChips(splitSkills(t)) } }}
            placeholder={skills.length ? 'Add another' : 'e.g. Teamwork, Mobile App Development'}
            className="flex-1 min-w-40 text-sm py-0.5 placeholder-gray-300 focus:outline-none" />
        </div>
        <p className="text-xs text-gray-400 mt-1.5">Suggested by AI from the title and description. Remove any that don't fit.</p>
        {note && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-2">{note}</p>}
      </div>
      {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {dupe
        ? <DuplicateAsk message={dupe} yesLabel={editing ? 'Yes, save it' : 'Yes, add it'} busy={busy !== ''}
            onYes={() => save(true)} onBack={() => setDupe('')} />
        : <FormButtons loading={busy !== ''} busyText={busy === 'suggest' ? 'Finding skills…' : 'Saving…'}
            label={needsSuggest ? 'Suggest skills' : editing ? 'Save' : 'Add award'} onCancel={onCancel} disabled={!canSuggest} />}
    </form>
  )
}

// ── Programme + intake (8 Oct) ────────────────────────────────────────────────
// Two drop-downs, used by the first sign-in setup (StudySetup.jsx) and by "Edit intro". options = GET /profile/study.
// The intake list follows the programme picked. A programme the career office hasn't given intakes yet can be saved
// without one.

export function StudyFields({ options, value, onChange }) {
  const programme = options.programmes.find(p => p.id === value.programme_id)
  return (
    // One under the other: programme names are long ("BSc (Hons) Software Engineering")
    <div className="space-y-4">
      <div>
        <label htmlFor="study-programme" className="block text-xs font-medium text-gray-600 mb-1.5">Programme <span className="text-red-400">*</span></label>
        <select id="study-programme" value={value.programme_id ?? ''} className={inputCls} required
          onChange={e => onChange({ programme_id: e.target.value ? Number(e.target.value) : null, intake_id: null })}>
          <option value="">Pick your programme</option>
          {options.programmes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="study-intake" className="block text-xs font-medium text-gray-600 mb-1.5">Intake <span className="text-red-400">*</span></label>
        <select id="study-intake" value={value.intake_id ?? ''} className={inputCls} disabled={!programme || !programme.intakes.length}
          required={!!programme?.intakes.length}
          onChange={e => onChange({ ...value, intake_id: e.target.value ? Number(e.target.value) : null })}>
          <option value="">{programme && !programme.intakes.length ? 'No intakes yet' : 'Pick your intake'}</option>
          {programme?.intakes.map(i => <option key={i.id} value={i.id}>{i.code}</option>)}
        </select>
        {programme && !programme.intakes.length && <p className="text-xs text-gray-400 mt-1.5">The career office hasn't added intakes yet. You can pick it later.</p>}
      </div>
    </div>
  )
}

// ── Intro: headline + programme and intake (8 Oct) ────────────────────────────
// data = GET /profile/showcase. Saves only what changed: the study (PUT /profile/study) and/or the headline
// (PUT /profile/about, which takes every About field, so the others are sent back as they are).

export function IntroForm({ data, onDone, onCancel, onDirty }) {
  const [headline, setHeadline] = useState(data.headline || '')
  const [options, setOptions] = useState(null)      // the programmes and intakes to pick from
  const [study, setStudy] = useState(null)          // what is picked: { programme_id, intake_id }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/profile/study')
      .then(res => { setOptions(res.data); setStudy({ programme_id: res.data.programme_id, intake_id: res.data.intake_id }) })
      .catch(() => setError("Couldn't load the programmes. Please try again."))
  }, [])

  const studyChanged = !!options && (study.programme_id !== options.programme_id || study.intake_id !== options.intake_id)
  const headlineChanged = headline.trim() !== (data.headline || '')
  useEffect(() => { onDirty?.(studyChanged || headlineChanged) }, [studyChanged, headlineChanged, onDirty])

  const save = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      if (studyChanged) await api.put('/profile/study', study)
      if (headlineChanged) await api.put('/profile/about', { ...aboutBody(data), headline })
      onDone(studyChanged ? study : null)
    } catch (err) {
      setError(errText(err, "Couldn't save. Please try again."))
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <p className="text-xs text-gray-500">Your name comes from <Link to="/account" className="text-blue-700 hover:underline">Account settings</Link>.</p>
      <Field label="Headline" optional>
        <input value={headline} onChange={e => setHeadline(e.target.value)} maxLength={120} className={inputCls} autoFocus
          placeholder="e.g. Final-year Software Engineering student · aspiring backend developer" />
      </Field>
      {options ? <StudyFields options={options} value={study} onChange={setStudy} />
        : !error && <div className="flex justify-center py-4 text-blue-600"><Spinner /></div>}
      {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <FormButtons loading={busy} busyText="Saving…" label="Save" onCancel={onCancel}
        disabled={!options || !studyComplete(options, study) || !(studyChanged || headlineChanged)} />
    </form>
  )
}

// ── About, and links (8 Oct) ──────────────────────────────────────────────────
// Both save through PUT /profile/about with the other fields sent back unchanged.

function useAboutSave(data, onDone) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async (changes) => {
    setBusy(true); setError('')
    try { await api.put('/profile/about', { ...aboutBody(data), ...changes }); onDone() }
    catch (err) { setError(errText(err, "Couldn't save. Please try again.")) }
    finally { setBusy(false) }
  }
  return { busy, error, save }
}

export function AboutForm({ data, onDone, onCancel, onDirty }) {
  const [about, setAbout] = useState(data.about || '')
  const { busy, error, save } = useAboutSave(data, onDone)
  const changed = about.trim() !== (data.about || '')
  useEffect(() => { onDirty?.(changed) }, [changed, onDirty])
  return (
    <form onSubmit={e => { e.preventDefault(); save({ about }) }} className="space-y-4">
      <div>
        <textarea aria-label="About" value={about} onChange={e => setAbout(e.target.value)} rows={8} maxLength={1000} autoFocus
          className={`${inputCls} resize-none`} placeholder="A few sentences: what you enjoy building, what kind of role you are looking for" />
        <p className="text-xs text-gray-400 mt-1 text-right tabular-nums">{about.length} / 1000</p>
      </div>
      {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <FormButtons loading={busy} busyText="Saving…" label="Save" onCancel={onCancel} disabled={!changed} />
    </form>
  )
}

const LINKS = [
  { key: 'linkedin_url', label: 'LinkedIn', placeholder: 'https://www.linkedin.com/in/your-name' },
  { key: 'portfolio_url', label: 'Portfolio or personal website', placeholder: 'https://your-site.com' },
  { key: 'github_url', label: 'GitHub profile', placeholder: 'https://github.com/your-name' },
]

export function LinksForm({ data, onDone, onCancel, onDirty }) {
  const [initial] = useState(() => {
    const body = aboutBody(data)
    return Object.fromEntries(LINKS.map(l => [l.key, body[l.key]]))
  })
  const [links, setLinks] = useState(initial)
  const { busy, error, save } = useAboutSave(data, onDone)
  const changed = JSON.stringify(links) !== JSON.stringify(initial)
  useEffect(() => { onDirty?.(changed) }, [changed, onDirty])
  return (
    <form onSubmit={e => { e.preventDefault(); save(links) }} className="space-y-4">
      {LINKS.map((l, i) => (
        <Field key={l.key} label={l.label} optional>
          <input type="url" value={links[l.key]} maxLength={300} className={inputCls} placeholder={l.placeholder} autoFocus={i === 0}
            onChange={e => setLinks(prev => ({ ...prev, [l.key]: e.target.value }))} />
        </Field>
      ))}
      {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <FormButtons loading={busy} busyText="Saving…" label="Save" onCancel={onCancel} disabled={!changed} />
    </form>
  )
}
