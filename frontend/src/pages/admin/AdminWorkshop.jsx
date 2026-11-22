import { useUnsavedChanges } from '../../components/useUnsavedChanges'
import { useConfirmation } from '../../components/useConfirmation'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../../api'
import { useAuth } from '../../context/useAuth'
import PageHeader from '../../components/PageHeader'
import BackLink from '../../components/BackLink'
import { Busy } from '../../components/Spinner'
import { skillName } from '../../skillName'
import RowMenu from './RowMenu'
import { AUTOSAVE_MS, copyTitle, factsFor, saveState, statusText } from './autosave'

// 20 Nov (her approved mock review/workshop-planner.html): the career office plans a workshop on the most common
// skill gaps. Left: the choices; right: the drafted activity proposal, every part editable, then Export PDF.
// The figures come from SkillMap (backend routers/workshop.py); the AI only writes the text around them.
const LENGTHS = [['2h', '2 hours'], ['half', 'Half day'], ['full', 'Full day']]
const FORMATS = [['in_person', 'In person'], ['online', 'Online'], ['hybrid', 'Hybrid']]
const AUDIENCES = [['all', 'All students'], ['final_year', 'Final-year students']]
// what the content was drafted from; any difference shows the set-up note (22 Nov, her review)
const setupOf = ({ skills, length, format, audience, note }) => JSON.stringify({ skills: [...skills].sort(), length, format, audience, note: (note || '').trim() })
// the text of a proposal without its details line (that line follows the set-up, so it is not a hand edit)
const bodyOf = (x) => JSON.stringify({ ...x, facts: undefined })
const SAVING_UNAVAILABLE = 'Saving isn’t available right now'
const errText = (err, fallback) => {
  if (err.response?.status === 503) return SAVING_UNAVAILABLE
  const detail = err.response?.data?.detail
  return typeof detail === 'string' ? detail : fallback
}
const DRAFT_KEY = 'workshop-draft'

function readDraft(scope) {
  try {
    const details = JSON.parse(localStorage.getItem(DRAFT_KEY + '-details')) || {}
    if (scope && details.scope !== scope) return null
    return {
      ...details,
      proposal: JSON.parse(localStorage.getItem(DRAFT_KEY)),
      id: localStorage.getItem(DRAFT_KEY + '-id'),
    }
  } catch {
    return null
  }
}

function Chips({ label, options, value, onChange }) {
  return (
    <fieldset className="ws-f">
      <legend>{label}</legend>
      <div className="ws-chips">
        {options.map(([k, l]) => (
          <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)} className={value === k ? 'on' : ''}>{l}</button>
        ))}
      </div>
    </fieldset>
  )
}

// a text area that grows with its text, so a section never scrolls inside itself. 20 Nov (her review): "[to fill in]"
// is highlighted while editing too: the same text drawn behind a transparent text area, with the marks coloured
const FILL = '[to fill in]'
function Marked({ text }) {
  const parts = text.split(FILL)
  return parts.map((p, i) => <span key={i}>{p}{i < parts.length - 1 && <mark className="ws-mark">{FILL}</mark>}</span>)
}
function Grow({ value, onChange, label, rows = 2 }) {
  return (
    <div className="ws-grow">
      <div className="ws-grow-back" aria-hidden="true"><Marked text={value} />{' '}</div>
      <textarea aria-label={label} rows={rows} value={value} onChange={e => onChange(e.target.value)} className="ws-text" />
    </div>
  )
}

export default function AdminWorkshop() {
  const location = useLocation()
  return <WorkshopEditor key={location.key} />
}

function WorkshopEditor() {
  const { confirm, confirmation } = useConfirmation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const proposalId = params.get('proposal')
  const { user } = useAuth()
  const recoveryKey = proposalId && user?.id ? `${DRAFT_KEY}:${user.id}:${proposalId}` : null
  const { key } = useLocation()
  const scope = params.has('new') || params.has('skills') ? key : null
  const [initialDraft] = useState(() => proposalId ? null : readDraft(scope))
  const [gaps, setGaps] = useState(null)
  const [skills, setSkills] = useState(() => initialDraft?.skills ?? (params.get('skills') || '').split('|').filter(Boolean).slice(0, 4))
  const [length, setLength] = useState('half')
  const [format, setFormat] = useState('in_person')
  const [audience, setAudience] = useState('all')
  const [note, setNote] = useState('')
  const [p, setP] = useState(initialDraft?.proposal ?? null)
  const [busy, setBusy] = useState('')
  const [draftBody, setDraftBody] = useState(null)   // the AI's text as drafted; null = opened, unknown
  const [drafts, setDrafts] = useState(0)   // counts finished drafts: the new text fades in
  const [saved, setSaved] = useState(null)
  const [savedId, setSavedId] = useState(initialDraft?.proposal ? initialDraft.id : null)
  const [savedSnapshot, setSavedSnapshot] = useState(initialDraft?.snapshot ?? null)
  const [openState, setOpenState] = useState(proposalId ? 'loading' : '')
  const [error, setError] = useState('')
  const [, setRecovered] = useState(false)
  // 22 Nov (her approved mock): saved by itself after a pause; the version before the last save, for Undo
  const [failed, setFailed] = useState(false)
  // the set-up the content was last drafted with; a different one means the agenda may need a redraft
  const [draftedWith, setDraftedWith] = useState(null)
  const [savedAt, setSavedAt] = useState(null)
  const [undoTo, setUndoTo] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const saving = useRef(false)
  const body = () => {
    const { source: _source, ...proposal } = p // eslint-disable-line no-unused-vars
    return { skills, proposal }
  }
  // 22 Nov (her question): the set-up choices count as edits too, so changing only them saves as well
  const full = () => ({ ...body(), setup: { length, format, audience, note } })
  const dirty = !!p && (!savedId || JSON.stringify(full()) !== savedSnapshot)

  useEffect(() => {
    let active = true
    api.get('/admin/skill-gaps').then(res => { if (active) setGaps(res.data) })
      .catch(() => { if (active) setGaps([]) })
    api.get('/admin/workshop/proposals').then(res => { if (active) setSaved(res.data) })
      .catch(() => { if (active) setSaved(false) })
    if (proposalId) {
      api.get(`/admin/workshop/proposals/${proposalId}`).then(({ data }) => {
        if (!active) return
        const setup = { length: data.setup?.length || 'half', format: data.setup?.format || 'in_person', audience: data.setup?.audience || 'all', note: data.setup?.note || '' }
        const snapshot = JSON.stringify({ skills: data.skills, proposal: data.proposal, setup })
        let cachedDraft = null
        try {
          if (recoveryKey) cachedDraft = JSON.parse(sessionStorage.getItem(recoveryKey))
        } catch { /* storage blocked */ }
        const restore = cachedDraft?.snapshot === snapshot && cachedDraft.proposal
        setP(restore ? cachedDraft.proposal : data.proposal)
        setSkills(restore ? cachedDraft.skills : data.skills)
        setRecovered(!!restore)
        setSavedId(data.id)
        setSavedSnapshot(snapshot)
        setLength(setup.length); setFormat(setup.format); setAudience(setup.audience); setNote(setup.note)
        setDraftedWith(setupOf({ ...setup, skills: restore ? cachedDraft.skills : data.skills }))
        setOpenState('')
      }).catch(err => {
        if (!active) return
        setError(errText(err, "Couldn't open the proposal. Try again from Saved proposals."))
        setOpenState('failed')
      })
    }
    return () => { active = false }
  }, [proposalId, recoveryKey])

  useEffect(() => {
    if (proposalId) return
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY + '-details', JSON.stringify({ scope, skills, snapshot: savedSnapshot }))
        if (p) localStorage.setItem(DRAFT_KEY, JSON.stringify(p))
        else localStorage.removeItem(DRAFT_KEY)
        if (savedId) localStorage.setItem(DRAFT_KEY + '-id', savedId)
        else localStorage.removeItem(DRAFT_KEY + '-id')
      } catch { /* storage blocked */ }
    }, 800)
    return () => clearTimeout(t)
  }, [p, proposalId, savedId, savedSnapshot, scope, skills])

  useEffect(() => {
    if (!recoveryKey || !p) return
    try {
      if (dirty) sessionStorage.setItem(recoveryKey, JSON.stringify({ proposal: p, skills, snapshot: savedSnapshot }))
      else sessionStorage.removeItem(recoveryKey)
    } catch { /* storage blocked */ }
  }, [dirty, p, recoveryKey, savedSnapshot, skills])

  const leaveConfirmation = useUnsavedChanges(dirty, {
    includeSearch: true,
    onDiscard() {
      try {
        if (recoveryKey) sessionStorage.removeItem(recoveryKey)
        else {
          localStorage.removeItem(DRAFT_KEY)
          localStorage.removeItem(DRAFT_KEY + '-id')
          localStorage.removeItem(DRAFT_KEY + '-details')
        }
      } catch { /* storage blocked */ }
    },
  })

  const save = async () => {
    if (saving.current) return
    saving.current = true
    setBusy(b => b || 'save')
    setFailed(false)
    // 22 Nov (her pick): the set-up choices are saved with the proposal and come back when it is opened
    const payload = full()
    const before = savedSnapshot
    try {
      const { data } = savedId
        ? await api.put(`/admin/workshop/proposals/${savedId}`, payload)
        : await api.post('/admin/workshop/proposals', payload)
      if (!savedId) {
        // the new proposal now has an address, so a reload opens it (no remount: the page keeps its state)
        window.history.replaceState(window.history.state, '', `/admin/workshop?proposal=${encodeURIComponent(data.id)}`)
      }
      if (before) setUndoTo(before)
      setSavedId(data.id)
      setRecovered(false)
      setSavedSnapshot(JSON.stringify(payload))
      setSavedAt(Date.now())
      setSaved(previous => [data, ...(Array.isArray(previous) ? previous : []).filter(item => item.id !== data.id)])
    } catch (err) {
      if (err.response?.status === 404) {
        setSavedId(null)
        setError('This proposal was deleted. Save to create a new copy.')
      } else {
        setFailed(true)
        setError(errText(err, "Couldn't save the proposal. Check the title and section lengths, then try again."))
      }
    } finally {
      saving.current = false
      setBusy(b => (b === 'save' ? '' : b))
    }
  }
  const canSave = !!p && saved !== false && !openState && !!p.title.trim()
  useEffect(() => {
    if (!dirty || !canSave || failed || busy === 'draft') return
    const t = setTimeout(save, AUTOSAVE_MS)
    return () => clearTimeout(t)
  }, [p, skills, length, format, audience, note, dirty, canSave, failed, busy]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {      // "Saved · 2 min ago" stays true
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  const undo = () => {
    if (!undoTo) return
    const back = JSON.parse(undoTo)
    setUndoTo(null)
    setP(x => ({ ...back.proposal, source: x?.source }))
    setSkills(back.skills)
    if (back.setup) { setLength(back.setup.length); setFormat(back.setup.format); setAudience(back.setup.audience); setNote(back.setup.note) }
  }
  const makeCopy = async () => {
    setBusy('copy'); setError('')
    try {
      const { proposal } = body()
      const { data } = await api.post('/admin/workshop/proposals', { skills, proposal: { ...proposal, title: copyTitle(proposal.title) } })
      navigate(`/admin/workshop?proposal=${encodeURIComponent(data.id)}`)
    } catch (err) {
      setError(errText(err, "Couldn't make a copy. Try again."))
    } finally { setBusy('') }
  }
  const remove = async () => {
    if (!await confirm({ title: 'Delete this proposal?', message: `“${p.title}” will be permanently deleted.`, confirmLabel: 'Delete proposal', danger: true })) return
    setBusy('delete'); setError('')
    try {
      if (savedId) await api.delete(`/admin/workshop/proposals/${savedId}`)
      try { localStorage.removeItem(DRAFT_KEY); localStorage.removeItem(DRAFT_KEY + '-id'); localStorage.removeItem(DRAFT_KEY + '-details') } catch { /* storage blocked */ }
      setSavedSnapshot(JSON.stringify(body()))     // nothing left to save, so leaving asks nothing
      navigate('/admin/workshop/proposals')
    } catch (err) {
      setError(errText(err, "Couldn't delete the proposal. Try again."))
      setBusy('')
    }
  }
  // a set-up click rewrites the details line at once (her question, 22 Nov)
  const pick = (key, value) => {
    const next = { length, format, audience, [key]: value }
    ;({ length: setLength, format: setFormat, audience: setAudience })[key](value)
    setP(x => (x ? { ...x, facts: factsFor(x.facts || [], next) } : x))
  }
  // dismissed for this set-up only: a later change shows the note again
  const setupKey = setupOf({ skills, length, format, audience, note })
  const [noteHidden, setNoteHidden] = useState('')
  const setupChanged = !!p && !!draftedWith && draftedWith !== setupKey
  const state = saveState({ dirty, saving: busy === 'save', failed, available: saved !== false })
  const toggle = s => setSkills(x => x.includes(s) ? x.filter(y => y !== s) : x.length < 4 ? [...x, s] : x)
  const set = (k, v) => setP(x => ({ ...x, [k]: v }))
  const draft = async () => {
    // 22 Nov: ask only when the text was edited by hand (or opened from saved); a set-up change alone redrafts at once
    const edited = !!p && (draftBody === null || bodyOf(p) !== draftBody)
    if (edited && !await confirm({
      title: 'Redraft this proposal?',
      message: 'Drafting again replaces the agenda, objectives and other text, including your own edits.',
      confirmLabel: 'Redraft proposal',
      cancelLabel: 'Keep editing',
      danger: true,
    })) return
    setBusy('draft')
    setError('')
    try {
      const { data } = await api.post('/admin/workshop/draft', { skills, length, format, audience, note })
      setP(data)
      setDraftBody(bodyOf(data))
      setDrafts(n => n + 1)
      setDraftedWith(setupOf({ skills, length, format, audience, note }))
      setSkills(skills)
    } catch (err) {
      setError(errText(err, "Couldn't draft the proposal. Try again."))
    } finally {
      setBusy('')
    }
  }
  const exportPdf = async () => {
    setBusy('pdf'); setError('')
    try {
      const res = await api.post('/admin/workshop/pdf', body().proposal, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `workshop-proposal-${p.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'workshop'}.pdf`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      setError(err.response?.status === 422 ? 'A part is too long or the title is empty.' : "Couldn't make the PDF. Try again.")
    } finally { setBusy('') }
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-var(--bar-h))]">
      {confirmation}
      {leaveConfirmation}
      <BackLink label="Workshops" onClick={() => { if (!busy) navigate('/admin/workshop/proposals') }} />
      <PageHeader>
        <div className="pb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-widest mb-2">Admin · Workshops</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Plan a workshop</h1>
          <p className="text-sm text-slate-500 mt-1">From the skills students most often lack. The AI drafts the text; the figures are SkillMap's.</p>
        </div>
        </div>
      </PageHeader>
      {saved === false && <p role="status" className="mx-4 mt-2 text-sm text-ink-soft sm:mx-8">{SAVING_UNAVAILABLE}. You can still draft and export a PDF, or retry saving.</p>}
      {error && <p role="alert" className="mx-4 mt-2 text-sm text-rose-700 sm:mx-8">{error}</p>}

      <div className="ws-grid flex-1 min-h-0 px-4 sm:px-8 pt-3.5 pb-4">
        <section className="emp-tile ws-set bg-white rounded-2xl border" aria-labelledby="ws-set-h">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-2">
            <h2 id="ws-set-h" className="adm-tt">Set up</h2>
          </div>
          <fieldset className="ws-f">
            <legend>Skills to cover <span className="font-normal text-muted">· up to 4</span></legend>
            {gaps === null && <span className="text-xs text-muted">Loading the skill gaps…</span>}
            {gaps?.length === 0 && <span className="text-xs text-muted">No student has a skill profile yet.</span>}
            <ul className="ws-skills">
              {gaps?.map(g => (
                <li key={g.skill}><label className={skills.includes(g.skill) ? 'on' : ''}>
                  <input type="checkbox" checked={skills.includes(g.skill)} onChange={() => toggle(g.skill)}
                    disabled={!skills.includes(g.skill) && skills.length >= 4} />
                  <span className="min-w-0 flex-1 truncate">{skillName(g.skill)}</span>
                  <span className="ws-n">{g.students} of {g.of_students} lack it</span>
                </label></li>
              ))}
            </ul>
          </fieldset>
          <Chips label="Length" options={LENGTHS} value={length} onChange={v => pick('length', v)} />
          <Chips label="Format" options={FORMATS} value={format} onChange={v => pick('format', v)} />
          <Chips label="Open to" options={AUDIENCES} value={audience} onChange={v => pick('audience', v)} />
          <div className="ws-f">
            <label htmlFor="ws-note" className="ws-lbl">Anything to add <span className="font-normal text-muted">(optional)</span></label>
            <textarea id="ws-note" rows={2} maxLength={300} value={note} onChange={e => setNote(e.target.value)}
              placeholder="e.g. a speaker from industry, use Power BI" className="ws-text border" />
          </div>
          <button type="button" onClick={draft} disabled={!skills.length || !!busy || !!openState} className="head-cta h-10 px-4 text-sm mt-auto self-start disabled:opacity-45">
            {busy === 'draft' ? <Busy>Drafting…</Busy> : p ? 'Redraft proposal' : 'Draft proposal'}</button>
        </section>

        <article className="emp-tile ws-doc bg-white rounded-2xl border" aria-label="Proposal">
          {!p ? (
            <div className="ws-empty">
              {!openState && busy !== 'draft' && (
                <span className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-accent-soft text-accent-strong" aria-hidden="true">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
                    strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9l-6-6Z" />
                    <path d="M13 3v6h6M8 13h8m-8 4h6" />
                  </svg>
                </span>
              )}
              {busy === 'draft' && <span className="ws-spin mx-auto mb-3" aria-hidden="true" />}
              <p className="m-0 font-semibold text-ink">{busy === 'draft' ? 'Drafting your proposal…' : openState === 'loading' ? 'Opening proposal…' : openState === 'failed' ? 'Proposal unavailable' : 'Your proposal appears here'}</p>
              {!openState && <p className="m-0 mt-1 text-sm text-muted">{busy === 'draft' ? 'The AI writes it from the skill gaps. This takes a few seconds.' : 'Choose the skills to cover, then select Draft proposal.'}</p>}
              {openState === 'failed' && <Link to="/admin/workshop/proposals" className="ws-add">Back to saved proposals</Link>}
            </div>
          ) : (<>
            <div className="ws-edbar">
              <h2 className="m-0 text-[15px] font-semibold text-ink">Proposal</h2>
              <span className="ml-auto flex items-center gap-3">
              <p role="status" className={`ws-state ${state}`}>
                <span className="ws-state-ic" aria-hidden="true">{state === 'saved' ? '✓' : state === 'error' ? '!' : state === 'off' ? '–' : ''}</span>
                {statusText(state, savedAt, now)}
                {state === 'error' && <button type="button" onClick={() => { setFailed(false); save() }} className="ws-link">Try again</button>}
                {state === 'saved' && undoTo && <button type="button" onClick={undo} className="ws-link">Undo</button>}
              </p>
                <button type="button" onClick={exportPdf} disabled={!!busy && busy !== 'save'} className="head-cta h-10 px-4 text-sm disabled:opacity-50">
                  {busy === 'pdf' ? <Busy>Making PDF…</Busy> : <>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M12 3v12m-5-5 5 5 5-5M5 16v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>Export PDF</>}
                </button>
                <RowMenu label="More actions for this proposal" disabled={!!busy && busy !== 'save'} items={[
                  ...(saved !== false ? [{ label: 'Make a copy', onSelect: makeCopy }] : []),
                  { label: 'Delete…', danger: true, onSelect: remove },
                ]} />
              </span>
            </div>
            {setupChanged && noteHidden !== setupKey && (
              <div className="ws-setup-note" role="status">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v6m0 3.5h.01" /></svg>
                <span className="ws-setup-txt">Set-up changed. <span className="ws-setup-more">The agenda and objectives still follow the old one.</span></span>
                <button type="button" onClick={draft} disabled={!!busy} className="ws-redraft">
                  {busy === 'draft' ? <><span className="ws-spin ws-spin-sm" aria-hidden="true" />Redrafting…</> : <>
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" /></svg>
                  Redraft</>}</button>
                <button type="button" onClick={() => setNoteHidden(setupKey)} aria-label="Dismiss" className="ws-note-x">×</button>
              </div>
            )}
            <div className="ws-editor-note">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v5m0-8h.01" strokeLinecap="round" />
              </svg>
              <p>
                <strong>Before sharing</strong>
                {p.source === 'ai' && 'Review the AI draft. '}
                Replace any <span className="ws-todo">[to fill in]</span> placeholders with your workshop details.
              </p>
            </div>
            {busy === 'draft' && (
              <div className="ws-redrafting" role="status">
                <div className="ws-redrafting-card">
                  <span className="ws-spin" aria-hidden="true" />
                  <p className="m-0 font-semibold text-ink">Redrafting with the new set-up…</p>
                  <p className="m-0 text-sm text-muted">The AI rewrites the agenda and objectives. This takes a few seconds.</p>
                </div>
              </div>
            )}
            <div key={drafts} className={`ws-body${drafts > 1 ? ' ws-fresh' : ''}`} aria-busy={busy === 'draft'}>
              <p className="ws-eb">Activity proposal · Career office</p>
              <input aria-label="Title" value={p.title} maxLength={160} onChange={e => set('title', e.target.value)} className="ws-title" />
              <div className="mt-1 mb-2">
                <Grow label="Workshop details" value={p.facts.join(' · ')} rows={1}
                  onChange={value => {
                    const facts = value.split(' · ')
                    if (facts.length <= 6) set('facts', facts)
                  }} />
              </div>
              <h3>1. Background</h3><Grow label="Background" value={p.background} onChange={v => set('background', v)} rows={3} />
              <h3>2. Objectives</h3>
              {p.objectives.map((o, i) => (
                <div key={i} className="ws-li"><span aria-hidden="true">•</span>
                  <input aria-label={`Objective ${i + 1}`} value={o} maxLength={200} onChange={e => set('objectives', p.objectives.map((x, j) => j === i ? e.target.value : x))} />
                  <button type="button" aria-label={`Remove objective ${i + 1}`} onClick={() => set('objectives', p.objectives.filter((_, j) => j !== i))}>×</button></div>
              ))}
              {p.objectives.length < 8 && <button type="button" className="ws-add" onClick={() => set('objectives', [...p.objectives, ''])}>+ Add objective</button>}
              <h3>3. Learning outcomes</h3><Grow label="Learning outcomes" value={p.outcomes} onChange={v => set('outcomes', v)} />
              <h3>4. Participants</h3><Grow label="Participants" value={p.participants} onChange={v => set('participants', v)} />
              <h3>5. Agenda</h3>
              {p.agenda.map(([t, sname], i) => (
                <div key={i} className="ws-row">
                  <input aria-label={`Time of item ${i + 1}`} value={t} maxLength={20} onChange={e => set('agenda', p.agenda.map((r, j) => j === i ? [e.target.value, r[1]] : r))} />
                  <input aria-label={`Session ${i + 1}`} value={sname} maxLength={160} onChange={e => set('agenda', p.agenda.map((r, j) => j === i ? [r[0], e.target.value] : r))} />
                  <button type="button" aria-label={`Remove agenda item ${i + 1}`} onClick={() => set('agenda', p.agenda.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
              {p.agenda.length < 12 && <button type="button" className="ws-add" onClick={() => set('agenda', [...p.agenda, ['', '']])}>+ Add item</button>}
              <h3>6. Speakers and industry partners</h3><Grow label="Speakers and industry partners" value={p.partners || ''} onChange={v => set('partners', v)} rows={3} />
              <h3>7. Resources and budget</h3><Grow label="Resources and budget" value={p.resources} onChange={v => set('resources', v)} />
              <h3>8. Evaluation</h3><Grow label="Evaluation" value={p.evaluation} onChange={v => set('evaluation', v)} />
            </div>
          </>)}
        </article>
      </div>
    </div>
  )
}
