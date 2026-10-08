import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api'
import PageHeader from '../../components/PageHeader'
import { skillName } from '../../skillName'
import { monthLabel } from './profileUtils'

// My Profile (8 Oct, Mr Au: one profile like LinkedIn that shows the student's skills and strong points).
// Read-only: everything comes from what was already entered (Account settings, Skill Profile), via one request,
// GET /profile/showcase (backend app/services/showcase.py). The difference from LinkedIn: each top skill lists its
// evidence (module + grade, project, certificate, award). Employers will see this same page when a student applies.

const SOURCE = { module: 'Module', project: 'Project', cert: 'Certificate', award: 'Award' }

function Card({ title, edit, children }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
        {edit && <Link to={`/profile?tab=${edit}`} className="text-xs font-medium text-blue-700 hover:underline">Edit</Link>}
      </div>
      {children}
    </section>
  )
}

// Nothing added yet: say where to add it, instead of an empty card
function Empty({ text, tab, action }) {
  return (
    <p className="text-sm text-gray-500">
      {text} <Link to={`/profile?tab=${tab}`} className="text-blue-700 font-medium hover:underline">{action}</Link>
    </p>
  )
}

function ExternalLink({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-sm text-slate-700 border border-slate-200 rounded-lg px-2.5 py-1 hover:border-blue-300 hover:text-blue-700">
      {children} <span aria-hidden="true" className="text-slate-400">↗</span>
    </a>
  )
}

export default function MyProfile() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/profile/showcase')
      .then(res => setData(res.data))
      .catch(() => setError("Couldn't load your profile. Please refresh the page."))
  }, [])

  if (error) return <div className="p-8"><p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p></div>
  if (!data) return <div className="p-8 text-sm text-slate-400">Loading your profile…</div>

  const initials = data.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const { links } = data
  const study = [data.programme, data.intake && `Intake ${data.intake}`].filter(Boolean).join(' · ')

  return (
    <div className="min-h-screen bg-slate-50">
      <PageHeader>
        <div className="pb-5 pt-1">
          <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-widest mb-3">My Profile</p>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0">
              <div aria-hidden="true" className="w-14 h-14 rounded-full bg-slate-700 text-white grid place-items-center text-lg font-semibold shrink-0">{initials}</div>
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{data.name}</h1>
                {data.headline
                  ? <p className="text-slate-600 mt-0.5">{data.headline}</p>
                  : <Link to="/profile?tab=about" className="text-sm text-blue-700 hover:underline">+ Add a headline</Link>}
                {study && <p className="text-sm text-slate-500 mt-0.5">{study}</p>}
                {(links.linkedin || links.portfolio || links.github) && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {links.linkedin && <ExternalLink href={links.linkedin}>LinkedIn</ExternalLink>}
                    {links.portfolio && <ExternalLink href={links.portfolio}>Portfolio</ExternalLink>}
                    {links.github && <ExternalLink href={links.github}>GitHub</ExternalLink>}
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${data.visible_to_employers ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {data.visible_to_employers ? '● Visible to employers' : 'Hidden from employers'}
              </span>
              <Link to="/profile?tab=about"
                className="text-sm font-medium px-4 py-2 rounded-xl bg-blue-700 text-white hover:bg-blue-800 transition">Edit profile</Link>
            </div>
          </div>
        </div>
      </PageHeader>

      <div className="px-8 py-6 grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          <Card title="About" edit="about">
            {data.about
              ? <p className="text-sm text-gray-700 whitespace-pre-line">{data.about}</p>
              : <Empty text="Tell employers a little about yourself." tab="about" action="Add About" />}
          </Card>

          <Card title="Top skills">
            {data.top_skills.length === 0 ? (
              <Empty text="No skills yet. They come from your modules, projects, certificates and awards." tab="modules" action="Add modules" />
            ) : (
              <>
                <p className="text-xs text-gray-500 -mt-1 mb-3">Each skill shows where it was found. Skills found in more places come first.</p>
                <ul className="grid sm:grid-cols-2 gap-2">
                  {data.top_skills.map(s => (
                    <li key={s.name} className="border border-gray-200 rounded-xl px-3 py-2.5">
                      <p className="text-sm font-semibold text-gray-800">{skillName(s.name)}</p>
                      <ul className="mt-1 space-y-0.5">
                        {s.evidence.map((e, i) => (
                          <li key={i} className="text-xs text-gray-500">
                            {SOURCE[e.type]}: {e.label}{e.grade && <span className="text-gray-700 font-medium"> ({e.grade})</span>}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
                {data.total_skills > data.top_skills.length && (
                  <Link to="/profile" className="inline-block text-xs font-medium text-blue-700 hover:underline mt-3">
                    See all {data.total_skills} skills in Skill Profile →
                  </Link>
                )}
              </>
            )}
          </Card>

          <Card title="Projects" edit="projects">
            {data.projects.length === 0 ? <Empty text="No projects yet." tab="projects" action="Add a project" /> : (
              <ul className="divide-y divide-gray-100">
                {data.projects.map((p, i) => (
                  <li key={i} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-800">{p.name}</p>
                      {p.github_url && <a href={p.github_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">GitHub ↗</a>}
                    </div>
                    <p className="text-sm text-gray-600 mt-1 line-clamp-3">{p.description}</p>
                    {p.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {p.skills.map(s => <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">{skillName(s)}</span>)}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5 min-w-0">
          <Card title="Education" edit="modules">
            <p className="text-sm font-semibold text-gray-800">{data.programme || 'Programme not set yet'}</p>
            {data.intake && <p className="text-xs text-gray-500 mt-0.5">Intake {data.intake}</p>}
            {data.strongest_modules.length > 0 ? (
              <>
                <p className="text-xs font-medium text-gray-500 mt-3 mb-1.5">Strongest modules</p>
                <ul className="space-y-1">
                  {data.strongest_modules.map(m => (
                    <li key={m.name} className="flex justify-between gap-3 text-sm text-gray-700">
                      <span className="min-w-0">{m.name}</span>
                      {m.grade && <span className="font-medium tabular-nums shrink-0">{m.grade}</span>}
                    </li>
                  ))}
                </ul>
                {!data.show_grades_to_employers && <p className="text-[11px] text-gray-400 mt-2">Grades are hidden from employers (change it in About &amp; links).</p>}
              </>
            ) : <div className="mt-2"><Empty text="No modules yet." tab="modules" action="Add your modules" /></div>}
          </Card>

          <Card title="Certifications" edit="certs">
            {data.certifications.length === 0 ? <Empty text="No certifications yet." tab="certs" action="Add a certificate" /> : (
              <ul className="space-y-2">
                {data.certifications.map((c, i) => (
                  <li key={i} className="text-sm">
                    <span className="font-medium text-gray-800">{c.name}</span>
                    <span className="text-gray-500"> · {c.issuer}</span>
                    {c.credly_url && <a href={c.credly_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline ml-2">Credly ↗</a>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Honours & awards" edit="awards">
            {data.awards.length === 0 ? <Empty text="No awards yet." tab="awards" action="Add an award" /> : (
              <ul className="space-y-3">
                {data.awards.map((a, i) => (
                  <li key={i} className="text-sm">
                    <p className="font-medium text-gray-800">{a.title}</p>
                    <p className="text-xs text-gray-500">{a.issuer}{a.date && ` · ${monthLabel(a.date)}`}</p>
                    {a.description && <p className="text-gray-600 mt-1">{a.description}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
