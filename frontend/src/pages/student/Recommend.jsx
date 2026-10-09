import { Fragment, useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/useAuth'
import { cached, peek } from '../../pageCache'
import PageHeader from '../../components/PageHeader'
import LevelTag from '../../components/LevelTag'
import { skillName } from '../../skillName'

const LOADING_STEPS = [
  'Building your skill profile...',
  'Analysing your strengths...',
  'Comparing against job market...',
  'Ranking best matches...',
  'Almost done...',
]

// Location filter (3 Oct): country, then state (references.md "Location filter layout"). Locations are stored as
// "City, State" or just the country, so a Malaysian job without a city belongs to "All Malaysia" only.
// Filter values: 'all', a country ('MY'), or country:state ('MY:Selangor').
const COUNTRY_NAMES = { MY: 'Malaysia', SG: 'Singapore' }
const countryOf = (place) => (place.country || 'MY').toUpperCase()
const stateOf = (place) => {
  const last = (place.location || '').split(',').pop().trim().replace(/^Federal Territory of /, '')
  return Object.values(COUNTRY_NAMES).includes(last) ? '' : last
}
const inLocation = (job, loc) => loc === 'all'
  || (loc.includes(':') ? `${countryOf(job)}:${stateOf(job)}` === loc : countryOf(job) === loc)
// "Hide senior roles" (3 Oct): only jobs whose TITLE says Senior / Lead / Manager (the amber tags). No "Entry level only"
// filter: 130 of 214 titles state no level and about half of such postings are entry level (references.md), so it
// would hide most suitable jobs. Off by default; the level penalty already ranks these lower.
const SENIOR_LEVELS = ['senior', 'lead', 'manager']

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
        Go to My Profile
      </button>
    </div>
  )
}

// "12 days ago" on each card (F8, 5 Oct): most postings close within about a month, so the age helps decide
const daysAgo = (days) => {
  if (days == null || days < 0) return ''
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  return `${Math.floor(days / 7)} weeks ago`
}

// Where the student was (sort, how many shown, scroll) when opening a job, to put them back there (6 Oct).
// The results themselves are kept by pageCache.js.
const VIEW = 'jobMatchesView'
const readView = () => {
  try { return JSON.parse(sessionStorage.getItem(VIEW)) || {} } catch { return {} }
}

const searchBody = (role, category) => ({
  top_n: 0,  // 0 = all
  role_filter: role,
  category: category === 'all' ? '' : category,   // chip and typed search both apply
})

export default function Recommend() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [skillCount, setSkillCount] = useState(() => peek('/profile/skills')?.total ?? null) // null = loading, 0 = empty profile, -1 = failed
  const [results, setResults] = useState(null)
  const [shownQuery, setShownQuery] = useState('')   // the search the shown results are for
  const [sortBy, setSortBy] = useState('fit')   // 'fit' | 'skills'
  const [loading, setLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState(0)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [error, setError] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [subcategories, setSubcategories] = useState([])
  const [activeCategory, setActiveCategory] = useState('all')
  const [locations, setLocations] = useState([])     // every (country, location) of current openings
  const [location, setLocation] = useState(sessionStorage.getItem('lastLocation') || 'all')
  const [hideSenior, setHideSenior] = useState(sessionStorage.getItem('lastHideSenior') === '1')
  const [visibleCount, setVisibleCount] = useState(10)
  const latestSearch = useRef(0)   // only the newest search may update the page
  const restoreScroll = useRef(null)   // scroll position to go back to once cached results are shown
  const listRef = useRef(null)         // the results list scrolls, not the window

  const doSearch = async (role, category) => {
    const searchId = ++latestSearch.current
    const searchRole = role !== undefined ? role : roleFilter
    const searchCategory = category !== undefined ? category : activeCategory
    const body = searchBody(searchRole, searchCategory)
    const show = (data) => {
      setResults(data)
      setShownQuery(searchRole.trim())
      sessionStorage.setItem('lastRoleFilter', searchRole)
      sessionStorage.setItem('lastActiveCategory', searchCategory)
      setLoading(false)
    }
    setError('')
    setVisibleCount(10)
    const saved = peek('/recommend/', body)
    if (saved) {          // asked for in the last few minutes and nothing changed since: no loading screen
      show(saved)
      return
    }
    setLoading(true)
    setResults(null)
    setLoadingStep(0)
    setLoadingProgress(0)

    const stepInterval = setInterval(() => {
      setLoadingStep(prev => Math.min(prev + 1, LOADING_STEPS.length - 1))
      setLoadingProgress(prev => Math.min(prev + 20, 90))
    }, 800)

    try {
      const data = await cached('/recommend/', body)
      clearInterval(stepInterval)
      if (searchId !== latestSearch.current) return   // a newer search has started, ignore this one
      setLoadingProgress(100)
      setTimeout(() => {
        if (searchId !== latestSearch.current) return
        show(data)
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
    cached('/profile/skills').then(data => {
      const count = data.total ?? 0
      setSkillCount(count)
      if (count === 0) return

      cached('/jobs/subcategories').then(setSubcategories).catch(() => {})
      cached('/jobs/locations').then(setLocations).catch(() => {})

      // Keep the last search. Its results come from pageCache (dropped after any profile change, so they never
      // show different numbers from Job Detail: the 30 Sep problem)
      sessionStorage.removeItem('lastRecommendResults')   // left by older versions
      sessionStorage.removeItem('jobMatchesCache')        // left by 19a84cb
      // The category picked earlier in this visit; else the career goal (9 Oct: Job Matches opens on it, and the
      // category filter can still be cleared or changed); else all jobs
      const savedCategory = sessionStorage.getItem('lastActiveCategory') || user?.target_category || 'all'
      // Before 3 Oct a chip also wrote its name into the search box; don't restore that as typed text
      const savedRole = (sessionStorage.getItem('lastRoleFilter') || '') === savedCategory ? ''
        : sessionStorage.getItem('lastRoleFilter') || ''
      setRoleFilter(savedRole)
      setActiveCategory(savedCategory)
      // Back from a job: the same results, at the same place
      const view = readView()
      const resume = view.role === savedRole && view.category === savedCategory && peek('/recommend/', searchBody(savedRole, savedCategory))
      doSearch(savedRole, savedCategory)
      if (resume) {
        setSortBy(view.sortBy || 'fit')
        setVisibleCount(view.visible || 10)
        restoreScroll.current = view.scrollY || 0
      }
    }).catch(() => {
      // Not "empty profile": the request failed (e.g. server down). Show the error instead.
      setError('Could not load your skill profile. Please check the server is running and refresh.')
      setSkillCount(-1)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (results && restoreScroll.current !== null) {
      const y = restoreScroll.current
      restoreScroll.current = null
      requestAnimationFrame(() => { if (listRef.current) listRef.current.scrollTop = y })
    }
  }, [results])

  // Remember where the student was (sort, how many shown, scroll) before opening a job
  const openJob = (jobId) => {
    try {
      sessionStorage.setItem(VIEW, JSON.stringify({ role: sessionStorage.getItem('lastRoleFilter') || '', category: activeCategory, sortBy,
                                                    visible: visibleCount, scrollY: listRef.current?.scrollTop || 0 }))
    } catch { /* storage blocked: start at the top */ }
    navigate(`/jobs/${encodeURIComponent(jobId)}`, { state: { from: 'Job Matches' } })
  }

  if (skillCount === null) return (
    <div className="h-screen bg-slate-50 flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (skillCount === 0) return <NoSkillsState />

  // Typed search, category chip and location combine (Baymard: different filter types use AND)
  const handleCategoryClick = (cat) => {
    setActiveCategory(cat)
    doSearch(roleFilter, cat)
  }

  const handleFindJobs = () => doSearch(roleFilter, activeCategory)

  const handleLocation = (loc) => {
    setLocation(loc)
    setVisibleCount(10)
    sessionStorage.setItem('lastLocation', loc)
  }

  const handleHideSenior = (on) => {
    setHideSenior(on)
    setVisibleCount(10)
    sessionStorage.setItem('lastHideSenior', on ? '1' : '0')
  }

  const clearFilters = () => {
    handleLocation('all')
    handleHideSenior(false)
    setActiveCategory('all')
    doSearch(roleFilter, 'all')
  }

  const getMatchBgColor = (pct) => pct >= 70 ? 'bg-emerald-50 text-emerald-700' : pct >= 40 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-600'
  const getAccentColor  = (pct) => pct >= 70 ? 'bg-emerald-400' : pct >= 40 ? 'bg-amber-400' : 'bg-rose-400'

  // Displayed number = skill coverage (same as Job Detail). Default order = "best fit" (backend ranking,
  // which also weighs overall profile similarity and seniority); "most skills" re-sorts by coverage.
  const coverageOf = (job) => job.coverage_percent ?? job.match_percent
  // Job Matches shows only current openings (the backend no longer sends past 2024 postings;
  // those are used for Career Paths and market statistics instead)
  const allJobs = results?.recommendations || []
  const isSenior = (job) => SENIOR_LEVELS.includes(job.level)
  const levelJobs = hideSenior ? allJobs.filter(job => !isSenior(job)) : allJobs
  const placeJobs = levelJobs.filter(job => inLocation(job, location))
  // Options come from all current openings (stable list); counts follow the current search, chip and level switch
  const countIn = (loc) => levelJobs.filter(job => inLocation(job, loc)).length
  const statesBy = {}
  for (const place of locations) {
    const c = countryOf(place), st = stateOf(place)
    statesBy[c] = statesBy[c] || new Set()
    if (st) statesBy[c].add(st)
  }
  const countries = Object.keys(statesBy).sort((a, b) => (a === 'MY' ? -1 : b === 'MY' ? 1 : a.localeCompare(b)))
  // A typed search puts jobs matching it (title, company or location; search_match 3..0 from the backend) first;
  // the chosen sort only orders jobs within each group. Without a typed search every value is 0: nothing changes.
  const titleOf = (job) => job.search_match ?? 0
  const sortedJobs = sortBy === 'skills'
    // by how sure the coverage is (Wilson lower bound from the backend), so 1 of 1 doesn't beat 9 of 10 (5 Oct)
    ? [...placeJobs].sort((a, b) => titleOf(b) - titleOf(a)
        || (b.coverage_confidence ?? 0) - (a.coverage_confidence ?? 0) || coverageOf(b) - coverageOf(a)
        || b.match_score - a.match_score)
    : placeJobs
  const visibleJobs = sortedJobs.slice(0, visibleCount)
  const hasMore = results && visibleCount < sortedJobs.length

  const filtersOn = location !== 'all' || activeCategory !== 'all' || hideSenior
  const matchCount = placeJobs.filter(job => titleOf(job) > 0).length
  const locationOptions = (
    <>
      <option value="all">All locations</option>
      {countries.map(c => (
        <optgroup key={c} label={COUNTRY_NAMES[c] || c}>
          <option value={c} disabled={countIn(c) === 0}>All {COUNTRY_NAMES[c] || c} ({countIn(c)})</option>
          {[...statesBy[c]].sort().map(st => (
            <option key={st} value={`${c}:${st}`} disabled={countIn(`${c}:${st}`) === 0}>{st} ({countIn(`${c}:${st}`)})</option>
          ))}
        </optgroup>
      ))}
    </>
  )
  // The button shows the choice without a count ("Selangor", not "Selangor (45)"): a number on a filter button can
  // read as results, filters or places. Counts stay inside the open list, where they help to choose.
  const locationLabel = (loc) => loc.includes(':') ? loc.split(':')[1]
    : loc === 'MY' ? 'All Malaysia' : COUNTRY_NAMES[loc] || loc
  const categoryOptions = (
    <>
      <option value="all">All job categories</option>
      {subcategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
    </>
  )
  const searchInput = (pad) => (
    <div className={`flex-1 flex items-center gap-2 ${pad} pr-3 py-2.5 min-w-0`}>
      <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input type="text" value={roleFilter} aria-label="Search jobs"
        onChange={e => {
          setRoleFilter(e.target.value)
          // Emptied by hand: show the full list again (as the ✕ does), instead of keeping the old search's results
          if (!e.target.value.trim() && shownQuery) doSearch('', activeCategory)
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') handleFindJobs()
          if (e.key === 'Escape' && roleFilter) { setRoleFilter(''); doSearch('', activeCategory) }
        }}
        placeholder="Job title, skill or company"
        className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none text-slate-700 placeholder-slate-400" />
      {roleFilter && (
        <button onClick={() => { setRoleFilter(''); doSearch('', activeCategory) }} aria-label="Clear search"
          className="text-slate-400 hover:text-slate-600 text-xs">✕</button>
      )}
    </div>
  )
  const searchButton = (
    <button onClick={handleFindJobs} disabled={loading}
      className="bg-blue-600 text-white px-5 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50">
      {loading ? 'Searching…' : 'Search'}
    </button>
  )
  // Sort shows plain text with the browser's list invisibly on top (same as the filter buttons), so it is only as
  // wide as "Best fit" in every browser
  const sortSelect = (
    <span className="relative inline-flex items-center gap-1.5 text-sm text-slate-500 rounded focus-within:ring-2 focus-within:ring-blue-200">
      Sort by
      <span className="text-slate-700 font-medium">{sortBy === 'fit' ? 'Best fit' : 'Most skills matched'}</span>
      <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
      <select aria-label="Sort by" value={sortBy} onChange={e => { setSortBy(e.target.value); setVisibleCount(10) }}
        title={sortBy === 'fit'
          ? 'Mixes skills matched, how close your overall profile is to the role, and entry-level roles first'
          : 'Jobs where you already have the most of the skills they ask for'}
        className="absolute inset-0 w-full opacity-0 cursor-pointer">
        <option value="fit">Best fit</option>
        <option value="skills">Most skills matched</option>
      </select>
    </span>
  )

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
            {/* A visible button: matches come from the profile, so updating it is the main way to change them */}
            <button onClick={() => navigate('/profile')}
              className="flex items-center gap-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3.5 py-2
                hover:bg-blue-100 hover:border-blue-300 transition shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15.232 5.232l3.536 3.536M9 13l6.232-6.232a2.5 2.5 0 113.536 3.536L12.536 16.536 8 18l1.464-4.536z" />
              </svg>
              Update profile
            </button>
          </div>

          <div className="flex gap-2 mb-3">
            <div className="flex-1 flex items-center bg-white border border-slate-200 rounded-lg focus-within:border-blue-300 transition">
              {searchInput('pl-3.5')}
            </div>
            {searchButton}
          </div>
          {/* Filters (3 Oct): one row of identical buttons, sort on the right (Indeed-style top bar, references.md
              "How job sites lay out search + filters"). A button shows its value when set and clears with ✕. */}
          <div className="flex flex-wrap items-center gap-2 pb-4">
            <FilterButton label="Location" display={locationLabel(location)} active={location !== 'all'}
              value={location} onChange={handleLocation} onClear={() => handleLocation('all')}>{locationOptions}</FilterButton>
            <FilterButton label="Job category" display={activeCategory} active={activeCategory !== 'all'}
              value={activeCategory} onChange={handleCategoryClick} onClear={() => handleCategoryClick('all')}>{categoryOptions}</FilterButton>
            <button type="button" aria-pressed={hideSenior} onClick={() => handleHideSenior(!hideSenior)}
              title="Hides jobs whose title says Senior, Lead or Manager"
              className={`${PILL} px-3.5 py-1.5 ${hideSenior ? PILL_ON : PILL_OFF}`}>
              Hide senior roles{hideSenior && <span aria-hidden="true" className="ml-2">✕</span>}
            </button>
            <div className="ml-auto">{sortSelect}</div>
          </div>
        </div>
      </PageHeader>

      <div ref={listRef} className="flex-1 overflow-auto px-8 py-4">
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
            {/* Count line (3 Oct): a search only ranks (others stay below the divider), so with a search it counts the
                jobs that match it, not the whole list; with nothing typed or set the header already gives the total */}
            {allJobs.length > 0 && (shownQuery || filtersOn) && (
              <div className="pb-1 text-sm">
                <p className="text-slate-500">
                  {shownQuery && matchCount === 0 && filtersOn
                    ? `No openings match “${shownQuery}” with these filters. Showing the ${placeJobs.length} ${placeJobs.length === 1 ? 'opening' : 'openings'} in these filters instead.`
                    : shownQuery && matchCount === 0
                    ? `No openings match “${shownQuery}”. Showing others that fit your profile.`
                    : shownQuery
                    ? `${matchCount} ${matchCount === 1 ? 'opening matches' : 'openings match'} “${shownQuery}”`
                    : `${placeJobs.length} ${placeJobs.length === 1 ? 'opening' : 'openings'}`}
                  {filtersOn && (
                    <button onClick={clearFilters} className="ml-3 text-blue-600 hover:underline">Clear filters</button>
                  )}
                </p>
              </div>
            )}
            {placeJobs.length === 0 ? (
              <div className="bg-white rounded-xl p-10 text-center border border-slate-200">
                <p className="text-slate-400 text-sm">No current openings match this search. Try a broader search, another category or location.</p>
              </div>
            ) : (
              <>
                {visibleJobs.map((job, idx) => (
                  <Fragment key={job.job_id}>
                  {idx > 0 && titleOf(job) === 0 && titleOf(visibleJobs[idx - 1]) > 0 && (
                    <p className="text-xs text-slate-400 pt-3 pb-1 px-1">Other openings that fit your profile</p>
                  )}
                  <div onClick={() => openJob(job.job_id)}
                    className="bg-white rounded-xl border border-slate-200 cursor-pointer hover:border-blue-200 hover:shadow-sm transition group overflow-hidden flex">
                    {/* Left accent bar */}
                    <div className={`w-1 shrink-0 ${getAccentColor(coverageOf(job))}`} />
                    <div className="flex-1 px-4 py-3.5 min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-xs text-slate-300 font-medium tabular-nums shrink-0 w-4">{idx + 1}</span>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800 text-sm truncate group-hover:text-blue-700 transition leading-snug">{job.job_title}</p>
                            <p className="text-xs text-slate-400 mt-0.5 truncate">
                              {job.company} · {job.location}{daysAgo(job.posted_days_ago) && ` · ${daysAgo(job.posted_days_ago)}`}
                            </p>
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
                        <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md font-medium">{job.subcategory}</span>
                        {job.salary && job.salary !== 'nan' && (
                          <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md font-medium">{job.salary}</span>
                        )}
                        {job.top_job_skills?.slice(0, 3).map(skill => (
                          // the skill the search matched comes first and is highlighted: it shows why the job is here
                          <span key={skill} className={skill === job.search_skill
                            ? 'text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200 font-medium'
                            : 'text-xs text-slate-400 px-2 py-0.5 rounded-md border border-slate-200'}>{skillName(skill)}</span>
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
                  <p className="text-center text-xs text-slate-400 py-3">{sortedJobs.length === 1 ? 'End of list' : `End of list · all ${sortedJobs.length} shown`}</p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const Chevron = () => (
  <svg className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"
    fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
)

const PILL = 'inline-flex items-center text-sm rounded-full border transition'
const PILL_ON = 'border-blue-300 bg-blue-50 text-blue-700'
const PILL_OFF = 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'

// Filter button: shows "Location ⌄" or the chosen value with ✕. The browser's own list sits invisibly on top of the
// label, so opening, keyboard use and screen readers work as with a normal dropdown.
function FilterButton({ label, display, active, value, onChange, onClear, children }) {
  return (
    <span className={`${PILL} focus-within:ring-2 focus-within:ring-blue-200 ${active ? PILL_ON : PILL_OFF}`}>
      <span className={`relative py-1.5 pl-3.5 ${active ? 'pr-1.5' : 'pr-8'}`}>
        {active ? display : label}
        {!active && <Chevron />}
        <select aria-label={label} value={value} onChange={e => onChange(e.target.value)}
          className="absolute inset-0 w-full opacity-0 cursor-pointer">
          {children}
        </select>
      </span>
      {active && (
        <button type="button" onClick={onClear} aria-label={`Clear ${label.toLowerCase()}`}
          className="pr-3 pl-1 py-1.5 text-blue-500 hover:text-blue-800">✕</button>
      )}
    </span>
  )
}
