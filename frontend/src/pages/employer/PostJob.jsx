import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import api from '../../api'
import PageHeader from '../../components/PageHeader'
import { errText } from '../student/profileUtils'

// Employer > Post a job (11 Oct; mock-up 9 Oct board 2; one form since 13 Oct). "Read the skills" adds what SkillMap
// found under the ad (the same extractor and quote check as live jobs). The employer removes what
// is wrong, adds what is missing, moves nothing they don't want to, then publishes. If the ad changes after reading,
// the skills must be read again before publishing (the same rule as Admin's "Find skills" for modules).
const MIN_DESCRIPTION = 80
const MAX_DESCRIPTION = 12000
const BOXES = [
  { level: 'required', title: 'Required', hint: "Counted in each student's match. Hover a skill to see the words in your ad it came from." },
  { level: 'preferred', title: 'Nice to have', hint: 'Shown to students, not counted in the match %.' },
  { level: 'trained', title: 'Taught on the job', hint: "Not expected from graduates; shown so they know what they'll learn." },
]
const field = 'w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500'
const label = 'block text-sm font-medium text-slate-700 mb-1'

function ChipBox({ box, skills, onRemove, onAdd }) {
  const [draft, setDraft] = useState('')
  const take = () => {
    draft.split(/[,;\n]/).map(s => s.replace(/\s+/g, ' ').trim()).filter(s => s && s.length <= 80).forEach(onAdd)
    setDraft('')
  }
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-800">{box.title} <span className="font-normal text-slate-400">({skills.length})</span></h3>
      <p className="text-xs text-slate-500 mt-0.5 mb-2">{box.hint}</p>
      <div className="border border-slate-200 rounded-lg px-2.5 py-2 flex flex-wrap items-center gap-1.5 focus-within:ring-2 focus-within:ring-blue-500">
        {skills.map(s => (
          <span key={s.name} title={s.quote ? `From your ad: "${s.quote}"` : 'Added by you'}
            className={`inline-flex items-center gap-1 text-sm pl-3 pr-1.5 py-0.5 rounded-full border ${s.quote
              ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-white border-slate-300 text-slate-700'}`}>
            {s.name}
            <button type="button" aria-label={`Remove ${s.name}`} onClick={() => onRemove(s)}
              className="w-5 h-5 inline-flex items-center justify-center rounded-full hover:bg-black/10">×</button>
          </span>
        ))}
        <input aria-label={`Add a skill to ${box.title}`} value={draft} onChange={e => setDraft(e.target.value)} onBlur={take} maxLength={200}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); take() } }}
          placeholder="+ Add skill" className="flex-1 min-w-28 text-sm py-0.5 focus:outline-none" />
      </div>
    </div>
  )
}

// 13 Oct: the same page edits a posted job (/employer/jobs/:jobId/edit; her design after research, references.md
// "Editing a published job"). Title, location and category are locked once published; the rest works as here.
const lockedCls = 'bg-slate-50 text-slate-500 cursor-not-allowed'

export default function PostJob() {
  const navigate = useNavigate()
  const { jobId } = useParams()
  const editing = Boolean(jobId)
  const [editJob, setEditJob] = useState(null)        // the post being edited (applicants count etc.)
  const [ad, setAd] = useState({ title: '', location: '', salary: '', category: '', description: '' })
  const [categories, setCategories] = useState([])
  const [skills, setSkills] = useState([])     // [{ name, level, quote, group }]
  const [soft, setSoft] = useState([])
  const [readFor, setReadFor] = useState(null) // the title + description the skills were read from
  const [reading, setReading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState('')
  const skillsRef = useRef(null)
  const [justRead, setJustRead] = useState(false)   // first read on a new post: bring the skills into view

  useEffect(() => {
    api.get('/jobs/subcategories', { params: { include_past: true } }).then(res => setCategories(res.data)).catch(() => {})
  }, [])
  useEffect(() => {
    if (!editing) return
    api.get(`/employer/jobs/${jobId}/edit`).then(res => {
      const j = res.data
      setEditJob(j)
      setAd({ title: j.title, location: j.location || '', salary: j.salary || '', category: j.category || '', description: j.description })
      setSkills(j.skills); setSoft(j.soft)
      setReadFor(`${j.title.trim()}\n${j.description.trim()}`)     // the saved skills belong to the saved ad
    }).catch(err => setError(errText(err, "Couldn't load this job.")))
  }, [editing, jobId])

  const set = (key) => (e) => setAd(a => ({ ...a, [key]: e.target.value }))
  const adKey = `${ad.title.trim()}\n${ad.description.trim()}`
  const read = readFor !== null
  const stale = read && readFor !== adKey
  const desc = ad.description.trim().length
  // 13 Oct: no maxLength on the box: a long ad pasted from Word or a website was cut off without a word. Now it
  // pastes whole and the employer is asked to shorten it.
  const tooLong = ad.description.length > MAX_DESCRIPTION
  const missing = [
    ad.title.trim().length < 3 && 'a job title',
    desc < MIN_DESCRIPTION && `a description of at least ${MIN_DESCRIPTION} characters`,
  ].filter(Boolean)
  const cantRead = missing.length > 0 || tooLong
  const detailsMissing = [
    ad.location.trim().length < 2 && 'where the job is based',
    !ad.category && 'a job category',
  ].filter(Boolean)
  const required = skills.filter(s => s.level === 'required').length
  const canPublish = read && !stale && !tooLong && required > 0 && !detailsMissing.length && !publishing

  const readSkills = () => {
    setReading(true); setError('')
    api.post('/employer/jobs/read', { title: ad.title, description: ad.description })
      .then(res => {
        // Reading again replaces what SkillMap found; skills the employer typed stay
        setSkills(prev => {
          const mine = prev.filter(s => !s.quote)
          const have = new Set(mine.map(s => s.name.toLowerCase()))
          return [...res.data.skills.filter(s => !have.has(s.name.toLowerCase())), ...mine]
        })
        setSoft(res.data.soft)
        if (!read) setJustRead(true)
        setReadFor(adKey)
      })
      .catch(err => {
        setError(errText(err, "Couldn't read the skills. Try again."))
        if (err.response?.status === 503) {
          // SkillMap's reader is down: the employer may add the skills by hand. 12 Oct (audit): skills read from an
          // EARLIER version of the ad are dropped first, so they can't be published with the new ad; typed ones stay
          setSkills(prev => prev.filter(s => !s.quote))
          setSoft([])
          setReadFor(adKey)
        }
      })
      .finally(() => setReading(false))
  }
  const add = (level) => (name) => setSkills(prev =>
    prev.some(s => s.name.toLowerCase() === name.toLowerCase())
      ? prev.map(s => s.name.toLowerCase() === name.toLowerCase() ? { ...s, level } : s)   // typed again = moved here
      : [...prev, { name, level, quote: '', group: '' }])
  const remove = (skill) => setSkills(prev => prev.filter(s => s !== skill))
  const publish = () => {
    setPublishing(true); setError('')
    const req = editing
      ? api.put(`/employer/jobs/${jobId}`, { description: ad.description, salary: ad.salary, skills, soft })
      : api.post('/employer/jobs', { ...ad, skills, soft })
    req.then(res => navigate('/employer/jobs', { state: editing ? { saved: ad.title.trim() } : { posted: ad.title.trim(), fit: res.data.graduates_fit } }))
      .catch(err => { setError(errText(err, editing ? "Couldn't save the changes. Try again." : "Couldn't publish the job. Try again.")); setPublishing(false) })
  }
  useEffect(() => {
    if (!justRead) return
    skillsRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
    setJustRead(false)    // eslint-disable-line react-hooks/set-state-in-effect
  }, [justRead])
  const byLevel = useMemo(() => Object.fromEntries(BOXES.map(b => [b.level, skills.filter(s => s.level === b.level)])), [skills])

  return (
    <div className="flex flex-col h-screen">
      <PageHeader>
        <div className="pb-5">
          <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-widest mb-2">{editing ? 'My jobs' : 'Post a job'}</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{editing ? `Edit ${editJob?.title || 'job'}` : read ? 'Check the skills SkillMap read from your ad' : 'Write your job ad'}</h1>
          <p className="text-sm text-slate-500 mt-1">{editing
            ? (editJob ? `${editJob.applicants ? `${editJob.applicants} applicant${editJob.applicants === 1 ? '' : 's'} · their match updates when you save` : 'Changes show in Job Matches when you save'} · posted date stays the same` : '')
            : read
              ? 'Students are matched on these. Remove anything wrong, add anything missing, then publish.'
              : 'SkillMap reads the skills from your ad, and you check them before the job goes live.'}</p>
        </div>
      </PageHeader>

      {/* 13 Oct (her review: two columns felt crowded): ONE form, top to bottom. The ad first; "Read the skills" adds
          the skills under it in the same form, then Cancel / Publish at the end. Before reading, the description box
          takes the height left so the form shows without scrolling (12 Oct); after reading, the page scrolls. */}
      <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6 flex flex-col">
        <section className={`bg-white border border-slate-200 rounded-2xl p-6 flex flex-col gap-4 ${read ? '' : 'flex-1'}`}>
          <div>
            <label htmlFor="pj-title" className={label}>Job title</label>
            <input id="pj-title" value={ad.title} onChange={set('title')} maxLength={120} placeholder="e.g. Junior Backend Developer"
              disabled={editing} className={`${field} ${editing ? lockedCls : ''}`} />
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 basis-48">
              <label htmlFor="pj-location" className={label}>Location</label>
              <input id="pj-location" value={ad.location} onChange={set('location')} maxLength={120} placeholder="e.g. Kuala Lumpur"
                disabled={editing} className={`${field} ${editing ? lockedCls : ''}`} />
            </div>
            <div className="flex-1 basis-48">
              <label htmlFor="pj-salary" className={label}>Salary <span className="font-normal text-slate-400">(optional)</span></label>
              <input id="pj-salary" value={ad.salary} onChange={set('salary')} maxLength={60} placeholder="e.g. RM 3,500 - 4,500" className={field} />
            </div>
          </div>
          <div>
            <label htmlFor="pj-category" className={label}>Job category</label>
            <select id="pj-category" value={ad.category} onChange={set('category')} disabled={editing} className={`${field} ${editing ? lockedCls : ''}`}>
              <option value="">Choose a category</option>
              {[...new Set([...categories, ...(ad.category ? [ad.category] : [])])].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {editing && <p className="text-xs text-slate-500 mt-1.5">Title, location and category can't change once a job is posted. To change them, close this job and post a new one.</p>}
          </div>
          <div className={read ? '' : 'flex-1 min-h-0 flex flex-col'}>
            <label htmlFor="pj-description" className={label}>Description</label>
            <textarea id="pj-description" rows={read ? 10 : undefined} value={ad.description} onChange={set('description')}
              placeholder="What the graduate will do, and the skills you ask for, prefer, or will teach"
              className={`${field} leading-relaxed ${read ? 'resize-y' : 'flex-1 min-h-36 resize-none'}`} />
            <div className="flex items-start justify-between gap-3 mt-1">
              <p className="text-xs text-amber-800">{tooLong ? `Shorten the description to ${MAX_DESCRIPTION.toLocaleString()} characters to read the skills.`
                : missing.length > 0 && `To read the skills, add ${missing.join(' and ')}.`}</p>
              <p className={`text-xs tabular-nums shrink-0 ${tooLong ? 'text-rose-700 font-medium' : 'text-slate-400'}`}>{ad.description.length.toLocaleString()} / {MAX_DESCRIPTION.toLocaleString()}</p>
            </div>
          </div>

          {!read && (
            <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <Link to="/employer/jobs" className="text-sm text-slate-600 hover:underline">Cancel</Link>
              <button type="button" onClick={readSkills} disabled={reading || cantRead}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
                {reading ? 'Reading the skills…' : 'Read the skills'}
              </button>
            </div>
          )}
          {!read && error && <p role="alert" className="text-sm text-rose-600">{error}</p>}

          {read && (
            <div ref={skillsRef} className="pt-5 border-t border-slate-200 flex flex-col gap-5 scroll-mt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-[15px] font-semibold text-slate-900">Skills students are matched on</h2>
                <button type="button" onClick={readSkills} disabled={reading || cantRead}
                  className="text-sm font-medium text-blue-700 hover:underline disabled:text-slate-300 disabled:no-underline">
                  {reading ? 'Reading the skills…' : 'Read the skills again'}
                </button>
              </div>
              {stale && (
                <p className="text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
                  Your ad changed: read the skills again so they match it. Skills you added stay.
                </p>
              )}
              {BOXES.map(b => <ChipBox key={b.level} box={b} skills={byLevel[b.level]} onRemove={remove} onAdd={add(b.level)} />)}
              {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
              <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <Link to="/employer/jobs" className="text-sm text-slate-600 hover:underline">Cancel</Link>
                <div className="flex items-center gap-3">
                  {!stale && (required === 0 || detailsMissing.length > 0) && (
                    <span className="text-xs text-amber-800">
                      {required === 0 ? 'Add at least one required skill.' : `Add ${detailsMissing.join(' and ')}.`}
                    </span>
                  )}
                  <button type="button" onClick={publish} disabled={!canPublish}
                    className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
                    {editing ? (publishing ? 'Saving…' : 'Save changes') : publishing ? 'Publishing…' : 'Publish job'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
