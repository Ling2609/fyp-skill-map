import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../../api'
import PageHeader from '../../components/PageHeader'
import BackLink from '../../components/BackLink'
import { errText } from '../student/profileUtils'
import { STATUSES, STATUS_CLS, fmtDay } from './statuses'
import { useStatusChange } from './statusChange'
import ConfirmDecision from './ConfirmDecision'
import { ADMIN_COUNTS_CHANGED } from '../../components/Sidebar'
import { CardSkeleton, LoadingLabel } from '../../components/Skeleton'

// Employer > one job's applicants (11 Oct, batch 2; her pick 3A "applicants as a list"). Best match first: the
// share of the job's required skills each student has, the same match the student sees. Changing a status shows on
// the student's My Applications page.
// 14 Oct (transparency flow): tick several -> Not selected (21 Oct: or Shortlist) with one optional reason (each student sees their own
// missing skills for "missing skills"); the decision date and the numbers students see are in the header; contact
// details appear only after shortlisting.
const WAITING = ['applied', 'shortlisted']

export default function Applicants() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('all')
  const [error, setError] = useState('')
  const [picked, setPicked] = useState([])          // application ids ticked
  const [askMany, setAskMany] = useState(null)      // 'rejected' | 'shortlisted': the action being confirmed
  const [savingMany, setSavingMany] = useState(false)
  const [notice, setNotice] = useState('')

  const load = () => api.get(`/employer/jobs/${jobId}/applicants`).then(res => setData(res.data))
    .catch(err => setError(errText(err, "Couldn't load the applicants.")))
  useEffect(() => { load() }, [jobId])   // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id) => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  // 21 Oct (her question): Shortlist several as well as Not selected (references.md "Actions on several applicants
  // at once"); only those still at Applied are shortlisted, and it asks first because contact details are shared
  const toShortlist = (data?.applicants || []).filter(p => picked.includes(p.id) && p.status === 'applied').length
  const many = (why) => {
    const st = askMany
    setSavingMany(true)
    api.post('/employer/applications/bulk', { ids: picked, status: st, ...(st === 'rejected' ? why : {}) })
      .then(res => {
        const n = res.data.updated
        setNotice(st === 'rejected'
          ? `${n} marked Not selected. They see it on My Applications${why.reason ? ', with your reason' : ''}.`
          : `${n} shortlisted. Their email and phone now show on their profiles.`)
        setPicked([]); setAskMany(null); load(); window.dispatchEvent(new Event(ADMIN_COUNTS_CHANGED))
      })
      .catch(err => { setAskMany(null); setError(errText(err, "Couldn't save. Try again.")) })
      .finally(() => setSavingMany(false))
  }

  // 12 Oct: Rejected / Accepted ask first; Shortlisted / Applied change at once with Undo (statusChange.jsx)
  const status = useStatusChange((id, res) =>
    setData(d => ({ ...d, applicants: d.applicants.map(x => x.id === id ? { ...x, ...res } : x) })))

  const people = data?.applicants || []
  const count = (s) => people.filter(p => s === 'all' || p.status === s).length
  const shown = people.filter(p => tab === 'all' || p.status === tab)
  const job = data?.job

  return (
    <div className="flex flex-col h-screen">
      {/* 21 Oct (her review: every back link the same, near the left edge) */}
      <BackLink label="My Jobs" onClick={() => navigate('/employer/jobs')} />
      <PageHeader>
        <div className="pb-5">
          <div className="flex items-center gap-3 mt-1">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{job?.title || 'Applicants'}</h1>
            {job && <span className={`text-xs font-medium border rounded-full px-2.5 py-0.5 ${job.status === 'open'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>{job.status === 'open' ? 'Open' : 'Closed'}</span>}
          </div>
          {job && <p className="text-sm text-slate-500 mt-1">
            {[job.location, `posted ${fmtDay(job.posted_at)}`].filter(Boolean).join(' · ')}
            {job.required_names?.length > 0 && ` · requires ${job.required_names.join(', ')}`}
          </p>}
          {job?.decide_by && <p className={`text-sm mt-1 ${job.past_date ? 'text-rose-700 font-medium' : 'text-slate-700'}`}>
            {job.past_date ? `Your decision date (${fmtDay(job.decide_by)}) has passed: applicants still waiting see "No decision".`
              : `Decide by ${fmtDay(job.decide_by)}`}{job.stopped && ' · Not taking new applications'}
          </p>}
        </div>
      </PageHeader>

      <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6 flex flex-col gap-4">
        {error && <p role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5">{error}</p>}
        {!data && !error && <><LoadingLabel>Loading applicants…</LoadingLabel><CardSkeleton rows={5} /></>}
        {data && people.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
            <h2 className="text-base font-semibold text-slate-900">No applicants yet</h2>
            <p className="text-sm text-slate-500 mt-1">Students see this job in Job Matches, marked "Apply on SkillMap", and apply with their SkillMap profile.</p>
          </div>
        )}
        {notice && <p role="status" className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5">{notice}</p>}
        {people.length > 0 && (
          <>
            <div role="tablist" className="flex flex-wrap gap-2">
              {[['all', 'All'], ...STATUSES].map(([key, text]) => (
                <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
                  className={`text-sm font-medium px-3.5 py-1.5 rounded-full border ${tab === key
                    ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'}`}>{text} {count(key)}</button>
              ))}
            </div>
            {picked.length > 0 && (
              <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-sm">
                <span className="font-medium text-slate-800">{picked.length} selected</span>
                {toShortlist > 0 && (
                  <button type="button" onClick={() => setAskMany('shortlisted')}
                    className="ml-auto text-sm font-medium px-3.5 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700">Shortlist{toShortlist < picked.length ? ` ${toShortlist}` : ''}</button>
                )}
                <button type="button" onClick={() => setAskMany('rejected')}
                  className={`${toShortlist > 0 ? '' : 'ml-auto '}text-sm font-medium px-3.5 py-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700`}>Mark as Not selected</button>
                <button type="button" onClick={() => setPicked([])} className="text-sm text-slate-600 hover:text-slate-900">Clear</button>
              </div>
            )}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <tr><th className="pl-5 py-3 w-8"><span className="sr-only">Select</span></th><th className="px-5 py-3">Student</th><th className="px-5 py-3">Required skills they have</th>
                    <th className="px-5 py-3">Applied</th><th className="px-5 py-3">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shown.map(p => {
                    const full = p.total > 0 && p.have === p.total
                    return (
                      <tr key={p.id} onClick={() => navigate(`/employer/applications/${p.id}`)} className="cursor-pointer hover:bg-blue-50/40">
                        <td className="pl-5 py-3.5" onClick={e => e.stopPropagation()}>
                          {WAITING.includes(p.status) && (
                            <input type="checkbox" aria-label={`Select ${p.name}`} checked={picked.includes(p.id)} onChange={() => toggle(p.id)}
                              className="w-4 h-4 accent-blue-700" />
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          {/* 12 Oct: an application not opened yet reads bold with "Not opened", like an unread email
                              (DfE design history: a bold row for messages not viewed) */}
                          <p className={`text-slate-900 ${p.opened ? 'font-medium' : 'font-bold'}`}>
                            {p.name}
                            {!p.opened && <span className="ml-2 text-[11px] font-semibold text-blue-700">Not opened</span>}
                            {p.invited && <span className="ml-2 text-[11px] font-semibold text-violet-700 bg-violet-50 rounded-full px-2 py-0.5">Invited</span>}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">{p.programme}</p>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`text-xs font-semibold rounded-full px-2.5 py-0.5 ${full ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
                            {p.have} of {p.total}
                          </span>
                          {p.missing.length > 0 && <span className="ml-2 text-xs text-slate-500">missing {p.missing.join(', ')}</span>}
                        </td>
                        <td className="px-5 py-3.5 text-slate-600">{fmtDay(p.applied_at)}</td>
                        <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                          <select aria-label={`Status for ${p.name}`} value={p.status} disabled={status.busy === p.id}
                            onChange={e => status.request({ ...p, job_title: job.title }, e.target.value)}
                            className={`text-xs font-semibold border rounded-full pl-2.5 pr-7 py-1 ${STATUS_CLS[p.status]}`}>
                            {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        </td>
                      </tr>
                    )
                  })}
                  {shown.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-slate-400">None here.</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500">Best match first. The student sees each status on their "My Applications" page (Rejected shows as "Not selected"). Email and phone appear after you shortlist someone.</p>
          </>
        )}
      </div>
      {status.ui}
      {askMany === 'rejected' && <ConfirmDecision d={{ action: 'Mark as Not selected', danger: true }} busy={savingMany}
        title={`Mark ${picked.length} ${picked.length === 1 ? 'applicant' : 'applicants'} as Not selected?`}
        text={<>They will see <b>"Not selected"</b> for {job.title} on their My Applications page straight away.</>}
        onConfirm={many} onCancel={() => setAskMany(null)} />}
      {askMany === 'shortlisted' && <ConfirmDecision d={{ action: 'Shortlist' }} busy={savingMany}
        title={`Shortlist ${toShortlist} ${toShortlist === 1 ? 'applicant' : 'applicants'}?`}
        text={<>They will see <b>"Shortlisted"</b> for {job.title} on their My Applications page, and their email and
          phone will show on their profiles for you.{toShortlist < picked.length ? ' Only the ones still at Applied are shortlisted.' : ''}</>}
        onConfirm={many} onCancel={() => setAskMany(null)} />}
    </div>
  )
}
