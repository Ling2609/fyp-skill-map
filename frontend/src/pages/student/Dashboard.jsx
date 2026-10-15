import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../../api'
import { cached, ALL_MATCHES } from '../../pageCache'
import { useAuth } from '../../context/useAuth'
import PageHeader from '../../components/PageHeader'
import LevelTag from '../../components/LevelTag'
import { Bar, RowSkeleton, LoadingLabel } from '../../components/Skeleton'
import { skillName } from '../../skillName'
import { ADMIN_COUNTS_CHANGED } from '../../components/Sidebar'

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

// Card title on white with a clear line under it and a stronger title (9 Oct, her review: a grey band matched the
// page, a blue band read as "selected" like the active sidebar item); the action ("View all") sits on the subtitle
// line (items-end)
function Card({ title, sub, action, className = '', children }) {
  return (
    <section className={`bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col min-h-0 ${className}`}>
      {title && (
        <div className="shrink-0 flex items-end justify-between gap-3 px-6 pt-4 pb-3 mb-1 border-b border-slate-200">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

// The goal picker at the top of the goal card (13 Oct, replaces the separate market page; references.md "Market
// page and student sidebar"): every career, best fit first, each with how many of its 10 most-asked skills she has, so
// she can compare careers when she picks or changes a goal. A plain <select> can't draw the bars, so it is a button and
// a list. With no goal the fit comes with /recommend/goal; with a goal it is asked for (/recommend/fit) only when the
// list is opened, so the Dashboard doesn't get slower.
// "Developers/Programmers" may break after the slash on a phone, not in the middle of a word
const slashBreaks = (text) => text.split('/').flatMap((part, i) => i ? ['/', <wbr key={i} />, part] : [part])

function GoalPicker({ goal, categories, fit, busy, onChange }) {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(null)        // { categories, best_fit } from /recommend/fit
  const [failed, setFailed] = useState(false)
  const box = useRef(null)
  const bestFit = fit || loaded?.best_fit
  const cats = loaded?.categories || categories

  useEffect(() => {
    if (!open || fit || loaded) return
    cached('/recommend/fit').then(setLoaded).catch(() => setFailed(true))
  }, [open, fit, loaded])

  // Closes on Escape (focus back on the button) or a click outside
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); box.current?.querySelector('button')?.focus() } }
    const onClick = (e) => { if (!box.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick) }
  }, [open])

  const current = goal || ''                        // '' = Open to all ICT roles
  const pick = (name) => { setOpen(false); if (name !== current) onChange(name || null) }
  const fitOf = Object.fromEntries((bestFit || []).map(b => [b.category, b]))
  // careers with too few live jobs to compare go last, with their job count
  const rest = cats.filter(c => !fitOf[c.name])
  const row = (name, right, label = name) => (
    <li key={name || 'all'}>
      <button type="button" onClick={() => pick(name)} aria-current={name === current ? 'true' : undefined}
        className={`w-full flex items-center gap-3 text-left px-3 py-2 rounded-lg text-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:bg-slate-100 ${name === current ? 'bg-blue-50 hover:bg-blue-50' : ''}`}>
        <span className="flex-1 min-w-0 wrap-break-word text-slate-800">
          {slashBreaks(label)}{name && name === current && <span className="text-xs font-semibold text-blue-700"> · your goal</span>}
        </span>
        {right}
      </button>
    </li>
  )

  return (
    <div ref={box} className="relative flex flex-wrap items-center gap-2 text-sm text-slate-500">
      Your goal
      <button type="button" disabled={busy} onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="true"
        className="text-sm font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg px-3 py-1.5 max-w-full sm:max-w-md min-w-0 truncate hover:border-blue-300 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
        {goal || 'Open to all ICT roles'} <span aria-hidden="true" className="text-slate-500">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-20 w-full sm:w-120 bg-white border border-slate-300 rounded-xl shadow-lg p-1.5">
          <p className="px-3 pt-1.5 pb-1 text-xs text-slate-500">
            {failed ? "Couldn't compare careers just now. You can still pick one." : "How many of each career's top skills you have"}
          </p>
          <ul className="max-h-80 overflow-y-auto">
            {!bestFit && !failed ? [0, 1, 2, 3, 4].map(i => (
              <li key={i} className="flex items-center gap-3 px-3 py-2.5"><Bar className="h-3.5 flex-1" /><Bar className="h-1.5 w-20" /><Bar className="h-3 w-12" /></li>
            )) : (<>
              {(bestFit || []).map(b => row(b.category, (<>
                <span aria-hidden="true" className="hidden sm:block w-20 h-1.5 rounded-full bg-slate-200 overflow-hidden shrink-0">
                  <span className="block h-full bg-blue-700" style={{ width: `${(b.have / b.of) * 100}%` }} />
                </span>
                <span className="w-14 text-right text-xs text-slate-500 tabular-nums">{b.have} of {b.of}</span>
              </>)))}
              {rest.map(c => row(c.name, <span className="text-xs text-slate-400 tabular-nums">{c.jobs} {c.jobs === 1 ? 'job' : 'jobs'}</span>))}
            </>)}
          </ul>
          <ul className="border-t border-slate-100 mt-1 pt-1">
            {row('', null, 'Open to all ICT roles')}
          </ul>
        </div>
      )}
    </div>
  )
}

// "What opens up" under a skill still to learn (13 Oct; research and wording: references.md "What-if simulator"). The
// jobs she would newly fit (half or more of the required skills) with that one skill, each with its count before ->
// after, and what was counted and what it can't promise (Google PAIR: say what data was used and the limits).
function OpensUp({ r, goal, jobs }) {
  const more = r.opens_count - r.opens.length
  return (
    <div className="ml-7 mb-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
      <p className="font-semibold text-slate-800">With {skillName(r.skill)} on your profile, you'd have half or more of the required skills for:</p>
      <ul className="mt-1 space-y-0.5">
        {r.opens.map(o => (
          <li key={o.job_ref} className="text-slate-700">
            <Link to={`/jobs/${encodeURIComponent(o.job_ref)}`} state={{ from: 'Dashboard' }} className="hover:text-blue-700 hover:underline">{o.title}</Link>
            <span className="text-slate-500">{o.company ? ` · ${o.company}` : ''}</span>
            {' — '}<span className="tabular-nums"><b className="font-semibold">{o.before} → {o.after}</b> of {o.total} required skills</span>
          </li>
        ))}
        {more > 0 && <li className="text-slate-500">and {more} more</li>}
      </ul>
      <p className="text-xs text-slate-500 mt-2">Checked on the {jobs} live {goal} {jobs === 1 ? 'job' : 'jobs'} with the same skill check as Job Matches. Employers also weigh experience, grades and the interview.</p>
    </div>
  )
}

function GoalCard({ data, busy, onGoal, onPlan, onJobs }) {
  const have = data.readiness.filter(r => r.has)
  const missing = data.readiness.filter(r => !r.has)
  // Option C (her pick, 13 Oct; built 14 Oct): two labelled groups, so each number sits under its own meaning.
  // Quickest wins = skills that alone would make her fit more jobs (most first); then the rest by how often asked.
  const quick = missing.filter(r => r.opens_count > 0).sort((a, b) => b.opens_count - a.opens_count)
  const often = missing.filter(r => !(r.opens_count > 0))
  const [picked, setPicked] = useState(() => [...quick, ...often].slice(0, 1).map(r => r.skill))
  const toggle = (skill) => setPicked(p => p.includes(skill) ? p.filter(s => s !== skill) : [...p, skill])
  const [open, setOpen] = useState(null)        // the skill whose "What opens up" is open
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
            {/* 14 Oct (her review, option A): the same pinned grey bands as Admin Academics' years (Material list
                subheaders stay pinned until the next one; NN/g: sticky headers small and opaque). The band's right side says
                what each row's number means; no count on the band, which read as "4 more jobs" (her review). */}
            <div className="mt-2 min-h-0 lg:overflow-y-auto rounded-lg border border-slate-200">
              {[[quick, 'Quickest wins', 'more jobs you\'d fit'], [often, quick.length ? 'Also asked for often' : 'Asked for most often', 'of jobs ask']]
                .filter(([rows]) => rows.length).map(([rows, title, column]) => (
                <section key={title}>
                  <p className="sticky top-0 z-10 flex justify-between gap-3 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 border-b border-slate-200 [section+section_&]:border-t">
                    <span>{title}</span>
                    <span className="font-normal text-slate-500">{column}</span>
                  </p>
                  <ul className="px-3">
                    {rows.map(r => (
                      <li key={r.skill} className="border-t border-slate-100 first:border-t-0">
                        <div className="flex items-center gap-3">
                          <label className="flex-1 min-w-0 flex items-center gap-3 py-2 cursor-pointer">
                            <input type="checkbox" checked={picked.includes(r.skill)} onChange={() => toggle(r.skill)} className="w-4 h-4 accent-blue-700" />
                            <span className="flex-1 text-sm text-slate-800">{skillName(r.skill)}</span>
                          </label>
                          {r.opens_count > 0 ? (
                            <button type="button" onClick={() => setOpen(o => o === r.skill ? null : r.skill)} aria-expanded={open === r.skill}
                              aria-label={`What opens up with ${skillName(r.skill)}: ${r.opens_count} more ${r.opens_count === 1 ? 'job' : 'jobs'} you'd fit`}
                              className="text-xs font-semibold text-emerald-700 tabular-nums whitespace-nowrap hover:underline">
                              +{r.opens_count} {r.opens_count === 1 ? 'job' : 'jobs'} {open === r.skill ? '▴' : '▾'}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-500 tabular-nums">{pct(r.share)}</span>
                          )}
                        </div>
                        {open === r.skill && <OpensUp r={r} goal={data.goal} jobs={data.jobs} />}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
            {/* The ticks only choose what to plan; a skill counts once the profile shows it */}
            <p className="shrink-0 text-xs text-slate-500 mt-2">
              Learnt one? Add the project, certificate or grade that shows it in <Link to="/profile" className="text-blue-700 hover:underline">My Profile</Link> and it counts here.
            </p>
          </div>
        )}
        {/* All of them: celebrate, then the next step is applying (Atlassian: celebrate, then point to next steps) */}
        {total > 0 && missing.length === 0 && (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
            <p className="text-base font-semibold text-emerald-900">You have every skill on this list. Well done!</p>
            <p className="text-sm text-emerald-800 mt-1">These are the skills {data.goal} jobs ask for most, so you're ready to apply. Keep adding projects and certificates to stand out.</p>
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
            className={`text-sm font-medium px-4 py-2 rounded-xl transition ${missing.length ? 'border border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-700' : 'bg-blue-700 text-white hover:bg-blue-800'}`}>
            See the {data.jobs} {data.jobs === 1 ? 'job' : 'jobs'}{missing.length ? '' : ' and apply'}
          </button>
        </div>
      </div>
    </Card>
  )
}

function NoGoalCard({ data, busy, onGoal, onCounsellor }) {
  const shown = data.best_fit.slice(0, data.best_fit_shown || 5)
  const [choice, setChoice] = useState(shown[0]?.category || '')
  return (
    <Card className="lg:flex-1">
      <div className="px-5 sm:px-7 pt-6 pb-6 flex flex-col flex-1 min-h-0">
        <GoalPicker goal={null} categories={data.categories} fit={data.best_fit} busy={busy} onChange={onGoal} />
        <p className="text-2xl font-semibold tracking-tight text-slate-900 mt-5 leading-tight">
          Not sure which role fits you yet?<br /><span className="text-slate-400">That's normal.</span>
        </p>
        {data.best_fit.length > 0 ? (
          <>
            <p className="text-sm text-slate-500 mt-2">These job categories fit your skills best. Pick one to see how close you are, or choose any other from the list above.</p>
            <div role="radiogroup" aria-label="Job categories" className="mt-4 grid gap-2 min-h-0 lg:overflow-y-auto">
              {shown.map(b => (
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

// While the Dashboard loads: the same two columns and cards, grey bars where the text goes (9 Oct)
function DashboardSkeleton() {
  const side = (rows) => (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-1 min-h-56 overflow-hidden">
      <div className="px-6 pt-4 pb-3 border-b border-slate-200 space-y-2"><Bar className="h-4 w-36" /><Bar className="h-3 w-52" /></div>
      <div className="px-6 divide-y divide-slate-100">{[...Array(rows)].map((_, i) => <RowSkeleton key={i} />)}</div>
    </section>
  )
  return (
    <div className="grid lg:grid-cols-[1.3fr_1fr] gap-5 lg:flex-1 lg:min-h-0" aria-busy="true">
      <LoadingLabel>Loading your dashboard…</LoadingLabel>
      <div className="flex flex-col gap-5 min-h-0">
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm lg:flex-1 px-5 sm:px-7 pt-6 pb-6 flex flex-col">
          <div className="flex items-center gap-2"><Bar className="h-3.5 w-16" /><Bar className="h-8 w-64 rounded-lg" /></div>
          <div className="flex items-end gap-5 mt-5"><Bar className="h-12 w-24" /><div className="space-y-2 pb-1"><Bar className="h-5 w-64" /><Bar className="h-3.5 w-48" /></div></div>
          <div className="grid grid-cols-10 gap-1.5 mt-4">{[...Array(10)].map((_, i) => <Bar key={i} className="h-3" />)}</div>
          <div className="flex gap-1.5 mt-4">{['w-20', 'w-24', 'w-16', 'w-18'].map(w => <Bar key={w} className={`h-6 ${w} rounded-full`} />)}</div>
          <div className="mt-5 space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="flex items-center gap-3"><Bar className="h-4 w-4 rounded" /><Bar className="h-3.5 w-40" /></div>)}</div>
          <div className="mt-auto pt-5 flex gap-2"><Bar className="h-9 w-48 rounded-xl" /><Bar className="h-9 w-32 rounded-xl" /></div>
        </section>
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-4 shrink-0"><Bar className="h-4 w-64" /></section>
      </div>
      <div className="flex flex-col gap-5 min-h-0">{side(4)}{side(4)}</div>
    </div>
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
      <div className="px-4 sm:px-8 py-8">
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
  // 12 Oct (her review): an employer's invitation to apply shows here, where she looks first; only when there is one
  const [invites, setInvites] = useState([])
  useEffect(() => { api.get('/applications/invitations').then(res => setInvites(res.data)).catch(() => {}) }, [])
  const dismissInvite = (inv) => {
    setInvites(list => list.filter(i => i.id !== inv.id))
    api.patch(`/applications/invitations/${inv.id}`, { dismissed: true })
      .then(() => window.dispatchEvent(new Event(ADMIN_COUNTS_CHANGED)))
      .catch(() => setInvites(list => [inv, ...list]))
  }

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
    const fits = (goalData?.best_fit || []).slice(0, 3).map(b => b.category)
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

      <div className="flex-1 min-h-0 px-4 sm:px-8 py-6 flex flex-col">
        {loadError && <p role="alert" className="text-sm text-rose-600 bg-rose-50 rounded-lg px-4 py-3 mb-4">{loadError}</p>}
        {invites.length > 0 && (
          <section aria-label="Invitations to apply" className="mb-5 bg-violet-50 border border-violet-200 rounded-2xl divide-y divide-violet-100">
            {invites.slice(0, 3).map(inv => (
              <div key={inv.id} className="px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <p className="flex-1 min-w-60 text-sm text-slate-700">
                  <b className="text-slate-900">{inv.company} invited you to apply</b> for {inv.title}{inv.match && ` · you have ${inv.match}`}
                </p>
                <Link to={`/jobs/${encodeURIComponent(inv.job_ref)}`} state={{ from: 'Dashboard' }}
                  className="text-sm font-medium text-violet-800 bg-white border border-violet-200 rounded-lg px-3.5 py-1.5 hover:bg-violet-100">View job</Link>
                <button onClick={() => dismissInvite(inv)} className="text-sm text-slate-500 hover:text-slate-800">Not interested</button>
              </div>
            ))}
            {invites.length > 3 && <Link to="/applications" className="block px-5 py-2.5 text-sm font-medium text-violet-800 hover:underline">See all {invites.length} in My applications</Link>}
          </section>
        )}

        {emptyProfile ? <StartCard onGo={(tab) => navigate(`/profile?tab=${tab}`)} /> : !goalData ? (
          <DashboardSkeleton />
        ) : (
          <div className="grid lg:grid-cols-[1.3fr_1fr] gap-5 lg:flex-1 lg:min-h-0">
            <div className="flex flex-col gap-5 min-h-0 min-w-0">
              {goalData.goal
                ? <GoalCard key={goalData.goal} data={goalData} busy={busy} onGoal={changeGoal} onPlan={plan} onJobs={seeGoalJobs} />
                : <NoGoalCard data={goalData} busy={busy} onGoal={changeGoal} onCounsellor={counsellor} />}
              <Card className="shrink-0">
                <div className="flex items-center justify-between gap-3 px-6 py-4">
                  <p className="text-sm min-w-0 truncate">
                    <span className="font-semibold text-slate-800">Continue a chat</span>
                    <span className="text-slate-500">
                      {chats === null ? <span aria-hidden="true" className="inline-block align-middle ml-2 h-3 w-40 rounded bg-slate-200 motion-safe:animate-pulse" /> : chat
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
                  {matches === null ? <div className="divide-y divide-slate-100">{[...Array(4)].map((_, i) => <RowSkeleton key={i} />)}</div>
                    : !matches.length ? <p className="text-sm text-slate-500 py-3">No current openings here yet. Try another goal, or check back after the next job update.</p>
                    : (
                      <ul className="divide-y divide-slate-200">
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
                                  {job.skills_matched}/{job.skills_total} {{ unspecified: 'listed', preferred: 'preferred' }[job.coverage_basis] || 'required'}
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
                    // A table, so the name column is as wide as the longest name (all names in full) and every bar
                    // starts at the same point with the same length (9 Oct, her review). A name over 16rem (9rem on a
                    // phone) wraps rather than squeezing the bars; a bar is never shorter than 4rem. Bars are out of 100% of the jobs, so short bars are honest
                    <table className="w-full border-collapse">
                      <tbody>
                        {goalData.wanted.map(w => (
                          <tr key={w.skill} className="border-b border-slate-200 last:border-0">
                            <td className="py-3 pr-10 align-middle">
                              <span className="block w-max max-w-36 sm:max-w-64 text-sm text-slate-800">{skillName(w.skill)}</span>
                            </td>
                            <td className="w-full py-3 align-middle" aria-hidden="true">
                              <span className="block min-w-16 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                                <span className="block h-full bg-blue-500 rounded-full" style={{ width: pct(w.share) }} />
                              </span>
                            </td>
                            <td className="py-3 pl-3 align-middle text-right text-xs text-slate-500 tabular-nums whitespace-nowrap">{pct(w.share)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
