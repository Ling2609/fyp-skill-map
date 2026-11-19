import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../../api'
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
const errText = (err, fallback) => err.response?.data?.detail || fallback
const DRAFT_KEY = 'workshop-draft'   // this browser only: a convenience, not a saved record

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
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [gaps, setGaps] = useState(null)
  const [skills, setSkills] = useState(() => (params.get('skills') || '').split('|').filter(Boolean).slice(0, 4))
  const [length, setLength] = useState('half')
  const [format, setFormat] = useState('in_person')
  const [audience, setAudience] = useState('all')
  const [note, setNote] = useState('')
  const [p, setP] = useState(() => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY)) } catch { return null } })
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { api.get('/admin/skill-gaps').then(res => setGaps(res.data)).catch(() => setGaps([])) }, [])
  useEffect(() => { try { p ? localStorage.setItem(DRAFT_KEY, JSON.stringify(p)) : localStorage.removeItem(DRAFT_KEY) } catch { /* storage blocked */ } }, [p])

  const toggle = (s) => setSkills(x => x.includes(s) ? x.filter(y => y !== s) : x.length < 4 ? [...x, s] : x)
  const set = (k, v) => setP(x => ({ ...x, [k]: v }))
  const draft = () => {
    setBusy('draft'); setError('')
    api.post('/admin/workshop/draft', { skills, length, format, audience, note })
      .then(res => setP(res.data)).catch(err => setError(errText(err, "Couldn't draft the proposal. Try again.")))
      .finally(() => setBusy(''))
  }
  const exportPdf = async () => {
    setBusy('pdf'); setError('')
    try {
      // eslint-disable-next-line no-unused-vars
      const { source, ...body } = p
      const res = await api.post('/admin/workshop/pdf', body, { responseType: 'blob' })
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
      <BackLink label="Dashboard" onClick={() => navigate('/dashboard')} />
      <PageHeader>
        <div className="pb-4">
          <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-widest mb-2">Admin · Workshop planner</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Plan a workshop</h1>
          <p className="text-sm text-slate-500 mt-1">From the skills students most often lack. The AI drafts the text; the figures are SkillMap's.</p>
        </div>
      </PageHeader>

      <div className="ws-grid flex-1 min-h-0 px-4 sm:px-8 pt-3.5 pb-4">
        <section className="emp-tile ws-set bg-white rounded-2xl border" aria-labelledby="ws-set-h">
          <h2 id="ws-set-h" className="adm-tt">Set up</h2>
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
          <button type="button" onClick={draft} disabled={!skills.length || !!busy} className="head-cta h-10 px-4 text-sm mt-auto self-start disabled:opacity-45">
            {busy === 'draft' ? <Busy>Drafting…</Busy> : p ? '✦ Draft again' : '✦ Draft the proposal'}</button>
        </section>

        <article className="emp-tile ws-doc bg-white rounded-2xl border" aria-label="Proposal">
          {!p ? (
            <div className="ws-empty">
              <p className="m-0 font-semibold text-ink">Your proposal appears here</p>
              <p className="m-0 mt-1 text-sm text-muted">Pick the skills and choices on the left, then draft. Every part can be edited before you export it.</p>
            </div>
          ) : (<>
            <div className="ws-bar">
              <span className="text-xs text-muted">{p.source === 'ai' ? '✦ Drafted with AI · check every part' : 'Drafted from a template (the AI was not available)'} · <span className="ws-todo">[to fill in]</span> = yours to complete</span>
              <span className="flex gap-2">
                <button type="button" onClick={() => setP(null)} className="acad-btn edit h-9">Clear</button>
                <button type="button" onClick={exportPdf} disabled={!!busy} className="head-cta h-9 px-3.5 text-sm">{busy === 'pdf' ? <Busy>Making PDF…</Busy> : '⤓ Export PDF'}</button>
              </span>
            </div>
            {error && <p role="alert" className="mx-6 mt-3 text-sm text-rose-700">{error}</p>}
            <div className="ws-body">
              <p className="ws-eb">Activity proposal · Career office</p>
              <input aria-label="Title" value={p.title} maxLength={160} onChange={e => set('title', e.target.value)} className="ws-title" />
              <p className="ws-facts">{p.facts.join(' · ')}</p>
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
