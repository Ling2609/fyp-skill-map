import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../../api'
import PageHeader from '../../components/PageHeader'
import { useAuth } from '../../context/useAuth'
import { Modal, Spinner } from './profileParts'
import { ProfileForm, StudyForm } from './profileForms'
import { AwardsTab, CertsTab, ModulesTab, ProjectsTab } from './profileSections'
import { btnCls } from './profileUtils'
import GithubImport from './GithubImport'
import ModulesPanel from './ModulesPanel'

// My Profile (9 Oct, her design): the page where a student puts things in. Four tabs, the four places her skills come
// from: Modules, Projects, Certificates, Awards. What SkillMap works out from them (matches, skills to learn) is on the
// Dashboard and Job Matches, not here. Edit profile (far right) = links to her other profiles + profile visibility.
// Research: references.md "Showcase profile" and "Profile layout with many categories" (NN/g tabs, Handshake).

const TABS = [
  { key: 'modules', label: 'Modules' },
  { key: 'projects', label: 'Projects' },
  { key: 'certs', label: 'Certificates' },
  { key: 'awards', label: 'Awards' },
]

function VisibilityPill({ on }) {
  return on
    ? <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">● Visible to employers</span>
    : <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">Hidden from employers</span>
}

export default function MyProfile() {
  const { setUser } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState(null)          // GET /profile/showcase: name, links, programme, counts
  const [projects, setProjects] = useState([])
  const [certs, setCerts] = useState([])
  const [awards, setAwards] = useState([])
  const [error, setError] = useState('')
  // ?tab=projects opens that tab; ?edit=modules opens the modules panel (first sign-in, the old /modules address)
  const [tab, setTab] = useState(() => TABS.some(t => t.key === searchParams.get('tab')) ? searchParams.get('tab') : 'modules')
  const [open, setOpen] = useState(searchParams.get('edit') === 'modules' ? 'modules' : null)   // 'profile' | 'study' | 'modules' | 'github'
  const [dirty, setDirty] = useState(false)
  const [importNote, setImportNote] = useState('')
  const [modulesVersion, setModulesVersion] = useState(0)

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

  if (error && !data) return <div className="p-8"><p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p></div>
  if (!data) return <div className="p-8 flex items-center gap-3 text-sm text-slate-400"><Spinner />Loading your profile…</div>

  const count = { modules: data.module_count, projects: projects.length, certs: certs.length, awards: awards.length }
  const { links } = data
  const linkList = [['LinkedIn', links.linkedin], ['GitHub', links.github], ['Portfolio', links.portfolio]].filter(([, url]) => url)

  return (
    // Wide screens: the page fills the window and only the open tab's list scrolls; narrow: the page scrolls
    <div className="min-h-screen lg:h-screen bg-slate-50 flex flex-col">
      <PageHeader>
        <div className="flex flex-wrap items-start justify-between gap-4 pt-1">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-widest mb-2">My Profile</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{data.name}</h1>
              <VisibilityPill on={data.visible_to_employers} />
            </div>
            <p className="text-sm text-slate-500 mt-1">
              {data.total_skills} {data.total_skills === 1 ? 'skill' : 'skills'} from your modules, projects, certificates and awards
              {linkList.map(([label, url]) => (
                <span key={label}> · <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">{label} ↗</a></span>
              ))}
            </p>
          </div>
          <button type="button" onClick={() => setOpen('profile')} className={`${btnCls} shrink-0`}>Edit profile</button>
        </div>
        {/* Tabs wrap onto a second line on a narrow window: never a sideways scrollbar (her request 8 Oct) */}
        <div role="tablist" aria-label="Profile sections" className="flex flex-wrap gap-x-6 mt-4">
          {TABS.map(t => {
            const active = tab === t.key
            return (
              <button key={t.key} type="button" role="tab" aria-selected={active} onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors ${active
                  ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-200'}`}>
                {t.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium tabular-nums ${active ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                  {count[t.key]}
                </span>
              </button>
            )
          })}
        </div>
      </PageHeader>

      <div className="flex-1 min-h-0 px-8 py-6">
        {tab === 'modules' && (
          <ModulesTab data={data} version={modulesVersion} onEditGrades={() => setOpen('modules')} onChangeStudy={() => setOpen('study')} />
        )}
        {tab === 'projects' && (
          <ProjectsTab projects={projects} onRefresh={load} onImport={() => setOpen('github')}
            importNote={importNote} onImportNoteClose={() => setImportNote('')} />
        )}
        {tab === 'certs' && <CertsTab certs={certs} onRefresh={load} />}
        {tab === 'awards' && <AwardsTab awards={awards} onRefresh={load} />}
      </div>

      {open === 'profile' && (
        <Modal title="Edit profile" dirty={dirty} onClose={close}>
          <ProfileForm data={data} onDirty={setDirty} onCancel={close} onDone={saved} />
        </Modal>
      )}
      {open === 'study' && (
        <Modal title="Change programme" dirty={dirty} onClose={close}>
          <StudyForm onDirty={setDirty} onCancel={close}
            onDone={(study) => { setUser(u => ({ ...u, ...study })); saved() }} />
        </Modal>
      )}
      {open === 'modules' && (
        <ModulesPanel onClose={close} onSaved={() => { load(); setModulesVersion(v => v + 1); setTab('modules') }} />
      )}
      {open === 'github' && (
        <GithubImport githubLink={links.github} onClose={close}
          onDone={(note) => { setImportNote(note); setTab('projects'); saved() }} />
      )}
    </div>
  )
}
