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

export function MyJobs() {
  const { state } = useLocation()
  const [jobs, setJobs] = useState(null)
  const [tab, setTab] = useState('open')
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(state?.posted ? `"${state.posted}" is live. Students see it in Job Matches now.` : '')

  useEffect(() => {
    if (state?.posted) window.history.replaceState({}, '')     // the "is live" note shows once, not after a reload
    api.get('/employer/jobs').then(res => setJobs(res.data)).catch(err => setError(errText(err, "Couldn't load your jobs.")))
  }, [state?.posted])

  const toggle = (job) => {
    const closing = job.status === 'open'
    setBusy(job.id); setError(''); setNotice('')
    api.patch(`/employer/jobs/${job.id}`, { closed: closing })
      .then(res => {
        setJobs(prev => prev.map(j => j.id === job.id ? res.data : j))
        setNotice(closing ? `"${job.title}" is closed. Students no longer see it.` : `"${job.title}" is open again.`)
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
        <div className="pb-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-widest mb-2">My jobs</p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Your job posts</h1>
            <p className="text-sm text-slate-500 mt-1">Posted jobs appear in students' Job Matches straight away, marked "Posted on SkillMap".</p>
          </div>
          <Link to="/employer/post" className="shrink-0 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700">+ Post a job</Link>
        </div>
      </PageHeader>

      <div className="flex-1 px-8 py-6 flex flex-col gap-4">
        {notice && <p role="status" className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5">{notice}</p>}
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
                      <td className="px-5 py-3.5 text-slate-600">
                        {j.applicants}{j.new_applicants > 0 && <span className="ml-1.5 text-xs font-semibold text-blue-700">· {j.new_applicants} new</span>}
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
  return <div className="flex flex-col min-h-screen"><Waiting status={user?.employer_status} company={user?.company_name} /></div>
}
