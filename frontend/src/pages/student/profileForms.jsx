import { useEffect, useRef, useState } from 'react'
import api from '../../api'
import { DuplicateAsk, Field, FormButtons, SkillChecker, SkillChip } from './profileParts'
import { MIN_DESCRIPTION, errText, inputCls, mergeFound, projectChips, projectKey, splitSkills, studyComplete } from './profileUtils'
import { Busy } from '../../components/Spinner'
import { FieldSkeleton, LoadingLabel } from '../../components/Skeleton'
import { CATEGORIES } from './experienceKinds'

// Every pop-up form on My Profile (8-9 Oct). Each one is opened by a button on the page and closes itself through
// onDone / onCancel; onDirty tells the pop-up there is something typed, so a stray click outside asks first.
// Project, certificate and award forms moved here unchanged from the old Skill Profile tabs.

// ── Project (moved from Profile.jsx) ──────────────────────────────────────────

// Project pop-up (10 Oct, her flow, the same as certificates and admin modules): fill in the details, "Find skills"
// (POST /profile/projects/suggest: the AI reads her words, GitHub gives the repo's main languages; nothing saved),
// check the chips, then add. Changing the name, description or link after finding asks to find them again (skills she
// typed stay), so what is saved always matches the text. The button says why it can't run yet.
export function ProjectForm({ project, onDone, onCancel, onDirty }) {
  const editing = !!project
  const [initial] = useState(() => ({
    name: project?.name || '', description: project?.description || '', github_url: project?.github_url || '',
  }))
  // 21 Oct: the project's context, all optional; changing it never asks to find the skills again
  const [initialCtx] = useState(() => ({ role: project?.role || '', team_size: project?.team_size ? String(project.team_size) : '',
    outcome: project?.outcome || '', demo_url: project?.demo_url || '' }))
  const [ctx, setCtx] = useState(initialCtx)
  const [form, setForm] = useState(initial)
  const [skills, setSkills] = useState(() => projectChips(project))
  const [foundFor, setFoundFor] = useState(() => (editing ? projectKey(initial) : null))
  const [notes, setNotes] = useState([])
  const [recordId, setRecordId] = useState(null)  // 14 Oct: the AI's suggestion (MongoDB extraction_records)
  const [repoCheck, setRepoCheck] = useState(null)   // 14 Oct: {url, status: 'yours' | 'not_linked' | null, as, connected}
  const checkRepo = () => {
    const url = form.github_url.trim()
    if (!url || repoCheck?.url === url) return
    api.post('/profile/github/check', { url })
      .then(res => setRepoCheck({ url, ...res.data }))
      .catch(() => setRepoCheck(null))
  }
  const repoState = repoCheck?.url === form.github_url.trim() ? repoCheck.status : null
  // Editing a project that has a repo: check it once when the form opens
  useEffect(() => { if (project?.github_url) checkRepo() }, [])   // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState('')            // '' | 'find' | 'save'
  const [error, setError] = useState('')
  const [dupe, setDupe] = useState('')            // "you already have one called ..." question
  useEffect(() => {
    onDirty?.(JSON.stringify(form) !== JSON.stringify(initial) || JSON.stringify(ctx) !== JSON.stringify(initialCtx)
      || JSON.stringify(skills) !== JSON.stringify(projectChips(project)))
  }, [form, initial, ctx, initialCtx, skills, project, onDirty])

  const descLength = form.description.trim().length
  const ready = form.name.trim() && descLength >= MIN_DESCRIPTION
  const found = foundFor !== null
  const stale = found && foundFor !== projectKey(form)
  const set = (k) => (e) => { setForm(p => ({ ...p, [k]: e.target.value })); setDupe('') }

  const find = async () => {
    setBusy('find'); setError(''); setNotes([])
    try {
      const res = await api.post('/profile/projects/suggest', { name: form.name.trim(), description: form.description.trim(),
        github_url: form.github_url.trim() || null })
      setSkills(prev => mergeFound(prev, res.data.skills))
      setRecordId(res.data.record_id || null)    // 14 Oct: sent back on save (what you kept vs the AI's suggestion)
      setNotes([res.data.skills_note, res.data.github_note].filter(Boolean))
      setFoundFor(projectKey(form))
    } catch (err) {
      setError(errText(err, "Couldn't find skills right now. Type them yourself, or try again later."))
      setFoundFor(projectKey(form))
    } finally { setBusy('') }
  }
  const save = async (allowDuplicate = false) => {
    setBusy('save'); setError('')
    const body = { name: form.name.trim(), description: form.description.trim(), github_url: form.github_url.trim() || null,
                   skills: Object.fromEntries(skills.map(s => [s.name, s.evidence])), allow_duplicate: allowDuplicate,
                   record_id: recordId, role: ctx.role.trim(), team_size: ctx.team_size ? Number(ctx.team_size) : null,
                   outcome: ctx.outcome.trim(), demo_url: ctx.demo_url.trim() }
    try {
      const res = editing ? await api.put(`/profile/projects/${project.id}`, body) : await api.post('/profile/projects', body)
      onDone(res.data)
    } catch (err) {
      if (err.response?.status === 409) setDupe(err.response.data.detail)
      else setError(errText(err, editing ? "Couldn't save the project" : "Couldn't add the project"))
    } finally { setBusy('') }
  }
  const submit = (e) => {
    e.preventDefault()
    if (!ready || busy) return
    if (!found || stale) find()
    else if (skills.length) save()
  }
  const label = !found ? 'Find skills' : stale ? 'Find skills again' : editing ? 'Save' : 'Add project'
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Project name">
        <input type="text" value={form.name} onChange={set('name')}
          placeholder="e.g. Inventory Management System" className={inputCls} maxLength={100} required autoFocus />
      </Field>
      <div>
        <Field label="What you built and the tools you used">
          <textarea value={form.description} onChange={set('description')}
            placeholder="e.g. A booking app for the campus library in React, with a FastAPI backend and PostgreSQL" rows={6}
            className={`${inputCls} resize-none`} maxLength={3000} required />
        </Field>
        <p className="flex justify-between text-xs mt-1.5">
          {/* 14 Oct (her FYP project found no skills: its description said what it does, not what it's built with) */}
          <span className={descLength < MIN_DESCRIPTION ? 'text-amber-700' : 'text-gray-500'}>{descLength < MIN_DESCRIPTION
            ? `Write at least ${MIN_DESCRIPTION} characters so skills can be found.`
            : 'Name the tools you used (the language, framework, database) so SkillMap can find them in your words.'}</span>
          <span className="text-gray-400 tabular-nums shrink-0 ml-3">{form.description.length} / 3000</span>
        </p>
      </div>
      <div>
        <Field label="GitHub link" optional>
          <input type="url" value={form.github_url} onChange={set('github_url')} onBlur={checkRepo}
            placeholder="https://github.com/username/repo" className={inputCls} maxLength={500} />
        </Field>
        {/* 14 Oct (her review: three lines were repetitive): ONE line under the link, by situation. The check never
            blocks saving (people have several accounts) */}
        {repoState === 'yours' ? (
          <p className="text-xs mt-1.5"><span className="font-medium text-emerald-700">✓ Yours (as {repoCheck.as}).</span>
            <span className="text-gray-500"> Its main languages are added as skills.</span></p>
        ) : repoState === 'not_linked' ? (
          <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-1.5">
            Not linked to {repoCheck.connected ? 'a GitHub account you connected' : 'your GitHub yet'}. If it's yours,
            connect that account in Profile &amp; privacy. You can still save; employers just won’t see the ✓ GitHub badge.
          </p>
        ) : (
          <p className="text-xs text-gray-500 mt-1.5">Only add repositories you built or contributed to. Their main languages are added as skills (public repos only).</p>
        )}
      </div>
      {/* 21 Oct (references.md "What employers look for in graduates"): what you did and what came of it */}
      <div className="grid sm:grid-cols-[1fr_7rem] gap-3">
        <Field label="Your role" optional>
          <input value={ctx.role} onChange={e => setCtx(c => ({ ...c, role: e.target.value }))} maxLength={80}
            placeholder="e.g. Back-end developer, team lead" className={inputCls} />
        </Field>
        <Field label="Team size" optional>
          <input type="number" min={1} max={50} value={ctx.team_size} onChange={e => setCtx(c => ({ ...c, team_size: e.target.value }))}
            placeholder="1 = solo" className={inputCls} />
        </Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Outcome" optional>
          <input value={ctx.outcome} onChange={e => setCtx(c => ({ ...c, outcome: e.target.value }))} maxLength={300}
            placeholder="e.g. Used by 120 club members; grade A" className={inputCls} />
        </Field>
        <Field label="Demo link" optional>
          <input type="url" value={ctx.demo_url} onChange={e => setCtx(c => ({ ...c, demo_url: e.target.value }))} maxLength={500}
            placeholder="A live site or a video" className={inputCls} />
        </Field>
      </div>
      {found ? (
        <div>
          <SkillChecker id="project-skills" skills={skills} onChange={setSkills} />
          {stale && <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2 mt-2">You changed the details: find the skills again so they match. Skills you typed stay.</p>}
          {notes.map(n => <p key={n} className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2 mt-2">{n}</p>)}
          {!stale && (
            <button type="button" onClick={find} disabled={!ready || !!busy}
              className="mt-2 text-xs font-medium text-blue-700 hover:underline disabled:text-gray-300 disabled:no-underline">
              {busy === 'find' ? <Busy>Finding skills…</Busy> : 'Find skills again'}
            </button>
          )}
        </div>
      ) : (
        <p className="text-xs text-gray-500 border border-dashed border-gray-200 rounded-xl px-3 py-3 text-center">
          Skills appear here after Find skills, for you to check before {editing ? 'saving' : 'adding'}.
        </p>
      )}
      {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {dupe
        ? <DuplicateAsk message={dupe} yesLabel={editing ? 'Yes, save it' : 'Yes, add it'} busy={!!busy}
            onYes={() => save(true)} onBack={() => setDupe('')} />
        : <FormButtons loading={!!busy} busyText={busy === 'find' ? 'Finding skills…' : 'Saving…'} label={label} onCancel={onCancel}
            disabled={!ready || (found && !stale && !skills.length)} />}
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
              {busy === 'suggest' ? <Busy>Finding skills…</Busy> : suggested ? 'Suggest more' : 'Suggest skills'}
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
              {busy === 'suggest' ? <Busy>Finding skills…</Busy> : 'Suggest skills'}
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

// "APU1F2409CS(DA) · also APU3F2605CS(DA) · started Sep 2024": APU gives each year its own code, so the group's later
// codes are shown too and a student can find theirs by today's code
const intakeLabel = (i) => [i.code, i.other_codes && `also ${i.other_codes}`,
  i.start_date && `started ${new Date(i.start_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`]
  .filter(Boolean).join(' · ')

export function StudyFields({ options, value, onChange }) {
  const programme = options.programmes.find(p => p.id === value.programme_id)
  return (
    // One under the other: programme names are long ("BSc (Hons) Software Engineering")
    <div className="space-y-4">
      <div>
        <label htmlFor="study-programme" className="block text-xs font-medium text-gray-600 mb-1.5">Programme <span className="text-red-400">*</span></label>
        <select id="study-programme" value={value.programme_id ?? ''} className={inputCls} required
          onChange={e => onChange({ programme_id: e.target.value ? Number(e.target.value) : null, intake_id: null })}>
          <option value="" disabled>Pick your programme</option>
          {options.programmes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="study-intake" className="block text-xs font-medium text-gray-600 mb-1.5">Intake <span className="text-red-400">*</span></label>
        <select id="study-intake" value={value.intake_id ?? ''} className={inputCls} disabled={!programme || !programme.intakes.length}
          required={!!programme?.intakes.length}
          onChange={e => onChange({ ...value, intake_id: e.target.value ? Number(e.target.value) : null })}>
          <option value="" disabled>{programme && !programme.intakes.length ? 'No intakes yet' : 'Pick your intake'}</option>
          {programme?.intakes.map(i => <option key={i.id} value={i.id}>{intakeLabel(i)}</option>)}
        </select>
        {programme && !programme.intakes.length && <p className="text-xs text-gray-400 mt-1.5">The career office hasn't added intakes yet. You can pick it later.</p>}
        {/* 10 Oct: each intake has its own module list, so the intake decides which modules the student sees */}
        {!!programme?.intakes.length && <p className="text-xs text-gray-400 mt-1.5">As on your timetable, e.g. APU3F2605CS(DA)</p>}
      </div>
    </div>
  )
}

// ── Programme and intake, changed from the Modules tab (9 Oct) ─────────────

const GRADE_LETTER = { '4.0': 'A', '3.7': 'A-', '3.3': 'B+', '3.0': 'B', '2.7': 'B-', '2.3': 'C+', '2.0': 'C' }

export function StudyForm({ onDone, onCancel, onDirty }) {
  const [options, setOptions] = useState(null)      // the programmes and intakes to pick from
  const [study, setStudy] = useState(null)          // what is picked: { programme_id, intake_id }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/profile/study')
      .then(res => { setOptions(res.data); setStudy({ programme_id: res.data.programme_id, intake_id: res.data.intake_id }) })
      .catch(() => setError("Couldn't load the programmes. Please try again."))
  }, [])

  const changed = !!options && (study.programme_id !== options.programme_id || study.intake_id !== options.intake_id)
  useEffect(() => { onDirty?.(changed) }, [changed, onDirty])

  // 20 Oct (her bug report, her pick A): grades of modules that aren't in the new programme/intake are removed, after
  // she has seen which ones. The first save answers 409 with the list; she confirms here, in the form (her pop-up
  // guide: a confirm for what can't be undone, with buttons that say what they do).
  const [leaving, setLeaving] = useState(null)      // { message, modules: [{ code, name, grade }] }
  const keepBtn = useRef(null)
  // the safe choice gets the focus, without the browser scrolling the pop-up down to it (21 Oct)
  useEffect(() => { if (leaving) keepBtn.current?.focus({ preventScroll: true }) }, [leaving])
  const save = async (e, removeGrades = false) => {
    e?.preventDefault()
    setBusy(true); setError('')
    try { await api.put('/profile/study', { ...study, remove_grades: removeGrades }); onDone(study) }
    catch (err) {
      if (err.response?.status === 409 && err.response.data?.detail?.modules) setLeaving(err.response.data.detail)
      else setError(errText(err, "Couldn't save. Please try again."))
    }
    finally { setBusy(false) }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <p className="text-xs text-gray-500">Your modules follow your programme and intake. Grades for modules in both lists are kept.</p>
      {options ? <StudyFields options={options} value={study} onChange={v => { setStudy(v); setLeaving(null) }} />
        : !error && <><LoadingLabel>Loading programmes…</LoadingLabel><FieldSkeleton n={2} /></>}
      {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {leaving ? (
        <div role="alert" className="bg-amber-50 border border-amber-200 rounded-xl p-3.5">
          <p className="text-sm font-medium text-amber-900">{leaving.message} Their grades will be removed from your profile:</p>
          {/* 20 Oct (her review: crowded): a small table, module | code | grade, in the wider pop-up.
              21 Oct (her review: with 15 modules the pop-up opened scrolled to the bottom, the programme out of sight):
              the table scrolls inside its own box, its header stays, and the pop-up keeps its top in view */}
          <div className="mt-2.5 max-h-56 overflow-y-auto bg-white rounded-lg border border-amber-100">
          <table className="w-full text-sm text-slate-700">
            <thead className="sticky top-0 bg-white"><tr className="text-xs text-slate-500 text-left">
              <th className="font-medium px-3 py-1.5">Module</th><th className="font-medium px-3 py-1.5">Code</th><th className="font-medium px-3 py-1.5 text-right">Grade</th>
            </tr></thead>
            <tbody className="divide-y divide-amber-50">
              {leaving.modules.map(m => (
                <tr key={m.code}><td className="px-3 py-1.5">{m.name}</td><td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">{m.code}</td>
                  <td className="px-3 py-1.5 text-right font-medium">{GRADE_LETTER[String(Number(m.grade).toFixed(1))] || m.grade}</td></tr>
              ))}
            </tbody>
          </table>
          </div>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onCancel} ref={keepBtn}
              className="text-sm font-medium text-slate-700 border border-slate-300 bg-white rounded-lg px-3 py-1.5 hover:bg-slate-50">Keep my programme</button>
            <button type="button" disabled={busy} onClick={() => save(null, true)}
              className="text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg px-3 py-1.5 disabled:opacity-60">{busy ? 'Saving…' : 'Change and remove grades'}</button>
          </div>
        </div>
      ) : (
        <FormButtons loading={busy} busyText="Saving…" label="Save" onCancel={onCancel}
          disabled={!options || !studyComplete(options, study) || !changed} />
      )}
    </form>
  )
}

// ── Edit profile: other profiles + profile visibility (9 Oct) ─────────────
// One PUT /profile/about, which takes every About field; headline and About are no longer shown (9 Oct design) but
// are sent back unchanged so nothing saved before is lost. Group names follow Handshake ("Profile visibility").


// ── Work experience and activities (21 Oct) ───────────────────────────────────
// references.md "What employers look for in graduates". The same flow as an award: fill in, "Suggest skills" (the AI
// reads what you did; each skill must be in your words, or it is dropped), check the chips, then add.

const MONTH_NOW = () => new Date().toISOString().slice(0, 7)

export function ExperienceForm({ item, kind: newKind, onDone, onCancel, onDirty }) {
  const editing = !!item
  const kind = item?.kind || newKind
  const [initial] = useState(() => ({ category: item?.category || CATEGORIES[kind][0][0], role: item?.role || '',
    organisation: item?.organisation || '', start_month: item?.start_month || '', end_month: item?.end_month || '',
    ongoing: editing ? !item.end_month : false, description: item?.description || '' }))
  const [form, setForm] = useState(initial)
  const [skills, setSkills] = useState(item?.mapped_skills || [])
  const [added, setAdded] = useState(item?.added_skills || [])
  const [triedSuggest, setTriedSuggest] = useState(editing)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [dupe, setDupe] = useState('')
  const set = (key) => (e) => { setForm(f => ({ ...f, [key]: e.target.value })); setDupe('') }
  const addChips = (names, typed) => {
    const have = new Set(skills.map(x => x.toLowerCase()))
    const fresh = names.filter(n => n.length <= 60 && !have.has(n.toLowerCase()) && have.add(n.toLowerCase()))
    setSkills(prev => [...prev, ...fresh])
    if (typed) setAdded(prev => [...prev, ...fresh])
  }
  const takeDraft = () => { if (draft.trim()) { addChips(splitSkills(draft), true); setDraft('') } }
  const ready = form.role.trim() && form.organisation.trim()
  const datesOk = form.start_month && (form.ongoing || form.end_month)
  const work = kind === 'work'

  useEffect(() => {
    onDirty?.(JSON.stringify(form) !== JSON.stringify(initial) || draft.trim() !== ''
      || JSON.stringify(skills) !== JSON.stringify(item?.mapped_skills || []))
  }, [form, initial, draft, skills, item, onDirty])

  const suggest = async () => {
    setBusy('suggest'); setError(''); setNote('')
    try {
      const res = await api.post('/profile/experiences/suggest', { kind, role: form.role.trim(),
        organisation: form.organisation.trim(), description: form.description.trim() })
      const found = (res.data.skills || []).map(x => x.name)
      if (found.length) addChips(found, false)
      else if (res.data.too_short) setNote(`Write a sentence about what you did (at least ${MIN_DESCRIPTION} characters) so skills can be suggested, or add them yourself.`)
      else if (res.data.failed) setNote("Couldn't suggest skills right now. You can add them yourself, or try again later.")
      else setNote('No skills found in what you wrote. Name the tools you used and what you did, or add skills yourself.')
      setTriedSuggest(true)
    } catch (err) {
      setError(errText(err, "Couldn't suggest skills right now. You can add them yourself."))
      setTriedSuggest(true)
    } finally { setBusy('') }
  }
  const needsSuggest = !skills.length && !draft.trim() && !triedSuggest
  const save = async (allowDuplicate = false) => {
    const extra = draft.trim() ? splitSkills(draft).filter(n => !skills.some(x => x.toLowerCase() === n.toLowerCase())) : []
    setBusy('save'); setError('')
    const body = { kind, category: form.category, role: form.role.trim(), organisation: form.organisation.trim(),
                   start_month: form.start_month, end_month: form.ongoing ? null : form.end_month || null,
                   description: form.description.trim(), skills: [...skills, ...extra], added: [...added, ...extra],
                   allow_duplicate: allowDuplicate }
    try {
      const res = editing ? await api.put(`/profile/experiences/${item.id}`, body) : await api.post('/profile/experiences', body)
      onDone(res.data)
    } catch (err) {
      if (err.response?.status === 409) setDupe(err.response.data.detail)
      else setError(errText(err, "Couldn't save. Please try again."))
    } finally { setBusy('') }
  }
  const submit = (e) => { e.preventDefault(); if (!ready || !datesOk || busy) return; if (needsSuggest) suggest(); else save() }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid sm:grid-cols-[12rem_1fr] gap-3">
        <Field label="Type">
          <select value={form.category} onChange={set('category')} className={inputCls}>
            {CATEGORIES[kind].map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label={work ? 'Job title' : 'Your role'}>
          <input value={form.role} onChange={set('role')} maxLength={120} required autoFocus className={inputCls}
            placeholder={work ? 'e.g. Software Engineering Intern' : 'e.g. Vice President, Participant, Volunteer'} />
        </Field>
      </div>
      <Field label={work ? 'Company' : 'Club, event or organisation'}>
        <input value={form.organisation} onChange={set('organisation')} maxLength={120} required className={inputCls}
          placeholder={work ? 'e.g. NTT DATA Payment Services' : 'e.g. APU Google Developer Student Club'} />
      </Field>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44"><Field label="From">
          <input type="month" value={form.start_month} max={MONTH_NOW()} onChange={set('start_month')} required className={inputCls} />
        </Field></div>
        <div className="w-44"><Field label="To">
          <input type="month" value={form.ongoing ? '' : form.end_month} min={form.start_month || undefined} disabled={form.ongoing}
            onChange={set('end_month')} className={`${inputCls} disabled:bg-gray-50`} />
        </Field></div>
        <label className="flex items-center gap-2 text-sm text-gray-700 pb-2.5">
          <input type="checkbox" checked={form.ongoing} onChange={e => setForm(f => ({ ...f, ongoing: e.target.checked }))} />
          {work ? 'I still work here' : 'I still do this'}
        </label>
      </div>
      <Field label="What you did" optional hint="A sentence or two, naming the tools you used, helps SkillMap suggest the skills it shows.">
        <textarea value={form.description} onChange={set('description')} rows={3} maxLength={1500} className={`${inputCls} resize-none`}
          placeholder={work ? 'e.g. Built REST APIs with Spring Boot and wrote unit tests for the payments team' : 'e.g. Ran weekly coding workshops for 60 members and organised the club hackathon'} />
      </Field>
      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <label htmlFor="exp-skill-input" className="block text-xs font-medium text-gray-600">Skills it shows</label>
          {!needsSuggest && (
            <button type="button" onClick={suggest} disabled={!ready || busy !== ''}
              className="text-xs font-medium text-blue-700 hover:underline disabled:text-gray-300 disabled:no-underline">
              {busy === 'suggest' ? <Busy>Finding skills…</Busy> : 'Suggest skills'}
            </button>
          )}
        </div>
        <div className="w-full border border-gray-200 rounded-xl px-3 py-2.5 flex flex-wrap items-center gap-1.5 focus-within:ring-2 focus-within:ring-blue-500">
          {skills.map(x => <SkillChip key={x} skill={x} added={added.includes(x)} onRemove={() => setSkills(prev => prev.filter(y => y !== x))} />)}
          <input id="exp-skill-input" value={draft} onChange={e => setDraft(e.target.value)} onBlur={takeDraft}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); takeDraft() }
              if (e.key === 'Backspace' && !draft && skills.length) setSkills(prev => prev.slice(0, -1))
            }}
            placeholder={skills.length ? 'Add another' : 'e.g. Spring Boot, Teamwork'}
            className="flex-1 min-w-40 text-sm py-0.5 placeholder-gray-300 focus:outline-none" />
        </div>
        <p className="text-xs text-gray-400 mt-1.5">Suggested from your own words only. Remove any that don't fit.</p>
        {note && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-2">{note}</p>}
      </div>
      {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {dupe
        ? <DuplicateAsk message={dupe} yesLabel={editing ? 'Yes, save it' : 'Yes, add it'} busy={busy !== ''}
            onYes={() => save(true)} onBack={() => setDupe('')} />
        : <FormButtons loading={busy !== ''} busyText={busy === 'suggest' ? 'Finding skills…' : 'Saving…'}
            label={needsSuggest ? 'Suggest skills' : editing ? 'Save' : 'Add'} onCancel={onCancel} disabled={!ready || !datesOk} />}
    </form>
  )
}
