import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../../api'
import PageHeader from '../../components/PageHeader'
import { useAuth } from '../../context/useAuth'
import { skillName } from '../../skillName'
import { Modal, SkillChip, Spinner, Toggle } from './profileParts'
import { AboutForm, IntroForm, LinksForm } from './profileForms'
import { AwardsCard, Card, CardAction, CertsCard, ProjectsCard } from './profileSections'
import { aboutBody } from './profileUtils'
import GithubImport from './GithubImport'
import ModulesPanel from './ModulesPanel'

// My Profile (8 Oct): ONE page, edited in place (her rethink: My Profile + Skill Profile merged; clean A mock-up).
// Main column: About, Skills (each with its evidence), Education, Projects, Certifications, Honours & awards.
// Side column: the "Finish your profile" checklist (hides itself when everything is done) and Profile details
// (links + the two employer switches). Every Edit / + Add opens a pop-up; modules and grades open a wide side panel.
// Research: references.md "Showcase profile" (Ant Design "Make it Direct": edit where it is shown; Jakob's Law).

const SOURCE = { module: 'Module', project: 'Project', cert: 'Certificate', award: 'Award' }

// What the checklist asks for. Certificates and awards are left out on purpose: not every student has one.
const CHECKS = [
  { key: 'study',    label: 'Add your programme and intake', done: (d) => !!d.programme,           open: 'intro' },
  { key: 'grades',   label: 'Add your modules and grades',   done: (d) => d.module_count > 0,       open: 'modules' },
  { key: 'headline', label: 'Add a headline',                done: (d) => !!d.headline,             open: 'intro' },
  { key: 'about',    label: 'Write a short About',           done: (d) => !!d.about,                open: 'about' },
  { key: 'project',  label: 'Add a project',                 done: (d, n) => n.projects > 0,        open: 'projects' },
  { key: 'link',     label: 'Add a LinkedIn, GitHub or portfolio link',
                     done: (d) => !!(d.links.linkedin || d.links.github || d.links.portfolio),     open: 'links' },
]

function Checklist({ data, counts, onOpen }) {
  const left = CHECKS.filter(c => !c.done(data, counts))
  if (!left.length) return null      // all done: the card goes (it comes back if something is removed)
  const done = CHECKS.length - left.length
  return (
    <section className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
      <h2 className="text-sm font-semibold text-gray-800">Finish your profile</h2>
      <p className="text-xs text-gray-500 mt-0.5">{done} of {CHECKS.length} done</p>
      <div className="h-1.5 bg-white rounded-full mt-3" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={CHECKS.length}>
        <div className="h-1.5 bg-blue-600 rounded-full transition-all" style={{ width: `${(100 * done) / CHECKS.length}%` }} />
      </div>
      <ul className="mt-3 space-y-1.5">
        {left.map(c => (
          <li key={c.key}>
            <button type="button" onClick={() => onOpen(c.open)} className="text-sm text-blue-700 hover:underline text-left">→ {c.label}</button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ExternalLink({ href, children }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-700 hover:underline">{children} ↗</a>
}

// Profile details: the links, and the two switches, which save as soon as they are flipped
function DetailsCard({ data, onEditLinks, onSaved }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const flip = async (key, value) => {
    setBusy(true); setError('')
    try { await api.put('/profile/about', { ...aboutBody(data), [key]: value }); onSaved() }
    catch { setError("Couldn't save the switch. Please try again.") }
    finally { setBusy(false) }
  }
  const { links } = data
  const any = links.linkedin || links.portfolio || links.github
  return (
    <Card title="Profile details" action={<CardAction onClick={onEditLinks}>Edit links</CardAction>}>
      <p className="text-xs font-medium text-gray-500 mb-1">Links</p>
      {any ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {links.linkedin && <ExternalLink href={links.linkedin}>LinkedIn</ExternalLink>}
          {links.portfolio && <ExternalLink href={links.portfolio}>Portfolio</ExternalLink>}
          {links.github && <ExternalLink href={links.github}>GitHub</ExternalLink>}
        </div>
      ) : <p className="text-sm text-gray-500">None yet.</p>}
      <p className="text-xs font-medium text-gray-500 mt-4 mb-2">Employers</p>
      <div className="space-y-3">
        <Toggle id="flag-visible" checked={data.visible_to_employers} disabled={busy}
          onChange={v => flip('visible_to_employers', v)} label="Let employers see my profile"
          hint="Turn it off when you are not looking for a job." />
        <Toggle id="flag-grades" checked={data.show_grades_to_employers} disabled={busy}
          onChange={v => flip('show_grades_to_employers', v)} label="Show my grades to employers"
          hint="Off: they see your modules and skills, not the grades." />
      </div>
      {error && <p role="alert" className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 mt-3">{error}</p>}
    </Card>
  )
}

// "See all": every skill in the profile (GET /profile/skills, the same list Job Matches uses)
function AllSkills({ onClose }) {
  const [skills, setSkills] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api.get('/profile/skills').then(res => setSkills([...res.data.skills].sort((a, b) => a.localeCompare(b))))
      .catch(() => setError("Couldn't load your skills. Please try again."))
  }, [])
  return (
    <Modal title={skills ? `All ${skills.length} skills` : 'All skills'} onClose={onClose}>
      {error && <p role="alert" className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {!skills && !error && <div className="flex justify-center py-6 text-blue-600"><Spinner /></div>}
      {skills && (
        <>
          <p className="text-xs text-gray-500 mb-3">From your modules, projects, certificates and awards. Job matches use this list.</p>
          <div className="flex flex-wrap gap-1.5">{skills.map(s => <SkillChip key={s} skill={s} />)}</div>
        </>
      )}
    </Modal>
  )
}

export default function MyProfile() {
  const { setUser } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState(null)          // GET /profile/showcase
  const [projects, setProjects] = useState([])
  const [certs, setCerts] = useState([])
  const [awards, setAwards] = useState([])
  const [error, setError] = useState('')
  // The pop-up or panel open now: 'intro' | 'about' | 'links' | 'modules' | 'github' | 'skills' | null.
  // /profile?edit=modules opens the modules panel (the old /modules address goes there).
  const [open, setOpen] = useState(searchParams.get('edit') === 'modules' ? 'modules' : null)
  const [dirty, setDirty] = useState(false)
  const [importNote, setImportNote] = useState('')

  const load = useCallback(() => Promise.all([
    api.get('/profile/showcase'), api.get('/profile/projects'), api.get('/profile/certifications'), api.get('/profile/awards'),
  ]).then(([show, proj, cert, award]) => {
    setData(show.data); setProjects(proj.data); setCerts(cert.data); setAwards(award.data); setError('')
  }).catch(() => setError("Couldn't load your profile. Please refresh the page.")), [])

  useEffect(() => { load() }, [load])

  const close = () => {
    setOpen(null); setDirty(false)
    if (searchParams.get('edit')) setSearchParams({}, { replace: true })
  }
  const saved = () => { close(); load() }
  const openFromChecklist = (what) => {
    if (what === 'projects') document.getElementById('projects-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    else setOpen(what)
  }

  if (error && !data) return <div className="p-8"><p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p></div>
  if (!data) return <div className="p-8 flex items-center gap-3 text-sm text-slate-400"><Spinner />Loading your profile…</div>

  const initials = data.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const study = [data.programme, data.intake && `Intake ${data.intake}`].filter(Boolean).join(' · ')

  return (
    <div className="min-h-screen bg-slate-50">
      <PageHeader>
        <div className="pb-5 pt-1">
          <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-widest mb-3">My Profile</p>
          <div className="flex items-start gap-4">
            <div aria-hidden="true" className="w-14 h-14 rounded-full bg-slate-700 text-white grid place-items-center text-lg font-semibold shrink-0">{initials}</div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{data.name}</h1>
              {data.headline ? <p className="text-slate-600 mt-0.5">{data.headline}</p>
                : <button type="button" onClick={() => setOpen('intro')} className="text-sm text-blue-700 hover:underline">+ Add a headline</button>}
              <p className="text-sm text-slate-500 mt-0.5">{study || 'Programme and intake not set yet'}</p>
            </div>
            <button type="button" onClick={() => setOpen('intro')}
              className="shrink-0 text-sm font-medium px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:border-blue-300 hover:text-blue-700 transition">Edit intro</button>
          </div>
        </div>
      </PageHeader>

      <div className="px-8 py-6 grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          <Card title="About" action={<CardAction onClick={() => setOpen('about')}>{data.about ? 'Edit' : '+ Add'}</CardAction>}>
            {data.about ? <p className="text-sm text-gray-700 whitespace-pre-line">{data.about}</p>
              : <p className="text-sm text-gray-500">Tell employers a little about yourself.</p>}
          </Card>

          <Card title={<>Skills <span className="font-normal text-gray-400">· {data.total_skills}, each with its evidence</span></>}
            action={data.total_skills > 0 && <CardAction onClick={() => setOpen('skills')}>See all</CardAction>}>
            {data.top_skills.length === 0 ? (
              <p className="text-sm text-gray-500">No skills yet. They come from your modules, projects, certificates and awards.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {data.top_skills.map(s => (
                  <li key={s.name} className="py-2 first:pt-0 last:pb-0 flex justify-between gap-4">
                    <span className="text-sm font-semibold text-gray-800 shrink-0">{skillName(s.name)}</span>
                    <span className="text-xs text-gray-500 text-right">
                      {s.evidence.map(e => `${e.type === 'module' ? '' : SOURCE[e.type] + ': '}${e.label}${e.grade ? ` (${e.grade})` : ''}`).join(' · ')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Education" action={<CardAction onClick={() => setOpen('modules')}>Edit modules &amp; grades</CardAction>}>
            <p className="text-sm text-gray-800">
              {data.programme || 'Programme not set yet'}
              {data.module_count > 0 && <span className="text-gray-500"> · {data.module_count} {data.module_count === 1 ? 'module' : 'modules'} graded</span>}
            </p>
            {data.strongest_modules.length > 0 ? (
              <p className="text-xs text-gray-500 mt-1">
                Strongest: {data.strongest_modules.map(m => `${m.name}${m.grade ? ` ${m.grade}` : ''}`).join(' · ')}
              </p>
            ) : <p className="text-xs text-gray-500 mt-1">No grades yet. Your grades are the strongest evidence for your skills.</p>}
          </Card>

          <div id="projects-card" className="scroll-mt-6">
            <ProjectsCard projects={projects} onRefresh={load} onImport={() => setOpen('github')}
              importNote={importNote} onImportNoteClose={() => setImportNote('')} />
          </div>
          <CertsCard certs={certs} onRefresh={load} />
          <AwardsCard awards={awards} onRefresh={load} />
        </div>

        <div className="space-y-5 min-w-0 lg:sticky lg:top-6">
          <Checklist data={data} counts={{ projects: projects.length }} onOpen={openFromChecklist} />
          <DetailsCard data={data} onEditLinks={() => setOpen('links')} onSaved={load} />
        </div>
      </div>

      {open === 'intro' && (
        <Modal title="Edit intro" dirty={dirty} onClose={close}>
          <IntroForm data={data} onDirty={setDirty} onCancel={close}
            onDone={(study) => { if (study) setUser(u => ({ ...u, ...study })); saved() }} />
        </Modal>
      )}
      {open === 'about' && (
        <Modal title="About" dirty={dirty} onClose={close}>
          <AboutForm data={data} onDirty={setDirty} onCancel={close} onDone={saved} />
        </Modal>
      )}
      {open === 'links' && (
        <Modal title="Edit links" dirty={dirty} onClose={close}>
          <LinksForm data={data} onDirty={setDirty} onCancel={close} onDone={saved} />
        </Modal>
      )}
      {open === 'skills' && <AllSkills onClose={close} />}
      {open === 'modules' && <ModulesPanel onClose={close} onSaved={load} />}
      {open === 'github' && (
        <GithubImport githubLink={data.links.github} onClose={close}
          onDone={(note) => { setImportNote(note); saved() }} />
      )}
    </div>
  )
}
