import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api'
import PageHeader from '../../components/PageHeader'
import { useAuth } from '../../context/useAuth'
import { errText } from '../student/profileUtils'
import { CardSkeleton, LoadingLabel } from '../../components/Skeleton'
import { Busy } from '../../components/Spinner'
import { greeting } from '../../greeting'
import FitList from '../../components/FitList'
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
const card = 'bg-white border border-slate-200 rounded-2xl flex flex-col overflow-hidden'
const SEE = 'shrink-0 text-sm font-medium text-blue-700 hover:underline'
// 25 Oct (her review: "which job each graduate fits, clear at a glance"): each open job has a colour, shown as a dot
// beside its title in "Your open jobs" (the key) and in each graduate's row with the job's name, so the colour is never
// the only cue. Not grey, blue, green or red: those already mean a status in the jobs' bars.
const JOB_DOT = ['bg-violet-500', 'bg-amber-500', 'bg-cyan-500', 'bg-fuchsia-500', 'bg-lime-500', 'bg-orange-500']
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
const GROUP = 'px-5 pt-3 pb-1.5 text-xs font-semibold text-slate-500 border-t border-slate-200'
const MARK = {
  late: ['bg-rose-100 text-rose-700', 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'],
  wait: ['bg-amber-100 text-amber-700', 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z'],
  tip: ['bg-slate-100 text-slate-600', 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z'],
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
      className={`text-xs font-semibold rounded-full px-2.5 py-1 whitespace-nowrap ${full ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
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
    <li>
      <Link to={to} className="px-5 py-2.5 flex items-start gap-3 text-sm text-slate-600 hover:bg-slate-50">
        <span aria-hidden="true" className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${DOT[e.status || e.kind]}`} />
        <span className="flex-1 min-w-0 truncate">{activityText(e)}</span>
        <span className="shrink-0 text-xs text-slate-500">{ago(e.at)}</span>
      </Link>
    </li>
  )
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
    <li key={a.id} className="px-5 py-3.5 flex items-center gap-3.5">
      <Avatar name={a.name} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm text-slate-900 truncate ${a.opened ? 'font-semibold' : 'font-bold'}`}>
          {a.name}
          {a.invited && <span className="ml-2 text-[11px] font-semibold text-violet-700 bg-violet-50 rounded-full px-2 py-0.5">Invited</span>}
        </p>
        <p className="text-xs text-slate-500 truncate">{a.job_title} · applied {ago(a.applied_at)}{!a.opened && <> · <span className="font-semibold text-blue-700">not opened</span></>}</p>
      </div>
      <Match have={a.have} total={a.total} />
      <Link to={`/employer/applications/${a.id}`} className={ACTION}>Review</Link>
    </li>
  )
  const manyJobs = new Set((data?.graduates || []).map(g => g.job_id)).size > 1
  const jobDot = (id) => JOB_DOT[Math.max(0, (data?.open_jobs || []).findIndex(j => j.id === id)) % JOB_DOT.length]
  const gradRow = g => (
    <li key={g.student_id} className="px-5 py-3 flex items-center gap-3">
      <Avatar name={g.name} small />
      <div className="flex-1 min-w-0">
        <Link to={`/employer/graduates/${g.student_id}?job=${g.job_id}`} className="block text-sm font-semibold text-slate-900 truncate hover:text-blue-700">{g.name}</Link>
        {/* 24 Oct: the nice-to-have skills they also have, which put them higher in the list */}
        <p className="text-xs text-slate-500 truncate">{g.programme}{g.nice > 0 && ` · +${g.nice} nice to have`}</p>
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
  // 25 Oct (her review: "no need to show all, show a few; See all goes to the relevant page"): each list shows the rows
  // that fit (laptops) and its title line links to where the full list lives
  const [lg, setLg] = useState(() => window.matchMedia('(min-width: 1024px)').matches)
  useEffect(() => {
    const m = window.matchMedia('(min-width: 1024px)')
    const on = () => setLg(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  const [nReview, setNReview] = useState(0)
  const [nGrads, setNGrads] = useState(0)
  const [nJobs, setNJobs] = useState(0)
  const sum = data?.summary
  const noJobs = sum && sum.jobs === 0
  const steps = data ? nextSteps(data) : []
  // 21 Oct: is anything late or waiting long, and which open job decides soonest (for the "Nothing urgent" line)
  const act = data && (data.to_review.length > 0 || data.attention.waiting_long.length > 0 || data.attention.quiet_jobs.length > 0
    || data.attention.past_date?.length > 0)
  const urgent = data && (data.attention.waiting_long.length > 0 || data.attention.quiet_jobs.length > 0 || data.attention.past_date?.length > 0)
  const nextDate = data?.open_jobs.filter(j => j.decide_by).map(j => ({ ...j, days: daysUntil(j.decide_by) }))
    .filter(j => j.days >= 0).sort((a, b) => a.days - b.days)[0]
  const anyApplicants = data?.open_jobs.some(j => Object.values(j.counts).some(n => n > 0))
  // where "See all" goes: the job's own page when the list is about one job, otherwise My Jobs
  const one = (ids) => (new Set(ids).size === 1 ? ids[0] : null)
  const reviewJob = data && one(data.to_review.map(p => p.job_id))
  const gradJob = data && one(data.graduates.map(g => g.job_id))

  return (
    <div className="flex flex-col h-screen">
      {/* 12 Oct (her review): the same header as the student and admin dashboards (eyebrow, greeting, one line);
          Post a Job lives in the sidebar */}
      <PageHeader>
        <div className="pb-5 pt-1">
          <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-widest mb-2">Dashboard</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{greeting(user?.first_name)} 👋</h1>
          <p className="text-sm text-slate-500 mt-1">
            {user?.company_name}
            {sum && (noJobs ? ' · post a job to start receiving applications' : <>
              {' · '}{sum.open_jobs} open job{sum.open_jobs === 1 ? '' : 's'} · {sum.applicants ? `${sum.applicants} applicant${sum.applicants === 1 ? '' : 's'}` : 'no applicants yet'}
              {sum.new > 0 && <> · <span className="font-semibold text-blue-700">{sum.new} to review</span></>}
            </>)}
          </p>
        </div>
      </PageHeader>

      {error && <p role="alert" className="mx-8 mt-6 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5">{error}</p>}
      {!data && !error && (
        <div className="flex-1 min-h-0 px-8 py-6 grid grid-cols-1 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] gap-5 content-start" aria-busy="true">
          <LoadingLabel>Loading your dashboard…</LoadingLabel>
          <CardSkeleton rows={5} />
          <div className="flex flex-col gap-5"><CardSkeleton rows={3} /><CardSkeleton rows={3} /></div>
        </div>
      )}

      {noJobs && (
        <div className="flex-1 px-8 py-6">
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
        // 20 Oct (her review: "neat", layout N2): rows, so cards side by side are the same height, top and bottom;
        // graduates who fit runs full width underneath
        // 20 Oct (her review: "fit screen size", no page scroll, no blank space at the bottom): on a laptop the three rows
        // share the screen height exactly; a card with more than fits scrolls inside itself. Phones keep one column.
        // 21 Oct (her report: a row cut in half on a shorter screen): each row is at least its cards' headers plus one
        // whole row (FitList's minimum); the shares above apply when there is room, and a short screen scrolls instead
        <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6 lg:py-5">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:h-full gap-5 lg:gap-4">
            {/* 25 Oct (her review: crowded cards beside cards with large blank space): two columns whose cards are as
                tall as their content. Later 25 Oct (her review: "still doesn't fit the screen"): on a laptop the columns
                are the screen's height; the cards with lists share it, each showing the whole rows that fit and never
                growing past its own rows; the last card of each column always reaches the bottom, so both columns end on
                the same line (her review; any spare height sits at the bottom of that card). A column too tall even with one
                row per list (a short screen) scrolls inside itself, so the page and the other column stay put */}
            <div className="flex flex-col gap-5 lg:gap-4 min-w-0 lg:min-h-0 lg:overflow-y-auto">
              {/* Row 1, left: applications to review, problems, then next steps (12 Oct, flow review M1) */}
              {/* 21 Oct (her review): amber, like the admin's "Needs your action", while there is something to act on */}
              <section className={`${act ? card.replace('border-slate-200', 'border-amber-300') : card} ${data.to_review.length ? 'flex-1' : 'shrink-0'}`} aria-labelledby="review-h">
                <div className={`px-5 py-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 ${act ? 'bg-amber-50' : ''}`}>
                  <h2 id="review-h" className={`text-base font-semibold ${act ? 'text-amber-900' : 'text-slate-900'}`}>Needs your attention</h2>
                  {data.attention.review_days && <span className="text-xs text-slate-500">You view applications within {data.attention.review_days} day{data.attention.review_days === 1 ? '' : 's'} on average · students see this</span>}
                </div>
                {(data.attention.waiting_long.length > 0 || data.attention.quiet_jobs.length > 0 || data.attention.past_date?.length > 0) && (
                  <ul className="shrink-0 border-t border-slate-200 divide-y divide-slate-100">
                    {/* 14 Oct (transparency flow): the employer's own decision date passed with applicants still waiting */}
                    {(data.attention.past_date || []).map(p => (
                      <li key={`d${p.job_id}`} className="px-5 py-3 flex items-center gap-3.5 bg-rose-50/60 text-sm text-slate-700">
                        <Mark kind="late" />
                        <span className="flex-1 min-w-0"><b className="font-semibold text-rose-900">{p.title}: your decision date has passed</b> with {p.waiting} applicant{p.waiting === 1 ? '' : 's'} waiting. They now see "No decision".</span>
                        <Link to={`/employer/jobs/${p.job_id}`} className={ACTION}>Decide</Link>
                      </li>
                    ))}
                    {data.attention.waiting_long.map(w => (
                      <li key={w.application_id} className="px-5 py-3 flex items-center gap-3.5 text-sm text-slate-700">
                        <Mark kind="wait" />
                        <span className="flex-1 min-w-0"><b className="font-semibold text-amber-900">{w.name} has waited {w.days} days</b> for {w.job_title}. Students are told to look elsewhere after 14 days.</span>
                        <Link to={`/employer/applications/${w.application_id}`} className={ACTION}>Decide</Link>
                      </li>
                    ))}
                    {data.attention.quiet_jobs.map(q => (
                      <li key={q.job_id} className="px-5 py-3 flex items-center gap-3.5 text-sm text-slate-700">
                        <Mark kind="wait" />
                        <span className="flex-1 min-w-0"><b className="font-semibold text-slate-900">{q.title}</b> has no applicants after a week.{q.fit > 0 && ` ${q.fit} visible graduate${q.fit === 1 ? ' fits' : 's fit'} it.`}</span>
                        {q.fit > 0 && <Link to={`/employer/jobs/${q.job_id}`} className={ACTION}>Invite</Link>}
                      </li>
                    ))}
                  </ul>
                )}
                {data.to_review.length > 0 && (
                  <div className={`${GROUP} flex items-baseline justify-between gap-3`}>
                    <span>To review ({sum.new}) · across all your jobs, newest first</span>
                    {nReview < sum.new && <Link to={reviewJob ? `/employer/jobs/${reviewJob}` : '/employer/jobs'} className={SEE}>
                      {reviewJob ? `See all ${sum.new} →` : 'See all in My Jobs →'}</Link>}
                  </div>
                )}
                {data.to_review.length === 0 ? (
                  <p className="px-5 pb-4 text-sm text-slate-500">
                    {sum.applicants ? 'All caught up: every application has a status.' : 'No applications yet. Your jobs are in students\' Job Matches, marked "Apply on SkillMap".'}
                  </p>
                ) : (
                  <FitList fill={lg} onShown={setNReview} className="border-t border-slate-200" items={data.to_review} renderItem={reviewRow} />
                )}
                {/* 21 Oct (her review: blank space once the tips hide after people apply): when nothing is late or waiting
                    long, say so, with the nearest decision date, so the card reads "on track" rather than empty */}
                {data.to_review.length > 0 && !urgent && nextDate && (
                  <p className="mt-auto border-t border-slate-200 px-5 py-3 text-sm text-slate-600">
                    <span className="font-medium text-emerald-700">✓ Nothing urgent.</span> Your next decision date: <b className="font-semibold text-slate-800">{nextDate.title}</b>,{' '}
                    {fmtDay(nextDate.decide_by)} ({nextDate.days === 0 ? 'today' : `${nextDate.days} day${nextDate.days === 1 ? '' : 's'} left`}).
                  </p>
                )}
              </section>
              {/* Left, last: graduates who fit (visible students who haven't applied, best match first); fills the column */}
              {/* only a card with rows stretches; an empty one would just be a large blank card */}
              <section className={`${card} flex-1`} aria-labelledby="fit-h">
                <div className="px-5 pt-4 pb-3">
                  <h2 id="fit-h" className="text-base font-semibold text-slate-900">Graduates who fit your jobs</h2>
                  {/* 25 Oct (her review): "See all" on the description's line, as on View applicants */}
                  <div className="mt-1 flex items-baseline justify-between gap-3">
                    <p className="text-xs text-slate-500 min-w-0">Not applied yet, best match first. Invite several at once from the job's page.</p>
                    {nGrads < data.graduates.length && <Link to={gradJob ? `/employer/jobs/${gradJob}?see=graduates` : '/employer/jobs'} className={SEE}>
                      {gradJob ? 'See all →' : 'See all in My Jobs →'}</Link>}
                  </div>
                </div>
                {data.graduates.length === 0 ? (
                  <p className="px-5 pb-4 text-sm text-slate-500">{data.open_jobs.length ? 'No visible graduate has at least half of your required skills yet. New profiles are matched as students add them.' : 'Open a job to see graduates who fit it.'}</p>
                ) : (
                  <FitList fill={lg} last onShown={setNGrads} className="border-t border-slate-200" items={data.graduates} renderItem={gradRow}
                    after={<p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">That's everyone who fits for now. New profiles are matched as students add them.</p>} />
                )}
              </section>
            </div>
            <div className="flex flex-col gap-5 lg:gap-4 min-w-0 lg:min-h-0 lg:overflow-y-auto">
              {/* Row 1, right: open jobs with their status bar (Workable's pipeline) and decision date */}
              <section className={`${card} ${data.open_jobs.length ? 'flex-1' : 'shrink-0'}`} aria-labelledby="jobs-h">
                <div className="px-5 pt-4 pb-3 lg:pb-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 id="jobs-h" className="text-base font-semibold text-slate-900">Your open jobs</h2>
                    <Link to="/employer/jobs" className={SEE}>{nJobs < data.open_jobs.length ? `See all ${data.open_jobs.length} →` : 'My Jobs'}</Link>
                  </div>
                  {anyApplicants && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 lg:mt-1 text-xs text-slate-500">
                      {BAR.map(([k, label, cls]) => <span key={k} className="inline-flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-sm ${cls}`} />{label}</span>)}
                    </div>
                  )}
                </div>
                {data.open_jobs.length === 0
                  ? <p className="px-5 pb-4 text-sm text-slate-500">No open jobs. Reopen one in My Jobs, or post a new one.</p>
                  : (
                    <FitList fill={lg} onShown={setNJobs} className="border-t border-slate-200" items={data.open_jobs} renderItem={j => {

                        const total = Object.values(j.counts).reduce((x, y) => x + y, 0)
                        const days = j.decide_by ? daysUntil(j.decide_by) : null
                        return (
                          <li key={j.id} className="px-5 py-3.5">
                            <div className="flex items-baseline justify-between gap-3">
                              <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 min-w-0">
                                {manyJobs && <JobDot cls={jobDot(j.id)} />}<span className="truncate">{j.title}</span></p>
                              <Link to={`/employer/jobs/${j.id}`} className="shrink-0 text-sm font-medium text-blue-700 hover:underline">View</Link>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {total ? `${total} applicant${total === 1 ? '' : 's'}` : 'No applicants yet'}
                              {j.counts.applied > 0 && <> · <span className="font-semibold text-blue-700">{j.counts.applied} to review</span></>}
                              {j.decide_by && <> · decide by {fmtDay(j.decide_by)} ({days > 0 ? `${days} day${days === 1 ? '' : 's'} left` : days === 0 ? 'today' : 'passed'})</>}
                            </p>
                            {total > 0 && (
                              <div className="mt-2.5 h-2.5 rounded-full bg-slate-100 flex overflow-hidden" role="img"
                                aria-label={BAR.map(([k, label]) => `${j.counts[k]} ${label.toLowerCase()}`).join(', ')}>
                                {BAR.map(([k, , cls]) => j.counts[k] > 0 && <span key={k} className={cls} style={{ width: `${(j.counts[k] / total) * 100}%` }} />)}
                              </div>
                            )}
                          </li>
                        )
                      }} />

                  )}
              </section>
              {/* 25 Oct (her review: optional tips inside the amber card looked as urgent as late decisions): suggestions get
                  their own plain card; "Needs your attention" keeps only what the employer owes students */}
              {steps.length > 0 && (
                <section className={`${card} shrink-0`} aria-labelledby="tips-h">
                  <h2 id="tips-h" className="px-5 pt-4 pb-3 text-base font-semibold text-slate-900">What you can do now</h2>
                  <ul className="border-t border-slate-200 divide-y divide-slate-100">
                    {steps.map(s => (
                      <li key={s.key} className="px-5 py-3 lg:py-2.5 flex items-center gap-3.5 text-sm text-slate-700">
                        <Mark kind="tip" />
                        <span className="flex-1 min-w-0">{s.text}</span>
                        {s.to.startsWith('#')
                          ? <a href={s.to} className={ACTION}>{s.action}</a>
                          : <Link to={s.to} className={ACTION}>{s.action}</Link>}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {/* Row 2, right (20 Oct, mock-up E3): what students see about this employer (improvement #1), kept short */}
              <section className={`${card} shrink-0`} aria-labelledby="record-h">
                <div className="px-5 py-4 lg:py-3">
                  <h2 id="record-h" className="text-base font-semibold text-slate-900">
                    Your reply record <InfoTip label="How the record is counted">{RECORD_TIP}</InfoTip>
                  </h2>
                  {data.record?.shown ? (
                    <p className="text-sm text-slate-700 mt-1.5">You replied to every applicant by your promised date on <b>{data.record.on_time} of {data.record.of}</b> past jobs. Students see this before applying.</p>
                  ) : (
                    // 25 Oct (her review: the columns' bottoms should line up): "appears after 3 jobs" is in the ⓘ tip
                    <p className="text-sm text-slate-700 mt-1.5">Students see: "New on SkillMap: no reply record yet."{data.record?.of ? ` ${data.record.of} of 3 jobs so far.` : ''}</p>
                  )}
                </div>
              </section>
              {/* Right, last: recent activity; fills the column */}
              {/* recent activity has no page of its own (her review), so it shows the newest that fit */}
              <section className={`${card} flex-1`} aria-labelledby="activity-h">
                <div className="px-5 py-4 flex items-baseline justify-between gap-3">
                  <h2 id="activity-h" className="text-base font-semibold text-slate-900">Recent activity</h2>
                  <span className="text-xs text-slate-500">Last 14 days</span>
                </div>
                {data.activity.length === 0
                  ? <p className="px-5 pb-4 text-sm text-slate-500">Nothing in the last 14 days. Applications, your status changes and invitations will be listed here.</p>
                  : (<>
                    {/* 25 Oct (her review: blank space under one activity): once every event shows, a quiet line right
                        under the last one says that's all, so the empty part of the card reads as finished */}
                    <FitList fill={lg} last max={8} className="border-t border-slate-200" items={data.activity} renderItem={(e, i) => <ActivityRow key={i} e={e} />}
                      after={<p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">That's everything from the last 14 days. New applications, your decisions and invitations appear here.</p>} />
                  </>)}
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
