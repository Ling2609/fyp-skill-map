import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api'
import PageHeader from '../../components/PageHeader'
import { ADMIN_COUNTS_CHANGED } from '../../components/Sidebar'
import { errText } from './profileUtils'
import ApplicationSteps from '../../components/ApplicationSteps'

// My applications (11 Oct, Employer flow batch 2; mock-up board 6): every job the student applied for on SkillMap.
// 12 Oct (her request; mock-up P2): one card per application with its progress, Applied -> Viewed -> Shortlisted ->
// Decision, each with its date, so the student isn't left waiting in silence (LinkedIn shows "Application viewed";
// Talent Board: nearly half of candidates never get a status update). After 14 quiet days the card says to keep
// applying elsewhere, after 30 that this one is unlikely (MyCareersFuture: follow up after 1-2 weeks, move on after
// about a month). Employers' invitations to apply sit on top. One column across the page width, newest update first (her review, 12 Oct). References: references.md "Application progress".
const fmtDay = (iso) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''
const PILL = {
  applied: 'bg-slate-100 text-slate-700', viewed: 'bg-slate-100 text-slate-700', shortlisted: 'bg-blue-50 text-blue-700',
  accepted: 'bg-emerald-50 text-emerald-700', rejected: 'bg-rose-50 text-rose-700', closed: 'bg-slate-100 text-slate-500',
}
const TABS = [['all', 'All'], ['waiting', 'Waiting'], ['accepted', 'Accepted'], ['rejected', 'Not selected']]
const inTab = (r, t) => t === 'all' || (t === 'waiting' ? !['accepted', 'rejected'].includes(r.status) : r.status === t)

function Note({ r }) {
  const p = r.progress
  if (p.nudge === 'move_on') return (
    <p className="mt-4 text-sm text-amber-900 bg-amber-50 rounded-lg px-3.5 py-2.5">
      <b>No update for {p.quiet_days} days.</b> Employers who are interested usually reply within a month, so treat this one as
      unlikely and put your time into other jobs. It stays here in case they reply.
    </p>
  )
  if (p.nudge === 'keep_applying') return (
    <p className="mt-4 text-sm text-amber-900 bg-amber-50 rounded-lg px-3.5 py-2.5">
      <b>No update for {p.quiet_days} days.</b> Keep applying to other jobs while you wait; this one stays open.
    </p>
  )
  if (p.closed_without_decision) return <p className="mt-4 text-sm text-slate-600">The employer closed this job without a decision.</p>
  if (r.status === 'rejected') return (
    <p className="mt-4 text-sm text-slate-600">
      Not selected this time. <Link to={`/jobs/${encodeURIComponent(r.job_ref)}`} className="text-blue-700 hover:underline">See what you were missing</Link>
      {' · '}<Link to="/recommend" className="text-blue-700 hover:underline">Find other jobs</Link>
    </p>
  )
  if (r.status === 'accepted') return <p className="mt-4 text-sm text-slate-600">{r.company} has your email and will contact you about the next step.</p>
  if (r.employer_usually_days) return (
    <p className="mt-4 text-sm text-slate-500">{r.company} usually views applications within {r.employer_usually_days} day{r.employer_usually_days === 1 ? '' : 's'}.</p>
  )
  return null
}

function pill(r) {
  if (r.progress.closed_without_decision) return ['closed', 'Job closed']
  if (r.status === 'accepted' || r.status === 'rejected' || r.status === 'shortlisted') return [r.status, r.status_label]
  return [r.progress.stage, r.progress.stage === 'viewed' ? 'Viewed' : 'Applied']
}

export default function MyApplications() {
  const [rows, setRows] = useState(null)
  const [invites, setInvites] = useState([])
  const [tab, setTab] = useState('all')
  const [error, setError] = useState('')
  useEffect(() => {
    api.get('/applications/mine').then(res => setRows(res.data)).catch(err => setError(errText(err, "Couldn't load your applications.")))
    api.get('/applications/invitations').then(res => setInvites(res.data)).catch(() => {})
  }, [])
  const dismiss = (inv) => {
    setInvites(list => list.filter(i => i.id !== inv.id))
    api.patch(`/applications/invitations/${inv.id}`, { dismissed: true })
      .then(() => window.dispatchEvent(new Event(ADMIN_COUNTS_CHANGED)))
      .catch(err => { setInvites(list => [inv, ...list]); setError(errText(err, "Couldn't update the invitation. Try again.")) })
  }
  const count = (t) => (rows || []).filter(r => inTab(r, t)).length
  // 12 Oct (her review): one column, the application with the newest update first
  const shown = (rows || []).filter(r => inTab(r, tab))
    .sort((a, b) => new Date(b.progress.last_update) - new Date(a.progress.last_update))

  return (
    <div className="flex flex-col h-screen">
      <PageHeader>
        <div className="pb-5">
          <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-widest mb-2">My applications</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Where your applications stand</h1>
          <p className="text-sm text-slate-500 mt-1">Jobs you applied for on SkillMap, newest update first: Applied, Viewed by the employer, Shortlisted, then their decision.</p>
        </div>
      </PageHeader>
      <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6"><div className="flex flex-col gap-4">
        {error && <p role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5">{error}</p>}

        {invites.map(inv => (
          <section key={inv.id} className="bg-violet-50 border border-violet-200 rounded-2xl px-5 py-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex-1 min-w-60">
              <h2 className="text-[15px] font-semibold text-slate-900">{inv.company} invited you to apply</h2>
              <p className="text-sm text-slate-600">{inv.title}{inv.match && ` · you have ${inv.match} skills`} · {fmtDay(inv.invited_at)}</p>
            </div>
            <Link to={`/jobs/${encodeURIComponent(inv.job_ref)}`} className="text-sm font-medium text-violet-800 bg-white border border-violet-200 rounded-lg px-3.5 py-1.5 hover:bg-violet-100">View job</Link>
            <button onClick={() => dismiss(inv)} className="text-sm text-slate-500 hover:text-slate-800">Not interested</button>
          </section>
        ))}

        {rows === null && !error && <p className="text-sm text-slate-400">Loading your applications…</p>}
        {rows?.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
            <h2 className="text-base font-semibold text-slate-900">No applications yet</h2>
            <p className="text-sm text-slate-500 mt-1">Jobs marked "Posted on SkillMap" in Job Matches can be applied for here with your profile.</p>
            <Link to="/recommend" className="inline-block mt-4 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700">Go to Job Matches</Link>
          </div>
        )}
        {rows?.length > 0 && (
          <>
            <div role="tablist" className="flex flex-wrap gap-2">
              {TABS.map(([t, text]) => (
                <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                  className={`text-sm font-medium px-3.5 py-1.5 rounded-full border ${tab === t
                    ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'}`}>
                  {text} {count(t)}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-4">
              {shown.map(r => {
                const [key, label] = pill(r)
                return (
                  <article key={r.id} className="bg-white border border-slate-200 rounded-2xl px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link to={`/jobs/${encodeURIComponent(r.job_ref)}`} className="text-[15px] font-semibold text-slate-900 hover:text-blue-700">{r.title}</Link>
                        <p className="text-xs text-slate-500 mt-0.5">{r.company}{r.match && ` · your match ${r.match}`}</p>
                      </div>
                      <span className={`shrink-0 text-xs font-semibold rounded-full px-2.5 py-0.5 ${PILL[key]}`}>{label}</span>
                    </div>
                    <ApplicationSteps steps={r.progress.steps} decided={['accepted', 'rejected'].includes(r.status)} />
                    <Note r={r} />
                  </article>
                )
              })}
              {shown.length === 0 && <p className="text-sm text-slate-400">None here.</p>}
            </div>
          </>
        )}
      </div></div>
    </div>
  )
}
