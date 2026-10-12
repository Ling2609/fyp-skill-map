import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import api from '../../api'
import PageHeader from '../../components/PageHeader'
import { ADMIN_COUNTS_CHANGED } from '../../components/Sidebar'
import { errText } from '../student/profileUtils'
import { STATUSES, STATUS_CLS } from './statuses'

// Employer > one applicant (11 Oct, batch 2; mock-up board 4). Their match for this job, each required skill with
// where it comes from (module, project, certificate), then the showcase: projects, strongest modules (grades only if
// the student allows it), certificates and awards.
// 12 Oct: also a graduate who fits one of the employer's jobs but hasn't applied (/employer/graduates/:studentId?job=):
// the same page without the status menu and without the email (only applying shares it).
const card = 'bg-white border border-slate-200 rounded-2xl p-5'

export default function ApplicantProfile() {
  const { appId, studentId } = useParams()
  const [params] = useSearchParams()
  const jobId = params.get('job')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const url = appId ? `/employer/applications/${appId}` : `/employer/graduates/${studentId}?job_id=${jobId}`
    api.get(url).then(res => setData(res.data)).catch(err => setError(errText(err, "Couldn't load this profile.")))
  }, [appId, studentId, jobId])

  const setStatus = (status) => {
    setSaving(true); setError('')
    api.patch(`/employer/applications/${appId}`, { status })
      .then(res => { setData(d => ({ ...d, application: { ...d.application, status: res.data.status } })); window.dispatchEvent(new Event(ADMIN_COUNTS_CHANGED)) })
      .catch(err => setError(errText(err, "Couldn't change the status. Try again.")))
      .finally(() => setSaving(false))
  }
  const s = data?.student, fit = data?.fit
  const links = s ? [['GitHub', s.links?.github], ['LinkedIn', s.links?.linkedin], ['Portfolio', s.links?.portfolio]].filter(([, u]) => u) : []

  return (
    <div className="flex flex-col min-h-screen">
      <PageHeader>
        <div className="pb-5 flex items-end justify-between gap-4">
          <div className="min-w-0">
            {data?.application && <Link to={`/employer/jobs/${data.job.id}`} className="text-sm text-slate-500 hover:text-blue-700">← Applicants for {data.job.title}</Link>}
            {data && !data.application && <Link to="/dashboard" className="text-sm text-slate-500 hover:text-blue-700">← Dashboard · fits {data.job.title}</Link>}
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mt-2">{s?.name || 'Applicant'}</h1>
            {s && <p className="text-sm text-slate-500 mt-1">
              {s.programme_line}
              {links.map(([label, url]) => <span key={label}> · <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">{label} ↗</a></span>)}
              {s.email && <> · <a href={`mailto:${s.email}`} className="text-blue-700 hover:underline">{s.email}</a></>}
            </p>}
            {s?.headline && <p className="text-sm text-slate-700 mt-1">{s.headline}</p>}
            {data && !data.application && <p className="text-xs text-slate-500 mt-2">
              They haven't applied, so their email isn't shared{links.length ? '. You can reach them through the links above.' : '.'}
            </p>}
          </div>
          {data?.application && (
            <label className="shrink-0 text-xs text-slate-500 flex flex-col gap-1">
              Status for this job
              <select value={data.application.status} disabled={saving} onChange={e => setStatus(e.target.value)}
                className={`text-sm font-semibold border rounded-lg px-3 py-1.5 ${STATUS_CLS[data.application.status]}`}>
                {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          )}
        </div>
      </PageHeader>

      <div className="flex-1 px-8 py-6 flex flex-wrap items-start gap-5">
        {error && <p role="alert" className="w-full text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5">{error}</p>}
        {!data && !error && <p className="text-sm text-slate-400">Loading…</p>}
        {data && (
          <>
            <section className={`${card} flex-[1.3] basis-[26rem] min-w-80`}>
              <h2 className="text-[15px] font-semibold text-slate-900">
                {fit ? `For this job: ${fit.have} of ${fit.total} required skills` : 'For this job'}
              </h2>
              {fit ? (
                <>
                  <p className="text-xs text-slate-500 mt-0.5 mb-3">Each skill with where it comes from.
                    {fit.nice_missing.length > 0 && ` Nice to have, not yet: ${fit.nice_missing.join(', ')}.`}</p>
                  <ul className="divide-y divide-slate-100">
                    {fit.matched.map(m => (
                      <li key={m.skill} className="py-2.5 flex items-start gap-3">
                        <span className="text-emerald-600 font-bold" aria-hidden="true">✓</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900">{m.skill}</p>
                          <p className="text-xs text-slate-500">{m.source === 'module' ? `Module: ${m.from}` : m.from}{m.grade && `, ${m.grade}`}</p>
                        </div>
                        {m.source !== 'module' && <span className="ml-auto text-[11px] text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">Self-declared</span>}
                      </li>
                    ))}
                    {fit.missing.map(name => (
                      <li key={name} className="py-2.5 flex items-start gap-3">
                        <span className="text-slate-300 font-bold" aria-hidden="true">–</span>
                        <p className="text-sm text-slate-500">{name} <span className="text-xs">· not in their record yet</span></p>
                      </li>
                    ))}
                  </ul>
                </>
              ) : <p className="text-sm text-slate-500 mt-1">This student's profile has no skills to compare at the moment.</p>}
            </section>

            <div className="flex-1 basis-80 min-w-80 flex flex-col gap-5">
              {s.about && <section className={card}><h2 className="text-[15px] font-semibold text-slate-900 mb-1">About</h2><p className="text-sm text-slate-600 whitespace-pre-line">{s.about}</p></section>}
              <section className={card}>
                <h2 className="text-[15px] font-semibold text-slate-900">Projects</h2>
                {s.projects.length === 0 && <p className="text-sm text-slate-400 mt-1">None added.</p>}
                <ul className="mt-2 flex flex-col gap-3">
                  {s.projects.map(p => (
                    <li key={p.name}>
                      <p className="text-sm font-medium text-slate-900">{p.name}
                        {p.github_url && <a href={p.github_url} target="_blank" rel="noopener noreferrer" className="ml-2 text-xs font-normal text-blue-700 hover:underline">GitHub ↗</a>}</p>
                      {p.skills.length > 0 && <p className="text-xs text-slate-500 mt-0.5">{p.skills.join(' · ')}</p>}
                    </li>
                  ))}
                </ul>
              </section>
              <section className={card}>
                <h2 className="text-[15px] font-semibold text-slate-900">Strongest modules</h2>
                <p className="text-xs text-slate-500 mt-0.5">{s.show_grades_to_employers ? 'Grades shown because the student allows it.' : "The student doesn't share grades."}</p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {s.strongest_modules.map(m => (
                    <li key={m.name} className="flex justify-between gap-3 text-sm text-slate-700"><span>{m.name}</span>{m.grade && <span className="font-semibold">{m.grade}</span>}</li>
                  ))}
                </ul>
              </section>
              {(s.certifications.length > 0 || s.awards.length > 0) && (
                <section className={card}>
                  <h2 className="text-[15px] font-semibold text-slate-900">Certificates and awards</h2>
                  <ul className="mt-2 flex flex-col gap-1.5 text-sm text-slate-700">
                    {s.certifications.map(c => <li key={`c${c.name}`} className="flex justify-between gap-3"><span>{c.name}</span><span className="text-xs text-slate-400">Certificate</span></li>)}
                    {s.awards.map(a => <li key={`a${a.title}`} className="flex justify-between gap-3"><span>{a.title}</span><span className="text-xs text-slate-400">Award</span></li>)}
                  </ul>
                </section>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
