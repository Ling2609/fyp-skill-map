import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import api from '../../api'
import { cached, peek } from '../../pageCache'
import { skillName } from '../../skillName'
import { SELF_DECLARED_TIP, errText, sourcePillCls } from './profileUtils'
import ApplicationSteps from '../../components/ApplicationSteps'
import { ADMIN_COUNTS_CHANGED } from '../../components/Sidebar'
import { Bar, RowSkeleton, LoadingLabel, TextSkeleton } from '../../components/Skeleton'
import { Busy } from '../../components/Spinner'
import EmployerRecord, { PromisedDate } from '../../components/EmployerRecord'
import { AdRequirementPills, SalaryFromAd } from '../../components/AdRequirements'

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
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 space-y-1">
      {decideBy && <PromisedDate company={company} date={fmtDay(decideBy)} className="text-sm font-medium text-slate-800" />}
      <EmployerRecord company={company} record={record} className="text-sm text-slate-700" />
      <p className="text-xs text-slate-500">{company || 'The employer'} sees your profile and your match. Your contact details only if they shortlist you.</p>
    </div>
  )
}

function ApplyAction({ a, closed: closedCached, taking: takingCached, fromApps }) {
  const { app, busy, error, apply, now } = a
  const closed = now ? now.closed : closedCached
  const taking = now ? now.taking_applications : takingCached
  if (app === undefined) return null
  return (
    <div className="shrink-0 flex flex-col items-end gap-1 max-w-64 text-right">
      {app ? (
        <>
          <span className={`text-sm font-semibold border px-4 py-2 rounded-lg ${OUTCOME[app.status] || 'text-slate-700 bg-slate-50 border-slate-200'}`}>
            {['accepted', 'rejected'].includes(app.status) ? `${app.status_label} · ${fmtDay(app.status_changed_at)}` : `Applied · ${fmtDay(app.applied_at)}`}
          </span>
          {/* 14 Oct (her review): the way to all applications sits under the status it belongs to; not shown when
              the back link already goes there */}
          {!fromApps && <Link to="/applications" className="text-xs text-blue-700 hover:underline">View in My Applications</Link>}
        </>
      ) : closed ? (
        <span className="text-sm text-slate-500 bg-slate-100 px-4 py-2 rounded-lg">This job is closed</span>
      ) : taking === false ? (
        <span className="text-sm text-slate-500 bg-slate-100 px-4 py-2 rounded-lg">Applications closed</span>
      ) : (
        <>
          <button onClick={apply} disabled={busy}
            className="text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 px-4 py-2 rounded-lg transition disabled:opacity-50">
            {busy ? <Busy>Applying…</Busy> : 'Apply with my SkillMap profile'}
          </button>
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
    <p className="mt-4 text-sm text-violet-900 bg-violet-50 border border-violet-200 rounded-lg px-3.5 py-2.5">
      <b>{invite.company || company} invited you to apply</b> on {fmtDay(invite.invited_at)}. Applying shares your profile and email with them.
    </p>
  )
  if (!app?.progress) return null
  const p = app.progress
  return (
    <div className="mt-2 border-t border-gray-100">
      <ApplicationSteps steps={p.steps} decided={['accepted', 'rejected'].includes(app.status)} />
      {p.nudge === 'no_decision' ? <p className="mt-3 text-sm text-amber-900 bg-amber-50 rounded-lg px-3.5 py-2">
        <b>{company} missed its promised reply date ({fmtDay(app.decide_by)}).</b> Focus on other jobs; any reply will still appear here.
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
      + `&job_id=${encodeURIComponent(gap?.job?.job_id || '')}`, { state: { fromJob: gap?.job?.job_title } })
  }
  const [gap, setGap] = useState(() => peek('/skillgap/', { job_id: decodeURIComponent(jobId) }))
  const skillmapApp = useSkillMapApplication(gap?.job?.job_id, gap?.job?.source === 'employer')
  const [loading, setLoading] = useState(() => !gap)
  const [error, setError] = useState('')
  // 12 Oct (her review): a rejected application opens on Skill Gap Analysis (what to work on next) unless the
  // student picked a tab (or came back to one)
  const [chosenTab, setActiveTab] = useState(location.state?.tab || null)
  const activeTab = chosenTab || (skillmapApp.app?.status === 'rejected' ? 'gap' : 'description')
  const [bullets, setBullets] = useState(() => peek(`/jobs/${encodeURIComponent(jobId)}/description`)?.bullets ?? null)
  const [bulletsLoading, setBulletsLoading] = useState(false)
  const [showSources, setShowSources] = useState(false)

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
    if (activeTab !== 'description' || bullets !== null || !gap) return
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
      <div className="min-h-screen" aria-busy="true">
        <LoadingLabel>Loading job details…</LoadingLabel>
        <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-3.5"><Bar className="h-3 w-24" /></div>
        <div className="px-4 sm:px-6 py-5 max-w-4xl mx-auto space-y-4" aria-hidden="true">
          <div className="bg-white rounded-xl p-6 border border-slate-200 flex justify-between gap-6">
            <div className="space-y-2.5"><Bar className="h-6 w-72" /><Bar className="h-3.5 w-56" /><Bar className="h-3 w-32" /></div>
            <Bar className="h-12 w-20" />
          </div>
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="px-6 py-3.5 border-b border-slate-100 flex gap-6">{['w-20', 'w-20', 'w-24'].map(w => <Bar key={w} className={`h-4 ${w}`} />)}</div>
            <div className="px-6 divide-y divide-slate-100">{[0, 1, 2, 3, 4].map(i => <RowSkeleton key={i} />)}</div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 text-sm mb-4">{error}</p>
          <button onClick={goBack} className="text-blue-700 text-sm hover:underline">← Go back</button>
        </div>
      </div>
    )
  }

  const coverage = gap?.summary?.coverage_percent || 0
  const coverageColor = coverage >= 70 ? 'text-green-600' : coverage >= 40 ? 'text-yellow-600' : 'text-red-500'
  const barColor = coverage >= 70 ? 'bg-green-500' : coverage >= 40 ? 'bg-yellow-500' : 'bg-red-400'

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
  // Nice-to-have skills: shown apart, never in the %. (Skills the role will teach and soft skills are left
  // out of the % too, but not listed here: the first reads oddly to a student, the second is in the description.)
  const niceToHave = gap?.nice_to_have || []

  return (
    <div className="min-h-screen">

      {/* Top nav */}
      {/* Same left edge as the other pages' headings (PageHeader: px-8) */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-3">
        <button onClick={goBack} className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 transition">
          <span>←</span>
          <span>Back to {backLabel}</span>
        </button>
      </div>

      <div className="px-4 sm:px-6 py-5 max-w-4xl mx-auto space-y-4">

        {/* Job header: info + action on top, one score row underneath */}
        <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
          {/* 19 Oct: on a phone the button goes under the title (the title was squeezed into a narrow column) */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-6">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-gray-800">{gap?.job?.job_title}</h1>
              <p className="text-sm text-gray-500 mt-1">{gap?.job?.company} · {gap?.job?.location}</p>
              <p className="text-xs text-gray-400 mt-1.5">
                {gap?.job?.salary && gap.job.salary !== 'nan'
                  ? <span className="text-green-700 font-medium">{gap.job.salary}</span>
                  : gap?.job?.requirements?.salary
                    ? <SalaryFromAd salary={gap.job.requirements.salary} />
                    : 'Salary not disclosed'}
                {gap?.job?.source === 'live'
                  ? (postedAgo(gap.job.listing_date) ? ` · Posted ${postedAgo(gap.job.listing_date)}` : '')
                  : gap?.job?.source === 'employer'
                    ? ` · Posted on SkillMap${postedAgo(gap.job.listing_date) ? ` ${postedAgo(gap.job.listing_date)}` : ''}`
                    : ' · Past posting from JobStreet (2024)'}
              </p>
            </div>
            {gap?.job?.source === 'employer' && <ApplyAction a={skillmapApp} fromApps={backLabel === 'My Applications'} closed={gap.job.closed}
              taking={gap.job.taking_applications} />}
            {gap?.job?.source === 'live' && gap.job.source_url && (
              <div className="shrink-0 flex flex-col items-start sm:items-end gap-1">
              <a
                href={gap.job.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 px-4 py-2 rounded-lg transition"
              >
                Apply on {gap.job.publisher || 'employer site'} ↗
              </a>
              {/* F8: most postings close within about a month (references.md); SkillMap can't check without credits */}
              {daysSince(gap.job.listing_date) > 30 && (
                <p className="text-xs text-amber-600">Posted over a month ago · it may have closed</p>
              )}
              </div>
            )}
          </div>

          <AdRequirementPills req={gap?.job?.requirements} />

          {gap?.job?.source === 'employer' && <ApplyInfo a={skillmapApp} company={gap.job.company} closed={gap.job.closed}
            taking={gap.job.taking_applications} decideBy={gap.job.decide_by} record={gap.job.employer_record} />}
          {gap?.job?.source === 'employer' && <ApplicationProgress a={skillmapApp} company={gap.job.company} />}

          {/* Score: one number, one bar (they say the same thing) */}
          <div className="mt-5">
            <div className="flex items-baseline justify-between mb-1.5">
              <p className="text-sm text-gray-600">
                <span className={`text-2xl font-bold ${coverageColor}`}>{Math.round(coverage)}%</span>
                <span className="ml-2">
                  of {basisWord} skills · you have {gap?.summary?.matched_skills} of {gap?.summary?.job_skills_total}
                </span>
              </p>
              <span className="text-xs text-gray-400">{gap?.summary?.missing_skills} to develop</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className={`h-2 rounded-full ${barColor}`} style={{ width: `${coverage}%` }} />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-100 shadow-sm">
          {[
            { key: 'description', label: 'Job Description' },
            { key: 'gap', label: 'Skill Gap Analysis' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === tab.key
                  ? 'bg-blue-700 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Job Description Tab */}
        {activeTab === 'description' && (
          <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
            {bulletsLoading ? (
              <div>
                <p role="status" className="text-xs text-gray-500 mb-4">Tidying the job description into points. This takes a few seconds.</p>
                <TextSkeleton lines={7} />
              </div>
            ) : bullets?.length > 0 ? (
              <ul className="space-y-2">
                {bullets.map((point, idx) => {
                  const isMainHeader = point.startsWith('## ')
                  const isSubHeader = point.startsWith('### ')
                  const displayText = point.replace(/^##+ /, '').replace(/^\d+\.\s+/, '').replace(/^-\s+/, '').trim()

                  if (isMainHeader) {
                    return (
                      <li key={idx} className="pt-4 first:pt-0">
                        <p className="text-sm font-semibold text-gray-800 uppercase tracking-wide border-b border-gray-100 pb-2">
                          {displayText}
                        </p>
                      </li>
                    )
                  }

                  if (isSubHeader) {
                    return (
                      <li key={idx} className="pt-2">
                        <p className="text-sm font-medium text-gray-700 italic">{displayText}</p>
                      </li>
                    )
                  }

                  return (
                    <li key={idx} className="flex items-start gap-2.5 text-sm text-gray-600 leading-relaxed">
                      <span className="text-blue-400 shrink-0">•</span>
                      <span>{point.replace(/^-\s+/, '').trim()}</span>
                    </li>
                  )
                })}
              </ul>
            ) : gap?.job?.description ? (
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                {gap.job.description}
              </p>
            ) : (
              <p className="text-sm text-gray-400">No description available.</p>
            )}
          </div>
        )}

        {/* Skill Gap Tab — summary first: to learn → you already have (with where it comes from) */}
        {activeTab === 'gap' && (
          <div className="space-y-4">

            {/* 1. To learn */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">
                  {BasisWord} skills you're missing <span className="text-red-600">({gapRows.length})</span>
                </h2>
              </div>
              {gapRows.length === 0 ? (
                <p className="text-xs text-gray-500 px-5 py-4">None. You have every {basisWord} skill this job lists.</p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {gapRows.map((item, idx) => {
                    return (
                      <li key={idx} className="flex items-start gap-3 px-5 py-2.5">
                        <span className="w-5 h-5 mt-0.5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 bg-red-100 text-red-600">
                          ✕
                        </span>
                        {/* Why it's a requirement, in the ad's own words (Stage 1 evidence quote; none for older jobs).
                            Always shown, wrapped to 2 lines: objective 3 is an explained gap, so no click needed */}
                        <span className="flex-1 min-w-0">
                          <span className="block text-xs font-medium text-gray-800">{skillName(item.job_skill)}</span>
                          {item.ad_quote && (
                            <span className="block mt-0.5 text-[11px] text-gray-500 line-clamp-2" title={item.ad_quote}>
                              From the ad: <i>“{item.ad_quote}”</i>
                            </span>
                          )}
                        </span>
                        <button
                          onClick={() => openChat(item.job_skill)}
                          className="text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-full transition font-medium shrink-0"
                        >
                          Learn →
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* 2. You already have — chips by default, grouped by source on click */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">
                  {BasisWord} skills you have <span className="text-green-700">({matchedRows.length} of {totalRequired})</span>
                </h2>
                {matchedRows.length > 0 && (
                  <button
                    onClick={() => setShowSources(v => !v)}
                    className="text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-100 px-3 py-1 rounded-full transition"
                  >
                    {showSources ? 'Hide sources ▴' : 'Show where these come from ▾'}
                  </button>
                )}
              </div>

              {matchedRows.length === 0 ? (
                <p className="text-xs text-gray-400 px-5 py-4">None of this job's skills match your record yet.</p>
              ) : !showSources ? (
                <div className="flex flex-wrap gap-1.5 px-5 py-4">
                  {matchedRows.map((item, idx) => (
                    <span key={idx} title={item.ad_quote ? `From the ad: “${item.ad_quote}”` : undefined}
                      className="inline-flex items-center gap-1.5 text-xs text-gray-700 bg-slate-50 border border-gray-200 px-2.5 py-1 rounded-lg">
                      <span className="text-green-600 font-bold">✓</span>
                      {skillName(item.job_skill)}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {sourceGroups.map(([source, group]) => (
                    <div key={source} className="px-5 py-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="text-xs font-semibold text-gray-700">{group.label}</span>
                        {group.grade && (
                          <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-semibold">{group.grade}</span>
                        )}
                        {group.strength && <span className="text-[11px] text-gray-500">{group.strength}</span>}
                        {group.selfDeclared && (
                          <span className={sourcePillCls} title={SELF_DECLARED_TIP}>Self-declared</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {group.items.map((item, idx) => (
                          <span key={idx} title={item.ad_quote ? `From the ad: “${item.ad_quote}”` : undefined}
                            className="inline-flex items-center gap-1.5 text-xs text-gray-700 bg-slate-50 border border-gray-200 px-2.5 py-1 rounded-lg">
                            <span className="text-green-600 font-bold">✓</span>
                            {skillName(item.job_skill)}
                            {item.matched_graduate_skill && item.matched_graduate_skill.toLowerCase() !== item.job_skill.toLowerCase() && (
                              <span className="text-[10px] text-gray-400">via {skillName(item.matched_graduate_skill)}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 3. Nice-to-have skills: a bonus, not counted in the % (only for jobs extracted with levels, Stage 1) */}
            {niceToHave.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-700">
                    Nice-to-have skills <span className="text-green-700">({niceToHave.filter(n => n.has).length} of {niceToHave.length})</span>
                    <span className="ml-2 font-normal text-xs text-gray-400">bonus · not counted in the %</span>
                  </h2>
                </div>
                {/* Her review 5 Oct: the ones you have first, then the ones to learn; those open the AI Assistant like
                    "Learn →" on the missing required skills */}
                <div className="flex flex-wrap gap-1.5 px-5 py-4">
                  {[...niceToHave].sort((x, y) => Number(y.has) - Number(x.has)).map((item, idx) => item.has ? (
                    <span key={idx} title={item.ad_quote ? `From the ad: “${item.ad_quote}”` : undefined}
                      className="inline-flex items-center gap-1.5 text-xs text-gray-700 bg-slate-50 border border-gray-200 px-2.5 py-1 rounded-lg">
                      <span className="text-green-600 font-bold">✓</span>
                      {skillName(item.job_skill)}
                    </span>
                  ) : (
                    <button key={idx} type="button"
                      title={item.ad_quote ? `From the ad: “${item.ad_quote}” · Learn more` : 'Learn more'}
                      onClick={() => openChat(item.job_skill)}
                      className="inline-flex items-center gap-1 text-xs text-blue-700 bg-white border border-blue-200 hover:bg-blue-50 px-2.5 py-1 rounded-lg transition">
                      {skillName(item.job_skill)} <span aria-hidden="true">→</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  )
}