import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

const LOADING_STEPS = [
  'Building your skill profile...',
  'Analysing your grades...',
  'Comparing against job market...',
  'Ranking best matches...',
  'Almost done...',
]

export default function Recommend() {
  const navigate = useNavigate()

  const stored = sessionStorage.getItem('selectedModules')
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
      const res = await api.post('/recommend/', {
        modules,
        top_n: searchCount,
        role_filter: searchRole,
      })
      clearInterval(stepInterval)
      setLoadingProgress(100)
      setTimeout(() => {
        setResults(res.data)
        // Save results to sessionStorage
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
    if (!stored || modules.length === 0) {
      navigate('/modules')
      return
    }

    api.get('/jobs/subcategories')
      .then(res => setSubcategories(res.data))
      .catch(() => {})

    // Restore previous results if available
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
      // Auto search only if no saved results
      setTimeout(() => doSearch('', 50), 0)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!stored || modules.length === 0) return null

  const handleCategoryClick = (cat) => {
    setActiveCategory(cat)
    if (cat === 'all') {
      setRoleFilter('')
      doSearch('', 50)
    } else {
      setRoleFilter(cat)
      doSearch(cat, 50)
    }
  }

  const handleFindJobs = () => {
    setActiveCategory('all')
    doSearch(roleFilter, 50)
  }

  const getMatchDotColor = (percent) => {
    if (percent >= 70) return 'bg-green-500'
    if (percent >= 40) return 'bg-yellow-500'
    return 'bg-red-400'
  }

  const getMatchTextColor = (percent) => {
    if (percent >= 70) return 'text-green-600'
    if (percent >= 40) return 'text-yellow-600'
    return 'text-red-500'
  }

  const visibleJobs = results?.recommendations?.slice(0, visibleCount) || []
  const hasMore = results && visibleCount < results.recommendations.length

  return (
    <div className="h-screen bg-gray-50 flex flex-col">

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-8 pt-5 pb-4 shrink-0">
        <div className="max-w-4xl mx-auto">

          {/* Title row */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-gray-800">Job Recommendations</h1>
              <p className="text-gray-500 text-xs mt-0.5">
                {modules.length} modules selected
                {results && ` · ${results.total_jobs_compared} jobs compared · ${results.recommendations.length} matches found`}
              </p>
            </div>
            <button onClick={() => navigate('/modules')} className="text-xs text-blue-600 hover:underline">
              ← Edit Modules
            </button>
          </div>

          {/* Search bar */}
          <div className="flex gap-2 mb-3">
            <div className="flex-1 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5">
              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleFindJobs()}
                placeholder="Search by role e.g. Software Engineer, Data Analyst..."
                className="flex-1 bg-transparent text-sm focus:outline-none text-gray-700 placeholder-gray-400"
              />
              {roleFilter && (
                <button
                  onClick={() => { setRoleFilter(''); setActiveCategory('all'); doSearch('', 50) }}
                  className="text-gray-400 hover:text-gray-600 text-sm"
                >
                  ✕
                </button>
              )}
            </div>
            <button
              onClick={handleFindJobs}
              disabled={loading}
              className="bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-800 transition disabled:opacity-50"
            >
              {loading ? 'Searching...' : 'Find Jobs'}
            </button>
          </div>

          {/* Category chips */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <button
              onClick={() => handleCategoryClick('all')}
              className={`text-xs px-3 py-1.5 rounded-full border transition shrink-0 ${
                activeCategory === 'all'
                  ? 'bg-blue-700 text-white border-blue-700'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400 hover:text-blue-700'
              }`}
            >
              All
            </button>
            {subcategories.map(cat => (
              <button
                key={cat}
                onClick={() => handleCategoryClick(cat)}
                disabled={loading}
                className={`text-xs px-3 py-1.5 rounded-full border transition disabled:opacity-50 shrink-0 whitespace-nowrap ${
                  activeCategory === cat
                    ? 'bg-blue-700 text-white border-blue-700'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400 hover:text-blue-700'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-8 py-4">
        <div className="max-w-4xl mx-auto">

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-full max-w-xs">
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-gray-500">{LOADING_STEPS[loadingStep]}</span>
                  <span className="text-blue-700 font-medium">{loadingProgress}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className="bg-blue-700 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${loadingProgress}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl border border-red-100 mb-4">
              {error}
            </div>
          )}

          {/* Results */}
          {results && !loading && (
            <div className="space-y-2">
              {results.recommendations?.length === 0 ? (
                <div className="bg-white rounded-xl p-8 text-center border border-gray-100">
                  <p className="text-gray-400 text-sm">No matching jobs found. Try a different role or category.</p>
                </div>
              ) : (
                <>
                  {visibleJobs.map((job, idx) => (
                    <div
                      key={job.job_id}
                      onClick={() => navigate(`/jobs/${encodeURIComponent(job.job_id)}`)}
                      className="bg-white rounded-xl px-5 py-4 border border-gray-100 cursor-pointer hover:border-blue-200 hover:shadow-sm transition group"
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-400 shrink-0 mt-0.5 group-hover:bg-blue-50 group-hover:text-blue-600 transition">
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-800 text-sm truncate group-hover:text-blue-700 transition">
                                {job.job_title}
                              </p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {job.company} · {job.location}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <div className={`w-2 h-2 rounded-full shrink-0 ${getMatchDotColor(job.match_percent)}`} />
                              <span className={`text-xs font-semibold ${getMatchTextColor(job.match_percent)}`}>
                                {job.match_percent}% match
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-1.5 mt-2 flex-wrap">
                            <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                              {job.subcategory}
                            </span>
                            {job.salary && job.salary !== 'nan' && (
                              <span className="text-xs bg-gray-50 text-gray-500 px-2 py-0.5 rounded-full border border-gray-100">
                                {job.salary}
                              </span>
                            )}
                            {job.top_job_skills?.slice(0, 3).map(skill => (
                              <span key={skill} className="text-xs text-gray-400 px-2 py-0.5 rounded-full border border-gray-100">
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
                      className="w-full py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-500 hover:border-blue-300 hover:text-blue-700 transition mt-2"
                    >
                      Show more ({results.recommendations.length - visibleCount} remaining)
                    </button>
                  )}

                  {!hasMore && results.recommendations.length > 0 && (
                    <p className="text-center text-xs text-gray-400 py-3">
                      All {results.recommendations.length} matches shown
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}