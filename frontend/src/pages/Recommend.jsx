import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import PageHeader from '../components/PageHeader'

const LOADING_STEPS = [
  'Building your skill profile...',
  'Analysing your grades...',
  'Comparing against job market...',
  'Ranking best matches...',
  'Almost done...',
]

function NoModulesState() {
  const navigate = useNavigate()
  return (
    <div className="h-screen bg-slate-50 flex flex-col items-center justify-center gap-5 px-8 text-center">
      <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
        <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>
      <div>
        <h2 className="text-base font-semibold text-slate-800 mb-1">No modules selected yet</h2>
        <p className="text-sm text-slate-500 max-w-sm">
          Select the modules you've studied and your grades — we'll match you with jobs that fit your academic profile.
        </p>
      </div>
      <button
        onClick={() => navigate('/profile?tab=modules')}
        className="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        Select My Modules
      </button>
    </div>
  )
}

export default function Recommend() {
  const navigate = useNavigate()

  const stored = localStorage.getItem('selectedModules')
  const modules = stored ? JSON.parse(stored) : []

  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState(0)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [error, setError] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [subcategories, setSubcategories] = useState([])
  const [activeCategory, setActiveCategory] = useState('all')
  const [visibleCount, setVisibleCount] = useState(10)

  const doSearch = async (role, count) => {
    const searchRole = role !== undefined ? role : roleFilter
    const searchCount = count || 50
    setLoading(true)
    setError('')
    setResults(null)
    setVisibleCount(10)
    setLoadingStep(0)
    setLoadingProgress(0)

    const stepInterval = setInterval(() => {
      setLoadingStep(prev => Math.min(prev + 1, LOADING_STEPS.length - 1))
      setLoadingProgress(prev => Math.min(prev + 20, 90))
    }, 800)

    try {
      const extra_skills = JSON.parse(localStorage.getItem('extraSkills') || '[]')
      const res = await api.post('/recommend/', {
        modules,
        extra_skills,
        top_n: searchCount,
        role_filter: searchRole,
      })
      clearInterval(stepInterval)
      setLoadingProgress(100)
      setTimeout(() => {
        setResults(res.data)
        sessionStorage.setItem('lastRecommendResults', JSON.stringify(res.data))
        sessionStorage.setItem('lastRoleFilter', searchRole)
        sessionStorage.setItem('lastActiveCategory', activeCategory)
        setLoading(false)
      }, 300)
    } catch (err) {
      clearInterval(stepInterval)
      setError(err.response?.data?.detail || 'Failed to get recommendations')
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!stored || modules.length === 0) return

    api.get('/jobs/subcategories')
      .then(res => setSubcategories(res.data))
      .catch(() => {})

    const savedResults = sessionStorage.getItem('lastRecommendResults')
    const savedRole = sessionStorage.getItem('lastRoleFilter')
    const savedCategory = sessionStorage.getItem('lastActiveCategory')

    if (savedResults) {
      setTimeout(() => {
        setResults(JSON.parse(savedResults))
        if (savedRole) setRoleFilter(savedRole)
        if (savedCategory) setActiveCategory(savedCategory)
      }, 0)
    } else {
      setTimeout(() => doSearch('', 50), 0)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!stored || modules.length === 0) return <NoModulesState />

  const handleCategoryClick = (cat) => {
    setActiveCategory(cat)
    if (cat === 'all') { setRoleFilter(''); doSearch('', 50) }
    else { setRoleFilter(cat); doSearch(cat, 50) }
  }

  const handleFindJobs = () => {
    setActiveCategory('all')
    doSearch(roleFilter, 50)
  }

  // Semantic only — match quality indicator
  const getMatchDotColor  = (pct) => pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-rose-400'
  const getMatchTextColor = (pct) => pct >= 70 ? 'text-emerald-600' : pct >= 40 ? 'text-amber-600' : 'text-rose-500'

  const visibleJobs = results?.recommendations?.slice(0, visibleCount) || []
  const hasMore = results && visibleCount < results.recommendations.length

  return (
    <div className="h-screen bg-slate-50 flex flex-col">

      <PageHeader>
        <div>
          <div className="flex items-start justify-between mb-4 pt-1">
            <div>
              <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-widest mb-2">Job Matches</p>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Find Your Best Fit</h1>
              <p className="text-sm text-slate-500 mt-1">
                {modules.length} modules selected
                {results && ` · ${results.total_jobs_compared} jobs compared · ${results.recommendations.length} matches`}
              </p>
            </div>
            <button
              onClick={() => navigate('/profile?tab=modules')}
              className="text-xs text-slate-400 hover:text-blue-600 transition mt-1"
            >
              ← Edit modules
            </button>
          </div>

          {/* Search */}
          <div className="flex gap-2 mb-3">
            <div className="flex-1 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5">
              <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleFindJobs()}
                placeholder="Search by role e.g. Software Engineer, Data Analyst..."
                className="flex-1 bg-transparent text-sm focus:outline-none text-slate-700 placeholder-slate-400"
              />
              {roleFilter && (
                <button
                  onClick={() => { setRoleFilter(''); setActiveCategory('all'); doSearch('', 50) }}
                  className="text-slate-400 hover:text-slate-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
            <button
              onClick={handleFindJobs}
              disabled={loading}
              className="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
            >
              {loading ? 'Searching…' : 'Search'}
            </button>
          </div>

          {/* Category chips */}
          <div className="flex gap-1.5 overflow-x-auto pb-3 scrollbar-hide">
            {['all', ...subcategories].map(cat => (
              <button
                key={cat}
                onClick={() => handleCategoryClick(cat)}
                disabled={loading}
                className={`text-xs px-3 py-1.5 rounded-full border transition shrink-0 whitespace-nowrap font-medium disabled:opacity-50 ${
                  activeCategory === cat
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300 hover:text-blue-600'
                }`}
              >
                {cat === 'all' ? 'All categories' : cat}
              </button>
            ))}
          </div>
        </div>
      </PageHeader>

      {/* Content */}
      <div className="flex-1 overflow-auto px-8 py-4">

        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-full max-w-xs">
              <div className="flex justify-between text-xs mb-2">
                <span className="text-slate-500">{LOADING_STEPS[loadingStep]}</span>
                <span className="text-blue-600 font-medium tabular-nums">{loadingProgress}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1">
                <div
                  className="bg-blue-600 h-1 rounded-full transition-all duration-500"
                  style={{ width: `${loadingProgress}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="bg-rose-50 text-rose-600 text-sm px-4 py-3 rounded-lg border border-rose-100 mb-4">
            {error}
          </div>
        )}

        {results && !loading && (
          <div className="space-y-1.5">
            {results.recommendations?.length === 0 ? (
              <div className="bg-white rounded-xl p-10 text-center border border-slate-200">
                <p className="text-slate-400 text-sm">No matches found. Try a broader search or different category.</p>
              </div>
            ) : (
              <>
                {visibleJobs.map((job, idx) => (
                  <div
                    key={job.job_id}
                    onClick={() => navigate(`/jobs/${encodeURIComponent(job.job_id)}`)}
                    className="bg-white rounded-xl px-5 py-4 border border-slate-200 cursor-pointer hover:border-blue-200 hover:shadow-sm transition group"
                  >
                    <div className="flex items-start gap-4">
                      <span className="w-5 text-xs text-slate-300 font-medium tabular-nums mt-0.5 shrink-0">{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-800 text-sm truncate group-hover:text-blue-700 transition">
                              {job.job_title}
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {job.company} · {job.location}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <div className={`w-1.5 h-1.5 rounded-full ${getMatchDotColor(job.match_percent)}`} />
                            <span className={`text-xs font-semibold tabular-nums ${getMatchTextColor(job.match_percent)}`}>
                              {job.match_percent}%
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-1.5 mt-2.5 flex-wrap">
                          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-medium">
                            {job.subcategory}
                          </span>
                          {job.salary && job.salary !== 'nan' && (
                            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-medium">
                              {job.salary}
                            </span>
                          )}
                          {job.top_job_skills?.slice(0, 3).map(skill => (
                            <span key={skill} className="text-xs text-slate-400 px-2 py-0.5 rounded-md border border-slate-200">
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {hasMore && (
                  <button
                    onClick={() => setVisibleCount(prev => prev + 10)}
                    className="w-full py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-500 hover:border-blue-300 hover:text-blue-600 transition mt-2"
                  >
                    Show more ({results.recommendations.length - visibleCount} remaining)
                  </button>
                )}

                {!hasMore && results.recommendations.length > 0 && (
                  <p className="text-center text-xs text-slate-400 py-3">
                    All {results.recommendations.length} matches shown
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}