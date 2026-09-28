import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import PageHeader from '../components/PageHeader'

// A job counts as "aligned" when you cover at least half its required skills
const ALIGNED_MIN_COVERAGE = 50

const getGreeting = () => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  // Summary comes from the backend on every visit, so it's never stale and works
  // before Job Matches has been opened. Same request as Job Matches' default view
  // (all live jobs, Best fit order), so the top 3 here are the top 3 there.
  const [summary, setSummary] = useState(null)   // null = loading
  const [emptyProfile, setEmptyProfile] = useState(false)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    api.get('/auth/me').then(res => setUser(res.data)).catch(() => {})
    api.post('/recommend/', { top_n: 0, role_filter: '' })
      .then(res => setSummary(res.data))
      .catch(err => {
        if (err.response?.status === 400) setEmptyProfile(true)   // no modules, projects or certs yet
        else setLoadError('Could not load your summary. Please check the server is running and refresh.')
      })
  }, [])

  const topJobs = summary?.recommendations?.slice(0, 3) || []
  const profile = summary?.graduate_profile
  const allJobs = summary?.recommendations || []
  const profileStats = profile && {
    // Openings where the student covers at least half the required skills. Replaces a raw
    // skill count, which is a vanity number (doesn't lead to any action; see references.md)
    aligned: allJobs.filter(j => j.coverage_percent >= ALIGNED_MIN_COVERAGE).length,
    openings: allJobs.length,
    modules: profile.modules_count,
    // Skill coverage of the #1 job, whole number like Job Detail; null = no live jobs yet
    bestMatch: topJobs[0] ? Math.round(topJobs[0].coverage_percent) : null,
    bestMatchTitle: topJobs[0]?.job_title || null,
  }
  const loading = !summary && !emptyProfile && !loadError

  const firstName = user?.first_name || 'there'

  // Semantic match colors only — not used as decoration anywhere else
  const getMatchColor = (pct) => pct >= 70 ? 'text-emerald-600' : pct >= 40 ? 'text-amber-600' : 'text-rose-500'
  const getDotColor  = (pct) => pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-rose-400'

  return (
    <div className="min-h-screen bg-slate-50">

      <PageHeader>
        <div className="flex items-end justify-between pb-5">
          <div>
            <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-widest mb-2">Dashboard</p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {getGreeting()}, {firstName} 👋
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Track your skills and discover opportunities in the Malaysian job market.
            </p>
          </div>
        </div>
      </PageHeader>

      <div className="px-8 py-6 space-y-6">

        {loadError && <p className="text-sm text-rose-500">{loadError}</p>}

        {emptyProfile && (
          <div className="bg-white rounded-xl p-5 border border-slate-200 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-800">Your skill profile is empty</p>
              <p className="text-sm text-slate-500 mt-0.5">Add your module grades, a project or a certification to see your job matches.</p>
            </div>
            <button
              onClick={() => navigate('/profile')}
              className="shrink-0 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg px-4 py-2 transition"
            >
              Set up profile
            </button>
          </div>
        )}

        {/* Stats strip */}
        {loading && (
          <div className="grid grid-cols-3 gap-4">
            {[0, 1, 2].map(i => (
              <div key={i} className="bg-white rounded-xl p-5 border border-slate-200 animate-pulse">
                <div className="h-3 w-24 bg-slate-100 rounded mb-4" />
                <div className="h-7 w-16 bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        )}

        {profileStats && (
          <div className="grid grid-cols-3 gap-4">
            {[
              {
                label: 'Openings You Align With',
                value: profileStats.aligned,
                sub: `of ${profileStats.openings} current openings · you cover ≥ half the skills`,
                dim: profileStats.aligned === 0,
              },
              {
                label: 'Top Match',
                value: profileStats.bestMatch != null ? `${profileStats.bestMatch}%` : '—',
                sub: profileStats.bestMatchTitle || 'no current openings yet',
                dim: profileStats.bestMatch == null,
                matchPct: profileStats.bestMatch,
              },
              {
                label: 'Modules Recorded',
                value: profileStats.modules,
                sub: profileStats.modules > 0 ? 'in your academic record' : 'none recorded yet',
                dim: false,
              },
            ].map(({ label, value, sub, dim, matchPct }) => (
              <div key={label} className="bg-white rounded-xl p-5 border border-slate-200">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">{label}</p>
                <p className={`text-3xl font-semibold tracking-tight leading-none ${
                  dim ? 'text-slate-200' :
                  matchPct != null ? getMatchColor(matchPct) :
                  'text-slate-900'
                }`}>
                  {value}
                </p>
                <p className="text-xs text-slate-400 mt-1.5 truncate">{sub}</p>
              </div>
            ))}
          </div>
        )}

        {/* Top matches */}
        {topJobs.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-700">Top Job Matches</h2>
              <button
                onClick={() => navigate('/recommend')}
                className="text-xs text-blue-600 font-medium hover:text-blue-700"
              >
                View all →
              </button>
            </div>
            <div className="divide-y divide-slate-50">
              {topJobs.map((job, idx) => (
                <div
                  key={job.job_id}
                  onClick={() => navigate(`/jobs/${encodeURIComponent(job.job_id)}`)}
                  className="flex items-center justify-between gap-3 px-5 py-3 cursor-pointer hover:bg-slate-50 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs text-slate-300 w-4 shrink-0 font-medium tabular-nums">{idx + 1}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{job.job_title}</p>
                      <p className="text-xs text-slate-400">{job.company} · {job.location}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className={`w-1.5 h-1.5 rounded-full ${getDotColor(job.coverage_percent)}`} />
                    <span className={`text-xs font-semibold tabular-nums ${getMatchColor(job.coverage_percent)}`}>
                      {`${job.skills_matched}/${job.skills_total} skills`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Feature grid */}
        <div className="grid grid-cols-2 gap-4">
          {[
            {
              label: 'My Profile',
              desc: 'Manage your modules, projects, and certifications to build your skill profile',
              cta: 'View profile',
              path: '/profile',
              icon: (
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              ),
            },
            {
              label: 'Job Recommendations',
              desc: 'Find jobs that match your skills from the Malaysian job market',
              cta: 'Explore jobs',
              path: '/recommend',
              icon: (
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              ),
            },
            {
              label: 'AI Career Assistant',
              desc: 'Get personalised guidance on your career and skill development',
              cta: 'Chat now',
              path: '/chatbot',
              icon: (
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              ),
            },
          ].map(({ label, desc, cta, path, icon }) => (
            <div
              key={label}
              onClick={() => navigate(path)}
              className="bg-white rounded-xl p-5 border border-slate-200 cursor-pointer hover:border-blue-200 hover:shadow-sm transition group"
            >
              <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center mb-4 group-hover:bg-blue-100 transition">
                {icon}
              </div>
              <h2 className="text-sm font-semibold text-slate-800">{label}</h2>
              <p className="text-sm text-slate-500 mt-1 leading-relaxed">{desc}</p>
              <span className="inline-block mt-3 text-sm text-blue-600 font-medium">{cta} →</span>
            </div>
          ))}

          {/* Disabled card */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 opacity-40">
            <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h2 className="text-sm font-semibold text-slate-700">Skill Gap Analysis</h2>
            <p className="text-sm text-slate-400 mt-1 leading-relaxed">See exactly which skills you need for your target role</p>
            <span className="inline-block mt-3 text-sm text-slate-400 font-medium">Select a job first →</span>
          </div>
        </div>

      </div>
    </div>
  )
}