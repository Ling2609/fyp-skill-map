import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api'

// ── Shared components ─────────────────────────────────────────────────────────

function SkillChip({ skill }) {
  return (
    <span className="inline-flex items-center text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1 rounded-full font-medium">
      {skill}
    </span>
  )
}

function EmptyState({ icon, title, subtitle }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-60 gap-3 text-center">
      <span className="text-5xl">{icon}</span>
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

// ── Grade options ─────────────────────────────────────────────────────────────

const GRADE_OPTIONS = [
  { label: 'A (4.0)', value: 4.0 },
  { label: 'A- (3.7)', value: 3.7 },
  { label: 'B+ (3.3)', value: 3.3 },
  { label: 'B (3.0)', value: 3.0 },
  { label: 'B- (2.7)', value: 2.7 },
  { label: 'C+ (2.3)', value: 2.3 },
  { label: 'C (2.0)', value: 2.0 },
]

// ── Tab definitions ───────────────────────────────────────────────────────────

const TABS = [
  {
    key: 'projects',
    label: 'Projects',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    ),
    description: 'Extract skills from your side projects',
  },
  {
    key: 'certs',
    label: 'Certifications',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
      </svg>
    ),
    description: 'Map certifications to validated skills',
  },
  {
    key: 'modules',
    label: 'Modules',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
    description: 'Select modules and grades for job recommendations',
  },
]

// ── Projects tab ──────────────────────────────────────────────────────────────

function ProjectsTab({ projects, onRefresh }) {
  const [form, setForm] = useState({ name: '', description: '', github_url: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!form.name.trim() || !form.description.trim()) return
    setLoading(true)
    setError('')
    try {
      await api.post('/profile/projects', {
        name: form.name.trim(),
        description: form.description.trim(),
        github_url: form.github_url.trim() || null,
      })
      setForm({ name: '', description: '', github_url: '' })
      onRefresh()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add project')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      await api.delete(`/profile/projects/${id}`)
      onRefresh()
    } catch { /* silent */ }
  }

  const canSubmit = form.name.trim() && form.description.trim()

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

      {/* Add form */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h3 className="text-base font-semibold text-gray-800 mb-1">Add a Project</h3>
        <p className="text-xs text-gray-400 mb-5">Describe your project — AI will extract the technical skills automatically.</p>
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Project Name <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Inventory Management System"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Description <span className="text-red-400">*</span></label>
            <textarea
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="Describe what you built, the tech stack you used, and key features..."
              rows={5}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">GitHub URL <span className="text-gray-300 font-normal">(optional)</span></label>
            <input
              type="url"
              value={form.github_url}
              onChange={e => setForm(p => ({ ...p, github_url: e.target.value }))}
              placeholder="https://github.com/username/repo"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <button
            type="submit"
            disabled={loading || !canSubmit}
            className="w-full bg-blue-700 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Spinner size="sm" />
                Extracting skills…
              </>
            ) : 'Add Project'}
          </button>
        </form>
      </div>

      {/* Project list */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-gray-800">Your Projects</h3>
          <span className="text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">{projects.length}</span>
        </div>
        {projects.length === 0 ? (
          <EmptyState
            icon="🗂"
            title="No projects yet"
            subtitle="Add a project on the left to extract your skills"
          />
        ) : (
          <div className="space-y-4 overflow-auto flex-1">
            {projects.map(p => (
              <div key={p.id} className="border border-gray-100 rounded-xl p-4 hover:border-gray-200 transition">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-800">{p.name}</span>
                      {p.github_url && (
                        <a
                          href={p.github_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:underline font-medium"
                        >
                          GitHub ↗
                        </a>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed line-clamp-2">{p.description}</p>
                  </div>
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="text-gray-300 hover:text-red-400 transition shrink-0 p-1 rounded-lg hover:bg-red-50"
                    title="Remove project"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {p.extracted_skills?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-50">
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
    if (!form.cert_name.trim() || !form.issuer.trim()) return
    setLoading(true)
    setError('')
    try {
      await api.post('/profile/certifications', {
        cert_name: form.cert_name.trim(),
        issuer: form.issuer.trim(),
      })
      setForm({ cert_name: '', issuer: '' })
      onRefresh()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add certification')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      await api.delete(`/profile/certifications/${id}`)
      onRefresh()
    } catch { /* silent */ }
  }

  const canSubmit = form.cert_name.trim() && form.issuer.trim()

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

      {/* Add form */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h3 className="text-base font-semibold text-gray-800 mb-1">Add a Certification</h3>
        <p className="text-xs text-gray-400 mb-5">Enter your cert details — AI will map it to the skills it validates.</p>
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Certification Name <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={form.cert_name}
              onChange={e => setForm(c => ({ ...c, cert_name: e.target.value }))}
              placeholder="e.g. AWS Certified Solutions Architect"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Issuer <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={form.issuer}
              onChange={e => setForm(c => ({ ...c, issuer: e.target.value }))}
              placeholder="e.g. Amazon Web Services"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
          {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <button
            type="submit"
            disabled={loading || !canSubmit}
            className="w-full bg-blue-700 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Spinner size="sm" />
                Mapping skills…
              </>
            ) : 'Add Certification'}
          </button>
        </form>
      </div>

      {/* Cert list */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-gray-800">Your Certifications</h3>
          <span className="text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">{certs.length}</span>
        </div>
        {certs.length === 0 ? (
          <EmptyState
            icon="🎓"
            title="No certifications yet"
            subtitle="Add a certification on the left to map its skills"
          />
        ) : (
          <div className="space-y-4 overflow-auto flex-1">
            {certs.map(c => (
              <div key={c.id} className="border border-gray-100 rounded-xl p-4 hover:border-gray-200 transition">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-sm font-semibold text-gray-800">{c.cert_name}</span>
                    <p className="text-xs text-gray-500 mt-0.5">{c.issuer}</p>
                  </div>
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="text-gray-300 hover:text-red-400 transition shrink-0 p-1 rounded-lg hover:bg-red-50"
                    title="Remove certification"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {c.mapped_skills?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-50">
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

// ── Modules tab (moved from Modules page) ─────────────────────────────────────

function ModulesTab() {
  const navigate = useNavigate()
  const [modules, setModules] = useState([])
  const [selectedYear, setSelectedYear] = useState(1)
  const [selections, setSelections] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/modules/').then(res => {
      setModules(res.data)
      const defaults = {}
      res.data.forEach(mod => {
        if (mod.type === 'common' || mod.type === 'specialised') {
          defaults[mod.code] = 3.0
        }
      })
      setSelections(defaults)
      setLoading(false)
    })
  }, [])

  const yearModules = modules.filter(m => m.level === selectedYear)
  const compulsory = yearModules.filter(m => m.type === 'common' || m.type === 'specialised')
  const electives = yearModules.filter(m => m.type === 'elective')

  const toggleElective = (code) => {
    setSelections(prev => {
      if (prev[code] !== undefined) {
        const updated = { ...prev }
        delete updated[code]
        return updated
      }
      return { ...prev, [code]: 3.0 }
    })
  }

  const setGrade = (code, grade) => {
    setSelections(prev => ({ ...prev, [code]: parseFloat(grade) }))
  }

  const handleGetRecommendations = () => {
    const moduleList = Object.entries(selections).map(([code, grade]) => ({
      module_code: code,
      grade,
    }))
    sessionStorage.setItem('selectedModules', JSON.stringify(moduleList))
    navigate('/recommend')
  }

  const selectedCount = Object.keys(selections).length

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-3 text-gray-400">
        <Spinner />
        <span className="text-sm">Loading modules…</span>
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {/* Action bar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-800">Select your modules and grades</p>
          <p className="text-xs text-gray-400 mt-0.5">We use this to match you with relevant jobs</p>
        </div>
        <button
          onClick={handleGetRecommendations}
          disabled={selectedCount === 0}
          className="bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-800 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Get Job Matches
          {selectedCount > 0 && <span className="bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded-full">{selectedCount}</span>}
        </button>
      </div>

      {/* Year tabs */}
      <div className="flex gap-2">
        {[1, 2, 3].map(year => (
          <button
            key={year}
            onClick={() => setSelectedYear(year)}
            className={`px-5 py-2 rounded-xl text-sm font-medium transition border ${
              selectedYear === year
                ? 'bg-blue-700 text-white border-blue-700 shadow-sm'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-700'
            }`}
          >
            Year {year}
          </button>
        ))}
      </div>

      {/* Split panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Compulsory */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Compulsory Modules</h3>
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
                  value={selections[mod.code] ?? 3.0}
                  onChange={e => setGrade(mod.code, e.target.value)}
                  className="ml-4 border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shrink-0"
                >
                  {GRADE_OPTIONS.map(g => (
                    <option key={g.value} value={g.value}>{g.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        {/* Electives */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Elective Modules</h3>
            <p className="text-xs text-gray-400 mt-0.5">Select the electives you took</p>
          </div>
          <div className="px-6 py-3 divide-y divide-gray-50">
            {electives.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">No electives for Year {selectedYear}</p>
            ) : (
              electives.map(mod => (
                <div key={mod.code} className="py-3">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selections[mod.code] !== undefined}
                      onChange={() => toggleElective(mod.code)}
                      className="w-4 h-4 mt-0.5 accent-blue-700 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{mod.name}</p>
                      <p className="text-xs text-gray-400">{mod.code}</p>
                      {selections[mod.code] !== undefined && (
                        <select
                          value={selections[mod.code]}
                          onChange={e => setGrade(mod.code, e.target.value)}
                          className="mt-2 border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
                        >
                          {GRADE_OPTIONS.map(g => (
                            <option key={g.value} value={g.value}>{g.label}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Profile page ─────────────────────────────────────────────────────────

export default function Profile() {
  const [searchParams] = useSearchParams()
  const [projects, setProjects] = useState([])
  const [certs, setCerts] = useState([])
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [activeTab, setActiveTab] = useState(
    searchParams.get('tab') === 'modules' ? 'modules' : 'projects'
  )

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
    }).catch(() => {}).finally(() => setProfileLoading(false))
  }

  useEffect(() => {
    const timeoutId = setTimeout(fetchAll, 0)
    return () => clearTimeout(timeoutId)
  }, [])

  return (
    <div className="h-screen bg-slate-50 flex flex-col">

      {/* Page header — pinned */}
      <div className="bg-white border-b border-gray-100 px-8 py-6 shrink-0">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
          <p className="text-sm text-gray-500 mt-1">Build your skill profile from projects, certifications, and academic modules</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
      <div className="max-w-6xl mx-auto px-8 py-8 space-y-6">

        {/* Skill summary banner */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-800">Your Skill Profile</h2>
              <p className="text-xs text-gray-400 mt-0.5">Automatically extracted from your projects and certifications</p>
            </div>
            {!profileLoading && profile && (
              <div className="flex items-center gap-4 text-right shrink-0">
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-700">{profile.total}</p>
                  <p className="text-xs text-gray-400">unique skills</p>
                </div>
                <div className="w-px h-10 bg-gray-100" />
                <div className="text-center">
                  <p className="text-lg font-semibold text-gray-700">{projects.length}</p>
                  <p className="text-xs text-gray-400">projects</p>
                </div>
                <div className="w-px h-10 bg-gray-100" />
                <div className="text-center">
                  <p className="text-lg font-semibold text-gray-700">{certs.length}</p>
                  <p className="text-xs text-gray-400">certifications</p>
                </div>
              </div>
            )}
          </div>
          {profileLoading ? (
            <div className="flex items-center gap-2 text-gray-400 text-xs py-3">
              <Spinner size="sm" />
              Loading your skills…
            </div>
          ) : profile?.skills?.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {profile.skills.map((s, i) => <SkillChip key={i} skill={s} />)}
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-2">
              No skills yet — add a project or certification below to get started.
            </p>
          )}
        </div>

        {/* Tab switcher — card style */}
        <div className="grid grid-cols-3 gap-3">
          {TABS.map(tab => {
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-3 px-5 py-4 rounded-2xl border text-left transition-all ${
                  isActive
                    ? 'bg-blue-700 text-white border-blue-700 shadow-md'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-700 hover:shadow-sm'
                }`}
              >
                <span className={isActive ? 'text-white' : 'text-gray-400'}>
                  {tab.icon}
                </span>
                <div className="min-w-0">
                  <p className={`text-sm font-semibold leading-none ${isActive ? 'text-white' : 'text-gray-800'}`}>
                    {tab.label}
                  </p>
                  <p className={`text-xs mt-1 leading-snug ${isActive ? 'text-blue-100' : 'text-gray-400'}`}>
                    {tab.description}
                  </p>
                </div>
              </button>
            )
          })}
        </div>

        {/* Tab content */}
        {activeTab === 'projects' && (
          <ProjectsTab projects={projects} onRefresh={fetchAll} />
        )}
        {activeTab === 'certs' && (
          <CertificationsTab certs={certs} onRefresh={fetchAll} />
        )}
        {activeTab === 'modules' && (
          <ModulesTab />
        )}

      </div>
      </div>
    </div>
  )
}