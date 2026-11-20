import InfoTip from '../../components/InfoTip'
import { useUnsavedChanges } from '../../components/useUnsavedChanges'
import { useConfirmation } from '../../components/useConfirmation'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../../api'
import { useAuth } from '../../context/useAuth'
import PageHeader from '../../components/PageHeader'
import BackLink from '../../components/BackLink'
import { Busy } from '../../components/Spinner'
import { skillName } from '../../skillName'

// 20 Nov (her approved mock review/workshop-planner.html): the career office plans a workshop on the most common
// skill gaps. Left: the choices; right: the drafted activity proposal, every part editable, then Export PDF.
// The figures come from SkillMap (backend routers/workshop.py); the AI only writes the text around them.
const LENGTHS = [['2h', '2 hours'], ['half', 'Half day'], ['full', 'Full day']]
const FORMATS = [['in_person', 'In person'], ['online', 'Online'], ['hybrid', 'Hybrid']]
const AUDIENCES = [['all', 'All students'], ['final_year', 'Final-year students']]
const SAVING_UNAVAILABLE = 'Saving isn’t available right now'
const errText = (err, fallback) => {
  if (err.response?.status === 503) return SAVING_UNAVAILABLE
  const detail = err.response?.data?.detail
  return typeof detail === 'string' ? detail : fallback
}
const DRAFT_KEY = 'workshop-draft'
const RECENT_PROPOSAL_LIMIT = 5

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
  const [saved, setSaved] = useState(null)
  const [savedId, setSavedId] = useState(initialDraft?.proposal ? initialDraft.id : null)
  const [savedSnapshot, setSavedSnapshot] = useState(initialDraft?.snapshot ?? null)
  const [openState, setOpenState] = useState(proposalId ? 'loading' : '')
  const [error, setError] = useState('')
  const [recovered, setRecovered] = useState(false)
  const body = () => {
    const { source: _source, ...proposal } = p // eslint-disable-line no-unused-vars
    return { skills, proposal }
  }
  const dirty = !!p && (!savedId || JSON.stringify(body()) !== savedSnapshot)

  useEffect(() => {
    let active = true
    api.get('/admin/skill-gaps').then(res => { if (active) setGaps(res.data) })
      .catch(() => { if (active) setGaps([]) })
    api.get('/admin/workshop/proposals').then(res => { if (active) setSaved(res.data) })
      .catch(() => { if (active) setSaved(false) })
    if (proposalId) {
      api.get(`/admin/workshop/proposals/${proposalId}`).then(({ data }) => {
        if (!active) return
        const snapshot = JSON.stringify({ skills: data.skills, proposal: data.proposal })
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
    try {
      localStorage.setItem(DRAFT_KEY + '-details', JSON.stringify({ scope, skills, snapshot: savedSnapshot }))
      if (p) localStorage.setItem(DRAFT_KEY, JSON.stringify(p))
      else localStorage.removeItem(DRAFT_KEY)
      if (savedId) localStorage.setItem(DRAFT_KEY + '-id', savedId)
      else localStorage.removeItem(DRAFT_KEY + '-id')
    } catch { /* storage blocked */ }
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

  const newProposal = () => navigate('/admin/workshop?new=1')
  const open = id => {
    if (id) navigate(`/admin/workshop?proposal=${encodeURIComponent(id)}`)
  }
  const save = async () => {
    setBusy('save')
    setError('')
    const payload = body()
    try {
      const { data } = savedId
        ? await api.put(`/admin/workshop/proposals/${savedId}`, payload)
        : await api.post('/admin/workshop/proposals', payload)
      setSavedId(data.id)
      setRecovered(false)
      setSavedSnapshot(JSON.stringify(payload))
      setSaved(previous => [data, ...(Array.isArray(previous) ? previous : []).filter(item => item.id !== data.id)])
    } catch (err) {
      if (err.response?.status === 404) {
        setSavedId(null)
        setError('This proposal was deleted. Save to create a new copy.')
      } else {
        setError(errText(err, "Couldn't save the proposal. Check the title and section lengths, then try again."))
      }
    } finally {
      setBusy('')
    }
  }
  const discard = async () => {
    if (busy || !dirty) return
    if (!await confirm({
      title: savedId ? 'Discard unsaved changes?' : 'Discard this draft?',
      message: savedId ? 'The proposal will return to its last saved version.' : 'This draft will be cleared.',
      confirmLabel: savedId ? 'Discard changes' : 'Discard draft',
      cancelLabel: 'Keep editing',
      danger: true,
    })) return

    setBusy('discard')
    setError('')
    try {
      let snapshot = savedSnapshot ? JSON.parse(savedSnapshot) : null
      if (savedId && !snapshot) {
        const { data } = await api.get(`/admin/workshop/proposals/${savedId}`)
        snapshot = { skills: data.skills || [], proposal: data.proposal }
      }
      if (savedId && snapshot) {
        setP(snapshot.proposal)
        setSkills(snapshot.skills)
        setSavedSnapshot(JSON.stringify(snapshot))
      } else {
        setP(null)
        setSavedId(null)
        setSavedSnapshot(null)
      }
      setRecovered(false)
      if (recoveryKey) {
        try { sessionStorage.removeItem(recoveryKey) } catch { /* storage blocked */ }
      }
    } catch (err) {
      setError(errText(err, "Couldn't restore the saved proposal. Try again."))
    } finally {
      setBusy('')
    }
  }

  const toggle = s => setSkills(x => x.includes(s) ? x.filter(y => y !== s) : x.length < 4 ? [...x, s] : x)
  const set = (k, v) => setP(x => ({ ...x, [k]: v }))
  const draft = async () => {
    if (dirty && !await confirm({
      title: 'Redraft this proposal?',
      message: 'Drafting again will replace the current proposal, including your unsaved edits.',
      confirmLabel: 'Redraft proposal',
      cancelLabel: 'Keep editing',
      danger: true,
    })) return
    setBusy('draft')
    setError('')
    try {
      const { data } = await api.post('/admin/workshop/draft', { skills, length, format, audience, note })
      setP(data)
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
      <BackLink label={proposalId ? 'Saved proposals' : 'Dashboard'} onClick={() => {
        if (!busy) navigate(proposalId ? '/admin/workshop/proposals' : '/dashboard')
      }} />
      <PageHeader>
        <div className="pb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-widest mb-2">Admin · Workshop planner</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Plan a workshop</h1>
          <p className="text-sm text-slate-500 mt-1">From the skills students most often lack. The AI drafts the text; the figures are SkillMap's.</p>
        </div>
        <details className="ws-saved" onBlur={event => {
          if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) {
            event.currentTarget.open = false
          }
        }} onKeyDown={event => {
          if (event.key === 'Escape' && event.currentTarget.open) {
            event.preventDefault()
            event.currentTarget.open = false
            event.currentTarget.querySelector('summary').focus()
          }
        }}>
          <summary className="acad-btn edit min-h-11">
            Saved proposals
            <svg className="ws-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <div className="ws-saved-panel">
            {Array.isArray(saved) && saved.length > 0 ? (
              <>
                <p className="border-b border-line bg-well px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-muted">Recently updated</p>
                <ul className="ws-saved-list" aria-label="Recently updated proposals">
                  {saved.slice(0, RECENT_PROPOSAL_LIMIT).map(item => (
                    <li key={item.id}>
                      <button type="button" disabled={!!busy} onClick={() => open(item.id)}>{item.title}</button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="px-3 py-2 text-sm text-muted">
                {saved === null ? 'Loading proposals…' : saved === false ? 'Saved proposals are unavailable' : 'No saved proposals yet'}
              </p>
            )}
            <Link to="/admin/workshop/proposals" onClick={event => {
              if (busy) event.preventDefault()
            }} className="ws-saved-all">View all saved proposals</Link>
          </div>
        </details>
        </div>
      </PageHeader>
      {saved === false && <p role="status" className="mx-4 mt-2 text-sm text-ink-soft sm:mx-8">{SAVING_UNAVAILABLE}. You can still draft and export a PDF, or retry saving.</p>}
      {error && <p role="alert" className="mx-4 mt-2 text-sm text-rose-700 sm:mx-8">{error}</p>}

      <div className="ws-grid flex-1 min-h-0 px-4 sm:px-8 pt-3.5 pb-4">
        <section className="emp-tile ws-set bg-white rounded-2xl border" aria-labelledby="ws-set-h">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-2">
            <h2 id="ws-set-h" className="adm-tt">Set up</h2>
            {p && (
              <button type="button" disabled={!!busy} onClick={newProposal} className="ws-new">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
                New proposal
              </button>
            )}
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
          <Chips label="Length" options={LENGTHS} value={length} onChange={setLength} />
          <Chips label="Format" options={FORMATS} value={format} onChange={setFormat} />
          <Chips label="Open to" options={AUDIENCES} value={audience} onChange={setAudience} />
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
              {!openState && (
                <span className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-accent-soft text-accent-strong" aria-hidden="true">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
                    strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9l-6-6Z" />
                    <path d="M13 3v6h6M8 13h8m-8 4h6" />
                  </svg>
                </span>
              )}
              <p className="m-0 font-semibold text-ink">{openState === 'loading' ? 'Opening proposal…' : openState === 'failed' ? 'Proposal unavailable' : 'Your proposal appears here'}</p>
              {!openState && <p className="m-0 mt-1 text-sm text-muted">Choose the skills to cover, then select Draft proposal.</p>}
              {openState === 'failed' && <Link to="/admin/workshop/proposals" className="ws-add">Back to saved proposals</Link>}
            </div>
          ) : (<>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line px-4 py-3">
              <div className="flex min-h-10 items-center gap-1">
                <h2 className="m-0 text-[15px] font-semibold normal-case tracking-normal text-ink">Proposal editor</h2>
                <InfoTip label="About saving and exporting">
                  Export PDF uses the current editor version, including unsaved changes. Save changes to update Saved proposals.
                </InfoTip>
              </div>
              <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
                <p role="status" title={recovered && dirty ? 'Unsaved edits restored from this tab' : undefined} className={`m-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${dirty ? 'bg-amber-100 text-amber-900' : 'bg-have-soft text-have-strong'}`}>
                  {recovered && dirty ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <path d="M3 10a9 9 0 1 1 2 8M3 4v6h6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : <span className="ws-save-dot" aria-hidden="true" />}
                  {busy === 'save' ? 'Saving…' : dirty ? recovered ? 'Unsaved changes' : savedId ? 'Unsaved changes' : 'Unsaved draft' : 'All changes saved'}
                </p>
                {dirty && (
                  <button type="button" onClick={discard} disabled={!!busy}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-control border border-rose-300 bg-white px-2.5 text-[13px] font-semibold text-rose-800 hover:border-rose-400 hover:bg-rose-50 disabled:opacity-50">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <path d="M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {busy === 'discard' ? <Busy>Discarding…</Busy> : savedId ? 'Discard changes' : 'Discard draft'}
                  </button>
                )}
                <button type="button" onClick={exportPdf} disabled={!!busy} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-control border border-line-strong bg-white px-3 text-[13px] font-semibold text-accent-strong hover:bg-accent-soft disabled:opacity-50">
                  {busy === 'pdf' ? <Busy>Making PDF…</Busy> : (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                        <path d="M12 3v12m-5-5 5 5 5-5M5 16v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4"
                          strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Export PDF
                    </>
                  )}
                </button>
                <button type="button" onClick={save} disabled={!!busy || saved === null || !dirty || !p.title.trim()}
                  className="inline-flex min-h-10 items-center justify-center rounded-control bg-accent px-3 text-[13px] font-bold text-white hover:bg-accent-strong active:bg-blue-950 disabled:opacity-45">
                  {busy === 'save' ? <Busy>Saving…</Busy> : savedId ? 'Save changes' : 'Save proposal'}
                </button>
              </div>
            </div>
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
            <div className="ws-body">
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
