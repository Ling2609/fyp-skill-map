import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../../api'
import PageHeader from '../../components/PageHeader'
import ProfileTracker from '../../components/ProfileTracker'
import { doneFrom } from '../../components/profileDone'
import { useAuth } from '../../context/useAuth'
import { Modal } from './profileParts'
import { StudyForm } from './profileForms'
import { softBtnCls } from './profileUtils'
import { AwardsTab, CertsTab, ExperienceTab, ModulesTab, ProjectsTab } from './profileSections'
import GithubImport from './GithubImport'
import { Bar, RowSkeleton, LoadingLabel } from '../../components/Skeleton'
import Popconfirm from '../../components/Popconfirm'

// My Profile (9 Oct, her design): the page where a student puts things in. Four tabs, the four places her skills come
// from: Modules, Projects, Certificates, Awards. What SkillMap works out from them (matches, skills to learn) is on the
// Dashboard and Job Matches, not here. "Profile & privacy" (a page since 21 Oct) = About you, languages, CGPA,
// contact, other profiles and who can see the profile. 21 Oct: a fifth tab, Experience (work and activities).
// Research: references.md "Showcase profile" and "Profile layout with many categories" (NN/g tabs, Handshake).

const TABS = [
  { key: 'modules', label: 'Modules' },
  { key: 'projects', label: 'Projects' },
  { key: 'experience', label: 'Experience' },        // 21 Oct: work experience and activities
  { key: 'certs', label: 'Certificates' },
  { key: 'awards', label: 'Awards' },
]

function VisibilityPill({ on }) {
  return on
    ? <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">● Visible to employers</span>
    : <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">● Hidden from employers</span>
}

export default function MyProfile() {
  const { setUser } = useAuth()
  // 20 Oct (her bug report): bumped after a programme/intake change so the module grid loads the new list
  const [studyVersion, setStudyVersion] = useState(0)
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState(null)          // GET /profile/showcase: name, links, programme, counts
  const [projects, setProjects] = useState([])
  const [certs, setCerts] = useState([])
  const [awards, setAwards] = useState([])
  const [experiences, setExperiences] = useState([])
  const navigate = useNavigate()
  const [error, setError] = useState('')
  // ?tab=projects opens that tab (first sign-in and the old /modules address use ?tab=modules)
  const [tab, setTab] = useState(() => TABS.some(t => t.key === searchParams.get('tab')) ? searchParams.get('tab') : 'modules')
  // ?open=import: back from GitHub's sign-in (14 Oct, Connect GitHub) to the pop-up it started from. ?open=links (the
  // old "Links & visibility" pop-up) now goes to the Profile & privacy page (21 Oct)
  const [open, setOpen] = useState(() => ({ import: 'github' })[searchParams.get('open')] || null)
  useEffect(() => {
    if (searchParams.get('open') === 'links') navigate(`/profile/settings${searchParams.get('github') ? `?github=${encodeURIComponent(searchParams.get('github'))}` : ''}`, { replace: true })
  }, [searchParams, navigate])
  const [githubNote, setGithubNote] = useState(searchParams.get('github') || '')   // "GitHub connected as …"
  const [githubLinked] = useState(() => Number(searchParams.get('linked') || 0))   // projects now shown as hers (said only if > 0); kept after the address is tidied
  const [githubAccounts, setGithubAccounts] = useState(0)
  const [gradesUnsaved, setGradesUnsaved] = useState(false)   // the Modules tab has grades not saved yet
  const [dirty, setDirty] = useState(false)
  const [importNote, setImportNote] = useState('')

  const load = useCallback(() => Promise.all([
    api.get('/profile/showcase'), api.get('/profile/projects'), api.get('/profile/certifications'), api.get('/profile/awards'),
    api.get('/profile/github/accounts').catch(() => ({ data: { accounts: [] } })), api.get('/profile/experiences'),
  ]).then(([show, proj, cert, award, gh, exp]) => {
    setData(show.data); setProjects(proj.data); setCerts(cert.data); setAwards(award.data); setExperiences(exp.data); setError('')
    setGithubAccounts(gh.data.accounts.length)
  }).catch(() => setError("Couldn't load your profile. Please refresh the page.")), [])

  useEffect(() => { load() }, [load])
  // The return address from GitHub isn't kept: a refresh mustn't open the pop-up again
  useEffect(() => {
    if (searchParams.get('open') || searchParams.get('github') || searchParams.get('linked')) {
      const keep = searchParams.get('tab')
      setSearchParams(keep ? { tab: keep } : {}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const close = () => { setOpen(null); setDirty(false) }

  // Leaving the Modules tab, or the page, with grades not saved asks first (as the old Skill Profile did, 4 Oct)
  // 20 Oct (her guide on pop-ups): asked in SkillMap's own small confirm beside the tabs, not the browser's grey box.
  // (Closing or reloading the browser tab still uses the browser's own warning: browsers allow no other.)
  const [leaveTo, setLeaveTo] = useState(null)
  const chooseTab = (key, sure = false) => {
    if (key === tab) return
    if (gradesUnsaved && !sure) { setLeaveTo(key); return }
    setLeaveTo(null)
    setGradesUnsaved(false)
    setTab(key)
    setSearchParams(key === 'modules' ? {} : { tab: key }, { replace: true })
  }
  useEffect(() => {
    const onLeave = (e) => { if (gradesUnsaved) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [gradesUnsaved])
  const saved = () => { close(); load() }

  if (error && !data) return <div className="p-8"><p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p></div>
  if (!data) return <ProfileSkeleton />

  const count = { modules: data.module_count, projects: projects.length, experience: experiences.length, certs: certs.length, awards: awards.length }
  const { links } = data
  const linkList = [['LinkedIn', links.linkedin], ['GitHub', links.github], ['Portfolio', links.portfolio]].filter(([, url]) => url)

  return (
    // Wide screens: the page fills the window and only the open tab's list scrolls; narrow: the page scrolls
    <div className="min-h-screen lg:h-screen bg-slate-50 flex flex-col">
      <PageHeader>
        <div className="pt-1 pb-4">
          <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-widest mb-2">My Profile</p>
          {/* One line about you: name, links, visibility; "Links & visibility" at its right end (her layout, 9 Oct) */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{data.name}</h1>
              {linkList.map(([label, url]) => (
                <a key={label} href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-700 hover:underline">{label} ↗</a>
              ))}
              <VisibilityPill on={data.visible_to_employers} />
            </div>
            {/* 21 Oct (her idea): what employers see, any time (pages/student/EmployerPreview.jsx) */}
            <div className="flex items-center gap-2.5 shrink-0">
            <Link to="/profile/preview" className="flex items-center gap-2 text-sm font-medium text-slate-700 border border-slate-300 bg-white rounded-lg px-3.5 py-2 hover:bg-slate-50">
              {/* 21 Oct (her idea): an eye, "see it as they see it" */}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Preview as employer</Link>
            {/* 21 Oct (her rename): Links & visibility became the Profile & privacy page (ProfilePrivacy.jsx) */}
            <Link to="/profile/settings" className={`${softBtnCls} shrink-0`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Profile &amp; privacy
            </Link>
            </div>
          </div>
          {/* Skill count on the left; programme and intake on the right of the same line, under "Links & visibility":
              they describe the student, so they sit in the header, and the empty space there costs no height (9 Oct) */}
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <p className="text-sm text-slate-500">
              <span className="text-xl font-semibold text-slate-900 tabular-nums">{data.total_skills}</span>{' '}
              <span className="font-medium text-slate-700">{data.total_skills === 1 ? 'skill' : 'skills'}</span> found in your modules, projects, experience, certificates and awards
            </p>
            <p className="text-sm text-slate-600">
              {data.programme || 'Programme not set'}{data.intake && <span className="text-slate-400"> · Intake {data.intake}</span>}
              {' · '}<button type="button" onClick={() => setOpen('study')} className="font-medium text-blue-700 hover:underline">Change</button>
            </p>
          </div>
        </div>
        {/* Tabs wrap onto a second line on a narrow window: never a sideways scrollbar (her request 8 Oct) */}
        <div className="relative">
        {leaveTo && <Popconfirm text="You have grade changes that aren't saved." confirmLabel="Leave without saving"
          cancelLabel="Stay and save" danger onConfirm={() => chooseTab(leaveTo, true)} onCancel={() => setLeaveTo(null)} />}
        <div className="flex flex-wrap items-center justify-between gap-x-6 border-t border-slate-200 -mx-4 sm:-mx-8 px-4 sm:px-8">
        <div role="tablist" aria-label="Profile sections" className="flex flex-wrap gap-x-6">
          {TABS.map(t => {
            const active = tab === t.key
            return (
              <button key={t.key} type="button" role="tab" aria-selected={active} onClick={() => chooseTab(t.key)}
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
        {/* 21 Oct (her pick after research: LinkedIn shows its profile meter on the profile page and hides it once
            complete): what's left to add, at the end of the tab row */}
        <ProfileTracker done={doneFrom({ ...data, projects, experiences, certifications: certs, awards })} onGo={chooseTab} />
        </div>
        </div>
      </PageHeader>

      <div className="flex-1 min-h-0 px-4 sm:px-8 py-6">
        {githubNote && (
          <p role="status" className="mb-4 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 flex justify-between gap-3">
            <span>GitHub connected as <b>{githubNote}</b>.{githubLinked > 0 && ` ${githubLinked} ${githubLinked === 1 ? 'project now shows' : 'projects now show'} as yours.`}</span>
            <button type="button" onClick={() => setGithubNote('')} aria-label="Close" className="text-emerald-700">×</button>
          </p>
        )}
        {tab === 'modules' && (
          <ModulesTab key={studyVersion} onUnsavedChange={setGradesUnsaved} onSaved={load} />
        )}
        {tab === 'projects' && (
          <ProjectsTab projects={projects} onRefresh={load} onImport={() => setOpen('github')} githubConnected={githubAccounts > 0}
            importNote={importNote} onImportNoteClose={() => setImportNote('')} />
        )}
        {tab === 'experience' && <ExperienceTab items={experiences} onRefresh={load} />}
        {tab === 'certs' && <CertsTab certs={certs} onRefresh={load} />}
        {tab === 'awards' && <AwardsTab awards={awards} onRefresh={load} />}
      </div>

      {open === 'study' && (
        <Modal title="Change programme" dirty={dirty} onClose={close} size="form">
          <StudyForm onDirty={setDirty} onCancel={close}
            onDone={(study) => { setUser(u => ({ ...u, ...study, needs_study: false })); setStudyVersion(v => v + 1); saved() }} />
        </Modal>
      )}
      {open === 'github' && (
        <GithubImport onClose={close}
          onDone={(note) => { setImportNote(note); saved() }} />
      )}
    </div>
  )
}

// While My Profile loads: the real header shape (name, skill count, tabs) and a list panel, in grey bars (9 Oct)
function ProfileSkeleton() {
  return (
    <div className="min-h-screen lg:h-screen bg-slate-50 flex flex-col" aria-busy="true">
      <LoadingLabel>Loading your profile…</LoadingLabel>
      <PageHeader>
        <div className="pt-1 pb-4">
          <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-widest mb-2">My Profile</p>
          <div className="flex items-center justify-between gap-3"><Bar className="h-7 w-56" /><Bar className="h-9 w-40 rounded-xl" /></div>
          <div className="mt-3 flex items-center justify-between gap-6"><Bar className="h-4 w-80" /><Bar className="h-4 w-60" /></div>
        </div>
        <div className="flex gap-6 border-t border-slate-200 -mx-4 sm:-mx-8 px-4 sm:px-8 py-3.5">
          {['w-20', 'w-20', 'w-24', 'w-24', 'w-16'].map((w, i) => <Bar key={i} className={`h-4 ${w}`} />)}
        </div>
      </PageHeader>
      <div className="flex-1 min-h-0 px-4 sm:px-8 py-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm h-full">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between"><Bar className="h-4 w-44" /><Bar className="h-9 w-28 rounded-xl" /></div>
          <div className="px-6 divide-y divide-slate-100">{[...Array(6)].map((_, i) => <RowSkeleton key={i} />)}</div>
        </div>
      </div>
    </div>
  )
}
