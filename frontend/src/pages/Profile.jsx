import { useState, useEffect, useCallback } from 'react'
import PageHeader from '../components/PageHeader'
import { useSearchParams } from 'react-router-dom'
import api from '../api'

// ── Shared ────────────────────────────────────────────────────────────────────

function SkillChip({ skill }) {
  return (
    <span className="inline-flex items-center text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1 rounded-full font-medium">
      {skill}
    </span>
  )
}

function EmptyState({ icon, title, subtitle }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-55 gap-3 text-center">
      <span className="text-4xl">{icon}</span>
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
      </div>
    </div>
  )
}

function Spinner({ size = 'md' }) {
  const sz = size === 'sm' ? 'w-3.5 h-3.5 border-2' : 'w-5 h-5 border-2'
  return <div className={`${sz} border-current border-t-transparent rounded-full animate-spin`} />
}

const GRADE_OPTIONS = [
  { label: 'A (4.0)', value: 4.0 },
  { label: 'A- (3.7)', value: 3.7 },
  { label: 'B+ (3.3)', value: 3.3 },
  { label: 'B (3.0)', value: 3.0 },
  { label: 'B- (2.7)', value: 2.7 },
  { label: 'C+ (2.3)', value: 2.3 },
  { label: 'C (2.0)', value: 2.0 },
]

// ── Projects tab ──────────────────────────────────────────────────────────────

function ProjectsTab({ projects, onRefresh }) {
  const [form, setForm] = useState({ name: '', description: '', github_url: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleAdd = async (e) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      await api.post('/profile/projects', {
        name: form.name.trim(),
        description: form.description.trim(),
        github_url: form.github_url.trim() || null,
      })
      setForm({ name: '', description: '', github_url: '' })
      onRefresh()
      sessionStorage.removeItem('lastRecommendResults')
      sessionStorage.removeItem('lastRoleFilter')
      sessionStorage.removeItem('lastActiveCategory')
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add project')
    } finally { setLoading(false) }
  }

  const handleDelete = async (id) => {
    try { await api.delete(`/profile/projects/${id}`); onRefresh() 
      sessionStorage.removeItem('lastRecommendResults')
    } catch { /* silent */ }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

      {/* Form — narrower */}
      <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-6 self-start">
        <h3 className="text-sm font-semibold text-gray-800 mb-0.5">Add a Project</h3>
        <p className="text-xs text-gray-400 mb-5">AI will extract technical skills from your description.</p>
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Project Name <span className="text-red-400">*</span></label>
            <input
              type="text" value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Inventory Management System"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Description <span className="text-red-400">*</span></label>
            <textarea
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="What you built, tech stack, key features..."
              rows={5}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">GitHub URL <span className="text-gray-300 font-normal">(optional)</span></label>
            <input
              type="url" value={form.github_url}
              onChange={e => setForm(p => ({ ...p, github_url: e.target.value }))}
              placeholder="https://github.com/username/repo"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <button
            type="submit"
            disabled={loading || !form.name.trim() || !form.description.trim()}
            className="w-full bg-blue-700 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-blue-800 disabled:opacity-40 transition flex items-center justify-center gap-2"
          >
            {loading ? (<><Spinner size="sm" />Extracting skills…</>) : 'Add Project'}
          </button>
        </form>
      </div>

      {/* List — wider */}
      <div className="lg:col-span-3">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-800">Your Projects</h3>
          <span className="text-xs text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full">{projects.length} total</span>
        </div>
        {projects.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-8">
            <EmptyState icon="🗂️" title="No projects yet" subtitle="Add your first project on the left" />
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map(p => (
              <div key={p.id} className="bg-white rounded-2xl border border-gray-200 p-5 hover:border-blue-200 transition group">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-800">{p.name}</span>
                      {p.github_url && (
                        <a href={p.github_url} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:underline">GitHub ↗</a>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">{p.description}</p>
                  </div>
                  <button onClick={() => handleDelete(p.id)}
                    className="text-gray-300 hover:text-red-400 transition shrink-0 p-1 rounded-lg hover:bg-red-50">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {p.extracted_skills?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-100">
                    {p.extracted_skills.map((s, i) => <SkillChip key={i} skill={s} />)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Certifications tab ────────────────────────────────────────────────────────

function CertificationsTab({ certs, onRefresh }) {
  const [form, setForm] = useState({ cert_name: '', issuer: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleAdd = async (e) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      await api.post('/profile/certifications', { cert_name: form.cert_name.trim(), issuer: form.issuer.trim() })
      setForm({ cert_name: '', issuer: '' })
      onRefresh()
      sessionStorage.removeItem('lastRecommendResults')
      sessionStorage.removeItem('lastRoleFilter')
      sessionStorage.removeItem('lastActiveCategory')
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add certification')
    } finally { setLoading(false) }
  }

  const handleDelete = async (id) => {
    try { await api.delete(`/profile/certifications/${id}`); onRefresh()
      sessionStorage.removeItem('lastRecommendResults')
     } catch { /* silent */ }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

      {/* Form */}
      <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-6 self-start">
        <h3 className="text-sm font-semibold text-gray-800 mb-0.5">Add a Certification</h3>
        <p className="text-xs text-gray-400 mb-5">AI will map it to the skills it validates.</p>
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Certification Name <span className="text-red-400">*</span></label>
            <input
              type="text" value={form.cert_name}
              onChange={e => setForm(c => ({ ...c, cert_name: e.target.value }))}
              placeholder="e.g. AWS Certified Solutions Architect"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Issuer <span className="text-red-400">*</span></label>
            <input
              type="text" value={form.issuer}
              onChange={e => setForm(c => ({ ...c, issuer: e.target.value }))}
              placeholder="e.g. Amazon Web Services"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <button
            type="submit"
            disabled={loading || !form.cert_name.trim() || !form.issuer.trim()}
            className="w-full bg-blue-700 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-blue-800 disabled:opacity-40 transition flex items-center justify-center gap-2"
          >
            {loading ? (<><Spinner size="sm" />Mapping skills…</>) : 'Add Certification'}
          </button>
        </form>
      </div>

      {/* List */}
      <div className="lg:col-span-3">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-800">Your Certifications</h3>
          <span className="text-xs text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full">{certs.length} total</span>
        </div>
        {certs.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-8">
            <EmptyState icon="🎓" title="No certifications yet" subtitle="Add your first certification on the left" />
          </div>
        ) : (
          <div className="space-y-3">
            {certs.map(c => (
              <div key={c.id} className="bg-white rounded-2xl border border-gray-200 p-5 hover:border-blue-200 transition">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{c.cert_name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{c.issuer}</p>
                  </div>
                  <button onClick={() => handleDelete(c.id)}
                    className="text-gray-300 hover:text-red-400 transition shrink-0 p-1 rounded-lg hover:bg-red-50">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {c.mapped_skills?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-100">
                    {c.mapped_skills.map((s, i) => <SkillChip key={i} skill={s} />)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Modules tab ───────────────────────────────────────────────────────────────

function ModulesTab({ onUnsavedChange, onSaved }) {
  const [modules, setModules] = useState([])
  const [selections, setSelections] = useState({})
  const [savedSelections, setSavedSelections] = useState({})
  const [selectedYear, setSelectedYear] = useState(1)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState('') // '', 'saved', 'error'

  // Only entries with a real grade value (number, not '' or undefined)
  const gradedSelections = (s) =>
    Object.fromEntries(Object.entries(s).filter(([, v]) => v !== '' && v !== undefined))

  const hasUnsaved = JSON.stringify(gradedSelections(selections)) !== JSON.stringify(gradedSelections(savedSelections))

  // Notify parent of unsaved state changes
  useEffect(() => {
    onUnsavedChange?.(hasUnsaved)
  }, [hasUnsaved, onUnsavedChange])

  useEffect(() => {
    Promise.all([
      api.get('/modules/'),
      api.get('/profile/modules'),
    ]).then(([modRes, gradeRes]) => {
      setModules(modRes.data)
      const saved = {}
      for (const { module_code, grade } of gradeRes.data.grades) {
        saved[module_code] = grade
      }
      setSelections(saved)
      setSavedSelections(saved)
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  const saveGrades = async () => {
    // Send only entries with a real grade — backend will delete anything not in this list
    const grades = Object.entries(selections)
      .filter(([, g]) => g !== '' && g !== undefined)
      .map(([module_code, grade]) => ({ module_code, grade }))
    setSaving(true)
    try {
      await api.post('/profile/modules', { grades })
      setSavedSelections(gradedSelections(selections))
      setSaveStatus('saved')
      onSaved?.()  // refresh header stats
      sessionStorage.removeItem('lastRecommendResults')
      sessionStorage.removeItem('lastRoleFilter')
      sessionStorage.removeItem('lastActiveCategory')
      setTimeout(() => setSaveStatus(''), 2500)
    } catch {
      setSaveStatus('error')
    } finally { setSaving(false) }
  }

  const yearModules = modules.filter(m => m.level === selectedYear)
  const compulsory = yearModules.filter(m => m.type === 'common' || m.type === 'specialised')
  const electives = yearModules.filter(m => m.type === 'elective')

  const toggleElective = (code) => setSelections(prev => {
    if (prev[code] !== undefined) { const u = { ...prev }; delete u[code]; return u }
    return { ...prev, [code]: '' }
  })

  const setGrade = (code, grade) => setSelections(prev => ({ ...prev, [code]: parseFloat(grade) }))

  if (loading) return (
    <div className="flex items-center justify-center py-24 gap-3 text-gray-400">
      <Spinner /><span className="text-sm">Loading modules…</span>
    </div>
  )

  return (
    <div className="space-y-5">

      {/* Year tabs + save status inline */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2">
          {[1, 2, 3].map(year => (
            <button key={year} onClick={() => setSelectedYear(year)}
              className={`px-5 py-2 rounded-xl text-sm font-medium border transition ${
                selectedYear === year
                  ? 'bg-blue-700 text-white border-blue-700 shadow-sm'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-700'
              }`}>
              Year {year}
            </button>
          ))}
        </div>

        {/* Right side: status text + always-visible Save Grades button */}
        <div className="flex items-center gap-3">
          {hasUnsaved && (
            <div className="flex items-center gap-1.5 text-amber-600">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <span className="text-xs font-medium">Unsaved changes</span>
            </div>
          )}
          {!hasUnsaved && saveStatus === 'saved' && (
            <span className="text-xs text-green-600 font-medium flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
              Saved
            </span>
          )}
          {!hasUnsaved && saveStatus === 'error' && (
            <span className="text-xs text-red-500 font-medium">Failed to save — try again</span>
          )}
          <button
            onClick={saveGrades}
            disabled={!hasUnsaved || saving}
            className={`px-4 py-2 rounded-xl text-sm font-medium border transition flex items-center gap-2 ${
              hasUnsaved
                ? 'bg-blue-700 text-white border-blue-700 hover:bg-blue-800'
                : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
            }`}
          >
            {saving ? <><Spinner size="sm" />Saving…</> : 'Save Grades'}
          </button>
        </div>
      </div>

      {/* Split panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-800">Compulsory Modules</p>
            <p className="text-xs text-gray-400 mt-0.5">{compulsory.length} modules · all required</p>
          </div>
          <div className="px-6 py-2 divide-y divide-gray-50">
            {compulsory.map(mod => (
              <div key={mod.code} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{mod.name}</p>
                    <p className="text-xs text-gray-400">{mod.code}</p>
                  </div>
                </div>
                <select
                  value={selections[mod.code] ?? ''}
                  onChange={e => setGrade(mod.code, e.target.value)}
                  className="ml-4 border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shrink-0"
                >
                  <option value="" disabled>Select grade</option>
                  {GRADE_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-800">Elective Modules</p>
            <p className="text-xs text-gray-400 mt-0.5">Tick the ones you took</p>
          </div>
          <div className="px-6 py-3 divide-y divide-gray-50">
            {electives.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">No electives for Year {selectedYear}</p>
            ) : electives.map(mod => (
              <div key={mod.code} className="py-3">
                <div className="flex items-start gap-3">
                  <input type="checkbox" checked={selections[mod.code] !== undefined}
                    onChange={() => toggleElective(mod.code)}
                    className="w-4 h-4 mt-0.5 accent-blue-700 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{mod.name}</p>
                    <p className="text-xs text-gray-400">{mod.code}</p>
                    {selections[mod.code] !== undefined && (
                      <select value={selections[mod.code] ?? ''} onChange={e => setGrade(mod.code, e.target.value)}
                        className="mt-2 border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full">
                        <option value="" disabled>Select grade</option>
                        {GRADE_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

// Modules first — it's the grade foundation; projects + certs add skills on top
const TABS = [
  { key: 'modules',  label: 'Modules' },
  { key: 'projects', label: 'Projects' },
  { key: 'certs',    label: 'Certifications' },
]

export default function Profile() {
  const [searchParams] = useSearchParams()
  const [projects, setProjects] = useState([])
  const [certs, setCerts] = useState([])
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [activeTab, setActiveTab] = useState(
    searchParams.get('tab') === 'projects' ? 'projects'
    : searchParams.get('tab') === 'certs' ? 'certs'
    : 'modules'
  )
  const [modulesHasUnsaved, setModulesHasUnsaved] = useState(false)

  // Warn on browser/tab close when unsaved
  useEffect(() => {
    const handler = (e) => {
      if (modulesHasUnsaved) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [modulesHasUnsaved])

  const handleTabChange = useCallback((key) => {
    if (key !== 'modules' && modulesHasUnsaved) {
      const ok = window.confirm('You have unsaved grade changes. Leave without saving?')
      if (!ok) return
    }
    setActiveTab(key)
  }, [modulesHasUnsaved])

  const fetchAll = () => {
    setProfileLoading(true)
    Promise.all([
      api.get('/profile/projects'),
      api.get('/profile/certifications'),
      api.get('/profile/skills'),
    ]).then(([projRes, certRes, skillRes]) => {
      setProjects(projRes.data)
      setCerts(certRes.data)
      setProfile(skillRes.data)
    }).catch(console.error).finally(() => setProfileLoading(false))
  }

  useEffect(() => {
    const timer = setTimeout(fetchAll, 0)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="h-screen bg-slate-50 flex flex-col">

      {/* ── Pinned header ── */}
      <PageHeader>
        {/* Title + stats row */}
        <div className="flex items-start justify-between mb-4 pt-1">
          <div>
            <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-widest mb-2">My Profile</p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Skill Profile</h1>
            <p className="text-sm text-slate-500 mt-1">Build your profile from modules, projects, and certifications</p>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-0 mt-1">
            {[
              { label: 'Skills', value: profileLoading ? '—' : (profile?.total ?? 0) },
              { label: 'Projects', value: profileLoading ? '—' : projects.length },
              { label: 'Certs', value: profileLoading ? '—' : certs.length },
            ].map(({ label, value }, i, arr) => (
              <div key={label} className="flex items-center">
                <div className="text-center px-6">
                  <p className="text-2xl font-semibold tracking-tight text-slate-900 leading-none tabular-nums">
                    {value}
                  </p>
                  <p className="text-xs text-slate-400 mt-1 font-medium">{label}</p>
                </div>
                {i < arr.length - 1 && <div className="w-px h-10 bg-slate-400" />}
              </div>
            ))}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex border-t border-slate-200 mt-2 -mx-8 px-8">
          {TABS.map(tab => {
            const isActive = activeTab === tab.key
            const count = tab.key === 'projects' ? projects.length : tab.key === 'certs' ? certs.length : null
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-200'
                }`}
              >
                {tab.label}
                {count !== null && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                    isActive ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </PageHeader>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-auto">
        <div className="px-8 py-6">
          {activeTab === 'modules'   && <ModulesTab onUnsavedChange={setModulesHasUnsaved} onSaved={fetchAll} />}
          {activeTab === 'projects'  && <ProjectsTab  projects={projects} onRefresh={fetchAll} />}
          {activeTab === 'certs'     && <CertificationsTab certs={certs}  onRefresh={fetchAll} />}
        </div>
      </div>

    </div>
  )
}