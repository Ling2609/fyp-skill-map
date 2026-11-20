import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import InfoTip from '../../components/InfoTip'
import api from '../../api'
import { cached, peek } from '../../pageCache'
import { skillName } from '../../skillName'
import { SELF_DECLARED_TIP, errText, sourcePillCls } from './profileUtils'
import ApplicationSteps from '../../components/ApplicationSteps'
import { ADMIN_COUNTS_CHANGED } from '../../components/Sidebar'
import { Bar, RowSkeleton, LoadingLabel, TextSkeleton } from '../../components/Skeleton'
import { Busy } from '../../components/Spinner'
import BackLink from '../../components/BackLink'
import { OutsideBanner, OutsideStatus } from '../../components/OutsideApply'
import { useOutsideApplication } from '../../components/useOutsideApplication'
import { AdRequirementPills, SalaryFromAd } from '../../components/AdRequirements'

// 19 Nov: the company's initials in the header's tile (as the Job Matches cards)
const initials = (name = '') => name.replace(/\b(sdn|bhd|berhad|ltd|limited|plc|inc)\b\.?/gi, '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '·'
// 19 Nov: mark the job's skill words inside a line of the ad (case-insensitive, whole words)
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
function markSkills(text, marks) {
  if (!marks.length || !text) return text
  const re = new RegExp(`(?<![\\w-])(${marks.map(([k]) => esc(k)).join('|')})(?![\\w-])`, 'gi')
  const kind = Object.fromEntries(marks.map(([k, c]) => [k.toLowerCase(), c]))
  return text.split(re).map((part, i) => (i % 2 ? <mark key={i} className={`jd-mark ${kind[part.toLowerCase()] === 'm' ? 'm' : ''}`}>{part}</mark> : part))
}

// The grade itself, not its weight: the weight is the same for C+ and C, so a C showed as "C+" (5 Oct)
const GRADE_LETTERS = { '4.0': 'A', '3.7': 'A-', '3.3': 'B+', '3.0': 'B', '2.7': 'B-', '2.3': 'C+', '2.0': 'C' }

const gradeLabel = (grade) => (grade == null ? '' : GRADE_LETTERS[Number(grade).toFixed(1)] || '')
// B4 (decided 27 Sep, built 9 Oct): a grade says how strong the academic evidence is, never how skilled she is, and it
// never decides a match. A/A- strong, B+/B/B- good, below fair.
const evidenceStrength = (grade) => (grade == null ? '' : grade >= 3.7 ? 'strong evidence' : grade >= 2.7 ? 'good evidence' : 'fair evidence')

// "today", "3 days ago", "2 weeks ago"
const daysSince = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : 0)

const postedAgo = (iso) => {
  if (!iso) return ''
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (isNaN(days)) return ''
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  return `${Math.floor(days / 7)} weeks ago`
}

const fmtDay = (iso) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''

// Apply on a job posted on SkillMap (11 Oct, Employer flow batch 2; mock-up board 5). There is no outside site,
// so the student applies with their SkillMap profile; the employer then sees it and the match for this job.
// 12 Oct (flow review, mock-up M3): after applying, the same progress steps as My Applications (no more green
// "Applied" when the answer was Not selected); before applying, an employer's invitation is shown above Apply.
const OUTCOME = { rejected: 'text-rose-700 bg-rose-50 border-rose-200', accepted: 'text-emerald-800 bg-emerald-50 border-emerald-200' }

function useSkillMapApplication(jobRef, onSkillMap) {
  const [app, setApp] = useState(undefined)       // undefined = loading, null = not applied
  const [invite, setInvite] = useState(null)
  const [now, setNow] = useState(null)            // 14 Oct: { closed, taking_applications, decide_by }, always fresh
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!jobRef || !onSkillMap) return
    api.get(`/applications/job/${encodeURIComponent(jobRef)}`).then(res => setApp(res.data)).catch(() => setApp(null))
    api.get('/applications/invitations').then(res => setInvite(res.data.find(i => i.job_ref === jobRef) || null)).catch(() => {})
    api.get(`/applications/job/${encodeURIComponent(jobRef)}/open`).then(res => setNow(res.data)).catch(() => {})
  }, [jobRef, onSkillMap])
  const apply = () => {
    setBusy(true); setError('')
    api.post('/applications', { job_id: jobRef })
      .then(res => { setApp(res.data); setInvite(null); window.dispatchEvent(new Event(ADMIN_COUNTS_CHANGED)) })
      .catch(err => setError(errText(err, "Couldn't send your application. Try again.")))
      .finally(() => setBusy(false))
  }
  return { app, invite, busy, error, apply, now }
}

// 14 Oct (transparency flow): the employer's decision date is shown before applying; a job that stopped taking
// applications (or closed) can't be applied to ("Applications closed", as Homerun's closed jobs)
// 19 Oct (her pick of the mock-up): before applying, the employer's promised reply date, its reply record and who
// sees what sit in one left-aligned box under the title (beside the button they wrapped badly: "reply by 17 / Nov")
function ApplyInfo({ a, company, closed: closedCached, taking: takingCached, decideBy: dateCached, record }) {
  const { app, now } = a
  const closed = now ? now.closed : closedCached
  const taking = now ? now.taking_applications : takingCached
  const decideBy = now ? now.decide_by : dateCached
  if (app !== null || closed || taking === false) return null      // loading, applied, or can't apply: nothing to say
  return (
    // 20 Nov (her review: the header pushed the content down): one compact line instead of a three-line box
    // 20 Nov (her review: "show the date directly"): one chip; the record and who sees what sit in its info tip
    decideBy ? (
      <span className="jd-chip">Reply by <b>{fmtDay(decideBy)}</b>
        <InfoTip label="About this date">{company || 'The employer'} promises to reply by this date.{' '}
          {record?.shown ? `They replied on time on ${record.on_time} of ${record.of} past jobs.` : 'New on SkillMap, so no reply record yet.'}{' '}
          They see your profile and match; your contact details only if they shortlist you.</InfoTip>
      </span>
    ) : null
  )
}

// 21 Oct (her idea; research: references.md "Checking what the employer sees before applying"): Apply asks first, in
// a small pop-up beside the button. A SkillMap application can't be taken back and shares her profile, so a confirm
// is justified (NN/g); the buttons say what they do. "Check what they'll see" opens /jobs/:jobId/check.
// 21 Oct (her pick, mock tip.png): one tip, only from what THIS ad asks for. First the required skills the profile
// lacks ("if you've used them", so nobody is pushed to claim a skill), else a language the employer ticked in Post a
// Job that her profile doesn't list. Posts have no work-experience field, so no experience tip (it would be a guess).
// Never blocks applying.
const listOf = (xs) => xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`

function ApplyTip({ job, missing }) {
  const [mine, setMine] = useState(null)        // her languages, from Profile & privacy
  const asks = job.requirements?.languages?.languages || []
  useEffect(() => {
    if (missing.length || !asks.length) return
    api.get('/profile/about').then(res => setMine(res.data.languages || [])).catch(() => setMine(null))
  }, [missing.length, asks.length])
  const cls = 'mt-3 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2'
  if (missing.length) {
    const names = missing.slice(0, 3)
    return <p className={cls}><b className="font-semibold">Tip:</b> this ad asks for {listOf(names)}{missing.length > 3 && ` and ${missing.length - 3} more`},
      {' '}which {missing.length === 1 ? "isn't" : "aren't"} on your profile. If you've used {missing.length === 1 ? 'it' : 'them'} in a project or job,{' '}
      <Link to="/profile?tab=projects" className="font-medium text-blue-700 underline">add it first</Link>.</p>
  }
  if (!mine) return null
  const have = new Set(mine.map(l => l.language.toLowerCase()))
  const lacking = asks.filter(l => !have.has(l.toLowerCase()))
  if (!lacking.length) return null
  return <p className={cls}><b className="font-semibold">Tip:</b> this ad asks for {listOf(lacking)}, which {lacking.length === 1 ? "isn't" : "aren't"} on
    your profile. <Link to="/profile/settings" className="font-medium text-blue-700 underline">Add your languages</Link></p>
}

function ApplyConfirm({ job, summary, missing = [], onApply, onClose }) {
  const box = useRef(null)
  const navigate = useNavigate()
  useEffect(() => {
    const close = (e) => { if (box.current && !box.current.contains(e.target)) onClose() }
    const esc = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [onClose])
  return (
    <div ref={box} role="dialog" aria-label={`Apply to ${job.company}?`}
      className="absolute right-0 top-full mt-2 z-40 w-md max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-lg p-4 text-left">
      {/* 21 Oct (her review): × in the top right corner, level with the title */}
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-slate-900 leading-5">Apply to {job.company}?</p>
        <button type="button" onClick={onClose} aria-label="Close"
          className="-mt-1 -mr-1.5 w-6 h-6 flex items-center justify-center rounded text-lg leading-none text-slate-500 hover:text-slate-700 hover:bg-slate-100">×</button>
      </div>
      <p className="text-sm text-slate-600 mt-1">They'll see your SkillMap profile and your match for {job.job_title}
        {summary ? `: ${summary.matched_skills} of ${summary.job_skills_total} required skills` : ''}. Your email, phone and other
        contact details only if they shortlist you. You can't take an application back once sent.</p>
      <ApplyTip job={job} missing={missing} />
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={() => navigate(`/jobs/${encodeURIComponent(job.job_id)}/check`)}
          className="text-sm font-medium text-slate-700 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50">Check what they'll see</button>
        <button type="button" onClick={() => { onClose(); onApply() }} autoFocus
          className="text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg px-3 py-1.5">Apply now</button>
      </div>
    </div>
  )
}

function ApplyAction({ a, closed: closedCached, taking: takingCached, fromApps, job, summary, missing }) {
  const { app, busy, error, apply, now } = a
  const [asking, setAsking] = useState(false)
  const closed = now ? now.closed : closedCached
  const taking = now ? now.taking_applications : takingCached
  if (app === undefined) return null
  return (
    <div className="relative shrink-0 flex flex-col items-end gap-1 max-w-64 text-right">
      {app ? (
        <>
          {/* 20 Nov (her review: "Applied · 19 Nov" repeated the step track under it): only an outcome gets a chip */}
          {['accepted', 'rejected'].includes(app.status) && <span className={`text-sm font-semibold border px-4 py-2 rounded-lg ${OUTCOME[app.status] || 'text-slate-700 bg-slate-50 border-slate-200'}`}>
            {`${app.status_label} · ${fmtDay(app.status_changed_at)}`}
          </span>}
          {/* 14 Oct (her review): the way to all applications sits under the status it belongs to; not shown when
              the back link already goes there */}
          {!fromApps && <Link to="/applications" className="text-xs text-blue-700 hover:underline">View in My Applications</Link>}
        </>
      ) : closed ? (
        <span className="text-sm text-slate-600 bg-slate-100 px-4 py-2 rounded-lg">This job is closed</span>
      ) : taking === false ? (
        <span className="text-sm text-slate-600 bg-slate-100 px-4 py-2 rounded-lg">{now?.deadline_passed || job?.deadline_passed ? 'New applications paused — decision date passed' : 'Applications closed'}</span>
      ) : (
        <>
          <button onClick={() => setAsking(v => !v)} disabled={busy} aria-expanded={asking}
            className="text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 px-4 py-2 rounded-lg transition disabled:opacity-50">
            {busy ? <Busy>Applying…</Busy> : 'Apply with my SkillMap profile'}
          </button>
          {asking && job && <ApplyConfirm job={job} summary={summary} missing={missing} onApply={apply} onClose={() => setAsking(false)} />}
          {/* 19 Oct (her pick): what to know before applying moved under the title (ApplyInfo) */}
        </>
      )}
      {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
    </div>
  )
}

function ApplicationProgress({ a, company }) {
  const { app, invite } = a
  if (!app && invite) return (
    <span className="jd-chip invite" title="Applying shares your profile and email with them">Invited <b>{fmtDay(invite.invited_at)}</b></span>
  )
  if (!app?.progress) return null
  const p = app.progress
  return (
    <div className="jd-progress">
      <ApplicationSteps compact steps={p.steps} decided={['accepted', 'rejected'].includes(app.status)} />
      {p.nudge === 'no_decision' ? <p className="mt-3 text-sm text-amber-900 bg-amber-50 rounded-lg px-3.5 py-2">
        <b>{company} missed its promised reply date ({fmtDay(app.decide_by)}).</b> Your application is still awaiting a decision. Focus on other jobs; any reply will still appear here.
      </p> : p.nudge && <p className="mt-3 text-sm text-amber-900 bg-amber-50 rounded-lg px-3.5 py-2">
        <b>No update for {p.quiet_days} days.</b> {p.nudge === 'move_on' ? 'Treat this one as unlikely and put your time into other jobs.' : 'Keep applying to other jobs while you wait.'}
      </p>}
      {/* 12 Oct (her review): no sentence about the gap (the score row and the Skill Gap tab, opened for a rejected
          application, already say it). 14 Oct: the link to all applications moved under the status pill */}
    </div>
  )
}

export default function JobDetail() {
  const navigate = useNavigate()
  const location = useLocation()
  const { jobId } = useParams()
  // Back to the page the job was opened from (Job Matches or Dashboard). history.back() keeps that page's
  // place; a job opened in a new tab has nothing to go back to, so it goes to Job Matches
  // 14 Oct (her review; GOV.UK back link: name where it goes): the label says the page it was opened from
  const backLabel = location.state?.from || 'Job Matches'
  const BACK_PATHS = { 'Job Matches': '/recommend', Dashboard: '/dashboard', 'My Applications': '/applications' }
  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate(BACK_PATHS[backLabel] || '/recommend'))
  // The chatbot's "Back to <job>" returns here on the same tab: remember it in this history entry first
  // The job's id goes too (E3, 9 Oct): the chatbot reads this job's skill gap itself (what she has, what is missing,
  // the ad's words), so its plan uses the same numbers as this page. (The old &reason= was never read.)
  const openChat = (skill) => {
    navigate(location.pathname, { replace: true, state: { ...location.state, tab: activeTab } })
    navigate(`/chatbot?skill=${encodeURIComponent(skill)}&job=${encodeURIComponent(gap?.job?.job_title || '')}`
      + `&job_id=${encodeURIComponent(gap?.job?.job_id || '')}`, { state: { from: gap?.job?.job_title || 'job' } })
  }
  const [gap, setGap] = useState(() => peek('/skillgap/', { job_id: decodeURIComponent(jobId) }))
  const skillmapApp = useSkillMapApplication(gap?.job?.job_id, gap?.job?.source === 'employer')
  // 20 Oct: a job on another site: did she apply there? (recorded by her, shown only to her)
  const outside = useOutsideApplication(gap?.job?.job_id, gap?.job?.source === 'live')
  const [loading, setLoading] = useState(() => !gap)
  const [error, setError] = useState('')
  // 12 Oct (her review): a rejected application opens on Skill Gap Analysis (what to work on next) unless the
  // student picked a tab (or came back to one)
  const [chosenTab] = useState(location.state?.tab || null)
  // 19 Nov (her review): on a phone the two tiles stacked made a very long page, so a switch shows one at a time
  const [phoneView, setPhoneView] = useState(location.state?.tab === 'description' ? 'ad' : 'gap')
  const activeTab = chosenTab || (skillmapApp.app?.status === 'rejected' ? 'gap' : 'description')
  const [bullets, setBullets] = useState(() => peek(`/jobs/${encodeURIComponent(jobId)}/description`)?.bullets ?? null)
  const [bulletsLoading, setBulletsLoading] = useState(false)

  useEffect(() => {
    // The backend builds the profile from the logged-in user's saved record
    // Kept by pageCache: back from the chatbot or Job Matches shows it at once (dropped after a profile change)
    cached('/skillgap/', { job_id: decodeURIComponent(jobId) })
      .then(data => { setGap(data); setLoading(false) })
      .catch(err => {
        setError(err.response?.data?.detail || 'Failed to load skill gap analysis')
        setLoading(false)
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (bullets !== null || !gap) return   // 19 Nov: the ad is always on screen now (no tabs)
    let cancelled = false
    setTimeout(() => {
      if (!cancelled) setBulletsLoading(true)
    }, 0)
    cached(`/jobs/${encodeURIComponent(jobId)}/description`)
      .then(data => { if (!cancelled) setBullets(data.bullets || []) })
      .catch(() => { if (!cancelled) setBullets([]) })
      .finally(() => { if (!cancelled) setBulletsLoading(false) })
    return () => { cancelled = true }
  }, [activeTab, gap]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      // 13 Oct: grey bars in the page's shape, like the other pages (was a lone spinner)
      <div className="min-h-[calc(100dvh-var(--bar-h))]" aria-busy="true">
        <LoadingLabel>Loading job details…</LoadingLabel>
        <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-3.5"><Bar className="h-3 w-24" /></div>
        <div className="px-4 sm:px-6 py-5 max-w-4xl mx-auto space-y-4" aria-hidden="true">
          <div className="bg-white rounded-xl p-6 border border-slate-200 flex justify-between gap-6">
            <div className="space-y-2.5"><Bar className="h-6 w-72" /><Bar className="h-3.5 w-56" /><Bar className="h-3 w-32" /></div>
            <Bar className="h-12 w-20" />
          </div>
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="px-6 py-3.5 border-b border-slate-200 flex gap-6">{['w-20', 'w-20', 'w-24'].map((w, i) => <Bar key={i} className={`h-4 ${w}`} />)}</div>
            <div className="px-6 divide-y divide-slate-100">{[0, 1, 2, 3, 4].map(i => <RowSkeleton key={i} />)}</div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-[calc(100dvh-var(--bar-h))] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 text-sm mb-4">{error}</p>
          <button onClick={goBack} className="text-blue-700 text-sm hover:underline">← Go back</button>
        </div>
      </div>
    )
  }


  // Layout (summary first): 1) what to learn, 2) what you already have (with where it comes from).
  // Only skills you have count (same skill, or SBERT >= 0.7). Gaps carry no "partly / related" reason:
  // below 0.7 closeness is not reliable evidence, so it isn't shown as one (step 2, 30 Sep).
  const gapRows = gap?.missing_skills || []

  // Matches: strongest first. Fallbacks keep the page correct with an older backend.
  const matchedRows = [...(gap?.matched_skills || [])]
    .sort((a, b) => b.similarity - a.similarity)
    .map(m => ({
      ...m,
      evidence_source: m.evidence_source || 'module',
    }))

  // "Show where these come from": group matched skills by their source (module / project / cert)
  const sourceGroups = Object.entries(
    matchedRows.reduce((acc, m) => {
      const key = m.matched_via_module || 'Other'
      if (!acc[key]) {
        acc[key] = {
          // Module names like "Project in Software Engineering" read like a project, so say what it is
          label: m.evidence_source === 'module' && key !== 'Other' ? `Module: ${key}` : key,
          grade: m.evidence_source === 'module' ? gradeLabel(m.grade) : '',
          strength: m.evidence_source === 'module' ? evidenceStrength(m.grade) : '',
          selfDeclared: m.evidence_source !== 'module' && key !== 'Other',
          items: [],
        }
      }
      acc[key].items.push(m)
      return acc
    }, {})
  ).sort((a, b) => b[1].items.length - a[1].items.length)

  const totalRequired = gapRows.length + matchedRows.length
  // Stage 3A: the % counts required skills; a job that requires nothing specific is scored on its preferred ones
  // What the % counts: required skills; if the ad requires none, the skills it lists without a level, else its preferred ones
  const basisWord = { preferred: 'preferred', unspecified: 'listed' }[gap?.summary?.coverage_basis] || 'required'
  const BasisWord = basisWord[0].toUpperCase() + basisWord.slice(1)
  // Nice-to-have skills: shown apart, never in the %. Soft skills are left out of the % too and not listed (they are in
  // the description).
  const niceToHave = gap?.nice_to_have || []
  // 19 Oct (her T1 + wording G1, research in references.md): skills gained by doing the job ("you will learn",
  // "exposure to"): never a gap; shown as a card after Nice-to-have, with the other skills (they are skills)
  const gainInRole = gap?.learn_on_job || []
  // the skill words to mark in the ad: teal if she has them, coral if not (longest first, so "Spring Boot Test" wins)
  const marks = [
    ...matchedRows.map(m => [m.job_skill, 'h']), ...gapRows.map(m => [m.job_skill, 'm']),
    ...niceToHave.map(m => [m.job_skill, m.has ? 'h' : 'm']),
  ].filter(([k]) => k && k.length > 1).sort((a, b) => b[0].length - a[0].length)

  return (
    <div className="flex flex-col min-h-[calc(100dvh-var(--bar-h))] lg:h-[calc(100dvh-var(--bar-h))]">

      {/* Top nav: same left edge as the other pages' headings (PageHeader: px-8); the shared back link (20 Oct) */}
      <BackLink label={backLabel} onClick={goBack} />
      {outside.toastUi}

      {/* 19 Nov (her approved mock review/job-detail.html): the page width every screen uses; the glass header; the two
          tabs became two tiles side by side (the ad with its skill words marked | the skill gap), so nothing hides
          behind a tab and the page fits one screen; each tile scrolls inside. Phone: the gap first, then the ad */}
      <div className="mx-auto flex w-full max-w-[1256px] min-h-0 flex-1 flex-col px-4 pb-4 sm:px-8">

        <section className="page-glass jd-head mt-3 shrink-0" aria-labelledby="jd-title">
          <span className="page-glass-ic jd-ic" aria-hidden="true">{initials(gap?.job?.company)}</span>
          <div className="page-glass-body relative px-4 py-4 sm:px-7 sm:py-5">
            <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
              <div className="min-w-0 flex-1 basis-80">
                <p className="jd-eb">Job{gap?.job?.category ? ` · ${gap.job.category}` : ''}</p>
                <h1 id="jd-title" className="m-0">{gap?.job?.job_title}</h1>
                <p className="jd-meta">
                  <span>{[gap?.job?.company, gap?.job?.location].filter(Boolean).join(' · ')}</span>
                  <span>
                    {gap?.job?.salary && gap.job.salary !== 'nan'
                      ? <span className="font-medium text-have-strong">{gap.job.salary}</span>
                      : gap?.job?.requirements?.salary
                        ? <SalaryFromAd salary={gap.job.requirements.salary} />
                        : 'Salary not disclosed'}
                    {gap?.job?.source === 'live'
                      ? (postedAgo(gap.job.listing_date) ? ` · Posted ${postedAgo(gap.job.listing_date)}` : '')
                      : gap?.job?.source === 'employer'
                        ? ` · Posted on SkillMap${postedAgo(gap.job.listing_date) ? ` ${postedAgo(gap.job.listing_date)}` : ''}`
                        : ' · Past posting from JobStreet (2024)'}
                    {/* F8: most postings close within about a month (references.md). 20 Oct (her pick H1): next to the date */}
                    {gap?.job?.source === 'live' && !gap.job.gone && daysSince(gap.job.listing_date) > 30 && (
                      <span className="text-partial-strong"> · it may have closed</span>
                    )}
                  </span>
                </p>
              </div>

              {/* the fit: integers from the API (her rule: 6/13, never a %), one dot per skill counted */}
              <div className="jd-fit" role="img" aria-label={`You have ${gap?.summary?.matched_skills ?? 0} of the ${gap?.summary?.job_skills_total ?? 0} ${basisWord} skills`}>
                <p className="m-0 jd-n"><b>{gap?.summary?.matched_skills ?? 0}</b><span>/{gap?.summary?.job_skills_total ?? 0}</span></p>
                <div>
                  <p className="m-0 jd-lbl">{basisWord} skills you have</p>
                  <p className="m-0 jd-dots" aria-hidden="true">
                    {Array.from({ length: gap?.summary?.job_skills_total || 0 }, (_, i) => <i key={i} className={i < (gap?.summary?.matched_skills || 0) ? '' : 'm'} />)}
                  </p>
                </div>
              </div>

              {gap?.job?.source === 'employer' && <ApplyAction a={skillmapApp} job={gap.job} summary={gap.summary} missing={(gap.missing_skills || []).map(m => skillName(m.job_skill))} fromApps={backLabel === 'My Applications'} closed={gap.job.closed}
                taking={gap.job.taking_applications} />}
              {gap?.job?.source === 'live' && gap.job.source_url && (
                <div className="shrink-0 flex flex-col items-start gap-1 sm:items-end">
                  {/* 20 Oct: the latest job search no longer returns this ad, so its link may be dead */}
                  {gap.job.gone ? (
                    <span className="text-sm text-slate-600 bg-slate-100 px-4 py-2 rounded-lg">This ad is no longer listed</span>
                  ) : (
                    <a href={gap.job.source_url} target="_blank" rel="noopener noreferrer" onClick={outside.leaving} className="head-cta">
                      Apply on {gap.job.publisher || 'employer site'}
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M7 17 17 7M9 7h8v8" /></svg>
                    </a>
                  )}
                  <OutsideStatus o={outside} />
                </div>
              )}
            </div>

            {gap?.job?.source === 'live' && <OutsideBanner o={outside} site={gap.job.publisher} company={gap.job.company} />}
            {/* 19 Nov (her review): what the ad asks for and the application's steps share one line */}
            <div className="jd-strip empty:hidden">
              <AdRequirementPills req={gap?.job?.requirements} />
              <span className="jd-chips empty:hidden">
                {gap?.job?.source === 'employer' && <ApplyInfo a={skillmapApp} company={gap.job.company} closed={gap.job.closed}
              taking={gap.job.taking_applications} decideBy={gap.job.decide_by} record={gap.job.employer_record} />}
                {gap?.job?.source === 'employer' && <ApplicationProgress a={skillmapApp} company={gap.job.company} />}
              </span>
            </div>
          </div>
        </section>

        {/* phones and tablets only: one tile at a time; the skill gap first (what SkillMap adds to the ad) */}
        <div className="jd-switch" role="group" aria-label="Show">
          <button type="button" aria-pressed={phoneView === 'gap'} onClick={() => setPhoneView('gap')}>Skill gap <span className="c">{gapRows.length} to learn</span></button>
          <button type="button" aria-pressed={phoneView === 'ad'} onClick={() => setPhoneView('ad')}>Job description</button>
        </div>
        <div className="jd-grid mt-3.5 min-h-0 flex-1" data-show={phoneView}>
          {/* the ad: its skill words marked teal (you have) or coral (to learn) */}
          <section className="jd-tile jd-ad" aria-labelledby="jd-desc">
            <div className="jd-thead">
              <h2 id="jd-desc" className="jd-tt"><i aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 3h9l4 4v14H6Z" /><path d="M9 11h7M9 15h7M9 7h3" /></svg></i>Job description</h2>
              <p className="jd-key"><span><u />You have</span><span><u className="m" />To learn</span></p>
            </div>
            <div className="jd-tbody" tabIndex={0} aria-label="Job description text">
              {bulletsLoading || (bullets === null && gap) ? (
                <div>
                  <p role="status" className="text-xs text-muted mb-4">Tidying the job description into points. This takes a few seconds.</p>
                  <TextSkeleton lines={7} />
                </div>
              ) : bullets?.length > 0 ? (
                <ul className="jd-points">
                  {bullets.map((point, idx) => {
                    const displayText = point.replace(/^##+ /, '').replace(/^\d+\.\s+/, '').replace(/^-\s+/, '').trim()
                    if (point.startsWith('## ')) return <li key={idx} className="jd-h">{displayText}</li>
                    if (point.startsWith('### ')) return <li key={idx} className="jd-sub">{displayText}</li>
                    return <li key={idx} className="jd-pt">{markSkills(point.replace(/^-\s+/, '').trim(), marks)}</li>
                  })}
                </ul>
              ) : gap?.job?.description ? (
                <p className="text-sm text-ink-soft leading-relaxed whitespace-pre-line">{markSkills(gap.job.description, marks)}</p>
              ) : (
                <p className="text-sm text-muted">No description available.</p>
              )}
            </div>
          </section>

          {/* the skill gap: to learn (each opens the AI Assistant), you have (by where it comes from), the rest */}
          <section className="jd-tile jd-gap jd-gap-clean" aria-labelledby="jd-gap">
            <div className="jd-thead">
              <h2 id="jd-gap" className="jd-tt"><i aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></svg></i>Skill gap</h2>
            </div>
            <div className="jd-tbody" tabIndex={0} aria-label="Skill gap details">
              <div className={`jd-gap-group ${gapRows.length ? 'jd-gap-missing' : 'jd-gap-complete'}`}>
                <div className="jd-gap-group-head">
                  <span className="jd-gap-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d={gapRows.length ? 'M8 12h8' : 'm8 12 3 3 5-6'} /></svg></span>
                  <h3 className="jd-sh">To learn <span className="c">{gapRows.length}</span></h3><span className="jd-gap-kind">{BasisWord}</span>
                </div>
                {gapRows.length === 0 ? <p className="jd-gap-empty">You have every {basisWord} skill this job lists.</p> : (
                  <ul className="jd-learn">
                    {gapRows.map((item, idx) => <li key={idx}>
                      <div className="min-w-0">
                        <b className="jd-missing-label">{skillName(item.job_skill)}</b>
                        {item.ad_quote && <details className="jd-ad-evidence"><summary>Ad evidence<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg></summary><p>“{item.ad_quote}”</p></details>}
                      </div>
                      <button type="button" onClick={() => openChat(item.job_skill)} className="jd-lbtn">Learn<span className="sr-only"> {skillName(item.job_skill)} with the AI Assistant</span><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></button>
                    </li>)}
                  </ul>
                )}
              </div>
              <div className="jd-gap-group jd-gap-have">
                <div className="jd-gap-group-head">
                  <span className="jd-gap-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></svg></span>
                  <h3 className="jd-sh">You have <span className="c">{matchedRows.length} of {totalRequired}</span></h3><span className="jd-gap-kind">{BasisWord}</span>
                </div>
                {matchedRows.length === 0 ? <p className="jd-gap-empty">No matches in your profile yet.</p> : sourceGroups.map(([source, group]) => (
                  <div key={source} className="jd-src">
                    <div className="jd-source-heading">
                      <p className="jd-from"><svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3 8 9-5 9 5-9 5-9-5Zm3 2v7l6 4 6-4v-7" /></svg><b>{group.label}</b></p>
                      {group.grade && <span className="jd-source-grade" aria-label={`Grade ${group.grade}`}>{group.grade}</span>}
                      {group.strength && <InfoTip label={`Academic evidence for ${group.label}`}>Grade {group.grade}: {group.strength}. Grades describe academic evidence; they do not change whether a skill matches.</InfoTip>}
                      {group.selfDeclared && <span className={`${sourcePillCls} jd-self-declared`} title={SELF_DECLARED_TIP}>Self-declared</span>}
                    </div>
                    <p className="jd-chips">
                      {group.items.map((item, idx) => <span key={idx} className="jd-chip" title={item.ad_quote ? `From the ad: “${item.ad_quote}”` : undefined}>
                        <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m5 12 4 4L19 6" /></svg>{skillName(item.job_skill)}
                        {item.matched_graduate_skill && item.matched_graduate_skill.toLowerCase() !== item.job_skill.toLowerCase() && <span className="via">via {skillName(item.matched_graduate_skill)}</span>}
                      </span>)}
                    </p>
                  </div>
                ))}
              </div>

              {(niceToHave.length > 0 || gainInRole.length > 0 || (gap?.soft_skills || []).length > 0) && (
                <div className="jd-gap-group jd-gap-other">
                  {[[niceToHave, 'Nice to have', 'not counted in the score'], [gainInRole, "You'll gain in this role", 'not expected before you start']]
                    .filter(([list]) => list.length > 0).map(([list, title, note]) => (
                      <div key={title} className={`mb-3 ${list === gainInRole ? 'jd-role-skills' : ''}`}>
                        <h3 className="jd-sh">{title} <span className="of">{note}</span></h3>
                        {/* her review 5 Oct / 19 Oct: the ones you have first; the others open the AI Assistant */}
                        <p className="jd-chips">
                          {[...list].sort((x, y) => Number(y.has) - Number(x.has)).map((item, idx) => item.has ? (
                            <span key={idx} className="jd-chip" title={item.ad_quote ? `From the ad: “${item.ad_quote}”` : undefined}>✓ {skillName(item.job_skill)}</span>
                          ) : (
                            <button key={idx} type="button" className="jd-chip m" onClick={() => openChat(item.job_skill)}
                              title={item.ad_quote ? `From the ad: “${item.ad_quote}” · Learn more` : 'Learn more'}>
                              {skillName(item.job_skill)} <span aria-hidden="true">→</span>
                            </button>
                          ))}
                        </p>
                      </div>
                    ))}
                  {(gap?.soft_skills || []).length > 0 && (
                    <>
                      <h3 className="jd-sh">Soft skills it asks for</h3>
                      <p className="jd-chips">{gap.soft_skills.map(s => <span key={s} className="jd-chip n">{s}</span>)}</p>
                      <p className="text-xs text-muted mt-1.5 mb-0">Show these through your projects and experience.</p>
                    </>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
