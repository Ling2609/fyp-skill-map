import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import api from '../../api'
import PageHeader from '../../components/PageHeader'
import { errText } from '../student/profileUtils'
import { Busy } from '../../components/Spinner'
import { Bar, FieldSkeleton, LoadingLabel } from '../../components/Skeleton'

// Employer > Post a Job (11 Oct; mock-up 9 Oct board 2; one form since 13 Oct). "Read the skills" adds what SkillMap
// found under the ad (the same extractor and quote check as live jobs). The employer removes what
// is wrong, adds what is missing, moves nothing they don't want to, then publishes. If the ad changes after reading,
// the skills must be read again before publishing (the same rule as Admin's "Find skills" for modules).
const MIN_DESCRIPTION = 80
const MAX_DESCRIPTION = 12000
const BOXES = [
  { level: 'required', title: 'Required', hint: "Counted in each student's match. Hover a skill to see the words in your ad it came from." },
  { level: 'preferred', title: 'Nice to have', hint: 'Shown to students, not counted in the match %.' },
  // 19 Oct (her wording G1): the ad's "you will learn / exposure to" skills are gained by doing the job, not taught
  { level: 'trained', title: 'Gained in the role', hint: 'Not expected before starting; graduates build these by doing the job. Students see them; not counted in the match.' },
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
      <h3 className="text-sm font-semibold text-slate-800">{box.title} <span className="font-normal text-slate-500">({skills.length})</span></h3>
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

// 19 Oct (E6, option F; references.md "Employer posts"): minimum qualification (Malaysian Qualifications Framework
// names), field of study and languages. Optional; students see them as pills under the job title.
const QUALIFICATIONS = [['', 'Not required'], ['certificate', 'Certificate'], ['diploma', 'Diploma'],
  ['advanced_diploma', 'Advanced Diploma'], ['bachelor', "Bachelor's degree"], ['master', "Master's degree"], ['phd', 'PhD']]
const LANGUAGES = ['English', 'Malay', 'Mandarin', 'Cantonese', 'Tamil', 'Japanese', 'Korean', 'Thai', 'Vietnamese', 'Indonesian']

// "Other" is always there (her rule, 19 Oct): a qualification or languages in the employer's own words
const KNOWN_QUALS = QUALIFICATIONS.map(([v]) => v)

function OtherRequirements({ reqs, setReqs }) {
  const known = KNOWN_QUALS.includes(reqs.min_qualification)
  const [qualOther, setQualOther] = useState(!known)
  const typedLangs = reqs.languages.filter(l => !LANGUAGES.includes(l))
  const [langOther, setLangOther] = useState(typedLangs.length > 0)
  const [langText, setLangText] = useState(typedLangs.join(', '))
  const listed = reqs.languages.filter(l => LANGUAGES.includes(l))
  const setLangs = (picked, text) => setReqs(r => ({ ...r, languages: [...picked,
    ...text.split(',').map(x => x.trim()).filter(Boolean)] }))
  const toggle = (lang) => setLangs(listed.includes(lang) ? listed.filter(x => x !== lang) : [...listed, lang], langOther ? langText : '')
  const pill = (on) => `text-sm font-medium rounded-full px-3.5 py-1.5 border ${on
    ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:border-blue-300'}`
  return (
    <div className="pt-5 border-t border-slate-200 flex flex-col gap-4">
      <div>
        <h2 className="text-[15px] font-semibold text-slate-900">Other requirements <span className="font-normal text-sm text-slate-500">(optional)</span></h2>
        <p className="text-xs text-slate-500 mt-1">Students see these under the job title. They don't change the match.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 basis-48 flex flex-col gap-2">
          <div>
            <label htmlFor="pj-qual" className={label}>Minimum qualification</label>
            <select id="pj-qual" value={qualOther ? 'other' : reqs.min_qualification} className={field}
              onChange={e => {
                const v = e.target.value
                setQualOther(v === 'other')
                setReqs(r => ({ ...r, min_qualification: v === 'other' ? '' : v }))
              }}>
              {QUALIFICATIONS.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
              <option value="other">Other…</option>
            </select>
          </div>
          {qualOther && (
            <input aria-label="Other qualification" value={reqs.min_qualification} maxLength={40}
              placeholder="e.g. SPM, professional certificate" className={field}
              onChange={e => setReqs(r => ({ ...r, min_qualification: e.target.value }))} />
          )}
        </div>
        <div className="flex-[2] basis-64">
          <label htmlFor="pj-field" className={label}>Field of study</label>
          <input id="pj-field" value={reqs.study_field} maxLength={200} placeholder="e.g. Computer Science, IT or related"
            onChange={e => setReqs(r => ({ ...r, study_field: e.target.value }))} className={field} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <p className={label} id="pj-langs">Languages</p>
        <div role="group" aria-labelledby="pj-langs" className="flex flex-wrap gap-2">
          {LANGUAGES.map(lang => (
            <button key={lang} type="button" aria-pressed={listed.includes(lang)} onClick={() => toggle(lang)}
              className={pill(listed.includes(lang))}>{lang}</button>
          ))}
          <button type="button" aria-pressed={langOther} className={pill(langOther)}
            onClick={() => { setLangOther(!langOther); setLangs(listed, langOther ? '' : langText) }}>Other…</button>
        </div>
        {langOther && (
          <input aria-label="Other languages" value={langText} maxLength={120}
            placeholder="e.g. Hokkien, French (separate with commas)" className={field}
            onChange={e => { setLangText(e.target.value); setLangs(listed, e.target.value) }} />
        )}
      </div>
    </div>
  )
}

export default function PostJob() {
  const navigate = useNavigate()
  const { jobId } = useParams()
  const editing = Boolean(jobId)
  const [editJob, setEditJob] = useState(null)        // the post being edited (applicants count etc.)
  const [ad, setAd] = useState({ title: '', location: '', salary: '', category: '', description: '' })
  const [categories, setCategories] = useState([])
  const [skills, setSkills] = useState([])     // [{ name, level, quote, group }]
  const [soft, setSoft] = useState([])
  const [recordId, setRecordId] = useState(null)
  const [readFor, setReadFor] = useState(null) // the title + description the skills were read from
  const [reading, setReading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  // 14 Oct (transparency flow): the date the employer promises a decision by; students see it before applying
  const [decideDays, setDecideDays] = useState(30)
  // 19 Oct (E6, option F): what the job asks for besides skills, chosen here (not read from the ad); students see them
  // as pills on Job Detail. All optional.
  const [reqs, setReqs] = useState({ min_qualification: '', study_field: '', languages: [] })
  const [error, setError] = useState('')
  const [asksMore, setAsksMore] = useState(false)    // 21 Oct: the edit asked for more after people applied (409)
  const skillsRef = useRef(null)
  const [justRead, setJustRead] = useState(false)   // first read on a new post: bring the skills into view
  // 24 Oct (TC-64): SkillMap's reader couldn't be reached on the last try; the employer adds the skills by hand
  const [readerDown, setReaderDown] = useState(false)

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
      setReqs({ min_qualification: j.min_qualification || '', study_field: j.study_field || '', languages: j.languages || [] })
      setReadFor(`${j.title.trim()}\n${j.description.trim()}`)     // the saved skills belong to the saved ad
    }).catch(err => setError(errText(err, "Couldn't load this job.")))
  }, [editing, jobId])

  // 21 Oct (references.md "Changing a job's requirements after people applied"): "Post a new job" from an edit that
  // asked for more starts a new post filled in with that edit (the skills count as read for that ad)
  const copy = useLocation().state?.copy
  useEffect(() => {
    if (editing || !copy) return
    setAd(copy.ad); setSkills(copy.skills); setSoft(copy.soft); setReqs(copy.reqs)  // eslint-disable-line react-hooks/set-state-in-effect
    setEditJob(null); setError(''); setAsksMore(false); setRecordId(null)       // the same page was showing the edit
    setReadFor(`${copy.ad.title.trim()}\n${copy.ad.description.trim()}`)
  }, [editing, copy])

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
        setRecordId(res.data.record_id || null)    // 14 Oct: sent back on publish (what you changed vs SkillMap's reading)
        if (!read) setJustRead(true)
        setReadFor(adKey)
        setReaderDown(false)
      })
      .catch(err => {
        if (err.response?.status !== 503) setError(errText(err, "Couldn't read the skills. Try again."))
        if (err.response?.status === 503) {
          // 24 Oct (TC-64): said at the top of the skills, not as a red line by Publish below the fold
          setReaderDown(true)
          if (!read) setJustRead(true)
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
    setPublishing(true); setError(''); setAsksMore(false)
    const req = editing
      ? api.put(`/employer/jobs/${jobId}`, { description: ad.description, salary: ad.salary, skills, soft, record_id: recordId, ...reqs })
      : api.post('/employer/jobs', { ...ad, skills, soft, decide_days: decideDays, record_id: recordId, ...reqs })
    req.then(res => navigate('/employer/jobs', { state: editing ? { saved: ad.title.trim() } : { posted: ad.title.trim(), fit: res.data.graduates_fit } }))
      .catch(err => {
        setError(errText(err, editing ? "Couldn't save the changes. Try again." : "Couldn't publish the job. Try again."))
        setAsksMore(editing && err.response?.status === 409)
        setPublishing(false)
      })
  }
  useEffect(() => {
    if (!justRead) return
    skillsRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
    setJustRead(false)    // eslint-disable-line react-hooks/set-state-in-effect
  }, [justRead])
  const loadingJob = editing && !editJob && !error
  const byLevel = useMemo(() => Object.fromEntries(BOXES.map(b => [b.level, skills.filter(s => s.level === b.level)])), [skills])

  return (
    <div className="flex flex-col h-screen">
      <PageHeader>
        <div className="pb-5">
          <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-widest mb-2">{editing ? 'My Jobs' : 'Post a Job'}</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{editing ? `Edit ${editJob?.title || 'job'}` : readerDown ? 'Add the skills students are matched on' : read ? 'Check the skills SkillMap read from your ad' : 'Write your job ad'}</h1>
          <p className="text-sm text-slate-500 mt-1">{editing
            // 21 Oct: once people applied, the job can ask for less, not more (references.md "Changing a job's
            // requirements after people applied")
            ? (editJob ? `${editJob.applicants ? `${editJob.applicants} applicant${editJob.applicants === 1 ? '' : 's'}: you can fix the ad or ask for less; to ask for more, post a new job` : 'Changes show in Job Matches when you save'} · posted date stays the same` : '')
            : readerDown
              ? 'Type the skills your ad asks for below, then publish.'
              : read
              ? 'Students are matched on these. Remove anything wrong, add anything missing, then publish.'
              : 'SkillMap reads the skills from your ad, and you check them before the job goes live.'}</p>
        </div>
      </PageHeader>

      {/* 13 Oct (her review: two columns felt crowded): ONE form, top to bottom. The ad first; "Read the skills" adds
          the skills under it in the same form, then Cancel / Publish at the end. Before reading, the description box
          takes the height left so the form shows without scrolling (12 Oct); after reading, the page scrolls. */}
      <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6 flex flex-col">
        {/* 15 Oct (her review: loading for all): editing a job, the saved ad is fetched first; grey bars in the form's
            shape until it arrives, instead of empty boxes that fill in a moment later */}
        {loadingJob && (
          <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
            <LoadingLabel>Loading the job…</LoadingLabel>
            <FieldSkeleton n={3} />
            <div aria-hidden="true" className="space-y-2"><Bar className="h-3 w-24" /><Bar className="h-48 w-full rounded-lg" /></div>
          </section>
        )}
        <section className={`bg-white border border-slate-200 rounded-2xl p-6 flex flex-col gap-4 ${read ? '' : 'flex-1'} ${loadingJob ? 'hidden' : ''}`}>
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
              <label htmlFor="pj-salary" className={label}>Salary <span className="font-normal text-slate-500">(optional)</span></label>
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
          {!editing && (
            <div>
              <p className={label} id="pj-decide">Decide by</p>
              <div role="radiogroup" aria-labelledby="pj-decide" className="flex flex-wrap gap-2">
                {[[14, '2 weeks'], [28, '4 weeks'], [30, '30 days'], [42, '6 weeks']].map(([d, text]) => (
                  <button key={d} type="button" role="radio" aria-checked={decideDays === d} onClick={() => setDecideDays(d)}
                    className={`text-sm font-medium rounded-full px-3.5 py-1.5 border ${decideDays === d
                      ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:border-blue-300'}`}>{text}</button>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-1.5">Students see this date before applying. Applications without a decision by then close automatically and count in your record.</p>
            </div>
          )}
          <div className={read ? '' : 'flex-1 min-h-0 flex flex-col'}>
            <label htmlFor="pj-description" className={label}>Description</label>
            <textarea id="pj-description" rows={read ? 10 : undefined} value={ad.description} onChange={set('description')}
              placeholder="What the graduate will do, and the skills you ask for, prefer, or will teach"
              className={`${field} leading-relaxed ${read ? 'resize-y' : 'flex-1 min-h-36 resize-none'}`} />
            <div className="flex items-start justify-between gap-3 mt-1">
              <p className="text-xs text-amber-800">{tooLong ? `Shorten the description to ${MAX_DESCRIPTION.toLocaleString()} characters to read the skills.`
                : missing.length > 0 && `To read the skills, add ${missing.join(' and ')}.`}</p>
              <p className={`text-xs tabular-nums shrink-0 ${tooLong ? 'text-rose-700 font-medium' : 'text-slate-500'}`}>{ad.description.length.toLocaleString()} / {MAX_DESCRIPTION.toLocaleString()}</p>
            </div>
          </div>

          {!read && (
            <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <Link to="/employer/jobs" className="text-sm text-slate-600 hover:underline">Cancel</Link>
              <button type="button" onClick={readSkills} disabled={reading || cantRead}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
                {reading ? <Busy>Reading the skills…</Busy> : 'Read the skills'}
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
                  {reading ? <Busy>Reading the skills…</Busy> : 'Read the skills again'}
                </button>
              </div>
              {readerDown && !reading && (
                <p role="alert" className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-3">
                  SkillMap couldn't read the skills just now. Add them yourself below, or read the skills again in a
                  few minutes.
                </p>
              )}
              {stale && (
                <p className="text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
                  Your ad changed: read the skills again so they match it. Skills you added stay.
                </p>
              )}
              {BOXES.map(b => <ChipBox key={b.level} box={b} skills={byLevel[b.level]} onRemove={remove} onAdd={add(b.level)} />)}
              <OtherRequirements key={editJob ? `edit-${editJob.id}` : 'new'} reqs={reqs} setReqs={setReqs} />
              {error && (asksMore ? (
                <div role="alert" className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-3">
                  <p>{error}</p>
                  <button type="button" onClick={() => navigate('/employer/post', { state: { copy: { ad, skills, soft, reqs } } })}
                    className="mt-2 font-medium text-blue-700 hover:underline">Post a new job with these changes →</button>
                </div>
              ) : <p role="alert" className="text-sm text-rose-600">{error}</p>)}
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
                    {editing ? (publishing ? <Busy>Saving…</Busy> : 'Save changes') : publishing ? <Busy>Publishing…</Busy> : 'Publish job'}
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
