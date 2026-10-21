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
import InfoTip from '../../components/InfoTip'
import { RECORD_TIP } from '../../components/EmployerRecord'

// Employer dashboard (12 Oct, her pick E after mock-ups A-E; references.md "Employer dashboard layout"; left column
// changed the same day to option B of mock-ups A-C (my proposal; her pick pending): to review sized to its rows + recent activity, so one application isn't a blank card).
// Left: applications to review across all jobs, newest first (Greenhouse's "Applications to Review").
// Right: open jobs with a stacked status bar (Workable's job pipeline), then graduates who fit (visible students who
// haven't applied, best match first). The page fills the screen and each card scrolls on its own (her rule).
const BAR = [['applied', 'Applied', 'bg-slate-400'], ['shortlisted', 'Shortlisted', 'bg-blue-500'],
  ['accepted', 'Accepted', 'bg-emerald-500'], ['rejected', 'Rejected', 'bg-rose-300']]
const AVATAR = ['bg-blue-600', 'bg-violet-600', 'bg-cyan-600', 'bg-pink-600', 'bg-orange-600', 'bg-emerald-600', 'bg-indigo-600', 'bg-teal-600']
const initials = (name) => name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
const avatarCls = (name) => AVATAR[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % AVATAR.length]
const ago = (iso) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 14 ? `${days} days ago` : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
const card = 'bg-white border border-slate-200 rounded-2xl flex flex-col min-h-0 overflow-hidden'
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

function Avatar({ name, small }) {
  return <span aria-hidden="true" className={`${small ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'} shrink-0 rounded-full text-white font-semibold flex items-center justify-center ${avatarCls(name)}`}>{initials(name)}</span>
}

// Short on purpose so the name and job keep their room; what's missing is on the profile
function Match({ have, total, short }) {
  const full = total > 0 && have === total
  return (
    <span title={`Has ${have} of the job's ${total} required skills`}
      className={`text-xs font-semibold rounded-full px-2.5 py-1 whitespace-nowrap ${full ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
      {have} of {total}{short ? '' : ' required'}
    </span>
  )
}

// Recent activity (12 Oct): what happened and, for a status change, what the student now sees
const DOT = { posted: 'bg-slate-300', applied: 'bg-slate-400', invited: 'bg-violet-400', shortlisted: 'bg-blue-500',
  accepted: 'bg-emerald-500', rejected: 'bg-rose-300' }
function activityText(e) {
  const who = <b className="font-semibold text-slate-900">{e.student}</b>
  if (e.kind === 'posted') return <>You posted <b className="font-semibold text-slate-900">{e.job}</b></>
  if (e.kind === 'applied') return <>{who} applied for {e.job}</>
  if (e.kind === 'invited') return <>You invited {who} to apply for {e.job}</>
  if (e.status === 'shortlisted') return <>You shortlisted {who} for {e.job}</>
  if (e.status === 'accepted') return <>You accepted {who} for {e.job}</>
  if (e.status === 'rejected') return <>You marked {who} Rejected for {e.job} · they see "Not selected"</>
  return <>You moved {who} back to Applied for {e.job}</>
}
function ActivityRow({ e }) {
  const to = e.application_id ? `/employer/applications/${e.application_id}`
    : e.kind === 'invited' ? `/employer/graduates/${e.student_id}?job=${e.job_id}` : `/employer/jobs/${e.job_id}`
  return (
    <li>
      <Link to={to} className="px-5 py-2.5 flex items-start gap-3 text-sm text-slate-600 hover:bg-slate-50">
        <span aria-hidden="true" className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${DOT[e.status || e.kind]}`} />
        <span className="flex-1 min-w-0 truncate">{activityText(e)}</span>
        <span className="shrink-0 text-xs text-slate-400">{ago(e.at)}</span>
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
        graduates: d.graduates.map(x => x.student_id === g.student_id ? { ...x, invited_at: res.data.invited_at } : x),
        activity: [{ kind: 'invited', at: res.data.invited_at, job: g.job_title, job_id: g.job_id, student: g.name, student_id: g.student_id }, ...d.activity] })))
      .catch(err => setError(errText(err, "Couldn't send the invitation. Try again.")))
      .finally(() => setInviting(null))
  }
  const sum = data?.summary
  const noJobs = sum && sum.jobs === 0
  const steps = data ? nextSteps(data) : []
  const anyApplicants = data?.open_jobs.some(j => Object.values(j.counts).some(n => n > 0))

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
        <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:grid-rows-[minmax(min-content,1.45fr)_minmax(min-content,1fr)_minmax(min-content,0.8fr)] lg:h-full gap-5">
            {/* Row 1, left: applications to review, problems, then next steps (12 Oct, flow review M1) */}
            <section className={card} aria-labelledby="review-h">
              <div className="px-5 py-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h2 id="review-h" className="text-base font-semibold text-slate-900">Needs your attention</h2>
                {data.attention.review_days && <span className="text-xs text-slate-500">You view applications within {data.attention.review_days} day{data.attention.review_days === 1 ? '' : 's'} on average · students see this</span>}
              </div>
              {(data.attention.waiting_long.length > 0 || data.attention.quiet_jobs.length > 0 || data.attention.past_date?.length > 0) && (
                <ul className="shrink-0 border-t border-slate-100 divide-y divide-slate-100">
                  {/* 14 Oct (transparency flow): the employer's own decision date passed with applicants still waiting */}
                  {(data.attention.past_date || []).map(p => (
                    <li key={`d${p.job_id}`} className="px-5 py-2.5 flex items-center gap-3 bg-rose-50 text-sm text-rose-900">
                      <span className="flex-1 min-w-0"><b>{p.title}: your decision date has passed</b> with {p.waiting} applicant{p.waiting === 1 ? '' : 's'} waiting. They now see "No decision".</span>
                      <Link to={`/employer/jobs/${p.job_id}`} className="shrink-0 font-medium text-blue-700 hover:underline">Decide</Link>
                    </li>
                  ))}
                  {data.attention.waiting_long.map(w => (
                    <li key={w.application_id} className="px-5 py-2.5 flex items-center gap-3 bg-amber-50 text-sm text-amber-900">
                      <span className="flex-1 min-w-0"><b>{w.name} has waited {w.days} days</b> for {w.job_title}. Students are told to look elsewhere after 14 days.</span>
                      <Link to={`/employer/applications/${w.application_id}`} className="shrink-0 font-medium text-blue-700 hover:underline">Decide</Link>
                    </li>
                  ))}
                  {data.attention.quiet_jobs.map(q => (
                    <li key={q.job_id} className="px-5 py-2.5 flex items-center gap-3 bg-slate-50 text-sm text-slate-700">
                      <span className="flex-1 min-w-0">{q.title} has <b>no applicants after a week</b>.{q.fit > 0 && ` ${q.fit} visible graduate${q.fit === 1 ? ' fits' : 's fit'} it.`}</span>
                      {q.fit > 0 && <a href="#fit-h" className="shrink-0 font-medium text-blue-700 hover:underline">Invite them</a>}
                    </li>
                  ))}
                </ul>
              )}
              {data.to_review.length > 0 && <p className="px-5 pt-3 pb-1.5 text-xs font-semibold text-slate-500 border-t border-slate-100">To review ({sum.new}) · across all your jobs, newest first</p>}
              {data.to_review.length === 0 ? (
                <p className="px-5 pb-4 text-sm text-slate-500">
                  {sum.applicants ? 'All caught up: every application has a status.' : 'No applications yet. Your jobs are in students\' Job Matches, marked "Apply on SkillMap".'}
                </p>
              ) : (
                <FitList className="border-t border-slate-100" items={data.to_review} renderItem={a => (

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
                      <Link to={`/employer/applications/${a.id}`} className="shrink-0 text-sm font-medium text-blue-700 border border-blue-200 rounded-lg px-3.5 py-1.5 hover:bg-blue-50">Review</Link>
                    </li>
                  )} />

              )}
              {steps.length > 0 && (
                <div className="border-t border-slate-100 px-5 py-3">
                  <p className="text-xs font-semibold text-slate-500">What you can do now</p>
                  <ul className="mt-1.5 space-y-1.5">
                    {steps.map(s => (
                      <li key={s.key} className="flex items-start justify-between gap-3 text-sm text-slate-700">
                        <span className="min-w-0">{s.text}</span>
                        {s.to.startsWith('#')
                          ? <a href={s.to} className="shrink-0 font-medium text-blue-700 hover:underline">{s.action}</a>
                          : <Link to={s.to} className="shrink-0 font-medium text-blue-700 hover:underline">{s.action}</Link>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {/* Row 1, right: open jobs with their status bar (Workable's pipeline) and decision date */}
            <section className={card} aria-labelledby="jobs-h">
              <div className="px-5 pt-4 pb-3">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 id="jobs-h" className="text-base font-semibold text-slate-900">Your open jobs</h2>
                  <Link to="/employer/jobs" className="text-sm font-medium text-blue-700 hover:underline">My Jobs</Link>
                </div>
                {anyApplicants && (
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-slate-500">
                    {BAR.map(([k, label, cls]) => <span key={k} className="inline-flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-sm ${cls}`} />{label}</span>)}
                  </div>
                )}
              </div>
              {data.open_jobs.length === 0
                ? <p className="px-5 pb-4 text-sm text-slate-500">No open jobs. Reopen one in My Jobs, or post a new one.</p>
                : (
                  <FitList className="border-t border-slate-100" items={data.open_jobs} renderItem={j => {

                      const total = Object.values(j.counts).reduce((x, y) => x + y, 0)
                      const days = j.decide_by ? daysUntil(j.decide_by) : null
                      return (
                        <li key={j.id} className="px-5 py-3.5">
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="text-sm font-semibold text-slate-900 truncate">{j.title}</p>
                            <Link to={`/employer/jobs/${j.id}`} className="shrink-0 text-sm font-medium text-blue-700 hover:underline">View</Link>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {total ? `${total} applicant${total === 1 ? '' : 's'}` : 'No applicants yet'}
                            {j.counts.applied > 0 && <> · <span className="font-semibold text-blue-700">{j.counts.applied} to review</span></>}
                            {j.decide_by && <> · decide by {fmtDay(j.decide_by)} ({days > 0 ? `${days} day${days === 1 ? '' : 's'} left` : days === 0 ? 'today' : 'passed'})</>}
                          </p>
                          {/* every row the same height (FitList counts whole rows): no applicants keeps the bar's space, empty */}
                          {total === 0 && <div aria-hidden="true" className="mt-2.5 h-2.5" />}
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

            {/* Row 2, left */}
            <section className={card} aria-labelledby="activity-h">
              <div className="px-5 py-4 flex items-baseline justify-between gap-3">
                <h2 id="activity-h" className="text-base font-semibold text-slate-900">Recent activity</h2>
                <span className="text-xs text-slate-500">Last 14 days</span>
              </div>
              {data.activity.length === 0
                ? <p className="px-5 pb-4 text-sm text-slate-500">Nothing in the last 14 days. Applications, your status changes and invitations will be listed here.</p>
                : (<>
                  <FitList className="border-t border-slate-100" items={data.activity} renderItem={(e, i) => <ActivityRow key={i} e={e} />} />
                  {data.activity.length < 3 && <p className="px-5 pb-3 text-xs text-slate-400">New applications and status changes appear here.</p>}
                </>)}
            </section>

            {/* Row 2, right (20 Oct, mock-up E3): what students see about this employer (improvement #1), kept short */}
            <section className={card} aria-labelledby="record-h">
              <div className="px-5 py-4">
                <h2 id="record-h" className="text-base font-semibold text-slate-900">
                  Your reply record <InfoTip label="How the record is counted">{RECORD_TIP}</InfoTip>
                </h2>
                {data.record?.shown ? (
                  <p className="text-sm text-slate-700 mt-1.5">You replied to every applicant by your promised date on <b>{data.record.on_time} of {data.record.of}</b> past jobs. Students see this before applying.</p>
                ) : (
                  <>
                    <p className="text-sm text-slate-700 mt-1.5">Students see: "New on SkillMap: no reply record yet."</p>
                    <p className="text-xs text-slate-500 mt-1">It appears after 3 of your jobs pass their decision date{data.record?.of ? ` (${data.record.of} so far)` : ''}.</p>
                  </>
                )}
              </div>
            </section>

            {/* Row 3, full width: graduates who fit (visible students who haven't applied, best match first) */}
            <section className={`${card} lg:col-span-2`} aria-labelledby="fit-h">
              <div className="px-5 pt-4 pb-3">
                <h2 id="fit-h" className="text-base font-semibold text-slate-900">Graduates who fit your jobs</h2>
                <p className="text-xs text-slate-500 mt-1">Visible students who haven't applied, best match first. Invite them to apply: they see it on My Applications.</p>
              </div>
              {data.graduates.length === 0 ? (
                <p className="px-5 pb-4 text-sm text-slate-500">{data.open_jobs.length ? 'No visible graduate has at least half of your required skills yet. New profiles are matched as students add them.' : 'Open a job to see graduates who fit it.'}</p>
              ) : (
                <FitList className="border-t border-slate-100" items={data.graduates} renderItem={g => (

                    <li key={g.student_id} className="px-5 py-3 flex items-center gap-3">
                      <Avatar name={g.name} small />
                      <div className="flex-1 min-w-0">
                        <Link to={`/employer/graduates/${g.student_id}?job=${g.job_id}`} className="block text-sm font-semibold text-slate-900 truncate hover:text-blue-700">{g.name}</Link>
                        <p className="text-xs text-slate-500 truncate">fits {g.job_title}{g.programme && ` · ${g.programme}`}</p>
                      </div>
                      <Match have={g.have} total={g.total} short />
                      {g.invited_at
                        ? <span className="shrink-0 text-xs font-semibold text-blue-700 bg-blue-50 rounded-full px-2.5 py-1">Invited {ago(g.invited_at)}</span>
                        : <button onClick={() => invite(g)} disabled={inviting === g.student_id}
                            className="shrink-0 text-sm font-medium text-blue-700 border border-blue-200 rounded-lg px-3 py-1 hover:bg-blue-50 disabled:opacity-40">
                            {inviting === g.student_id ? <Busy>Inviting…</Busy> : 'Invite'}
                          </button>}
                    </li>
                  )} />

              )}
            </section>
          </div>
        </div>
      )}
    </div>
  )
}
