import { useState, useEffect } from 'react'
import api from '../../api'
import { AddSkillChip, ConfirmDelete, CrossIcon, DuplicateAsk, EmptyState, Field, FormButtons, IconButton, Modal,
  PencilIcon, SkillChip, SkillsRow } from './profileParts'
import { ADDED_BY_YOU, errText, inputCls, monthLabel, splitSkills } from './profileUtils'

// Honours and awards (8 Oct, Mr Au). Works like the Certifications tab: the pop-up suggests skills from the title and
// description, the student keeps or removes them, then saves, so every saved skill was seen. Fields follow LinkedIn's
// Honors & awards form (title, issuer, date, description; references.md "Showcase profile").

function AwardForm({ award, onDone, onCancel, onDirty }) {
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

export default function AwardsTab({ awards, onRefresh }) {
  const [editing, setEditing] = useState(null)      // null | 'new' | the award being edited
  const [deleting, setDeleting] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [note, setNote] = useState('')

  const run = async (call) => {
    try { await call(); onRefresh() } catch { setNote("Couldn't save that change. Please try again.") }
  }
  const handleDelete = async (id) => { await api.delete(`/profile/awards/${id}`); setDeleting(null); onRefresh() }
  const removeSkill = (id, skill) => run(() => api.post(`/profile/awards/${id}/remove-skill`, { skill }))
  const addSkill = async (id, skill) => { await api.post(`/profile/awards/${id}/add-skill`, { skill }); onRefresh() }
  const close = () => { setEditing(null); setDirty(false) }

  return (
    // Same layout as Certifications: the title row stays, only the cards scroll
    <div className="lg:h-full flex flex-col">
      <div className="shrink-0 flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-800">Your Honours &amp; Awards</h3>
        <button type="button" onClick={() => setEditing('new')}
          className="bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-blue-800 transition">+ Add award</button>
      </div>
      <div tabIndex={0} aria-label="Your awards"
        className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto -mx-1 px-1 pb-1 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
        {note && (
          <p role="status" className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-3 flex justify-between gap-3">
            <span>{note}</span><button type="button" onClick={() => setNote('')} aria-label="Dismiss" className="text-amber-500 hover:text-amber-800">×</button>
          </p>
        )}
        {awards.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-8">
            <EmptyState icon="🏆" title="No awards yet" subtitle="Add competition wins, scholarships or a dean's list to show on your profile" />
          </div>
        ) : (
          <div className="space-y-3">
            {awards.map(a => {
              const added = a.added_skills || []
              return (
                <div key={a.id} className="bg-white rounded-2xl border border-gray-200 p-5 hover:border-blue-200 transition">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{a.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{a.issuer}{a.award_date && ` · ${monthLabel(a.award_date)}`}</p>
                      {a.description && <p className="text-sm text-gray-600 mt-2">{a.description}</p>}
                    </div>
                    <div className="flex items-center gap-0.5">
                      <IconButton label="Edit award" onClick={() => setEditing(a)}><PencilIcon /></IconButton>
                      <IconButton label="Delete award" danger onClick={() => setDeleting(a)}><CrossIcon /></IconButton>
                    </div>
                  </div>
                  <SkillsRow empty={!a.mapped_skills.length} emptyText="No skills: shown on your profile only.">
                    {a.mapped_skills.map((s, i) => (
                      <SkillChip key={i} skill={s} added={added.includes(s)} title={added.includes(s) ? ADDED_BY_YOU : undefined}
                        onRemove={() => removeSkill(a.id, s)} />
                    ))}
                    <AddSkillChip onAdd={(skill) => addSkill(a.id, skill)} />
                  </SkillsRow>
                </div>
              )
            })}
          </div>
        )}
      </div>
      {deleting && <ConfirmDelete name={deleting.title} onCancel={() => setDeleting(null)} onDelete={() => handleDelete(deleting.id)} />}
      {editing && (
        <Modal title={editing === 'new' ? 'Add an award' : 'Edit award'} dirty={dirty} onClose={close}>
          <AwardForm award={editing === 'new' ? null : editing} onDirty={setDirty}
            onDone={() => { close(); onRefresh() }} onCancel={close} />
        </Modal>
      )}
    </div>
  )
}
