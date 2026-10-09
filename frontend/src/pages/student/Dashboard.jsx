import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api'
import { cached, ALL_MATCHES } from '../../pageCache'
import { useAuth } from '../../context/useAuth'
import PageHeader from '../../components/PageHeader'
import LevelTag from '../../components/LevelTag'
import { skillName } from '../../skillName'

// Dashboard (9 Oct redesign, her choice after the "Dashboard on One Screen" mock-ups). A dashboard tells the student
// what she doesn't know yet (NN/g: "communicating critical information"), so:
//   left:  the goal card: how close she is to the jobs she wants ("7/10"), what's missing, a plan for it; with no
//          goal, the job categories her skills fit best and the career counsellor
//   right: top job matches and "your skills employers want most", both for her goal (or all jobs), and saying so
// On a laptop it fills the screen under the header; long lists scroll inside their card; narrow screens stack.
// GET /recommend/goal (app/routers/recommend.py) gives the goal card's numbers in one request.

const chatDay = (iso) => {
  const d = new Date(iso)
  return d.toDateString() === new Date().toDateString() ? 'today'
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

const getGreeting = () => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

const pct = (share) => `${Math.round(share * 100)}%`
const listAnd = (items) => items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`

function Card({ title, sub, action, className = '', children }) {
  return (
    <section className={`bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col min-h-0 ${className}`}>
      {title && (
        <div className="shrink-0 flex items-baseline justify-between gap-3 px-6 pt-5 pb-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
            {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

// The goal drop-down at the top of the goal card: changing it saves straight away
function GoalPicker({ goal, categories, busy, onChange }) {
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
      Your goal
      <select value={goal || ''} disabled={busy} onChange={e => onChange(e.target.value || null)}
        className="text-sm font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg pl-3 py-1.5 max-w-full sm:max-w-xs min-w-0 focus:outline-none focus:ring-2 focus:ring-blue-500">
        <option value="">Open to all ICT roles</option>
        {categories.map(c => <option key={c.name} value={c.name}>{c.name} ({c.jobs})</option>)}
      </select>
    </label>
  )
}

function GoalCard({ data, busy, onGoal, onPlan, onJobs }) {
  const have = data.readiness.filter(r => r.has)
  const missing = data.readiness.filter(r => !r.has)
  const [picked, setPicked] = useState(() => missing.slice(0, 1).map(r => r.skill))
  const toggle = (skill) => setPicked(p => p.includes(skill) ? p.filter(s => s !== skill) : [...p, skill])
  const total = data.readiness.length
  return (
    <Card className="lg:flex-1">
      <div className="px-5 sm:px-7 pt-6 pb-6 flex flex-col flex-1 min-h-0">
        <GoalPicker goal={data.goal} categories={data.categories} busy={busy} onChange={onGoal} />
        <div className="flex flex-wrap items-end gap-x-5 gap-y-2 mt-5">
          <p className="text-5xl font-bold tracking-tight text-slate-900 tabular-nums leading-none">
            {have.length}<span className="text-slate-300">/{total}</span>
          </p>
          <div className="pb-1 min-w-48 flex-1">
            <p className="text-lg font-semibold tracking-tight text-slate-900">of the top skills these jobs ask for</p>
            <p className="text-sm text-slate-500">
              {missing.length ? `${missing.length} to go` : 'You have them all'} · based on {data.jobs} live {data.jobs === 1 ? 'job' : 'jobs'} in Malaysia
            </p>
          </div>
        </div>
        {/* One block per top skill: filled = you have it; dashed = still to learn; light blue = in your plan */}
        <div className="grid gap-1.5 mt-4" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }} aria-hidden="true">
          {data.readiness.map(r => (
            <span key={r.skill} className={`h-3 rounded ${r.has ? 'bg-blue-700'
              : picked.includes(r.skill) ? 'bg-blue-200 border border-blue-700' : 'bg-white border-[1.5px] border-dashed border-slate-400'}`} />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {have.map(r => (
            <span key={r.skill} className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">✓ {skillName(r.skill)}</span>
          ))}
        </div>
        {missing.length > 0 && (
          <div className="mt-4 min-h-0 flex flex-col">
            <p className="shrink-0 text-sm font-semibold text-slate-700">Still to learn <span className="font-normal text-slate-500">· tick the ones you want a plan for</span></p>
            {/* pr-3: the % keeps a little space from the scroll bar */}
            <ul className="mt-1 min-h-0 lg:overflow-y-auto pr-3">
              {missing.map((r, i) => (
                <li key={r.skill} className="border-t border-slate-100 first:border-t-0">
                  <label className="flex items-center gap-3 py-2 cursor-pointer">
                    <input type="checkbox" checked={picked.includes(r.skill)} onChange={() => toggle(r.skill)} className="w-4 h-4 accent-blue-700" />
                    <span className="flex-1 text-sm text-slate-800">{skillName(r.skill)}</span>
                    <span className="text-xs text-slate-500 tabular-nums">{i === 0 ? `asked by ${pct(r.share)} of these jobs` : pct(r.share)}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-auto pt-5 flex flex-wrap items-center gap-2">
          {missing.length > 0 && (
            <button type="button" disabled={!picked.length} onClick={() => onPlan(picked.map(skillName))}
              className="text-sm font-medium px-4 py-2 rounded-xl bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-40 transition">
              {picked.length ? `Plan how to learn ${listAnd(picked.map(skillName))}` : 'Tick a skill to plan'}
            </button>
          )}
          <button type="button" onClick={onJobs}
            className="text-sm font-medium px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-700 transition">
            See the {data.jobs} {data.jobs === 1 ? 'job' : 'jobs'}
          </button>
        </div>
      </div>
    </Card>
  )
}

function NoGoalCard({ data, busy, onGoal, onCounsellor }) {
  const [choice, setChoice] = useState(data.best_fit[0]?.category || '')
  return (
    <Card className="lg:flex-1">
      <div className="px-5 sm:px-7 pt-6 pb-6 flex flex-col flex-1 min-h-0">
        <GoalPicker goal={null} categories={data.categories} busy={busy} onChange={onGoal} />
        <p className="text-2xl font-semibold tracking-tight text-slate-900 mt-5 leading-tight">
          Not sure which role fits you yet?<br /><span className="text-slate-400">That's normal.</span>
        </p>
        {data.best_fit.length > 0 ? (
          <>
            <p className="text-sm text-slate-500 mt-2">These job categories fit your skills best. Pick one to see how close you are.</p>
            <div role="radiogroup" aria-label="Job categories" className="mt-4 grid gap-2 min-h-0 lg:overflow-y-auto">
              {data.best_fit.map(b => (
                <label key={b.category} className={`flex items-center gap-3 border rounded-xl px-4 py-2.5 cursor-pointer transition ${
                  choice === b.category ? 'border-blue-600 bg-blue-50' : 'border-slate-200 hover:border-blue-300'}`}>
                  <input type="radio" name="best-fit" checked={choice === b.category} onChange={() => setChoice(b.category)} className="accent-blue-700" />
                  <span className="flex-1 text-sm text-slate-800">{b.category}</span>
                  <span className="text-xs text-slate-500 tabular-nums">{b.have} of {b.of} skills</span>
                </label>
              ))}
            </div>
          </>
        ) : <p className="text-sm text-slate-500 mt-2">Talk it through with the career counsellor, or pick a job category above.</p>}
        <div className="mt-auto pt-5 flex flex-wrap items-center gap-2">
          {data.best_fit.length > 0 && (
            <button type="button" disabled={busy || !choice} onClick={() => onGoal(choice)}
              className="text-sm font-medium px-4 py-2 rounded-xl bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-40 transition">
              Set as my goal
            </button>
          )}
          <button type="button" onClick={onCounsellor}
            className="text-sm font-medium px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-700 transition">
            Not sure? Talk to the counsellor
          </button>
        </div>
      </div>
    </Card>
  )
}

// No modules, projects, certificates or awards yet: one clear way forward, not empty cards (NN/g, empty states)
function StartCard({ onGo }) {
  const steps = [
    { tab: 'modules', icon: '📘', title: 'Modules and grades', text: 'The strongest evidence for your skills.' },
    { tab: 'projects', icon: '🗂️', title: 'Projects', text: 'What you built, or import from GitHub.' },
    { tab: 'certs', icon: '🎓', title: 'Certificates', text: 'Courses and badges you earned.' },
    { tab: 'awards', icon: '🏆', title: 'Awards', text: 'Competitions, scholarships, dean\'s list.' },
  ]
  return (
    <Card>
      <div className="px-8 py-8">
        <p className="text-xl font-semibold tracking-tight text-slate-900">Add what you've done to see your matches</p>
        <p className="text-sm text-slate-500 mt-1">SkillMap turns your modules, projects, certificates and awards into skills, then compares them with live jobs.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
          {steps.map(s => (
            <button key={s.tab} type="button" onClick={() => onGo(s.tab)}
              className="text-left border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:bg-blue-50/40 transition">
              <span aria-hidden="true" className="text-2xl">{s.icon}</span>
              <p className="text-sm font-semibold text-slate-800 mt-2">{s.title}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.text}</p>
            </button>
          ))}
        </div>
      </div>
    </Card>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { user, setUser } = useAuth()
  const [goalData, setGoalData] = useState(null)      // GET /recommend/goal
  const [matches, setMatches] = useState(null)        // top job matches for the goal (or all)
  const [emptyProfile, setEmptyProfile] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)
  const [chats, setChats] = useState(null)
  const [chatNote, setChatNote] = useState('')

  // Only sets state when an answer comes back (so it can run from an effect)
  const load = useCallback(() => {
    api.get('/recommend/goal')
      .then(res => {
        setGoalData(res.data)
        // The same request Job Matches sends for this category, so the order is the same there
        return cached('/recommend/', { ...ALL_MATCHES, category: res.data.goal || '' })
      })
      .then(rec => setMatches(rec.recommendations || []))
      .catch(err => {
        if (err.response?.status === 400) setEmptyProfile(true)   // nothing in the profile yet
        else setLoadError("Couldn't load your dashboard. Please check the server is running and refresh.")
      })
  }, [])

  useEffect(() => {
    load()
    api.get('/chatbot/sessions')
      .then(res => setChats(res.data.slice(0, 1)))
      .catch(err => { setChats([]); setChatNote(err.response?.status === 503 ? 'Chat history is off (MongoDB is not running).' : '') })
  }, [load])

  // "See the N jobs": Job Matches on the goal category, even if another category was picked there earlier
  const seeGoalJobs = () => {
    try { sessionStorage.setItem('lastActiveCategory', goalData.goal) } catch { /* storage blocked */ }
    navigate('/recommend')
  }

  const changeGoal = async (category) => {
    setBusy(true)
    try {
      await api.put('/profile/goal', { category })
      setUser(u => ({ ...u, target_category: category }))
      // A new goal: Job Matches opens on it, not on a category picked earlier in this visit
      try { sessionStorage.removeItem('lastActiveCategory') } catch { /* storage blocked */ }
      setGoalData(null); setMatches(null); setLoadError('')
      load()
    } catch {
      setLoadError("Couldn't save your goal. Please try again.")
    } finally { setBusy(false) }
  }

  const plan = (skills) => navigate(`/chatbot?skill=${encodeURIComponent(listAnd(skills))}`
    + (goalData?.goal ? `&job=${encodeURIComponent(goalData.goal)}` : ''))
  // The counsellor chat opens with this message in the box, not sent: she can change it first (9 Oct)
  const counsellor = () => {
    const strong = (goalData?.wanted || []).slice(0, 3).map(w => skillName(w.skill))
    const fits = (goalData?.best_fit || []).map(b => b.category)
    const ask = "I'm not sure which ICT role suits me."
      + (strong.length ? ` My strongest skills are ${listAnd(strong)}` : '')
      + (fits.length ? `${strong.length ? ', and' : ''} the job categories that fit me best are ${listAnd(fits)}.` : strong.length ? '.' : '')
      + ' Can you help me choose?'
    navigate(`/chatbot?mode=career_counsellor&ask=${encodeURIComponent(ask)}`)
  }

  const firstName = user?.first_name || 'there'
  const scope = goalData?.goal ? `In ${goalData.goal}` : `Across all ${goalData?.jobs ?? ''} live jobs`
  const chat = chats?.[0]

  return (
    // Wide screens: fills the window under the header (her request: no blank strip at the bottom)
    <div className="min-h-screen lg:h-screen bg-slate-50 flex flex-col">
      <PageHeader>
        <div className="pb-5 pt-1">
          <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-widest mb-2">Dashboard</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{getGreeting()}, {firstName} 👋</h1>
        </div>
      </PageHeader>

      <div className="flex-1 min-h-0 px-8 py-6">
        {loadError && <p role="alert" className="text-sm text-rose-600 bg-rose-50 rounded-lg px-4 py-3 mb-4">{loadError}</p>}

        {emptyProfile ? <StartCard onGo={(tab) => navigate(`/profile?tab=${tab}`)} /> : !goalData ? (
          <div className="grid lg:grid-cols-[1.3fr_1fr] gap-5 lg:h-full" aria-busy="true">
            {[0, 1].map(i => <div key={i} className="bg-white rounded-2xl border border-slate-200 animate-pulse min-h-64" />)}
          </div>
        ) : (
          <div className="grid lg:grid-cols-[1.3fr_1fr] gap-5 lg:h-full">
            <div className="flex flex-col gap-5 min-h-0 min-w-0">
              {goalData.goal
                ? <GoalCard key={goalData.goal} data={goalData} busy={busy} onGoal={changeGoal} onPlan={plan} onJobs={seeGoalJobs} />
                : <NoGoalCard data={goalData} busy={busy} onGoal={changeGoal} onCounsellor={counsellor} />}
              <Card className="shrink-0">
                <div className="flex items-center justify-between gap-3 px-6 py-4">
                  <p className="text-sm min-w-0 truncate">
                    <span className="font-semibold text-slate-800">Continue a chat</span>
                    <span className="text-slate-500">
                      {chats === null ? ' · loading…' : chat
                        ? ` · ${chat.context?.target_skill ? `Learn ${chat.context.target_skill}` : chat.title} · ${chatDay(chat.updated_at)}`
                        : ` · ${chatNote || 'no chats yet'}`}
                    </span>
                  </p>
                  <button type="button" onClick={() => navigate('/chatbot', chat ? { state: { openSession: chat.id } } : undefined)}
                    className="text-sm font-medium text-blue-700 hover:underline shrink-0">{chat ? 'Open' : 'New chat'}</button>
                </div>
              </Card>
            </div>

            <div className="flex flex-col gap-5 min-h-0 min-w-0">
              <Card title="Top job matches" sub={`${scope} · best fit first`} className="lg:flex-1 min-h-56"
                action={<button type="button" onClick={() => navigate('/recommend')} className="text-sm font-medium text-blue-700 hover:underline shrink-0">View all</button>}>
                <div className="pl-6 pr-3 pb-4 min-h-0 lg:overflow-y-auto">
                  {matches === null ? <p className="text-sm text-slate-400 py-3">Loading…</p>
                    : !matches.length ? <p className="text-sm text-slate-500 py-3">No current openings here yet. Try another goal, or check back after the next job update.</p>
                    : (
                      <ul className="divide-y divide-slate-100">
                        {matches.slice(0, 6).map(job => (
                          <li key={job.job_id}>
                            <button type="button" onClick={() => navigate(`/jobs/${encodeURIComponent(job.job_id)}`, { state: { from: 'Dashboard' } })}
                              className="w-full flex items-center justify-between gap-3 py-2 text-left hover:bg-slate-50 -mx-2 px-2 rounded-lg transition">
                              <span className="min-w-0">
                                <span className="block text-sm text-slate-800 truncate">{job.job_title}</span>
                                <span className="block text-xs text-slate-500 truncate">{job.company}{job.location && ` · ${job.location}`}</span>
                              </span>
                              <span className="flex items-center gap-2 shrink-0">
                                <LevelTag level={job.level} />
                                <span className="text-xs font-semibold tabular-nums px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                                  {job.skills_matched}/{job.skills_total}
                                </span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                </div>
              </Card>
              <Card title="Your skills employers want most" sub={`Share of ${goalData.goal ? 'these' : 'all live'} jobs asking for each`} className="lg:flex-1 min-h-56">
                <div className="pl-6 pr-3 pb-4 min-h-0 lg:overflow-y-auto">
                  {!goalData.wanted.length ? <p className="text-sm text-slate-500 py-3">None of your skills appear in these jobs yet.</p> : (
                    <ul className="divide-y divide-slate-100">
                      {goalData.wanted.map(w => (
                        <li key={w.skill} className="flex items-center justify-between gap-3 py-3">
                          <span className="text-sm text-slate-800 truncate">{skillName(w.skill)}</span>
                          <span className="flex items-center gap-2 shrink-0">
                            <span className="w-20 h-1.5 rounded-full bg-slate-200 overflow-hidden" aria-hidden="true">
                              <span className="block h-full bg-blue-500 rounded-full" style={{ width: pct(w.share) }} />
                            </span>
                            <span className="text-xs text-slate-500 tabular-nums w-9 text-right">{pct(w.share)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
