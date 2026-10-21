import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import api from '../../api'
import PageHeader from '../../components/PageHeader'
import { errText } from '../student/profileUtils'
import { ApplicantCards, ApplicantHeading } from '../../components/EmployerView'
import { STATUSES, STATUS_CLS, fmtDay } from './statuses'
import { useStatusChange } from './statusChange'
import { CardSkeleton, LoadingLabel } from '../../components/Skeleton'
import { Busy } from '../../components/Spinner'

// Employer > one applicant (11 Oct, batch 2; mock-up board 4). Their match for this job, each required skill with
// where it comes from (module, project, certificate), then the showcase: projects, strongest modules (grades only if
// the student allows it), certificates and awards.
// 12 Oct: also a graduate who fits one of the employer's jobs but hasn't applied (/employer/graduates/:studentId?job=):
// the same page without the status menu.
// 14 Oct (her rule; references.md "Contact details"): email, phone, city and start month only once the employer
// shortlists the applicant, so contacting someone always shows on SkillMap as a shortlist.

export default function ApplicantProfile() {
  const { appId, studentId } = useParams()
  const [params] = useSearchParams()
  const jobId = params.get('job')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [inviting, setInviting] = useState(false)

  const url = appId ? `/employer/applications/${appId}` : `/employer/graduates/${studentId}?job_id=${jobId}`
  useEffect(() => {
    api.get(url).then(res => setData(res.data)).catch(err => setError(errText(err, "Couldn't load this profile.")))
  }, [url])

  // 12 Oct: Rejected / Accepted ask first; Shortlisted / Applied change at once with Undo (statusChange.jsx).
  // 14 Oct: reloaded after a change, because shortlisting shows the contact details (and undoing hides them)
  const status = useStatusChange((id, res) => {
    setData(d => ({ ...d, application: { ...d.application, status: res.status } }))
    api.get(url).then(r => setData(r.data)).catch(() => {})
  })
  // 12 Oct (her supervisor's point): a graduate who fits can be invited to apply; they decide, their email stays private
  const invite = () => {
    setInviting(true); setError('')
    api.post('/employer/invitations', { job_id: data.job.id, student_id: Number(studentId) })
      .then(res => setData(d => ({ ...d, invited_at: res.data.invited_at })))
      .catch(err => setError(errText(err, "Couldn't send the invitation. Try again.")))
      .finally(() => setInviting(false))
  }
  const s = data?.student, fit = data?.fit

  return (
    <div className="flex flex-col h-screen">
      <PageHeader>
        <div className="pb-4 flex items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
            {data?.application && <Link to={`/employer/jobs/${data.job.id}`} className="text-sm text-slate-500 hover:text-blue-700">← Applicants for {data.job.title}</Link>}
            {data && !data.application && <Link to="/dashboard" className="text-sm text-slate-500 hover:text-blue-700">← Dashboard · fits {data.job.title}</Link>}
            {s ? <ApplicantHeading s={s} note={data.application && !s.contact ? 'Email and phone appear after you shortlist this applicant.' : ''} />
              : <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mt-2">Applicant</h1>}
            {data && !data.application && <p className="text-xs text-slate-500 mt-2">
              They haven't applied. Invite them to apply; their contact details appear only if you shortlist them.
            </p>}
          </div>
          {data?.application && (
            <div className="shrink-0 flex items-end gap-5">
            {/* 12 Oct: go on to the next application for this job still at Applied, without going back to the list */}
            {data.next_to_review && <Link to={`/employer/applications/${data.next_to_review.id}`} className="text-sm font-medium text-blue-700 hover:underline pb-2">Next to review: {data.next_to_review.name} ›</Link>}
            <label className="shrink-0 text-xs text-slate-500 flex flex-col gap-1">
              Status for this job
              <select value={data.application.status} disabled={status.busy === data.application.id}
                onChange={e => status.request({ id: data.application.id, name: s.name, status: data.application.status, job_title: data.job.title }, e.target.value)}
                className={`text-sm font-semibold border rounded-lg px-3 py-1.5 ${STATUS_CLS[data.application.status]}`}>
                {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            </div>
          )}
          {data && !data.application && (data.applied_application_id
            ? <Link to={`/employer/applications/${data.applied_application_id}`} className="shrink-0 text-sm font-medium text-blue-700 hover:underline">They applied: open the application</Link>
            : data.invited_at
              ? <span className="shrink-0 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3.5 py-2">Invited {fmtDay(data.invited_at)}</span>
              : <button onClick={invite} disabled={inviting}
                  className="shrink-0 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
                  {inviting ? <Busy>Inviting…</Busy> : 'Invite to apply'}
                </button>)}
        </div>
      </PageHeader>

      {/* 21 Oct (her review): three columns that fill the screen and end on one line; each card shows whole rows only
          (components/EmployerView). Narrow windows: one column and the page scrolls */}
      <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden px-4 sm:px-8 py-5 flex flex-col gap-4">
        {error && <p role="alert" className="shrink-0 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5">{error}</p>}
        {!data && !error && (<>
          <LoadingLabel>Loading the applicant…</LoadingLabel>
          <div className="grid lg:grid-cols-3 gap-4"><CardSkeleton rows={5} /><CardSkeleton rows={4} /><CardSkeleton rows={4} /></div>
        </>)}
        {data && <div className="flex-1 min-h-0"><ApplicantCards s={s} fit={fit} /></div>}
      </div>
      {status.ui}
    </div>
  )
}
