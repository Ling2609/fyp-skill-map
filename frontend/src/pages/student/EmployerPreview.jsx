import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import api from '../../api'
import PageHeader from '../../components/PageHeader'
import BackLink from '../../components/BackLink'
import { ADMIN_COUNTS_CHANGED } from '../../components/Sidebar'
import { ApplicantCards, ApplicantHeading, NotShownYet, VersionBar } from '../../components/EmployerView'
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
  const [view, setView] = useState('sent')      // 21 Oct: after applying, what she sent or her latest profile
  useEffect(() => {
    const url = jobId ? `/applications/job/${encodeURIComponent(jobId)}/preview?view=${view}` : '/profile/preview'
    api.get(url).then(res => setData(res.data)).catch(err => setError(errText(err, "Couldn't load the preview.")))
  }, [jobId, view])
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
    <div className="flex flex-col h-[calc(100dvh-var(--bar-h))]">
      <BackLink label={jobId ? (data?.job?.title || 'the job') : 'My Profile'} onClick={back} />
      {/* the student's bar: what this page is, and the actions; everything under it is the employer's page */}
      {/* 21 Oct (her review: the solid blue was too strong): a light strip with dark text; blue only on what you can click */}
      <div className="preview-note shrink-0 mx-4 sm:mx-8 mt-1 rounded-2xl px-4 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 flex items-center gap-2.5 text-sm text-ink">
          <span className="preview-ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg></span>
          <span><b className="font-bold">Preview:</b>{' '}
          {jobId ? `this is exactly what ${company} sees when you apply.` : 'this is what employers see. When you apply for a job, they also see your match for it.'}</span></p>
        {s && (
          <div className="flex items-center gap-2.5">
            <Link to="/profile" className="acad-btn edit h-9">Edit my profile</Link>
            {jobId && (data.applied
              ? <span className="text-sm text-slate-500 border border-slate-300 bg-white px-3.5 py-1.5 rounded-lg">Already applied</span>
              : <button type="button" onClick={send} disabled={sending}
                  className="text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded-lg disabled:opacity-50">
                  {sending ? <Busy>Sending…</Busy> : 'Send application'}</button>)}
          </div>
        )}
      </div>
      {/* 21 Oct (her pick D): a thicker line, apart from the CV below */}
      <PageHeader strong>
        <div className="pb-4">
          {s ? <ApplicantHeading s={s} note={jobId ? 'Email and phone appear after you shortlist this applicant.' : ''} />
            : <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mt-2">{jobId ? `What ${company} will see` : 'Preview as employer'}</h1>}
        </div>
      </PageHeader>
      {data?.versions && <VersionBar versions={data.versions} onView={setView} you />}
      {/* 21 Oct (her pick tp.png): two panels, each scrolling on its own; narrow windows: one column, the page scrolls */}
      <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden flex flex-col">
        {error && <p role="alert" className="m-4 sm:mx-8 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5">{error}</p>}
        {!data && !error && (<div className="px-4 sm:px-8 py-5"><LoadingLabel>Loading the preview…</LoadingLabel>
          <div className="grid lg:grid-cols-[1fr_23rem] gap-4"><CardSkeleton rows={6} /><CardSkeleton rows={5} /></div></div>)}
        {s && <div className="lg:flex-1 lg:min-h-0 mx-4 sm:mx-8 mt-3 mb-4 overflow-hidden emp-tile border border-slate-200 rounded-2xl"><ApplicantCards s={s} fit={data.fit} withFit={!!jobId}
          aside={!jobId && <NotShownYet s={s} />} /></div>}
      </div>
    </div>
  )
}
