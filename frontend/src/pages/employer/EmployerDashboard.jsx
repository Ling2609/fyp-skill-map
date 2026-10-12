import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api'
import PageHeader from '../../components/PageHeader'
import { useAuth } from '../../context/useAuth'
import { errText } from '../student/profileUtils'

// Employer dashboard (12 Oct, her pick E after mock-ups A-E; references.md "Employer dashboard layout").
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

function Avatar({ name, small }) {
  return <span aria-hidden="true" className={`${small ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'} shrink-0 rounded-full text-white font-semibold flex items-center justify-center ${avatarCls(name)}`}>{initials(name)}</span>
}

// Short on purpose so the name and job keep their room; what's missing is on the profile
function Match({ have, total }) {
  const full = total > 0 && have === total
  return (
    <span title={`Has ${have} of the job's ${total} required skills`}
      className={`text-xs font-semibold rounded-full px-2.5 py-1 whitespace-nowrap ${full ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
      {have} of {total} required
    </span>
  )
}

function Empty({ title, text, action }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-10 border-t border-slate-100">
      <p className="text-[15px] font-semibold text-slate-900">{title}</p>
      <p className="text-sm text-slate-500 mt-1 max-w-sm">{text}</p>
      {action}
    </div>
  )
}

export default function EmployerDashboard() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api.get('/employer/dashboard').then(res => setData(res.data)).catch(err => setError(errText(err, "Couldn't load your dashboard.")))
  }, [])
  const sum = data?.summary
  const noJobs = sum && sum.jobs === 0

  return (
    <div className="flex flex-col min-h-screen lg:h-screen">
      <PageHeader>
        <div className="pb-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-widest mb-2">{user?.company_name}</p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
            {sum && <p className="text-sm text-slate-500 mt-1">
              {noJobs ? 'Post a job to start receiving applications.' : <>
                {sum.open_jobs} open job{sum.open_jobs === 1 ? '' : 's'} · {sum.applicants ? `${sum.applicants} applicant${sum.applicants === 1 ? '' : 's'}` : 'no applicants yet'}
                {sum.new > 0 && <> · <span className="font-semibold text-blue-700">{sum.new} new to review</span></>}
              </>}
            </p>}
          </div>
          <Link to="/employer/post" className="shrink-0 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700">+ Post a job</Link>
        </div>
      </PageHeader>

      {error && <p role="alert" className="mx-8 mt-6 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5">{error}</p>}
      {!data && !error && <p className="px-8 py-6 text-sm text-slate-400">Loading your dashboard…</p>}

      {noJobs && (
        <div className="flex-1 px-8 py-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-10 max-w-2xl">
            <h2 className="text-lg font-semibold text-slate-900">Welcome, {user?.first_name}</h2>
            <p className="text-sm text-slate-600 mt-1">Three steps to your first graduate hire on SkillMap:</p>
            <ol className="mt-4 flex flex-col gap-2 text-sm text-slate-700 list-decimal pl-5">
              <li>Write your job ad. SkillMap reads the skills it asks for.</li>
              <li>Check the skills: they decide which graduates match.</li>
              <li>Publish. Students see it in Job Matches and apply with their SkillMap profile.</li>
            </ol>
            <Link to="/employer/post" className="inline-block mt-6 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700">Post your first job</Link>
          </div>
        </div>
      )}

      {data && !noJobs && (
        <div className="flex-1 min-h-0 px-8 py-6 grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-5">
          {/* Applications to review */}
          <section className={`${card} max-h-[32rem] lg:max-h-none`} aria-labelledby="review-h">
            <div className="px-5 py-4 flex items-baseline justify-between gap-3">
              <h2 id="review-h" className="text-base font-semibold text-slate-900">Applications to review{data.to_review.length > 0 && ` (${sum.new})`}</h2>
              {data.to_review.length > 0 && <span className="text-xs text-slate-500">Across all your jobs · newest first</span>}
            </div>
            {data.to_review.length === 0 ? (
              <Empty title={sum.applicants ? 'All caught up' : 'No applications yet'}
                text={sum.applicants ? 'Every application has a status. New ones appear here first.'
                  : 'Your jobs are in students\' Job Matches, marked "Posted on SkillMap". New applications appear here, best match first.'}
                action={data.graduates.length > 0 && <a href="#fit-h" className="mt-4 text-sm font-medium text-blue-700 border border-blue-200 rounded-lg px-3.5 py-1.5 hover:bg-blue-50">See graduates who fit</a>} />
            ) : (
              <ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100 border-t border-slate-100">
                {data.to_review.map(a => (
                  <li key={a.id} className="px-5 py-3.5 flex items-center gap-3.5">
                    <Avatar name={a.name} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{a.name}</p>
                      <p className="text-xs text-slate-500 truncate">{a.job_title} · applied {ago(a.applied_at)}</p>
                    </div>
                    <Match have={a.have} total={a.total} />
                    <Link to={`/employer/applications/${a.id}`} className="shrink-0 text-sm font-medium text-blue-700 border border-blue-200 rounded-lg px-3.5 py-1.5 hover:bg-blue-50">Review</Link>
                  </li>
                ))}
              </ul>
            )}
            <Link to="/employer/jobs" className="shrink-0 px-5 py-3 border-t border-slate-100 text-sm font-medium text-blue-700 hover:underline">See all applicants in My jobs</Link>
          </section>

          <div className="flex flex-col gap-5 min-h-0">
            {/* Open jobs: grows to 3, then scrolls */}
            <section className={`${card} shrink-0`} aria-labelledby="jobs-h">
              <div className="px-5 pt-4 pb-3">
                <h2 id="jobs-h" className="text-base font-semibold text-slate-900">Your open jobs</h2>
                {data.open_jobs.length > 0 && (
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-slate-500">
                    {BAR.map(([k, label, cls]) => <span key={k} className="inline-flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-sm ${cls}`} />{label}</span>)}
                  </div>
                )}
              </div>
              {data.open_jobs.length === 0
                ? <p className="px-5 pb-4 text-sm text-slate-500">No open jobs. Reopen one in My jobs, or post a new one.</p>
                : (
                  <ul className="max-h-[17rem] overflow-y-auto divide-y divide-slate-100 border-t border-slate-100">
                    {data.open_jobs.map(j => {
                      const total = Object.values(j.counts).reduce((x, y) => x + y, 0)
                      return (
                        <li key={j.id} className="px-5 py-3.5">
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="text-sm font-semibold text-slate-900 truncate">{j.title}</p>
                            <Link to={`/employer/jobs/${j.id}`} className="shrink-0 text-sm font-medium text-blue-700 hover:underline">View</Link>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {total} applicant{total === 1 ? '' : 's'}{j.counts.applied > 0 && <> · <span className="font-semibold text-blue-700">{j.counts.applied} new</span></>} · posted {ago(j.posted_at)}
                          </p>
                          <div className="mt-2.5 h-2.5 rounded-full bg-slate-100 flex overflow-hidden" role="img"
                            aria-label={BAR.map(([k, label]) => `${j.counts[k]} ${label.toLowerCase()}`).join(', ')}>
                            {total > 0 && BAR.map(([k, , cls]) => j.counts[k] > 0 && <span key={k} className={cls} style={{ width: `${(j.counts[k] / total) * 100}%` }} />)}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              {data.open_jobs.length > 3 && (
                <Link to="/employer/jobs" className="px-5 py-3 border-t border-slate-100 text-sm font-medium text-blue-700 hover:underline">See all {data.open_jobs.length} in My jobs</Link>
              )}
            </section>

            {/* Graduates who fit: takes the rest of the column */}
            <section className={`${card} flex-1 max-h-[28rem] lg:max-h-none`} aria-labelledby="fit-h">
              <div className="px-5 pt-4 pb-3">
                <h2 id="fit-h" className="text-base font-semibold text-slate-900">Graduates who fit your jobs</h2>
                <p className="text-xs text-slate-500 mt-1">Students who let employers see their profile and haven't applied yet, best match first.</p>
              </div>
              {data.graduates.length === 0 ? (
                <Empty title="No matches yet" text={data.open_jobs.length ? 'No visible graduate has at least half of your required skills yet. New profiles are matched as students add them.' : 'Open a job to see graduates who fit it.'} />
              ) : (
                <ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100 border-t border-slate-100">
                  {data.graduates.map(g => (
                    <li key={g.student_id} className="px-5 py-3 flex items-center gap-3">
                      <Avatar name={g.name} small />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{g.name}</p>
                        <p className="text-xs text-slate-500 truncate">fits {g.job_title}{g.programme && ` · ${g.programme}`}</p>
                      </div>
                      <Match have={g.have} total={g.total} />
                      <Link to={`/employer/graduates/${g.student_id}?job=${g.job_id}`} className="shrink-0 text-sm font-medium text-blue-700 hover:underline">View</Link>
                    </li>
                  ))}
                  {data.graduates.length < 3 && (
                    <li className="px-5 py-3 text-xs text-slate-400">Only {data.graduates.length} visible graduate{data.graduates.length === 1 ? '' : 's'} fit{data.graduates.length === 1 ? 's' : ''} so far.</li>
                  )}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  )
}
