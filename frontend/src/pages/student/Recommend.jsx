import { Fragment, useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api'
import PageHeader from '../../components/PageHeader'
import LevelTag from '../../components/LevelTag'

const LOADING_STEPS = [
  'Building your skill profile...',
  'Analysing your strengths...',
  'Comparing against job market...',
  'Ranking best matches...',
  'Almost done...',
]

function NoSkillsState() {
  const navigate = useNavigate()
  return (
    <div className="h-screen bg-slate-50 flex flex-col items-center justify-center gap-5 px-8 text-center">
      <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
        <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>
      <div>
        <h2 className="text-base font-semibold text-slate-800 mb-1">Your skill profile is empty</h2>
        <p className="text-sm text-slate-500 max-w-sm">
          Add your module grades, projects, or certifications on your Profile page — we'll match you with jobs that fit your skills.
        </p>
      </div>
      <button onClick={() => navigate('/profile')}
        className="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition flex items-center gap-2">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        Build My Profile
      </button>
    </div>
  )
}

export default function Recommend() {
  const navigate = useNavigate()

  const [skillCount, setSkillCount] = useState(null) // null = loading, 0 = empty profile, -1 = failed to load
  const [results, setResults] = useState(null)
  const [sortBy, setSortBy] = useState('fit')   // 'fit' | 'skills'
  const [loading, setLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState(0)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [error, setError] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [subcategories, setSubcategories] = useState([])
  const [activeCategory, setActiveCategory] = useState('all')
  const [visibleCount, setVisibleCount] = useState(10)
  const latestSearch = useRef(0)   // only the newest search may update the page

  const doSearch = async (role, count, category) => {
    const searchId = ++latestSearch.current
    const searchRole = role !== undefined ? role : roleFilter
    const searchCount = count || 0  // 0 = return all results
    const searchCategory = category !== undefined ? category : activeCategory
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
        top_n: searchCount,  // 0 = all
        role_filter: searchRole,
      })
      clearInterval(stepInterval)
      if (searchId !== latestSearch.current) return   // a newer search has started, ignore this one
      setLoadingProgress(100)
      setTimeout(() => {
        if (searchId !== latestSearch.current) return
        setResults(res.data)
        sessionStorage.setItem('lastRoleFilter', searchRole)
        sessionStorage.setItem('lastActiveCategory', searchCategory)
        setLoading(false)
      }, 300)
    } catch (err) {
      clearInterval(stepInterval)
      if (searchId !== latestSearch.current) return
      setError(err.response?.data?.detail || 'Failed to get recommendations')
      setLoading(false)
    }
  }

  useEffect(() => {
    // Check total skills across ALL sources (modules + projects + certs)
    api.get('/profile/skills').then(res => {
      const count = res.data.total ?? 0
      setSkillCount(count)
      if (count === 0) return

      api.get('/jobs/subcategories').catch(() => {})
        .then(res => res && setSubcategories(res.data))

      // Keep the last search, but always fetch fresh results: saved results went stale after a
      // profile or matching change and showed different numbers from Job Detail (30 Sep)
      sessionStorage.removeItem('lastRecommendResults')   // left by older versions
      const savedRole = sessionStorage.getItem('lastRoleFilter') || ''
      const savedCategory = sessionStorage.getItem('lastActiveCategory') || 'all'
      setRoleFilter(savedRole)
      setActiveCategory(savedCategory)
      doSearch(savedRole, 0, savedCategory)
    }).catch(() => {
      // Not "empty profile": the request failed (e.g. server down). Show the error instead.
      setError('Could not load your skill profile. Please check the server is running and refresh.')
      setSkillCount(-1)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (skillCount === null) return (
    <div className="h-screen bg-slate-50 flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (skillCount === 0) return <NoSkillsState />

  const handleCategoryClick = (cat) => {
    setActiveCategory(cat)
    if (cat === 'all') { setRoleFilter(''); doSearch('', 0, 'all') }
    else { setRoleFilter(cat); doSearch(cat, 0, cat) }
  }

  const handleFindJobs = () => {
    setActiveCategory('all')
    doSearch(roleFilter, 0, 'all')
  }

  const getMatchBgColor = (pct) => pct >= 70 ? 'bg-emerald-50 text-emerald-700' : pct >= 40 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-600'
  const getAccentColor  = (pct) => pct >= 70 ? 'bg-emerald-400' : pct >= 40 ? 'bg-amber-400' : 'bg-rose-400'

  // Displayed number = skill coverage (same as Job Detail). Default order = "best fit" (backend ranking,
  // which also weighs overall profile similarity and seniority); "most skills" re-sorts by coverage.
  const coverageOf = (job) => job.coverage_percent ?? job.match_percent
  // Job Matches shows only current openings (the backend no longer sends past 2024 postings;
  // those are used for Career Paths and market statistics instead)
  const allJobs = results?.recommendations || []
  // A typed search puts jobs matching it (title, company or location; search_match 3..0 from the backend) first;
  // the chosen sort only orders jobs within each group. Without a typed search every value is 0: nothing changes.
  const titleOf = (job) => job.search_match ?? 0
  const sortedJobs = sortBy === 'skills'
    ? [...allJobs].sort((a, b) => titleOf(b) - titleOf(a) || coverageOf(b) - coverageOf(a) || b.match_score - a.match_score)
    : allJobs
  const visibleJobs = sortedJobs.slice(0, visibleCount)
  const hasMore = results && visibleCount < sortedJobs.length

  return (
    <div className="h-screen bg-slate-50 flex flex-col">
      <PageHeader>
        <div>
          <div className="flex items-start justify-between mb-4 pt-1">
            <div>
              <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-widest mb-2">Job Matches</p>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Explore Your Career Fit</h1>
              <p className="text-sm text-slate-500 mt-1">
                Matched from your full skill profile
                {results && ` · ${results.total_jobs_compared} current openings compared`}
              </p>
            </div>
            <button onClick={() => navigate('/profile')}
              className="text-xs text-slate-400 hover:text-blue-600 transition mt-1">
              ← Update profile
            </button>
          </div>

          <div className="flex gap-2 mb-3">
            <div className="flex-1 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5">
              <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input type="text" value={roleFilter}
                onChange={e => setRoleFilter(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleFindJobs()}
                placeholder="Search by job title, skill, company or location, e.g. Data Analyst, Python, Penang"
                className="flex-1 bg-transparent text-sm focus:outline-none text-slate-700 placeholder-slate-400" />
              {roleFilter && (
                <button onClick={() => { setRoleFilter(''); setActiveCategory('all'); doSearch('', 0, 'all') }}
                  className="text-slate-400 hover:text-slate-600 text-xs">✕</button>
              )}
            </div>
            <button onClick={handleFindJobs} disabled={loading}
              className="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50">
              {loading ? 'Searching…' : 'Search'}
            </button>
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-3 scrollbar-hide">
            {['all', ...subcategories].map(cat => (
              <button key={cat} onClick={() => handleCategoryClick(cat)} disabled={loading}
                className={`text-xs px-3 py-1.5 rounded-full border transition shrink-0 whitespace-nowrap font-medium disabled:opacity-50 ${
                  activeCategory === cat
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300 hover:text-blue-600'
                }`}>
                {cat === 'all' ? 'All categories' : cat}
              </button>
            ))}
          </div>
        </div>
      </PageHeader>

      <div className="flex-1 overflow-auto px-8 py-4">
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-full max-w-xs">
              <div className="flex justify-between text-xs mb-2">
                <span className="text-slate-500">{LOADING_STEPS[loadingStep]}</span>
                <span className="text-blue-600 font-medium tabular-nums">{loadingProgress}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1">
                <div className="bg-blue-600 h-1 rounded-full transition-all duration-500" style={{ width: `${loadingProgress}%` }} />
              </div>
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="bg-rose-50 text-rose-600 text-sm px-4 py-3 rounded-lg border border-rose-100 mb-4">{error}</div>
        )}

        {results && !loading && (
          <div className="space-y-1.5">
            {results.recommendations?.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 pb-1 text-xs">
                <span className="text-slate-400">{allJobs.length} current openings</span>
                {/* Right: order */}
                <Toggle
                  label="Sort by"
                  value={sortBy}
                  onChange={v => { setSortBy(v); setVisibleCount(10) }}
                  options={[
                    { key: 'fit', label: 'Best fit', hint: 'Mixes skills matched, how close your overall profile is to the role, and entry-level roles first' },
                    { key: 'skills', label: 'Most skills matched', hint: 'Jobs where you already have the most of the skills they ask for' },
                  ]}
                />
              </div>
            )}
            {results.recommendations?.length === 0 ? (
              <div className="bg-white rounded-xl p-10 text-center border border-slate-200">
                <p className="text-slate-400 text-sm">No current openings match this search. Try a broader search or another category.</p>
              </div>
            ) : (
              <>
                {visibleJobs.map((job, idx) => (
                  <Fragment key={job.job_id}>
                  {idx > 0 && titleOf(job) === 0 && titleOf(visibleJobs[idx - 1]) > 0 && (
                    <p className="text-xs text-slate-400 pt-3 pb-1 px-1">Other openings that fit your profile</p>
                  )}
                  <div onClick={() => navigate(`/jobs/${encodeURIComponent(job.job_id)}`)}
                    className="bg-white rounded-xl border border-slate-200 cursor-pointer hover:border-blue-200 hover:shadow-sm transition group overflow-hidden flex">
                    {/* Left accent bar */}
                    <div className={`w-1 shrink-0 ${getAccentColor(coverageOf(job))}`} />
                    <div className="flex-1 px-4 py-3.5 min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-xs text-slate-300 font-medium tabular-nums shrink-0 w-4">{idx + 1}</span>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800 text-sm truncate group-hover:text-blue-700 transition leading-snug">{job.job_title}</p>
                            <p className="text-xs text-slate-400 mt-0.5 truncate">{job.company} · {job.location}</p>
                          </div>
                        </div>
                        {/* Match % pill */}
                        <span
                          title="Required skills you already have"
                          className={`shrink-0 text-xs font-bold tabular-nums px-2.5 py-1 rounded-full ${getMatchBgColor(coverageOf(job))}`}
                        >
                          {job.skills_total ? `${job.skills_matched}/${job.skills_total} skills` : `${job.match_percent}%`}
                        </span>
                      </div>
                      <div className="flex gap-1.5 mt-2.5 flex-wrap">
                        <LevelTag level={job.level} />
                        {job.country && job.country !== 'MY' && (
                          <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md font-medium">{job.country === 'SG' ? 'Singapore' : job.country}</span>
                        )}
                        <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md font-medium">{job.subcategory}</span>
                        {job.salary && job.salary !== 'nan' && (
                          <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md font-medium">{job.salary}</span>
                        )}
                        {job.top_job_skills?.slice(0, 3).map(skill => (
                          // the skill the search matched comes first and is highlighted: it shows why the job is here
                          <span key={skill} className={skill === job.search_skill
                            ? 'text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200 font-medium'
                            : 'text-xs text-slate-400 px-2 py-0.5 rounded-md border border-slate-200'}>{skill}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  </Fragment>
                ))}
                {hasMore && (
                  <button onClick={() => setVisibleCount(prev => prev + 10)}
                    className="w-full py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-500 hover:border-blue-300 hover:text-blue-600 transition mt-2">
                    Show more ({sortedJobs.length - visibleCount} remaining)
                  </button>
                )}
                {!hasMore && sortedJobs.length > 0 && (
                  <p className="text-center text-xs text-slate-400 py-3">All {sortedJobs.length} matches shown</p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// "Sort by  Best fit | Most skills matched" style text toggle
function Toggle({ label, value, onChange, options }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-slate-400">{label}</span>
      {options.map((opt, i) => (
        <span key={opt.key} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-slate-300">|</span>}
          <button
            title={opt.hint}
            onClick={() => onChange(opt.key)}
            className={`transition ${value === opt.key ? 'text-blue-700 font-semibold' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {opt.label}
          </button>
        </span>
      ))}
    </div>
  )
}