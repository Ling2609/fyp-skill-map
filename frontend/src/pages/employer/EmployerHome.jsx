import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import api from '../../api'
import PageHeader from '../../components/PageHeader'
import { useAuth } from '../../context/useAuth'
import EmployerDashboard from './EmployerDashboard'
import { errText } from '../student/profileUtils'

// Employer home (11 Oct; mock-up 9 Oct board 1). An employer the career office hasn't approved yet (or has rejected)
// sees only where they stand. An approved one sees the Dashboard (12 Oct, EmployerDashboard.jsx); My jobs moved to
// /employer/jobs: their posts, open or closed, with applicant counts, View applicants and close / reopen.
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

// Closing a job with applicants still waiting (12 Oct, flow review): they would otherwise only see "closed without a
// decision". Telling them "Not selected" closes the loop (Talent Board: nearly half of candidates never hear back).
function CloseDialog({ job, busy, onCancel, onClose }) {
  const n = job.waiting
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30" onMouseDown={() => { if (!busy) onCancel() }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="close-title" onMouseDown={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 pt-5 pb-4">
          <h2 id="close-title" className="text-base font-semibold text-slate-900">Close "{job.title}"?</h2>
          <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
            {n} applicant{n === 1 ? ' is' : 's are'} still waiting for a decision. Tell them "Not selected", or close it and they
            see "The employer closed this job without a decision".
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2 px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl">
          <button type="button" onClick={onCancel} disabled={busy} className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="button" onClick={() => onClose(false)} disabled={busy} className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">Close only</button>
          <button type="button" autoFocus onClick={() => onClose(true)} disabled={busy} className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
            {busy ? 'Closing…' : `Close and tell ${n === 1 ? 'them' : `all ${n}`} "Not selected"`}
          </button>
        </div>
      </div>
    </div>
  )
}

export function MyJobs() {
  const { state } = useLocation()
  const [jobs, setJobs] = useState(null)
  const [tab, setTab] = useState('open')
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(state?.posted ? `"${state.posted}" is live. Students see it in Job Matches now.` : '')
  // 12 Oct (flow review): after publishing, how many visible graduates already fit, so the next step is clear
  const [fitNote] = useState(state?.posted && state.fit > 0 ? state.fit : 0)
  const [askClose, setAskClose] = useState(null)       // a job with applicants still waiting

  useEffect(() => {
    if (state?.posted) window.history.replaceState({}, '')     // the "is live" note shows once, not after a reload
    api.get('/employer/jobs').then(res => setJobs(res.data)).catch(err => setError(errText(err, "Couldn't load your jobs.")))
  }, [state?.posted])

  const toggle = (job, notSelected = null) => {
    const closing = job.status === 'open'
    // 12 Oct (flow review): closing with applicants still waiting asks what to tell them first
    if (closing && job.waiting > 0 && notSelected === null) { setAskClose(job); return }
    setAskClose(null)
    setBusy(job.id); setError(''); setNotice('')
    api.patch(`/employer/jobs/${job.id}`, { closed: closing, not_selected_waiting: !!notSelected })
      .then(res => {
        setJobs(prev => prev.map(j => j.id === job.id ? res.data : j))
        setNotice(closing ? `"${job.title}" is closed. Students no longer see it.${notSelected ? ` ${job.waiting} waiting applicant${job.waiting === 1 ? ' sees' : 's see'} "Not selected".` : ''}`
          : `"${job.title}" is open again.`)
      })
      .catch(err => setError(errText(err, "Couldn't change the job. Try again.")))
      .finally(() => setBusy(null))
  }
  const open = (jobs || []).filter(j => j.status === 'open')
  const closed = (jobs || []).filter(j => j.status !== 'open')
  const shown = tab === 'open' ? open : closed

  return (
    <>
      <PageHeader>
        {/* 12 Oct (her review): same header as the other pages (eyebrow, title, one line); Post a job lives in the sidebar */}
        <div className="pb-5">
          <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-widest mb-2">My jobs</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Your job posts</h1>
          <p className="text-sm text-slate-500 mt-1">Posted jobs appear in students' Job Matches straight away, marked "Posted on SkillMap".</p>
        </div>
      </PageHeader>

      <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6 flex flex-col gap-4">
        {notice && <p role="status" className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5">
          {notice}
          {fitNote > 0 && notice.includes('is live') && <> {fitNote} visible graduate{fitNote === 1 ? '' : 's'} already fit it (at least half of its required skills). <Link to="/dashboard" className="font-semibold underline">Invite them from your Dashboard</Link></>}
        </p>}
        {askClose && <CloseDialog job={askClose} busy={busy === askClose.id} onCancel={() => setAskClose(null)}
          onClose={(notSelected) => toggle(askClose, notSelected)} />}
        {error && <p role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5">{error}</p>}
        {jobs === null && !error && <p className="text-sm text-slate-400">Loading your jobs…</p>}
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
              {/* 12 Oct (her review): the Job column takes the spare width; the others are fixed, so no wide gaps */}
              <table className="w-full text-sm table-fixed">
                <colgroup><col /><col className="w-28" /><col className="w-36" /><col className="w-60" /><col className="w-60" /></colgroup>
                <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Job</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Applicants</th>
                    <th className="px-5 py-3">Skills</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shown.map(j => (
                    <tr key={j.id} className="hover:bg-blue-50/40">
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-slate-900 truncate">{j.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{[j.location, j.category, `posted ${fmtDate(j.posted_at)}`].filter(Boolean).join(' · ')}</p>
                      </td>
                      <td className="px-5 py-3.5"><StatusPill status={j.status} /></td>
                      {/* 12 Oct: "1 · 1 new" read as a puzzle; now the total, and how many still wait for a status */}
                      <td className="px-5 py-3.5 text-slate-600">
                        {j.applicants}
                        {j.new_applicants > 0 && <p className="text-xs font-semibold text-blue-700 mt-0.5">{j.new_applicants} to review</p>}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap">{j.required} required{j.preferred ? ` · ${j.preferred} nice to have` : ''}</td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <Link to={`/employer/jobs/${j.id}`} className="text-sm font-medium text-blue-700 hover:underline mr-4">View applicants</Link>
                        {j.status !== 'hidden' && (
                          <button onClick={() => toggle(j)} disabled={busy === j.id}
                            className="text-sm font-medium text-blue-700 hover:underline disabled:text-slate-300">
                            {busy === j.id ? 'Saving…' : j.status === 'open' ? 'Close job' : 'Reopen'}
                          </button>
                        )}
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
