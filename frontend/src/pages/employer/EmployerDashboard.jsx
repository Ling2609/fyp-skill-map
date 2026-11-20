import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api'
import PageHeader, { HeadStats } from '../../components/PageHeader'
import { useAuth } from '../../context/useAuth'
import { errText } from '../student/profileUtils'
import { CardSkeleton, LoadingLabel } from '../../components/Skeleton'
import { Busy } from '../../components/Spinner'
import { greeting } from '../../greeting'
import { NOT_VIEWED_TIP } from './statuses'
import InviteLabel from '../../components/InviteLabel'
import InfoTip from '../../components/InfoTip'
import { RECORD_TIP } from '../../components/EmployerRecord'

// Employer dashboard (12 Oct, her pick E after mock-ups A-E; references.md "Employer dashboard layout"; left column
// changed the same day to option B of mock-ups A-C (my proposal; her pick pending): to review sized to its rows + recent activity, so one application isn't a blank card).
// Left: applications to review across all jobs, newest first (Greenhouse's "Applications to Review").
// Right: open jobs with a stacked status bar (Workable's job pipeline), then graduates who fit (visible students who
// haven't applied, best match first). The page fills the screen and each card scrolls on its own (her rule).
const BAR = [['applied', 'Applied', 'bg-slate-400'], ['shortlisted', 'Shortlisted', 'bg-blue-500'],
  ['accepted', 'Accepted', 'bg-emerald-500'], ['rejected', 'Rejected', 'bg-rose-300']]
const AVATAR = ['bg-blue-700', 'bg-violet-700', 'bg-cyan-700', 'bg-pink-700', 'bg-orange-700', 'bg-emerald-700', 'bg-indigo-700', 'bg-teal-700']   // -700: white initials readable (WCAG 4.5:1)
const initials = (name) => name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
const avatarCls = (name) => AVATAR[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % AVATAR.length]
const ago = (iso) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 14 ? `${days} days ago` : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
// 20 Nov (her approved mock review/employer-pages.html): Dashboard tiles (.emp-tile in index.css: rounded, soft shadow, mono titles)
const card = 'emp-tile bg-white border border-slate-200 rounded-2xl flex flex-col overflow-hidden'
const SEE = 'shrink-0 text-sm font-medium text-blue-700 hover:underline'
// 25 Oct (her review: "which job each graduate fits, clear at a glance"): each open job has a colour, shown as a dot
// beside its title in "Your open jobs" (the key) and in each graduate's row with the job's name, so the colour is never
// the only cue. Not grey, blue, green or red: those already mean a status in the jobs' bars.
const JOB_DOT = ['bg-violet-500', 'bg-amber-500', 'bg-cyan-500', 'bg-fuchsia-500', 'bg-lime-500', 'bg-orange-500']
const CARD_ICONS = {
  attention: 'M12 8v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  fit: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m8-7.87a4 4 0 0 1 0 7.75',
  jobs: 'M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M4 7h16a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a1 1 0 0 1 1-1Zm-1 6a24 24 0 0 0 18 0m-9-2v4',
  tips: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z',
  record: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6',
  activity: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-5v5l3 2',
}
function CardIcon({ kind }) {
  return <span className={`emp-card-icon emp-card-icon-${kind}`} aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={CARD_ICONS[kind]} /></svg></span>
}

function JobDot({ cls }) {
  return <span aria-hidden="true" className={`w-2.5 h-2.5 rounded-full shrink-0 ${cls}`} />
}
const daysUntil = (iso) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
const fmtDay = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const FEW_SKILLS = 3      // a job with fewer required skills than this: matching has little to go on

// 20 Oct (her review, mock-up E3): next steps that apply to this employer now, from data SkillMap already has; the
// list shrinks as they are done, so a busy employer sees their real lists instead
function nextSteps(data) {
  const steps = []
  const notInvited = data.graduates.filter(g => !g.invited_at).length
  if (notInvited) steps.push({ key: 'fit', text: <>{notInvited} graduate{notInvited === 1 ? ' fits' : 's fit'} your jobs and {notInvited === 1 ? "hasn't" : "haven't"} been invited</>, to: '#fit-h', action: 'Invite' })
  for (const j of data.open_jobs) {
    // 21 Oct (her question; references.md "Changing a job's requirements after people applied"): only before anyone
    // applies; after that the job may ask for less, not more, so these tips would point at changes it can't make
    if (Object.values(j.counts).some(n => n > 0)) continue
    if (j.required < FEW_SKILLS) steps.push({ key: `s${j.id}`, text: <><b className="font-semibold">{j.title}</b> lists {j.required} required skill{j.required === 1 ? '' : 's'}: graduates are matched on them</>, to: `/employer/jobs/${j.id}/edit`, action: 'Add skills' })
    if (!j.has_requirements) steps.push({ key: `r${j.id}`, text: <><b className="font-semibold">{j.title}</b>: no qualification or languages set</>, to: `/employer/jobs/${j.id}/edit`, action: 'Edit job' })
  }
  return steps.slice(0, 4)
}

// 25 Oct (her review: the card mixed buttons and plain links): every row in "Needs your attention" is the same shape,
// a round marker, the text, and ONE outlined button on the right named with a verb (NN/g, Principle of Similarity:
// items that look alike are taken to work alike; California Courts design system, Action List)
const ACTION = 'shrink-0 text-sm font-medium text-blue-700 border border-blue-200 rounded-lg px-3.5 py-1.5 hover:bg-blue-50'
const MARK = {
  late: ['bg-rose-100 text-rose-700', 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'],
  wait: ['bg-amber-100 text-amber-700', 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z'],
  tip: ['bg-blue-50 text-blue-700', 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z'],
}
function Mark({ kind }) {
  const [cls, d] = MARK[kind]
  return (
    <span aria-hidden="true" className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${cls}`}>
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={d} /></svg>
    </span>
  )
}

function Avatar({ name, small }) {
  return <span aria-hidden="true" className={`${small ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'} shrink-0 rounded-full text-white font-semibold flex items-center justify-center ${avatarCls(name)}`}>{initials(name)}</span>
}

// What's missing is on the profile. 24 Oct (her review: "what does 2 of 3 mean?"): always says "required"
function Match({ have, total }) {
  const full = total > 0 && have === total
  return (
    <span title={`Has ${have} of the job's ${total} required skills`}
      className={`emp-match text-xs font-semibold rounded-full px-2.5 py-1 whitespace-nowrap ${full ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
      {have} of {total} required
    </span>
  )
}

// Recent activity (12 Oct): what happened and, for a status change, what the student now sees
const DOT = { posted: 'bg-slate-300', applied: 'bg-slate-400', invited: 'bg-violet-400', shortlisted: 'bg-blue-500',
  accepted: 'bg-emerald-500', rejected: 'bg-rose-300', declined: 'bg-slate-300' }
function activityText(e) {
  const who = <b className="font-semibold text-slate-900">{e.student}</b>
  if (e.kind === 'posted') return <>You posted <b className="font-semibold text-slate-900">{e.job}</b></>
  if (e.kind === 'applied') return <>{who} applied for {e.job}</>
  if (e.kind === 'invited') return <>You invited {who} to apply for {e.job}</>
  if (e.kind === 'declined') return <>{who} declined your invitation for {e.job} · {e.reason}</>
  if (e.status === 'shortlisted') return <>You shortlisted {who} for {e.job}</>
  if (e.status === 'accepted') return <>You accepted {who} for {e.job}</>
  if (e.status === 'rejected') return <>You marked {who} Rejected for {e.job} · they see "Not selected"</>
  return <>You moved {who} back to Applied for {e.job}</>
}
function ActivityRow({ e }) {
  const to = e.application_id ? `/employer/applications/${e.application_id}`
    : e.kind === 'invited' || e.kind === 'declined' ? `/employer/graduates/${e.student_id}?job=${e.job_id}` : `/employer/jobs/${e.job_id}`
  return (
    // 25 Oct (her review: blank under the activity): the row's content sits in the middle when rows share spare height
    <li className="flex items-center">
      <Link to={to} className="flex-1 min-w-0 px-5 py-2.5 flex items-start gap-3 text-sm text-slate-600 hover:bg-slate-50">
        <span aria-hidden="true" className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${DOT[e.status || e.kind]}`} />
        <span className="flex-1 min-w-0 truncate">{activityText(e)}</span>
        <span className="shrink-0 text-xs text-slate-500">{ago(e.at)}</span>
      </Link>
    </li>
  )
}

function DashboardListDialog({ title, onClose, children }) {
  const ref = useRef(null)
  useEffect(() => { ref.current?.showModal() }, [])
  return <dialog ref={ref} className="emp-overview-dialog" aria-label={title} onClose={onClose} onClick={event => {
    if (event.target !== event.currentTarget) return
    const box = event.currentTarget.getBoundingClientRect()
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) ref.current.close()
  }}>
    <header><h2>{title}</h2><button type="button" aria-label="Close details" onClick={() => ref.current.close()}>×</button></header>
    <div className="emp-overview-dialog-body">{children}</div>
  </dialog>
}

export default function EmployerDashboard() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api.get('/employer/dashboard').then(res => setData(res.data)).catch(err => setError(errText(err, "Couldn't load your dashboard.")))
  }, [])
  // 12 Oct (her supervisor's point): invite a graduate who fits to apply; they decide, their email stays private
  const [inviting, setInviting] = useState(null)
  const invite = (g) => {
    setInviting(g.student_id); setError('')
    api.post('/employer/invitations', { job_id: g.job_id, student_id: g.student_id })
      .then(res => setData(d => ({ ...d,
        graduates: d.graduates.map(x => x.student_id === g.student_id ? { ...x, invited_at: res.data.invited_at,
          invite: { state: 'invited', label: 'Invited', at: res.data.invited_at, invited_at: res.data.invited_at } } : x),
        activity: [{ kind: 'invited', at: res.data.invited_at, job: g.job_title, job_id: g.job_id, student: g.name, student_id: g.student_id }, ...d.activity] })))
      .catch(err => setError(errText(err, "Couldn't send the invitation. Try again.")))
      .finally(() => setInviting(null))
  }
  // 25 Oct: one row each, shared by the card and its "Show all" pop-up
  const reviewRow = a => (
    <li key={a.id} className="emp-person-row px-5 py-3.5 flex items-center gap-3.5">
      <Avatar name={a.name} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm text-slate-900 truncate ${a.opened ? 'font-semibold' : 'font-bold'}`}>
          {a.name}
          {a.invited && <span className="ml-2 text-[11px] font-semibold text-violet-700 bg-violet-50 rounded-full px-2 py-0.5">Invited</span>}
        </p>
        <p className="text-xs text-slate-500 truncate">{a.job_title} · applied {ago(a.applied_at)}{!a.opened && <> · <span className="font-semibold text-blue-700" title={NOT_VIEWED_TIP}>not viewed yet</span></>}</p>
      </div>
      <Match have={a.have} total={a.total} />
      <Link to={`/employer/applications/${a.id}`} className={ACTION}>Review</Link>
    </li>
  )
  const manyJobs = new Set((data?.graduates || []).map(g => g.job_id)).size > 1
  const jobDot = (id) => JOB_DOT[Math.max(0, (data?.open_jobs || []).findIndex(j => j.id === id)) % JOB_DOT.length]
  const gradRow = g => (
    <li key={g.student_id} className="emp-person-row px-5 py-3 flex items-center gap-3">
      <Avatar name={g.name} small />
      <div className="flex-1 min-w-0">
        <Link to={`/employer/graduates/${g.student_id}?job=${g.job_id}`} className="block text-sm font-semibold text-slate-900 truncate hover:text-blue-700">{g.name}</Link>
        {/* 24 Oct: the nice-to-have skills they also have, which put them higher in the list */}
        {/* 25 Oct: the nice-to-haves first, so a long programme name can't cut them off */}
        <p className="text-xs text-slate-500 truncate">{g.nice > 0 && <span className="text-emerald-700 font-medium">+{g.nice} nice to have · </span>}{g.programme}</p>
      </div>
      {/* only when the graduates fit different jobs; with one open job every row would repeat the same name */}
      {manyJobs && <span className="w-40 shrink-0 flex items-center gap-1.5 text-xs font-medium text-slate-700 min-w-0" title={`Fits ${g.job_title}`}>
        <JobDot cls={jobDot(g.job_id)} /><span className="truncate"><span className="sr-only">Fits </span>{g.job_title}</span>
      </span>}
      <Match have={g.have} total={g.total} />
      {/* a fixed-width last column, so "Invited 25 Oct" and the Invite button keep every row's columns in line */}
      <span className="w-36 shrink-0 min-w-0 flex justify-end">
        {g.invite
          ? <InviteLabel invite={g.invite} className="max-w-full" />
          : <button onClick={() => invite(g)} disabled={inviting === g.student_id}
              className="shrink-0 text-sm font-medium text-blue-700 border border-blue-200 rounded-lg px-3 py-1 hover:bg-blue-50 disabled:opacity-40">
              {inviting === g.student_id ? <Busy>Inviting…</Busy> : 'Invite'}
            </button>}
      </span>
    </li>
  )
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))
  const [expanded, setExpanded] = useState(null)
  useEffect(() => {
    const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  const desktop = viewport.width >= 1024
  const compact = viewport.height < 800 || viewport.width < 1280
  const limits = desktop ? { alerts: compact ? 1 : 2, reviews: 1, grads: compact ? 2 : 3, jobs: compact ? 1 : 2, steps: 1, activity: compact ? 1 : 2 }
    : { alerts: 3, reviews: 3, grads: 5, jobs: 3, steps: 2, activity: 4 }
  const sum = data?.summary
  const noJobs = sum && sum.jobs === 0
  const steps = data ? nextSteps(data) : []
  const alerts = data ? [
    ...(data.attention.past_date || []).map(value => ({ kind: 'late', key: `d${value.job_id}`, value })),
    ...data.attention.waiting_long.map(value => ({ kind: 'wait', key: `w${value.application_id}`, value })),
    ...data.attention.quiet_jobs.map(value => ({ kind: 'quiet', key: `q${value.job_id}`, value })),
  ] : []
  const act = alerts.length > 0 || (data?.to_review.length || 0) > 0
  const alertRow = (alert, full = false) => {
    const v = alert.value
    const late = alert.kind === 'late', wait = alert.kind === 'wait'
    const title = late ? v.title : wait ? v.name : v.title
    const detail = late ? `${v.waiting} waiting · new applications paused`
      : wait ? `${v.days} days waiting · ${v.job_title}` : `No applicants after a week${v.fit ? ` · ${v.fit} graduates fit` : ''}`
    const to = wait ? `/employer/applications/${v.application_id}` : `/employer/jobs/${v.job_id}`
    return <li key={alert.key} className={`emp-overview-alert emp-action-row ${late ? 'emp-overview-overdue' : ''}`}>
      <Mark kind={late ? 'late' : 'wait'} />
      <div className="emp-overview-alert-copy"><b title={title}>{title}{late ? ': decision overdue' : ''}</b><p>{detail}</p>
        {full && <p>{late ? 'Your decision date has passed. Existing applicants stay pending until you decide.' : wait ? 'Students are told to look elsewhere after 14 days.' : 'Invite graduates who fit or review the job requirements.'}</p>}
      </div>
      <Link to={to} className={ACTION}>{late || wait ? 'Decide' : 'Invite'}</Link>
    </li>
  }
  const stepRow = step => <li key={step.key} className="emp-overview-alert emp-action-row"><Mark kind="tip" /><span className="flex-1 min-w-0">{step.text}</span>{step.to.startsWith('#') ? <a href={step.to} className={ACTION} onClick={() => setExpanded(null)}>{step.action}</a> : <Link to={step.to} className={ACTION}>{step.action}</Link>}</li>
  const jobRow = job => {
    const total = Object.values(job.counts).reduce((a, b) => a + b, 0)
    const days = job.decide_by ? daysUntil(job.decide_by) : null
    return <li key={job.id} className="emp-overview-job">
      <div><p className="emp-overview-job-title">{manyJobs && <JobDot cls={jobDot(job.id)} />}<b title={job.title}>{job.title}</b></p><Link to={`/employer/jobs/${job.id}`} className={SEE}>View</Link></div>
      <p>{total ? `${total} applicant${total === 1 ? '' : 's'}` : 'No applicants yet'}{job.counts.applied > 0 && <span className="text-blue-700 font-semibold"> · {job.counts.applied} to review</span>}{job.decide_by && <> · {fmtDay(job.decide_by)} <span className="whitespace-nowrap">({days > 0 ? `${days}d left` : days === 0 ? 'today' : 'passed'})</span></>}</p>
      {total > 0 && <div className="emp-overview-pipeline" role="img" aria-label={BAR.map(([key, label]) => `${job.counts[key]} ${label.toLowerCase()}`).join(', ')}>{BAR.map(([key, , cls]) => job.counts[key] > 0 && <span key={key} className={cls} style={{ width: `${job.counts[key] / total * 100}%` }} />)}</div>}
    </li>
  }
  // where "See all" goes: the job's own page when the list is about one job, otherwise My Jobs
  const one = (ids) => (new Set(ids).size === 1 ? ids[0] : null)
  const reviewJob = data && one(data.to_review.map(p => p.job_id))
  const gradJob = data && one(data.graduates.map(g => g.job_id))

  return (
    <div className="employer-dashboard flex flex-col h-[calc(100dvh-var(--bar-h))] max-sm:h-[calc(100dvh_-_var(--bar-h)_-_6rem)]">
      {/* 12 Oct (her review): the same header as the student and admin dashboards (eyebrow, greeting, one line);
          Post a Job lives in the sidebar */}
      <PageHeader bell>
        {/* 20 Nov (her approved mock): the counts in the white strip, Post a job as the page's main action */}
        <div className="pb-5 pt-1 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="emp-header-intro min-w-0 flex-1 basis-72">
            <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-widest mb-2">Dashboard</p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{greeting(user?.first_name)} 👋</h1>
            <p className="text-sm text-slate-500 mt-1">
              {user?.company_name}
              {sum && (noJobs ? ' · post a job to start receiving applications' : ` · hiring for ${sum.open_jobs} open job${sum.open_jobs === 1 ? '' : 's'}`)}
            </p>
          </div>
          {sum && !noJobs && <HeadStats items={[[sum.open_jobs, 'Open jobs', 'blue'], [sum.new, 'To review', sum.new > 0 ? 'todo' : ''], [sum.applicants, 'Applicants']]} />}
          <Link to="/employer/post" className="head-cta">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            Post a job
          </Link>
        </div>
      </PageHeader>

      {error && <p role="alert" className="mx-8 mt-6 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5">{error}</p>}
      {!data && !error && (
        <div className="flex-1 min-h-0 px-4 sm:px-8 py-6 grid grid-cols-1 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] gap-5 content-start" aria-busy="true">
          <LoadingLabel>Loading your dashboard…</LoadingLabel>
          <CardSkeleton rows={5} />
          <div className="flex flex-col gap-5"><CardSkeleton rows={3} /><CardSkeleton rows={3} /></div>
        </div>
      )}

      {noJobs && (
        <div className="flex-1 px-4 sm:px-8 py-6">
          {/* 19 Oct (her review: "make it fit screen"): the card fills the width; the three steps sit side by side
              (they are a real sequence, so they keep their numbers) and stack on a narrow screen */}
          <div className="bg-white border border-slate-200 rounded-2xl p-8">
            <h2 className="text-lg font-semibold text-slate-900">Welcome, {user?.first_name}</h2>
            <p className="text-sm text-slate-600 mt-1">Three steps to your first graduate hire on SkillMap:</p>
            <ol className="mt-5 grid gap-4 md:grid-cols-3">
              {[['Write your job ad', 'SkillMap reads the skills it asks for.'],
                ['Check the skills', 'They decide which graduates match.'],
                ['Publish', 'Students see it in Job Matches and apply with their SkillMap profile.']].map(([t, d], i) => (
                <li key={t} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-sm font-semibold">{i + 1}</span>
                  <p className="mt-3 text-sm font-semibold text-slate-900">{t}</p>
                  <p className="mt-1 text-sm text-slate-600">{d}</p>
                </li>
              ))}
            </ol>
            {/* 19 Oct (her review): the next step sits at the end of the steps, on the right */}
            <div className="mt-6 flex justify-end">
              <Link to="/employer/post" className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-700 text-white hover:bg-blue-800">Post your first job</Link>
            </div>
          </div>
        </div>
      )}

      {data && !noJobs && (
        <div className="emp-overview">
          <div className="emp-overview-layout">
            <div className="emp-overview-column">
              <section className={`${card} ${act ? 'emp-needs' : ''}`} aria-labelledby="review-h">
                <div className={`emp-overview-heading ${act ? 'emp-overview-attention-heading' : ''}`}>
                  <h2 id="review-h" className="emp-card-title"><CardIcon kind="attention" />Needs your attention</h2>
                  {alerts.length > limits.alerts && <button className={SEE} onClick={() => setExpanded('alerts')}>See all {alerts.length} →</button>}
                </div>
                {alerts.length > 0 && <ul className="emp-overview-list" aria-label="Things that need you">{alerts.slice(0, limits.alerts).map(alert => alertRow(alert))}</ul>}
                {data.to_review.length > 0 ? <>
                  <div className="emp-overview-subheading"><span>To review · {sum.new}</span>{sum.new > limits.reviews && <Link to={reviewJob ? `/employer/jobs/${reviewJob}` : '/employer/jobs'} className={SEE}>See all →</Link>}</div>
                  <ul className="emp-overview-list">{data.to_review.slice(0, limits.reviews).map(reviewRow)}</ul>
                </> : <p className="emp-overview-empty">{sum.applicants ? 'All caught up: every application has a status.' : 'No applications yet.'}</p>}
              </section>
              <section className={card} aria-labelledby="fit-h">
                <div className="emp-overview-heading"><h2 id="fit-h" className="emp-card-title"><CardIcon kind="fit" />Graduates who fit your jobs</h2><Link to={gradJob ? `/employer/jobs/${gradJob}?see=graduates` : '/employer/jobs'} className={SEE}>See all →</Link></div>
                <p className="emp-overview-caption">Best matches first · {data.graduates.length} graduate{data.graduates.length === 1 ? '' : 's'} fit</p>
                {data.graduates.length ? <ul className="emp-overview-list">{data.graduates.slice(0, limits.grads).map(gradRow)}</ul> : <p className="emp-overview-empty">{data.open_jobs.length ? 'No matching graduates yet. New profiles are checked as students add skills.' : 'Open a job to find matching graduates.'}</p>}
              </section>
            </div>
            <div className="emp-overview-column">
              <section className={card} aria-labelledby="jobs-h">
                <div className="emp-overview-heading"><h2 id="jobs-h" className="emp-card-title"><CardIcon kind="jobs" />Your open jobs</h2><Link to="/employer/jobs" className={SEE}>See all {data.open_jobs.length} →</Link></div>
                {data.open_jobs.length ? <ul className="emp-overview-list">{data.open_jobs.slice(0, limits.jobs).map(jobRow)}</ul> : <p className="emp-overview-empty">No open jobs. Reopen one in My Jobs or post a new one.</p>}
              </section>
              {steps.length > 0 && <section className={card} aria-labelledby="tips-h"><div className="emp-overview-heading"><h2 id="tips-h" className="emp-card-title"><CardIcon kind="tips" />What you can do now</h2>{steps.length > limits.steps && <button className={SEE} onClick={() => setExpanded('steps')}>See all →</button>}</div><ul className="emp-overview-list">{steps.slice(0, limits.steps).map(stepRow)}</ul></section>}
              <section className={card} aria-labelledby="record-h"><div className="emp-overview-heading"><h2 id="record-h" className="emp-card-title"><CardIcon kind="record" />Your reply record <InfoTip label="How the record is counted">{RECORD_TIP}</InfoTip></h2></div>
                <p className="emp-overview-empty">{data.record?.shown ? <><b>{data.record.on_time} of {data.record.of}</b> jobs replied to on time.</> : <>No reply record yet.{data.record?.of ? ` ${data.record.of} of 3 jobs completed.` : ''}</>}</p>
              </section>
              <section className={card} aria-labelledby="activity-h"><div className="emp-overview-heading"><h2 id="activity-h" className="emp-card-title"><CardIcon kind="activity" />Recent activity</h2>{data.activity.length > limits.activity ? <button className={SEE} onClick={() => setExpanded('activity')}>See all →</button> : <span className="text-xs text-muted shrink-0">Last 14 days</span>}</div>
                {data.activity.length ? <ul className="emp-overview-list">{data.activity.slice(0, limits.activity).map((event, index) => <ActivityRow key={index} e={event} />)}</ul> : <p className="emp-overview-empty">No activity in the last 14 days.</p>}
              </section>
            </div>
          </div>
        </div>
      )}
      {expanded && data && <DashboardListDialog title={{ alerts: 'Needs your attention', steps: 'What you can do now', activity: 'Recent activity · last 14 days' }[expanded]} onClose={() => setExpanded(null)}>
        <ul className="emp-overview-list">{expanded === 'alerts' ? alerts.map(alert => alertRow(alert, true)) : expanded === 'steps' ? steps.map(stepRow) : data.activity.map((event, index) => <ActivityRow key={index} e={event} />)}</ul>
      </DashboardListDialog>}
    </div>
  )
}
