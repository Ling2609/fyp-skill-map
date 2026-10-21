import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import api from '../../api'
import PageHeader from '../../components/PageHeader'
import BackLink from '../../components/BackLink'
import { ADMIN_COUNTS_CHANGED } from '../../components/Sidebar'
import { ApplicantCards, ApplicantHeading } from '../../components/EmployerView'
import { CardSkeleton, LoadingLabel } from '../../components/Skeleton'
import { Busy } from '../../components/Spinner'
import { errText } from './profileUtils'

// 21 Oct (her idea; mock-ups r_a-r_c; research: references.md "Checking what the employer sees before applying"):
//  - /jobs/:jobId/check: before applying for a SkillMap job, what this employer will see (opened from the Apply
//    pop-up on Job Detail), with Send application;
//  - /profile/preview: "Preview as employer" from My Profile, the same without a job's match.
// 21 Oct (her review: "just give exactly what employers will see"): below a slim student bar, the employer's applicant
// page itself: the same heading and cards (components/EmployerView) from the same data (employer._profile_for), in
// the same layout, with the same note about contact details. No frame, no tips on this page.

export default function EmployerPreview() {
  const { jobId } = useParams()                 // set on /jobs/:jobId/check, absent on /profile/preview
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  useEffect(() => {
    const url = jobId ? `/applications/job/${encodeURIComponent(jobId)}/preview` : '/profile/preview'
    api.get(url).then(res => setData(res.data)).catch(err => setError(errText(err, "Couldn't load the preview.")))
  }, [jobId])
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate(jobId ? `/jobs/${encodeURIComponent(jobId)}` : '/profile'))
  const send = () => {
    setSending(true); setError('')
    api.post('/applications', { job_id: jobId })
      .then(() => { window.dispatchEvent(new Event(ADMIN_COUNTS_CHANGED)); back() })
      .catch(err => { setError(errText(err, "Couldn't send your application. Try again.")); setSending(false) })
  }
  const s = data?.student
  const company = data?.company || 'the employer'

  return (
    <div className="flex flex-col h-screen">
      <BackLink label={jobId ? (data?.job?.title || 'the job') : 'My Profile'} onClick={back} />
      {/* the student's bar: what this page is, and the actions; everything under it is the employer's page */}
      <div className="shrink-0 bg-blue-50 border-b border-blue-100 px-4 sm:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-blue-900"><b className="font-semibold">Preview:</b>{' '}
          {jobId ? `this is exactly what ${company} sees when you apply.` : 'this is what employers see. When you apply for a job, they also see your match for it.'}</p>
        {s && (
          <div className="flex items-center gap-2.5">
            <Link to="/profile" className="text-sm font-medium text-slate-700 border border-slate-300 bg-white rounded-lg px-3.5 py-1.5 hover:bg-slate-50">Edit my profile</Link>
            {jobId && (data.applied
              ? <span className="text-sm text-slate-500 bg-white border border-slate-200 px-3.5 py-1.5 rounded-lg">Already applied</span>
              : <button type="button" onClick={send} disabled={sending}
                  className="text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 px-4 py-1.5 rounded-lg disabled:opacity-50">
                  {sending ? <Busy>Sending…</Busy> : 'Send application'}</button>)}
          </div>
        )}
      </div>
      <PageHeader>
        <div className="pb-4">
          {s ? <ApplicantHeading s={s} note={jobId ? 'Email and phone appear after you shortlist this applicant.' : ''} />
            : <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mt-2">{jobId ? `What ${company} will see` : 'Preview as employer'}</h1>}
        </div>
      </PageHeader>
      <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden px-4 sm:px-8 py-5 flex flex-col gap-4">
        {error && <p role="alert" className="shrink-0 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5">{error}</p>}
        {!data && !error && (<><LoadingLabel>Loading the preview…</LoadingLabel>
          <div className="grid lg:grid-cols-3 gap-4"><CardSkeleton rows={5} /><CardSkeleton rows={4} /><CardSkeleton rows={4} /></div></>)}
        {s && <div className="flex-1 min-h-0"><ApplicantCards s={s} fit={data.fit} withFit={!!jobId} /></div>}
      </div>
    </div>
  )
}
