import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import api from '../../api'
import PageHeader from '../../components/PageHeader'
import { useAuth } from '../../context/useAuth'
import EmployerDashboard from './EmployerDashboard'
import { errText } from '../student/profileUtils'
import RowMenu from '../admin/RowMenu'
import { CardSkeleton, LoadingLabel } from '../../components/Skeleton'
import { Busy } from '../../components/Spinner'

// Employer home (11 Oct; mock-up 9 Oct board 1). An employer the career office hasn't approved yet (or has rejected)
// sees only where they stand. An approved one sees the Dashboard (12 Oct, EmployerDashboard.jsx); My Jobs moved to
// /employer/jobs: their posts, open or closed, with applicant counts, View applicants and a ⋯ menu (Edit job, Close / Reopen; 13 Oct).
// 14 Oct (transparency flow): each open job shows its decision date; the menu adds Stop new applications / Take
// applications again and Move decision date (once); Close job asks why.
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

function Waiting({ status, company }) {
  const rejected = status === 'rejected'
  return (
    <div className="flex-1 flex items-start justify-center px-8 py-16">
      <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-lg">
        <p className={`text-[11px] font-semibold uppercase tracking-widest mb-2 ${rejected ? 'text-rose-600' : 'text-amber-600'}`}>
          {rejected ? 'Not approved' : 'Waiting for approval'}
        </p>
        <h1 className="text-xl font-semibold text-slate-900">
          {rejected ? `${company || 'Your company'} wasn't approved to post jobs` : `${company || 'Your company'} is waiting for approval`}
        </h1>
        <p className="text-sm text-slate-600 mt-2 leading-relaxed">
          {rejected
            ? 'The career office reviewed your account and did not approve it. If you think this is a mistake, contact the career office.'
            : "The university's career office checks every company before it can post jobs. You can post as soon as they approve your account."}
        </p>
      </div>
    </div>
  )
}

function StatusPill({ status }) {
  const cls = { open: 'bg-emerald-50 text-emerald-700 border-emerald-200', closed: 'bg-slate-100 text-slate-600 border-slate-200',
    hidden: 'bg-amber-50 text-amber-800 border-amber-200' }[status]
  const text = { open: 'Open', closed: 'Closed', hidden: 'Hidden by the career office' }[status]
  return <span className={`text-xs font-medium border rounded-full px-2.5 py-0.5 ${cls}`}>{text}</span>
}

// Closing a job (14 Oct, transparency flow; CareerPlug asks "Why are you closing this job?" with the same three
// answers): a reason is required, and every applicant still waiting is told the outcome with it. No silent close.
const CLOSE_REASONS = [
  ['filled_skillmap', 'Filled through SkillMap', 'You marked the person you hired as Accepted'],
  ['filled_other', 'Filled another way', 'You hired someone who did not apply here'],
  ['not_filling', 'Not filling now', 'On hold or cancelled'],
]
function Dialog({ title, busy, onCancel, children, action, onAction, disabled }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30" onMouseDown={() => { if (!busy) onCancel() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="dlg-title" onMouseDown={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 pt-5 pb-4">
          <h2 id="dlg-title" className="text-base font-semibold text-slate-900">{title}</h2>
          {children}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl">
          <button type="button" onClick={onCancel} disabled={busy} className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="button" onClick={onAction} disabled={busy || disabled} className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
            {busy ? <Busy>Saving…</Busy> : action}
          </button>
        </div>
      </div>
    </div>
  )
}

function CloseDialog({ job, busy, onCancel, onClose }) {
  const [reason, setReason] = useState('')
  const n = job.waiting
  return (
    <Dialog title={`Why are you closing "${job.title}"?`} busy={busy} onCancel={onCancel} action="Close job"
      onAction={() => onClose(reason)} disabled={!reason}>
      <div role="radiogroup" aria-label="Reason" className="mt-3 grid gap-2">
        {CLOSE_REASONS.map(([key, label, hint]) => (
          <label key={key} className={`flex items-start gap-3 border rounded-xl px-3.5 py-2.5 cursor-pointer ${reason === key ? 'border-blue-600 bg-blue-50' : 'border-slate-200 hover:border-blue-300'}`}>
            <input type="radio" name="close-reason" checked={reason === key} onChange={() => setReason(key)} className="mt-1 accent-blue-700" />
            <span><span className="block text-sm font-medium text-slate-900">{label}</span><span className="block text-xs text-slate-500">{hint}</span></span>
          </label>
        ))}
      </div>
      <p className="text-sm text-slate-600 mt-3">{n > 0 ? `The ${n} applicant${n === 1 ? '' : 's'} still waiting will see "Not selected" with this reason.` : 'Students will no longer see this job.'}</p>
    </Dialog>
  )
}

// Moving the decision date (14 Oct): once, by 1 or 2 weeks, with a reason the applicants see
function ExtendDialog({ job, busy, onCancel, onExtend }) {
  const [days, setDays] = useState(7)
  const [reason, setReason] = useState('')
  return (
    <Dialog title={`Move the decision date for "${job.title}"?`} busy={busy} onCancel={onCancel} action="Move the date"
      onAction={() => onExtend(days, reason)} disabled={reason.trim().length < 5}>
      <p className="text-sm text-slate-600 mt-1.5">Now {fmtDate(job.decide_by)}. You can move it once.</p>
      <div className="mt-3 flex gap-2">
        {[[7, '1 week later'], [14, '2 weeks later']].map(([d, label]) => (
          <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}
            className={`text-sm font-medium rounded-full px-3.5 py-1.5 border ${days === d ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:border-blue-300'}`}>{label}</button>
        ))}
      </div>
      <label className="block mt-3">
        <span className="text-xs text-slate-500">Why (applicants see this)</span>
        <input value={reason} maxLength={200} onChange={e => setReason(e.target.value)} placeholder="e.g. Interviews are taking longer than planned"
          className="mt-1 w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </label>
    </Dialog>
  )
}

export function MyJobs() {
  const { state } = useLocation()
  const [jobs, setJobs] = useState(null)
  const [tab, setTab] = useState('open')
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const [notice, setNotice] = useState(state?.posted ? `"${state.posted}" is live. Students see it in Job Matches now.`
    : state?.saved ? `Changes to "${state.saved}" are saved. Students see them in Job Matches now.` : '')
  // 12 Oct (flow review): after publishing, how many visible graduates already fit, so the next step is clear
  const [fitNote] = useState(state?.posted && state.fit > 0 ? state.fit : 0)
  const [askClose, setAskClose] = useState(null)       // the job being closed (a reason is asked)
  const [askExtend, setAskExtend] = useState(null)     // the job whose decision date is being moved

  useEffect(() => {
    if (state?.posted || state?.saved) window.history.replaceState({}, '')     // the "is live" note shows once, not after a reload
    api.get('/employer/jobs').then(res => setJobs(res.data)).catch(err => setError(errText(err, "Couldn't load your jobs.")))
  }, [state?.posted, state?.saved])

  // 14 Oct: one call for every change to a job's state, with the message that says what students now see
  const change = (job, body, done) => {
    setBusy(job.id); setError(''); setNotice('')
    return api.patch(`/employer/jobs/${job.id}`, body)
      .then(res => { setJobs(prev => prev.map(j => j.id === job.id ? res.data : j)); setNotice(done); setAskClose(null) })
      .catch(err => setError(errText(err, "Couldn't change the job. Try again.")))
      .finally(() => setBusy(null))
  }
  const close = (job, reason) => change(job, { closed: true, reason },
    `"${job.title}" is closed.${job.waiting ? ` ${job.waiting} waiting applicant${job.waiting === 1 ? ' sees' : 's see'} "Not selected" with your reason.` : ''}`)
  const reopen = (job) => change(job, { closed: false }, `"${job.title}" is open again.`)
  const stop = (job, stopped) => change(job, { stopped }, stopped
    ? `"${job.title}" no longer takes new applications. Applicants are still waiting for your decision by ${fmtDate(job.decide_by)}.`
    : `"${job.title}" takes applications again.`)
  const extend = (job, days, reason) => {
    setBusy(job.id); setError(''); setNotice('')
    api.post(`/employer/jobs/${job.id}/extend`, { days, reason })
      .then(res => { setJobs(prev => prev.map(j => j.id === job.id ? res.data : j)); setAskExtend(null)
        setNotice(`New decision date for "${job.title}": ${fmtDate(res.data.decide_by)}. Applicants see it with your reason.`) })
      .catch(err => { setAskExtend(null); setError(errText(err, "Couldn't move the date. Try again.")) })
      .finally(() => setBusy(null))
  }
  const open = (jobs || []).filter(j => j.status === 'open')
  const closed = (jobs || []).filter(j => j.status !== 'open')
  const shown = tab === 'open' ? open : closed

  return (
    <>
      <PageHeader>
        {/* 12 Oct (her review): same header as the other pages (eyebrow, title, one line); Post a Job lives in the sidebar */}
        <div className="pb-5">
          <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-widest mb-2">My Jobs</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Your job posts</h1>
          <p className="text-sm text-slate-500 mt-1">Posted jobs appear in students' Job Matches straight away, marked "Apply on SkillMap".</p>
        </div>
      </PageHeader>

      <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6 flex flex-col gap-4">
        {notice && <p role="status" className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5">
          {notice}
          {fitNote > 0 && notice.includes('is live') && <> {fitNote} visible graduate{fitNote === 1 ? '' : 's'} already fit it (at least half of its required skills). <Link to="/dashboard" className="font-semibold underline">Invite them from your Dashboard</Link></>}
        </p>}
        {askClose && <CloseDialog job={askClose} busy={busy === askClose.id} onCancel={() => setAskClose(null)}
          onClose={(reason) => close(askClose, reason)} />}
        {askExtend && <ExtendDialog job={askExtend} busy={busy === askExtend.id} onCancel={() => setAskExtend(null)}
          onExtend={(days, reason) => extend(askExtend, days, reason)} />}
        {error && <p role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5">{error}</p>}
        {jobs === null && !error && <><LoadingLabel>Loading your jobs…</LoadingLabel><CardSkeleton rows={5} /></>}
        {jobs?.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
            <h2 className="text-base font-semibold text-slate-900">No jobs posted yet</h2>
            <p className="text-sm text-slate-500 mt-1">Write your ad, check the skills SkillMap reads from it, and publish. Graduates are matched on those skills.</p>
            <Link to="/employer/post" className="inline-block mt-4 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700">Post your first job</Link>
          </div>
        )}
        {jobs?.length > 0 && (
          <>
            <div role="tablist" className="flex gap-2">
              {[['open', `Open (${open.length})`], ['closed', `Closed (${closed.length})`]].map(([key, text]) => (
                <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
                  className={`text-sm font-medium px-3.5 py-1.5 rounded-full border ${tab === key
                    ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'}`}>{text}</button>
              ))}
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              {/* 12 Oct (her review): the Job column takes the spare width; the others are fixed, so no wide gaps; every
                  column left-aligned (Actions was right-aligned) and the actions are buttons */}
              <table className="w-full text-sm table-fixed">
                <colgroup><col /><col className="w-28" /><col className="w-36" /><col className="w-56" /><col className="w-52" /></colgroup>
                <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Job</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Applicants</th>
                    <th className="px-5 py-3">Skills</th>
                    <th className="px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shown.map(j => (
                    <tr key={j.id} className="hover:bg-blue-50/40">
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-slate-900 truncate">{j.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{[j.location, j.category, `posted ${fmtDate(j.posted_at)}`].filter(Boolean).join(' · ')}</p>
                        {/* 14 Oct: the promised decision date, red once it has passed with applicants waiting */}
                        {j.status === 'open' && j.decide_by && <p className={`text-xs mt-0.5 ${j.past_date && j.waiting ? 'text-rose-700 font-medium' : 'text-slate-600'}`}>
                          {j.past_date && j.waiting ? `Decision date passed (${fmtDate(j.decide_by)})` : `Decide by ${fmtDate(j.decide_by)}`}{j.decide_extended ? ' · moved once' : ''}
                        </p>}
                      </td>
                      <td className="px-5 py-3.5"><StatusPill status={j.status} />
                        {j.status === 'open' && j.stopped && <p className="text-[11px] text-slate-500 mt-1">Not taking new applications</p>}
                      </td>
                      {/* 12 Oct: "1 · 1 new" read as a puzzle; now the total, and how many still wait for a status */}
                      <td className="px-5 py-3.5 text-slate-600">
                        {j.applicants}
                        {j.new_applicants > 0 && <p className="text-xs font-semibold text-blue-700 mt-0.5">{j.new_applicants} to review</p>}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap">{j.required} required{j.preferred ? ` · ${j.preferred} nice to have` : ''}</td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        {/* 13 Oct (her pick after research, references.md "Editing a published job"): the row's main action,
                            then a ⋯ menu beside it, like Indeed's menu beside each job */}
                        <div className="flex items-center gap-2">
                          <Link to={`/employer/jobs/${j.id}`} className="inline-block text-sm font-medium text-blue-700 border border-blue-300 bg-blue-50 rounded-lg px-3 py-1 hover:bg-blue-100">View applicants</Link>
                          {j.status !== 'hidden' && (
                            <RowMenu label={`Actions for ${j.title}`} disabled={busy === j.id} items={[
                              { label: 'Edit job', onSelect: () => navigate(`/employer/jobs/${j.id}/edit`) },
                              ...(j.status === 'open' ? [
                                j.stopped ? { label: 'Take applications again', onSelect: () => stop(j, false) }
                                  : { label: 'Stop new applications', onSelect: () => stop(j, true) },
                                ...(!j.decide_extended ? [{ label: 'Move decision date', onSelect: () => setAskExtend(j) }] : []),
                                { label: 'Close job', danger: true, onSelect: () => setAskClose(j) },
                              ] : [{ label: 'Reopen job', success: true, onSelect: () => reopen(j) }]),
                            ]} />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {shown.length === 0 && (
                    <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-slate-400">
                      {tab === 'open' ? 'No open jobs.' : 'No closed jobs.'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  )
}

export default function EmployerHome() {
  const { user } = useAuth()
  if (user?.employer_status === 'approved') return <EmployerDashboard />
  return <div className="flex flex-col h-screen"><Waiting status={user?.employer_status} company={user?.company_name} /></div>
}
