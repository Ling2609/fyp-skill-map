import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api'
import PageHeader from '../../components/PageHeader'
import { errText } from './profileUtils'

// My applications (11 Oct, Employer flow batch 2; mock-up board 6): every job the student applied for on SkillMap and
// where each one stands. The employer sets the status; "rejected" reads "Not selected" here.
const fmtDay = (iso) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''
const PILL = {
  Applied: 'bg-slate-100 text-slate-700', Shortlisted: 'bg-blue-50 text-blue-700',
  Accepted: 'bg-emerald-50 text-emerald-700', 'Not selected': 'bg-rose-50 text-rose-700',
}
const TABS = ['All', 'Applied', 'Shortlisted', 'Accepted', 'Not selected']

export default function MyApplications() {
  const [rows, setRows] = useState(null)
  const [tab, setTab] = useState('All')
  const [error, setError] = useState('')
  useEffect(() => {
    api.get('/applications/mine').then(res => setRows(res.data)).catch(err => setError(errText(err, "Couldn't load your applications.")))
  }, [])
  const count = (t) => (rows || []).filter(r => t === 'All' || r.status_label === t).length
  const shown = (rows || []).filter(r => tab === 'All' || r.status_label === tab)

  return (
    <div className="flex flex-col min-h-screen">
      <PageHeader>
        <div className="pb-5">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">My applications</h1>
          <p className="text-sm text-slate-500 mt-1">Jobs you applied for on SkillMap and where each one stands.</p>
        </div>
      </PageHeader>
      <div className="flex-1 px-8 py-6 flex flex-col gap-4">
        {error && <p role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5">{error}</p>}
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
              {TABS.map(t => (
                <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                  className={`text-sm font-medium px-3.5 py-1.5 rounded-full border ${tab === t
                    ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'}`}>
                  {t} {count(t)}
                </button>
              ))}
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <tr><th className="px-5 py-3">Job</th><th className="px-5 py-3">Your match</th><th className="px-5 py-3">Applied</th><th className="px-5 py-3">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shown.map(r => (
                    <tr key={r.id} className="hover:bg-blue-50/40">
                      <td className="px-5 py-3.5">
                        <Link to={`/jobs/${encodeURIComponent(r.job_ref)}`} className="font-medium text-slate-900 hover:text-blue-700">{r.title}</Link>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {r.company}
                          {r.job_closed && <span className="ml-2 text-[11px] font-semibold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">Job closed</span>}
                        </p>
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">{r.match || '—'}</td>
                      <td className="px-5 py-3.5 text-slate-600">{fmtDay(r.applied_at)}</td>
                      <td className="px-5 py-3.5">
                        <span className={`text-xs font-semibold rounded-full px-2.5 py-0.5 ${PILL[r.status_label]}`}>{r.status_label}</span>
                        <p className="text-xs text-slate-400 mt-1">{r.status_changed_at ? `updated ${fmtDay(r.status_changed_at)}` : 'waiting for the employer'}</p>
                      </td>
                    </tr>
                  ))}
                  {shown.length === 0 && <tr><td colSpan={4} className="px-5 py-8 text-center text-sm text-slate-400">None here.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
