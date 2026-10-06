import { useState, useEffect, useCallback } from 'react'
import PageHeader from '../../components/PageHeader'
import { useSearchParams } from 'react-router-dom'
import api from '../../api'

// ── Shared ────────────────────────────────────────────────────────────────────

// One skill. title = hover text (the student's own words, "GitHub: …", "Added by you", "Suggested by AI"); onRemove adds
// an ✕ (4 Oct: the student can take out a wrong skill, Nielsen "user control and freedom"). Looks: AI estimate = dashed
// border; added by the student = grey; everything with evidence = blue.
function SkillChip({ skill, title, onRemove, estimated = false, added = false }) {
  const look = added ? 'bg-gray-100 text-gray-700 border-gray-200'
    : estimated ? 'bg-white text-blue-700 border-blue-200 border-dashed'
    : 'bg-blue-50 text-blue-700 border-blue-100'
  return (
    <span title={title} className={`group/chip inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium border ${look}`}>
      {skill}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${skill}`}
          className="-mr-1 ml-0.5 w-4 h-4 inline-flex items-center justify-center rounded-full text-current opacity-40 hover:text-red-500 hover:bg-red-50 group-hover/chip:opacity-100 focus:opacity-100">
          ×
        </button>
      )}
    </span>
  )
}

function EmptyState({ icon, title, subtitle }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-55 gap-3 text-center">
      <span className="text-4xl">{icon}</span>
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
      </div>
    </div>
  )
}

function Spinner({ size = 'md' }) {
  const sz = size === 'sm' ? 'w-3.5 h-3.5 border-2' : 'w-5 h-5 border-2'
  return <div className={`${sz} border-current border-t-transparent rounded-full animate-spin`} />
}

const GRADE_OPTIONS = [
  { label: 'A (4.0)', value: 4.0 },
  { label: 'A- (3.7)', value: 3.7 },
  { label: 'B+ (3.3)', value: 3.3 },
  { label: 'B (3.0)', value: 3.0 },
  { label: 'B- (2.7)', value: 2.7 },
  { label: 'C+ (2.3)', value: 2.3 },
  { label: 'C (2.0)', value: 2.0 },
]

// ── Projects and certificates (4 Oct, her review) ─────────────────────────────
// Layout C: the list uses the full width; "+ Add" and each card's Edit open the same form in a pop-up (one form for
// both, as LinkedIn's "Add licence or certification"). One page scrollbar, no nested scroll areas (references.md).

const inputCls = 'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500'
const ADDED_BY_YOU = 'Added by you'
const errText = (err, fallback) => err.response?.data?.detail || fallback

// dirty = something has been typed: clicking outside, Esc or the corner ✕ then asks before throwing it away
// (5 Oct: a stray click outside lost a long description). The form's own Cancel closes straight away.
function Modal({ title, onClose, dirty = false, children }) {
  const [asking, setAsking] = useState(false)
  const tryClose = useCallback(() => { if (dirty) setAsking(true); else onClose() }, [dirty, onClose])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') tryClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tryClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30" onMouseDown={tryClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onMouseDown={e => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-5 pb-1">
          <h3 className="text-base font-semibold text-gray-800">{title}</h3>
          <button type="button" onClick={tryClose} aria-label="Close" className="text-gray-400 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        {asking && (
          <div role="alertdialog" aria-label="Discard changes" className="mx-6 mt-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-sm text-amber-800">Discard your changes?</p>
            <div className="flex gap-2 shrink-0">
              <button type="button" onClick={() => setAsking(false)} autoFocus className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">Keep editing</button>
              <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg">Discard</button>
            </div>
          </div>
        )}
        <div className="px-6 pb-6 pt-3">{children}</div>
      </div>
    </div>
  )
}

// "Delete X?" before a project or certificate goes (5 Oct: the card's ✕ sits near the chips' ×)
// onDelete must throw if the delete failed: the question then stays open and says so (5 Oct audit: a failed delete
// used to close it silently, so the student couldn't tell whether anything was deleted)
function ConfirmDelete({ name, onCancel, onDelete }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const del = async () => {
    setBusy(true); setFailed(false)
    try { await onDelete() } catch { setFailed(true); setBusy(false) }
  }
  return (
    <Modal title="Delete?" onClose={onCancel}>
      <p className="text-sm text-gray-600">Delete <span className="font-medium text-gray-800">“{name}”</span>? Its skills will leave your profile.</p>
      {failed && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 mt-3">Couldn't delete it. Please try again.</p>}
      <div className="flex justify-end gap-2 pt-5">
        <button type="button" onClick={onCancel} autoFocus className="px-4 py-2 text-sm text-gray-500 hover:text-gray-800">Cancel</button>
        <button type="button" disabled={busy} onClick={del}
          className="bg-red-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-red-700 disabled:opacity-40">Delete</button>
      </div>
    </Modal>
  )
}

function Field({ label, optional, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1.5">
        {label} {optional ? <span className="text-gray-300 font-normal">(optional)</span> : <span className="text-red-400">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1.5">{hint}</p>}
    </div>
  )
}

function FormButtons({ loading, busyText, label, onCancel, disabled }) {
  return (
    <div className="flex items-center justify-end gap-2 pt-2">
      <button type="button" onClick={onCancel} className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-800">Cancel</button>
      <button type="submit" disabled={loading || disabled}
        className="bg-blue-700 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-blue-800 disabled:opacity-40 transition flex items-center gap-2">
        {loading ? <><Spinner size="sm" />{busyText}</> : label}
      </button>
    </div>
  )
}

// "You already have one called X. Are you sure…?" (her wording, 5 Oct): shown in the pop-up in place of the buttons;
// "Yes, add it" sends the form again with allow_duplicate. Changing the name hides it.
function DuplicateAsk({ message, yesLabel, onYes, onBack, busy }) {
  return (
    <div role="alertdialog" aria-label="Same name" className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
      <p className="text-sm text-amber-800">{message}</p>
      <div className="flex justify-end gap-2 mt-3">
        <button type="button" onClick={onBack} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Go back</button>
        <button type="button" onClick={onYes} disabled={busy} autoFocus
          className="bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-blue-800 disabled:opacity-40">{yesLabel}</button>
      </div>
    </div>
  )
}

function IconButton({ label, onClick, children, danger }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label}
      className={`text-gray-300 transition shrink-0 p-1 rounded-lg ${danger ? 'hover:text-red-400 hover:bg-red-50' : 'hover:text-blue-600 hover:bg-blue-50'}`}>
      {children}
    </button>
  )
}
const PencilIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.536-6.536a2.5 2.5 0 113.536 3.536L12.536 16.536 8 17l.464-4.536z" /></svg>
const CrossIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>

// "+ Add skill": a chip that turns into a small box; Enter adds, Esc cancels
function AddSkillChip({ onAdd }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const close = () => { setOpen(false); setValue(''); setError('') }
  const submit = async () => {
    if (!value.trim()) { close(); return }
    setBusy(true); setError('')
    try { await onAdd(value.trim()); close() }
    catch (err) { setError(errText(err, "Couldn't add the skill")) }
    finally { setBusy(false) }
  }
  if (!open) return (
    <button type="button" onClick={() => setOpen(true)}
      className="text-xs px-2.5 py-1 rounded-full font-medium border border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-700">
      + Add skill
    </button>
  )
  return (
    <span className="inline-flex flex-col">
      <input autoFocus value={value} disabled={busy} maxLength={60} placeholder="Skill, then Enter"
        onChange={e => setValue(e.target.value)} onBlur={() => !value.trim() && close()}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit() } if (e.key === 'Escape') close() }}
        className="text-xs px-2.5 py-1 rounded-full border border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-200 w-40" />
      {error && <span className="text-[11px] text-red-500 mt-1">{error}</span>}
    </span>
  )
}

function SkillsRow({ children, empty, emptyText }) {
  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      {empty && <p className="text-xs text-gray-500 mb-2">{emptyText}</p>}
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  )
}

// ── Projects tab ──────────────────────────────────────────────────────────────

function ProjectForm({ project, onDone, onCancel, onDirty }) {
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

function ProjectsTab({ projects, onRefresh }) {
  const [editing, setEditing] = useState(null)   // null = closed, 'new', or a project
  const [note, setNote] = useState('')            // e.g. the GitHub repo couldn't be read

  // small actions (remove a skill, confirm): a failure is said, not swallowed (5 Oct audit)
  const run = async (call) => {
    try { await call(); onRefresh() } catch { setNote("Couldn't save that change. Please try again.") }
  }
  const [deleting, setDeleting] = useState(null)   // the project waiting for "Delete?"
  const [dirty, setDirty] = useState(false)
  const handleDelete = async (id) => { await api.delete(`/profile/projects/${id}`); setDeleting(null); onRefresh() }
  const removeSkill = (id, skill) => run(() => api.post(`/profile/projects/${id}/remove-skill`, { skill }))
  const addSkill = async (id, skill) => { await api.post(`/profile/projects/${id}/add-skill`, { skill }); onRefresh() }
  const done = (saved) => {
    setEditing(null); setDirty(false)
    const notes = [saved.skills_note, saved.github_note].filter(Boolean)
    setNote(notes.length ? `${saved.name}: ${notes.join(' ')}` : '')
    onRefresh()
  }

  const tooltip = (q) => !q ? undefined : q === ADDED_BY_YOU || q.startsWith('GitHub:') ? q : `“${q}”`

  return (
    // Title row fixed; only the cards scroll (her request 5 Oct, same as Modules). Panel is keyboard-focusable.
    <div className="lg:h-full flex flex-col">
      <div className="shrink-0 flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-800">Your Projects</h3>
        <button type="button" onClick={() => setEditing('new')}
          className="bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-blue-800 transition">+ Add project</button>
      </div>
      <div tabIndex={0} aria-label="Your projects"
        className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto -mx-1 px-1 pb-1 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
      {note && (
        <p role="status" className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-3 flex justify-between gap-3">
          <span>{note}</span><button type="button" onClick={() => setNote('')} aria-label="Dismiss" className="text-amber-500 hover:text-amber-800">×</button>
        </p>
      )}
      {projects.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8">
          <EmptyState icon="🗂️" title="No projects yet" subtitle="Add a project to show the skills you used" />
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map(p => (
            <div key={p.id} className="bg-white rounded-2xl border border-gray-200 p-5 hover:border-blue-200 transition">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-800">{p.name}</span>
                    {p.github_url && <a href={p.github_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">GitHub ↗</a>}
                  </div>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">{p.description}</p>
                </div>
                <div className="flex items-center gap-0.5">
                  <IconButton label="Edit project" onClick={() => setEditing(p)}><PencilIcon /></IconButton>
                  <IconButton label="Delete project" danger onClick={() => setDeleting(p)}><CrossIcon /></IconButton>
                </div>
              </div>
              <SkillsRow empty={!p.extracted_skills?.length} emptyText="No skills yet. Add the skills you used.">
                {(p.extracted_skills || []).map((s, i) => (
                  <SkillChip key={i} skill={s} title={tooltip(p.skill_quotes?.[s])} added={p.skill_quotes?.[s] === ADDED_BY_YOU}
                    onRemove={() => removeSkill(p.id, s)} />
                ))}
                <AddSkillChip onAdd={(skill) => addSkill(p.id, skill)} />
              </SkillsRow>
            </div>
          ))}
        </div>
      )}
      </div>
      {deleting && <ConfirmDelete name={deleting.name} onCancel={() => setDeleting(null)} onDelete={() => handleDelete(deleting.id)} />}
      {editing && (
        <Modal title={editing === 'new' ? 'Add a project' : 'Edit project'} dirty={dirty} onClose={() => { setEditing(null); setDirty(false) }}>
          <ProjectForm project={editing === 'new' ? null : editing} onDone={done} onDirty={setDirty}
            onCancel={() => { setEditing(null); setDirty(false) }} />
        </Modal>
      )}
    </div>
  )
}

// ── Certifications tab ────────────────────────────────────────────────────────

// Certificate pop-up (4 Oct, her flow): the skills are shown as chips BEFORE saving, so everything saved has been seen
// and checked (Amershi et al. 2019: support efficient correction; references.md "Reviewing AI-suggested skills").
// Type or paste the skills listed on the certificate, or "Suggest skills" from the name; × removes a chip.
// With no skills yet, the main button suggests first, so a certificate is never saved with skills nobody looked at.
const splitSkills = (text) => text.split(/[,;\n•]+/).map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean)

function CertForm({ cert, onDone, onCancel, onDirty }) {
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

function CertificationsTab({ certs, onRefresh }) {
  const [editing, setEditing] = useState(null)
  const [note, setNote] = useState('')

  // small actions (remove a skill, confirm): a failure is said, not swallowed (5 Oct audit)
  const run = async (call) => {
    try { await call(); onRefresh() } catch { setNote("Couldn't save that change. Please try again.") }
  }
  const [deleting, setDeleting] = useState(null)
  const [dirty, setDirty] = useState(false)
  const handleDelete = async (id) => { await api.delete(`/profile/certifications/${id}`); setDeleting(null); onRefresh() }
  const removeSkill = (id, skill) => run(() => api.post(`/profile/certifications/${id}/remove-skill`, { skill }))
  const confirm = (id) => run(() => api.post(`/profile/certifications/${id}/confirm`))
  const addSkill = async (id, skill) => { await api.post(`/profile/certifications/${id}/add-skill`, { skill }); onRefresh() }

  return (
    // Title row fixed; only the cards scroll (her request 5 Oct, same as Modules). Panel is keyboard-focusable.
    <div className="lg:h-full flex flex-col">
      <div className="shrink-0 flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-800">Your Certifications</h3>
        <button type="button" onClick={() => setEditing('new')}
          className="bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-blue-800 transition">+ Add certificate</button>
      </div>
      <div tabIndex={0} aria-label="Your certifications"
        className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto -mx-1 px-1 pb-1 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
      {note && (
        <p role="status" className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-3 flex justify-between gap-3">
          <span>{note}</span><button type="button" onClick={() => setNote('')} aria-label="Dismiss" className="text-amber-500 hover:text-amber-800">×</button>
        </p>
      )}
      {certs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8">
          <EmptyState icon="🎓" title="No certifications yet" subtitle="Add a certificate to show the skills it covers" />
        </div>
      ) : (
        <div className="space-y-3">
          {certs.map(c => {
            const added = c.added_skills || []
            const estimated = (c.skills_source == null || c.skills_source === 'estimated')
            const aiSkills = c.mapped_skills.filter(s => !added.includes(s))
            return (
              <div key={c.id} className="bg-white rounded-2xl border border-gray-200 p-5 hover:border-blue-200 transition">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-800">{c.cert_name}</p>
                      {c.credly_url && <a href={c.credly_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">Credly ↗</a>}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{c.issuer}</p>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <IconButton label="Edit certificate" onClick={() => setEditing(c)}><PencilIcon /></IconButton>
                    <IconButton label="Delete certificate" danger onClick={() => setDeleting(c)}><CrossIcon /></IconButton>
                  </div>
                </div>
                {/* An AI estimate says so first, with one click to confirm it after checking (her choice, option B) */}
                {estimated && aiSkills.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-500">
                    <span>Suggested by AI from the certificate name. Remove any that don't apply.</span>
                    <button type="button" onClick={() => confirm(c.id)}
                      className="font-medium text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5 hover:bg-blue-50">Confirm skills</button>
                  </div>
                )}
                <div className={estimated && aiSkills.length > 0 ? 'mt-2' : ''}>
                  <SkillsRow empty={!c.mapped_skills.length} emptyText="No skills yet. Add the skills listed on your certificate.">
                    {c.mapped_skills.map((s, i) => (
                      <SkillChip key={i} skill={s} added={added.includes(s)} estimated={estimated && !added.includes(s)}
                        title={added.includes(s) ? ADDED_BY_YOU : estimated ? 'Suggested by AI' : undefined}
                        onRemove={() => removeSkill(c.id, s)} />
                    ))}
                    <AddSkillChip onAdd={(skill) => addSkill(c.id, skill)} />
                  </SkillsRow>
                </div>
              </div>
            )
          })}
        </div>
      )}
      </div>
      {deleting && <ConfirmDelete name={deleting.cert_name} onCancel={() => setDeleting(null)} onDelete={() => handleDelete(deleting.id)} />}
      {editing && (
        <Modal title={editing === 'new' ? 'Add a certificate' : 'Edit certificate'} dirty={dirty} onClose={() => { setEditing(null); setDirty(false) }}>
          <CertForm cert={editing === 'new' ? null : editing} onDirty={setDirty}
            onDone={() => { setEditing(null); setDirty(false); onRefresh() }} onCancel={() => { setEditing(null); setDirty(false) }} />
        </Modal>
      )}
    </div>
  )
}

// ── Modules tab ───────────────────────────────────────────────────────────────

function ModulesTab({ onUnsavedChange, onSaved }) {
  const [modules, setModules] = useState([])
  const [selections, setSelections] = useState({})
  const [savedSelections, setSavedSelections] = useState({})
  const [selectedYear, setSelectedYear] = useState(1)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState('') // '', 'saved', 'error'

  // Only entries with a real grade value (number, not '' or undefined)
  const gradedSelections = (s) =>
    Object.fromEntries(Object.entries(s).filter(([, v]) => v !== '' && v !== undefined))

  const hasUnsaved = JSON.stringify(gradedSelections(selections)) !== JSON.stringify(gradedSelections(savedSelections))

  // Notify parent of unsaved state changes
  useEffect(() => {
    onUnsavedChange?.(hasUnsaved)
  }, [hasUnsaved, onUnsavedChange])

  useEffect(() => {
    Promise.all([
      api.get('/modules/'),
      api.get('/profile/modules'),
    ]).then(([modRes, gradeRes]) => {
      setModules(modRes.data)
      const saved = {}
      for (const { module_code, grade } of gradeRes.data.grades) {
        saved[module_code] = grade
      }
      setSelections(saved)
      setSavedSelections(saved)
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  const saveGrades = async () => {
    // Send only entries with a real grade — backend will delete anything not in this list
    const grades = Object.entries(selections)
      .filter(([, g]) => g !== '' && g !== undefined)
      .map(([module_code, grade]) => ({ module_code, grade }))
    setSaving(true)
    try {
      await api.post('/profile/modules', { grades })
      setSavedSelections(gradedSelections(selections))
      setSaveStatus('saved')
      onSaved?.()  // refresh header stats
      setTimeout(() => setSaveStatus(''), 2500)
    } catch {
      setSaveStatus('error')
    } finally { setSaving(false) }
  }

  const yearModules = modules.filter(m => m.level === selectedYear)
  const compulsory = yearModules.filter(m => m.type === 'common' || m.type === 'specialised')
  const electives = yearModules.filter(m => m.type === 'elective')

  const toggleElective = (code) => setSelections(prev => {
    if (prev[code] !== undefined) { const u = { ...prev }; delete u[code]; return u }
    return { ...prev, [code]: '' }
  })

  // "Not graded yet" ('') clears a grade picked by mistake; only graded modules are saved (IR §1.6.1: completed modules)
  const setGrade = (code, grade) => setSelections(prev => ({ ...prev, [code]: grade === '' ? '' : parseFloat(grade) }))

  if (loading) return (
    <div className="flex items-center justify-center py-24 gap-3 text-gray-400">
      <Spinner /><span className="text-sm">Loading modules…</span>
    </div>
  )

  return (
    // Her layout (4 Oct 23:31): on a wide screen the tab fills the window; the year row and each card's title stay put
    // and only the module lists scroll, each in its own panel. The panels can take keyboard focus (tabIndex) so they
    // can be scrolled without a mouse (the accessibility risk of separate scroll areas, references.md). Below the lg
    // breakpoint the cards stack and the page scrolls as normal.
    <div className="lg:h-full flex flex-col gap-5">

      {/* Year tabs + save status */}
      <div className="shrink-0 flex items-center justify-between gap-3">
        <div className="flex gap-2">
          {[1, 2, 3].map(year => (
            <button key={year} onClick={() => setSelectedYear(year)}
              className={`px-5 py-2 rounded-xl text-sm font-medium border transition ${
                selectedYear === year
                  ? 'bg-blue-700 text-white border-blue-700 shadow-sm'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-700'
              }`}>
              Year {year}
            </button>
          ))}
        </div>

        {/* Right side: status text + always-visible Save Grades button */}
        <div className="flex items-center gap-3">
          {hasUnsaved && (
            <div className="flex items-center gap-1.5 text-amber-600">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <span className="text-xs font-medium">Unsaved changes</span>
            </div>
          )}
          {!hasUnsaved && saveStatus === 'saved' && (
            <span className="text-xs text-green-600 font-medium flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
              Saved
            </span>
          )}
          {!hasUnsaved && saveStatus === 'error' && (
            <span className="text-xs text-red-500 font-medium">Failed to save — try again</span>
          )}
          <button
            onClick={saveGrades}
            disabled={!hasUnsaved || saving}
            className={`px-4 py-2 rounded-xl text-sm font-medium border transition flex items-center gap-2 ${
              hasUnsaved
                ? 'bg-blue-700 text-white border-blue-700 hover:bg-blue-800'
                : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
            }`}
          >
            {saving ? <><Spinner size="sm" />Saving…</> : 'Save Grades'}
          </button>
        </div>
      </div>

      {/* Split panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:flex-1 lg:min-h-0">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 flex flex-col lg:min-h-0 overflow-hidden">
          <div className="shrink-0 px-6 py-4 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-800">Compulsory Modules</p>
            {/* Users are final-year students and recent graduates (IR §3.2.2); only completed modules count (IR §1.6.1),
                so a final-year student leaves current modules blank. No honesty checkbox (Kristal et al. 2020) */}
            <p className="text-xs text-gray-400 mt-0.5">{compulsory.length} modules · leave blank if not completed yet</p>
          </div>
          {/* key = year: a new year opens at the top of its list, not where the last year was scrolled to */}
          <div key={`c${selectedYear}`} tabIndex={0} aria-label="Compulsory modules"
            className="px-6 py-2 divide-y divide-gray-50 lg:flex-1 lg:overflow-y-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-300">
            {compulsory.map(mod => (
              <div key={mod.code} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{mod.name}</p>
                    <p className="text-xs text-gray-400">{mod.code}</p>
                  </div>
                </div>
                <select
                  value={selections[mod.code] ?? ''}
                  onChange={e => setGrade(mod.code, e.target.value)}
                  className="ml-4 border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shrink-0"
                >
                  <option value="">Not graded yet</option>
                  {GRADE_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 flex flex-col lg:min-h-0 overflow-hidden">
          <div className="shrink-0 px-6 py-4 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-800">Elective Modules</p>
            <p className="text-xs text-gray-400 mt-0.5">Tick the ones you took</p>
          </div>
          <div key={`e${selectedYear}`} tabIndex={0} aria-label="Elective modules"
            className="px-6 py-3 divide-y divide-gray-50 lg:flex-1 lg:overflow-y-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-300">
            {electives.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">No electives for Year {selectedYear}</p>
            ) : electives.map(mod => (
              <div key={mod.code} className="py-3">
                <div className="flex items-start gap-3">
                  <input type="checkbox" checked={selections[mod.code] !== undefined}
                    onChange={() => toggleElective(mod.code)}
                    className="w-4 h-4 mt-0.5 accent-blue-700 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{mod.name}</p>
                    <p className="text-xs text-gray-400">{mod.code}</p>
                    {selections[mod.code] !== undefined && (
                      <select value={selections[mod.code] ?? ''} onChange={e => setGrade(mod.code, e.target.value)}
                        className="mt-2 border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full">
                        <option value="">Not graded yet</option>
                        {GRADE_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

// Modules first — it's the grade foundation; projects + certs add skills on top
const TABS = [
  { key: 'modules',  label: 'Modules' },
  { key: 'projects', label: 'Projects' },
  { key: 'certs',    label: 'Certifications' },
]

export default function Profile() {
  const [searchParams] = useSearchParams()
  const [projects, setProjects] = useState([])
  const [certs, setCerts] = useState([])
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [activeTab, setActiveTab] = useState(
    searchParams.get('tab') === 'projects' ? 'projects'
    : searchParams.get('tab') === 'certs' ? 'certs'
    : 'modules'
  )
  const [modulesHasUnsaved, setModulesHasUnsaved] = useState(false)

  // Warn on browser/tab close when unsaved
  useEffect(() => {
    const handler = (e) => {
      if (modulesHasUnsaved) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [modulesHasUnsaved])

  // Ask only when leaving Modules with unsaved grades. Leaving discards them (the tab's state goes), so the flag is
  // cleared: moving between Projects and Certifications afterwards doesn't ask again (her report 4 Oct)
  const handleTabChange = useCallback((key) => {
    if (activeTab === 'modules' && key !== 'modules' && modulesHasUnsaved) {
      const ok = window.confirm('You have unsaved grade changes. Leave without saving?')
      if (!ok) return
      setModulesHasUnsaved(false)
    }
    setActiveTab(key)
  }, [activeTab, modulesHasUnsaved])

  const fetchAll = () => {
    setProfileLoading(true)
    Promise.all([
      api.get('/profile/projects'),
      api.get('/profile/certifications'),
      api.get('/profile/skills'),
    ]).then(([projRes, certRes, skillRes]) => {
      setProjects(projRes.data)
      setCerts(certRes.data)
      setProfile(skillRes.data)
    }).catch(console.error).finally(() => setProfileLoading(false))
  }

  useEffect(() => {
    const timer = setTimeout(fetchAll, 0)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="h-screen bg-slate-50 flex flex-col">

      {/* ── Pinned header ── */}
      <PageHeader>
        {/* Title + stats row */}
        <div className="flex items-start justify-between mb-4 pt-1">
          <div>
            <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-widest mb-2">Skill Profile</p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Build Your Skill Profile</h1>
            <p className="text-sm text-slate-500 mt-1">Your modules, projects and certifications become the skills your job matches use</p>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-0 mt-1">
            {[
              { label: 'Skills', value: profileLoading ? '—' : (profile?.total ?? 0) },
              { label: 'Projects', value: profileLoading ? '—' : projects.length },
              { label: 'Certs', value: profileLoading ? '—' : certs.length },
            ].map(({ label, value }, i, arr) => (
              <div key={label} className="flex items-center">
                <div className="text-center px-6">
                  <p className="text-2xl font-semibold tracking-tight text-slate-900 leading-none tabular-nums">
                    {value}
                  </p>
                  <p className="text-xs text-slate-400 mt-1 font-medium">{label}</p>
                </div>
                {i < arr.length - 1 && <div className="w-px h-10 bg-slate-400" />}
              </div>
            ))}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex border-t border-slate-200 mt-2 -mx-8 px-8">
          {TABS.map(tab => {
            const isActive = activeTab === tab.key
            const count = tab.key === 'projects' ? projects.length : tab.key === 'certs' ? certs.length : null
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-200'
                }`}
              >
                {tab.label}
                {count !== null && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                    isActive ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </PageHeader>

      {/* ── Scrollable content ── */}
      {/* Wide screens: each tab fills the window and scrolls inside its own panels; narrow: the page scrolls */}
      <div className="flex-1 min-h-0 overflow-auto lg:overflow-hidden">
        <div className="px-8 py-6 lg:h-full">
          {activeTab === 'modules'   && <ModulesTab onUnsavedChange={setModulesHasUnsaved} onSaved={fetchAll} />}
          {activeTab === 'projects'  && <ProjectsTab  projects={projects} onRefresh={fetchAll} />}
          {activeTab === 'certs'     && <CertificationsTab certs={certs}  onRefresh={fetchAll} />}
        </div>
      </div>

    </div>
  )
}