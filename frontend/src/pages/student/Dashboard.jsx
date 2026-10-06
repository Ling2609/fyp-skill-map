import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api'
import { cached, peek, ALL_MATCHES } from '../../pageCache'
import { useAuth } from '../../context/useAuth'
import PageHeader from '../../components/PageHeader'
import LevelTag from '../../components/LevelTag'

// Skill names are saved as the ad wrote them, often all lower case ("business process analysis")
const sentenceCase = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text)

// "today" / "6 Oct" next to a saved chat
const chatDay = (iso) => {
  const d = new Date(iso)
  return d.toDateString() === new Date().toDateString() ? 'today'
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

const readBasedOn = () => {
  try { return localStorage.getItem('learnBasedOn') || '' } catch { return '' }
}

const getGreeting = () => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()   // already loaded at sign-in; kept up to date by Account Settings
  // Same request as Job Matches' default view (all live jobs, Best fit order), so the top 3 here are the top 3
  // there. Kept by pageCache for a few minutes and dropped after any profile change (6 Oct): no reload per visit.
  const [summary, setSummary] = useState(() => peek('/recommend/', ALL_MATCHES))   // null = loading
  const [emptyProfile, setEmptyProfile] = useState(false)
  const [loadError, setLoadError] = useState('')

  // "Skills to learn next", counted over the matches the student chooses (6 Oct, her idea; Harper et al. 2015:
  // users rate recommendations they can steer "much more positively"). '' = all matches, else one job category
  const [basedOn, setBasedOn] = useState(readBasedOn)
  const [categories, setCategories] = useState([])
  const [learnFor, setLearnFor] = useState(() => peek('/recommend/', { ...ALL_MATCHES, category: readBasedOn() }))
  const [chats, setChats] = useState(null)        // null = loading
  const [chatNote, setChatNote] = useState('')

  useEffect(() => {
    cached('/jobs/subcategories').then(setCategories).catch(() => {})
    api.get('/chatbot/sessions')
      .then(res => setChats(res.data.slice(0, 3)))
      .catch(err => {
        setChats([])
        setChatNote(err.response?.status === 503 ? 'Chat history is off (MongoDB is not running).' : '')
      })
  }, [])

  useEffect(() => {
    let cancelled = false
    cached('/recommend/', { ...ALL_MATCHES, category: basedOn })
      .then(data => { if (!cancelled) setLearnFor(data) })
      .catch(() => { if (!cancelled) setLearnFor({ skills_to_learn: [] }) })
    return () => { cancelled = true }
  }, [basedOn])

  const chooseBasedOn = (value) => {
    setLearnFor(peek('/recommend/', { ...ALL_MATCHES, category: value }))   // null shows "Loading…" until it arrives
    setBasedOn(value)
    try { localStorage.setItem('learnBasedOn', value) } catch { /* not remembered: fine */ }
  }

  const learn = (skill) => navigate(`/chatbot?skill=${encodeURIComponent(skill)}`
    + (basedOn ? `&job=${encodeURIComponent(basedOn)}` : ''))

  useEffect(() => {
    cached('/recommend/', ALL_MATCHES)
      .then(setSummary)
      .catch(err => {
        if (err.response?.status === 400) setEmptyProfile(true)   // no modules, projects or certs yet
        else setLoadError('Could not load your summary. Please check the server is running and refresh.')
      })
  }, [])

  const topJobs = summary?.recommendations?.slice(0, 3) || []
  const profile = summary?.graduate_profile
  const nextSkill = summary?.skills_to_learn?.[0]
  const profileStats = profile && {
    // The skill missing most often in the student's top matches: an action, not a vanity count.
    // Replaced "Openings you align with" (step 2, 30 Sep): with only skills you have counting,
    // that count fell to a handful and no longer led anywhere (see references.md, "Dashboard metric")
    nextSkill: sentenceCase(nextSkill?.skill) || null,
    nextSkillSub: nextSkill ? `missing in ${nextSkill.jobs} of your top ${nextSkill.of_top} matches`
      : topJobs.length ? 'you have every skill your top matches list' : 'no current openings yet',
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
                label: 'Skill to Learn Next',
                value: profileStats.nextSkill || '—',
                sub: profileStats.nextSkillSub,
                dim: !profileStats.nextSkill,
                text: true,
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
            ].map(({ label, value, sub, dim, matchPct, text }) => (
              <div key={label} className="bg-white rounded-xl p-5 border border-slate-200">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">{label}</p>
                <p title={text ? String(value) : undefined} className={`${text ? 'text-xl truncate' : 'text-3xl'} font-semibold tracking-tight leading-none ${
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
                  onClick={() => navigate(`/jobs/${encodeURIComponent(job.job_id)}`, { state: { from: 'Dashboard' } })}
                  className="flex items-center justify-between gap-3 px-5 py-3 cursor-pointer hover:bg-slate-50 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs text-slate-300 w-4 shrink-0 font-medium tabular-nums">{idx + 1}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{job.job_title}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                        <LevelTag level={job.level} />
                        <p className="text-xs text-slate-400 truncate">{job.company} · {job.location}</p>
                      </div>
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

        {/* Next steps (her choice A, 6 Oct): replaces four shortcut cards that repeated the sidebar */}
        {!emptyProfile && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200">
              <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-700">Skills to learn next</h2>
                <label className="flex items-center gap-1.5 text-xs text-slate-400 min-w-0">
                  Based on
                  <select value={basedOn} onChange={e => chooseBasedOn(e.target.value)}
                    className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-md px-1.5 py-1 max-w-[11rem] truncate focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">All my matches</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              </div>
              {!learnFor ? (
                <p className="px-5 py-4 text-xs text-slate-400">Loading…</p>
              ) : !(learnFor.skills_to_learn || []).length ? (
                <p className="px-5 py-4 text-sm text-slate-500">You have every required skill your top matches here ask for.</p>
              ) : (
                <ul className="divide-y divide-slate-50">
                  {learnFor.skills_to_learn.map(s => (
                    <li key={s.skill} className="flex items-center justify-between gap-3 px-5 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-800 truncate">{sentenceCase(s.skill)}</p>
                        <p className="text-xs text-slate-400">missing in {s.jobs} of your top {s.of_top} matches</p>
                      </div>
                      <button onClick={() => learn(s.skill)}
                        className="text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-full transition font-medium shrink-0">
                        Learn →
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200">
              <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-700">Continue a chat</h2>
                <button onClick={() => navigate('/chatbot')} className="text-xs text-blue-600 font-medium hover:text-blue-700">
                  + New chat
                </button>
              </div>
              {chats === null ? (
                <p className="px-5 py-4 text-xs text-slate-400">Loading…</p>
              ) : !chats.length ? (
                <p className="px-5 py-4 text-sm text-slate-500">
                  {chatNote || 'No chats yet. Ask the AI Assistant about a skill or a career path.'}
                </p>
              ) : (
                <ul className="divide-y divide-slate-50">
                  {chats.map(c => (
                    <li key={c.id}>
                      <button onClick={() => navigate('/chatbot', { state: { openSession: c.id } })}
                        className="w-full flex items-center justify-between gap-3 px-5 py-3 text-left hover:bg-slate-50 transition">
                        <span className="text-sm text-slate-700 truncate">
                          {c.context?.target_skill
                            ? `Learn ${c.context.target_skill}${c.context.job_title ? ` · ${c.context.job_title}` : ''}`
                            : c.title}
                        </span>
                        <span className="text-xs text-slate-400 shrink-0">{chatDay(c.updated_at)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}