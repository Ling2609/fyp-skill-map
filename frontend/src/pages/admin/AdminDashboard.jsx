import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api'
import PageHeader, { HeadStats } from '../../components/PageHeader'
import { ADMIN_COUNTS_CHANGED } from '../../components/Sidebar'
import { useAuth } from '../../context/useAuth'
import ReasonDialog from './ReasonDialog'
import { CompanyChecks } from './CompanyChecks'
import GapsChart, { GapKey } from './GapsChart'
import InfoTip from '../../components/InfoTip'
import { DECISIONS } from './decisions'
import { Bar as SkBar, CardSkeleton, StatsSkeleton, LoadingLabel } from '../../components/Skeleton'
import { greeting } from '../../greeting'

// Admin home, layout D (7 Oct, her pick; references.md "Admin layout"): what needs action first and most visible
// (NN/g: "make important information visually salient"), then glanceable counts, then two panels the career office
// can act on. Totals only, never one student's data.

const SHOW_WAITING = 2        // more than this: "and N more" opens the Users list, so the page never gets packed
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

const fmtDay = (iso) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'
const ago = (iso) => {
  const days = Math.floor((Date.now() - new Date(iso)) / 864e5)
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
}


// 20 Nov (her approved mock): a bar's colour says what the number means. gap: light to deep coral as more students
// lack the skill. progress: teal from 70% (on track), gold 40-70% (some behind), coral under 40% (most behind)
const progressColour = (t) => t >= 0.7 ? 'linear-gradient(90deg,#b9ebe4,#13998c 45%,#064740)'
  : t >= 0.4 ? 'linear-gradient(90deg,#fde6a8,#e0a21a 45%,#7d5600)' : 'linear-gradient(90deg,#fbd5c7,#e9795a 45%,#86301a)'
function Bar({ value, max, colour }) {
  const pct = max ? Math.round((value / max) * 100) : 0
  return (
    <div className="h-2.5 rounded-full bg-well overflow-hidden" aria-hidden="true">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: colour }} />
    </div>
  )
}

// tile titles with an icon, as every other dashboard (20 Nov, her approved mock)
const ic = (d) => <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
const TT = {
  alert: ic(<><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5v.5" /></>),
  chart: ic(<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />),
  users: ic(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c1-3.5 3.6-5.5 6.5-5.5s5.5 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.7 3 2.5 3.5 5.2" /></>),
  cap: ic(<><path d="M2 9l10-5 10 5-10 5Z" /><path d="M6 11v5c3 2 9 2 12 0v-5" /></>),
  clock: ic(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
}
const initials = (t = '') => (w => w.length > 1 ? w.map(x => x[0]).join('') : (w[0] || '').slice(0, 2))(t.split(/\s+/).filter(Boolean).slice(0, 2)).toUpperCase()

// a short laptop screen (her ~1440x735): one waiting employer shown instead of two
function useShort() {
  const q = '(max-height: 820px)'
  const [m, setM] = useState(() => matchMedia(q).matches)
  useEffect(() => { const mq = matchMedia(q); const f = () => setM(mq.matches); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f) }, [])
  return m
}

const isoWeek = (d) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7))
  const w = Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7)
  return `${t.getUTCFullYear()}-W${String(w).padStart(2, '0')}`
}
const shortDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export default function AdminDashboard() {
  const { user } = useAuth()
  const [rejecting, setRejecting] = useState(null)   // the employer whose reject pop-up is open
  const [askError, setAskError] = useState('')
  const [data, setData] = useState(null)
  const [gaps, setGaps] = useState(null)      // null = loading (it runs the matching for every student)
  // 20 Nov: weekly copies of these numbers (MongoDB); the one before this week gives the change shown per skill
  const [history, setHistory] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)      // id of the employer being approved / rejected

  const load = useCallback(() => {
    return api.get('/admin/dashboard').then(res => setData(res.data))
      .catch(() => setError("Couldn't load the dashboard. Is the backend running?"))
  }, [])

  useEffect(() => {
    load()
    api.get('/admin/skill-gaps').then(res => setGaps(res.data)).catch(() => setGaps([]))
    api.get('/admin/skill-gaps/history').then(res => setHistory(res.data)).catch(() => setHistory([]))
  }, [load])

  const decide = (id, action, reason) => {
    setBusy(id)
    api.post(`/admin/users/${id}/${action}`, reason === undefined ? undefined : { reason })
      .then(() => { setRejecting(null); window.dispatchEvent(new Event(ADMIN_COUNTS_CHANGED)); return load() })
      .catch(err => {
        const msg = err.response?.data?.detail || "Couldn't save that. Try again."
        if (reason === undefined) setError(msg); else setAskError(msg)
      })
      .finally(() => setBusy(null))
  }

  const todo = data?.todo
  const waiting = todo ? todo.pending_employers.length : 0
  const [plan, setPlan] = useState([])
  // the newest weekly copy from before this week (this week's copy equals what is shown now)
  const [weekNow] = useState(() => isoWeek(new Date()))
  const before = [...history].reverse().find(h => h.week !== weekNow) || null
  const togglePlan = (skill) => setPlan(p => p.includes(skill) ? p.filter(x => x !== skill) : p.length < 4 ? [...p, skill] : p)
  // employers shown: 2, or 1 on a short screen; never a scroll inside this card (20 Nov, her review)
  const short = useShort()
  const showEmp = short ? 1 : SHOW_WAITING
  const toReview = todo?.modules_to_review || 0
  const actions = waiting + (toReview ? 1 : 0)
  const p = data?.profiles

  return (
    // 21 Oct (her report): the heading stays put and only the content under it scrolls, as on the other dashboards
    <div className="adm-page h-[calc(100dvh-var(--bar-h))] flex flex-col">
      <PageHeader bell>
        <div className="pb-5 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1 basis-72">
          <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-widest mb-2">Dashboard · Career office</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {greeting(user?.first_name)} 👋
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {!data ? (error ? '' : <SkBar className="h-4 w-56 mt-1.5" />) : actions ? `${actions} thing${actions > 1 ? 's' : ''} need${actions > 1 ? '' : 's'} you today.` : 'Nothing needs you right now.'}
          </p>
          </div>
          {/* 20 Nov (her review): beside the greeting, each detail on a small second line, so the header is one row */}
          {data && <HeadStats items={[
            [data.counts.students, 'Students', 'blue', `${data.counts.students_new_30d} new in 30 days`],
            [data.counts.employers, 'Employers', '', data.counts.employers_pending ? `${data.counts.employers_pending} waiting` : 'none waiting'],
            [data.counts.live_jobs, 'Live jobs', '', `newest ${fmtDay(data.counts.newest_live_job_at)}`],
            [data.counts.modules, 'Modules', 'good', `${data.counts.modules_reviewed} reviewed`],
          ]} />}
        </div>
      </PageHeader>

      {/* fills the screen: the two panels stretch to its foot and spread their rows out; with a long to-do list they
          shrink back to their rows and the page scrolls instead */}
      <div className="adm-grid flex-1 min-h-0 overflow-y-auto px-8 pt-3.5 pb-4">
        {error && <p className="text-sm text-rose-600">{error}</p>}

        {!data && !error && (<>
          <LoadingLabel>Loading the dashboard…</LoadingLabel>
          <StatsSkeleton />
          <div className="flex-1 grid lg:grid-cols-2 gap-4"><CardSkeleton rows={6} /><CardSkeleton rows={3} /></div>
        </>)}
        {/* 20 Nov (v3, her review): two independent columns, so a card is as tall as its content and only the last card
            of each column takes what is left (left: what needs you, then profiles; right: gaps, then recent activity) */}
        {data && (
          <div className="adm-col">
            {actions > 0 ? <section className="emp-tile emp-needs adm-needs bg-white rounded-2xl border overflow-hidden">
            <div className="adm-th"><h2 className="adm-tt"><i className="c">{TT.alert}</i>Needs your action</h2>
              <span className="text-xs text-muted">{[waiting && plural(waiting, 'employer'), toReview && plural(toReview, 'module')].filter(Boolean).join(' · ')}</span></div>
            <div className="px-5 pb-4">
              {/* 20 Nov (her call): the link to the rest sits at the right of this line, not under the list */}
              {waiting > 0 && <p className="adm-sub flex items-baseline justify-between gap-3">Employers waiting for approval · {waiting}
                {showEmp < waiting && <span className="normal-case tracking-normal font-sans text-xs text-muted">
                  {showEmp} of {waiting} shown · <Link to="/admin/users?role=employer&status=pending" className="font-semibold text-accent hover:underline">See all {waiting} →</Link></span>}</p>}
              <ul className="adm-emps m-0 p-0 list-none">
              {todo.pending_employers.slice(0, showEmp).map(u => (
                <li key={u.id} className="adm-row">
                  <span className="usr-ava" aria-hidden="true">{initials(u.company_name || u.name)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink m-0 truncate">{u.company_name || u.name}</p>
                    <p className="text-xs text-muted m-0 mt-0.5 truncate" title={u.email}>{u.email} · registered {ago(u.created_at)}</p>
                    <CompanyChecks u={u} />
                  </div>
                  <button onClick={() => { setAskError(''); setRejecting(u) }} disabled={busy === u.id}
                    className="px-3.5 h-9 text-sm font-semibold rounded-control border border-line-strong bg-white text-ink hover:bg-well disabled:opacity-50">Reject</button>
                  <button onClick={() => decide(u.id, 'approve')} disabled={busy === u.id}
                    className="head-cta h-9 px-3.5 text-sm disabled:opacity-50">Approve</button>
                </li>
              ))}
              </ul>
              {toReview > 0 && (<>
                <p className="adm-sub">Module skills to review · {toReview}</p>
                <div className="adm-row">
                  <span className="usr-ava co text-accent" aria-hidden="true">{TT.cap}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink m-0">{toReview} of {data.counts.modules} modules not reviewed yet</p>
                    <p className="text-xs text-muted m-0 mt-0.5 truncate">{todo.modules_to_review_sample.map(m => m.name).join(', ')}{toReview > todo.modules_to_review_sample.length ? '…' : ''}</p>
                  </div>
                  <Link to="/admin/academic?show=todo" className="head-cta h-9 px-3.5 text-sm">Review</Link>
                </div>
                <div className="adm-progress" role="img" aria-label={`${data.counts.modules_reviewed} of ${data.counts.modules} modules reviewed`}>
                  <i style={{ width: `${data.counts.modules ? (data.counts.modules_reviewed / data.counts.modules) * 100 : 0}%` }} />
                </div>
              </>)}
            </div>
          </section> : (
              // 20 Nov (her review): nothing to do is a small "all clear" card, not an empty space
              <section className="emp-tile adm-clear bg-white rounded-2xl border" aria-labelledby="clear-h">
                <span className="adm-clear-ic" aria-hidden="true">✓</span>
                <div className="min-w-0 flex-1">
                  <h2 id="clear-h" className="m-0 text-base font-bold text-ink">Nothing needs you right now</h2>
                  <p className="m-0 mt-0.5 text-sm text-muted">All employers and modules done</p>
                </div>
                <Link to="/admin/users" className="acad-btn edit h-9">Users</Link>
                <Link to="/admin/academic" className="acad-btn edit h-9">Academics</Link>
              </section>
            )}
            <section className="emp-tile adm-prof bg-white rounded-2xl border flex flex-col">
              <div className="adm-th">
                <h2 className="adm-tt"><i>{TT.users}</i>Student profiles</h2>
                <p className="text-xs text-slate-500 m-0">Matching only works once grades are in</p>
              </div>
              <div className="adm-prof-body px-5 pb-4">
              <ul className="adm-prof-bars m-0 p-0 list-none text-sm">
                {[
                  ['Grades entered', p.with_grades],
                  ['Project or certificate', p.with_project_or_cert],
                  ['Visible to employers', p.visible_to_employers],
                ].map(([label, n]) => (
                  <li key={label}>
                    <span className="text-slate-800">{label}</span>
                    <Bar value={n} max={p.students} colour={progressColour(p.students ? n / p.students : 0)} />
                    <span className="font-display text-lg font-extrabold text-ink tabular-nums">{n}<span className="text-xs font-semibold text-muted">/{p.students}</span></span>
                  </li>
                ))}
              </ul>
              <p className="adm-key m-0 text-xs text-muted"><span><i style={{ background: '#13998c' }} />On track 70%+</span><span><i style={{ background: '#e0a21a' }} />Some behind</span><span><i style={{ background: '#e9795a' }} />Most behind under 40%</span></p>
              </div>
            </section>
            {data.recent?.length > 0 && <section className="emp-tile adm-recent bg-white rounded-2xl border flex flex-col" aria-labelledby="recent-h">
                <div className="adm-th"><h2 id="recent-h" className="adm-tt"><i>{TT.clock}</i>Recent activity</h2>
                  <span className="text-xs text-muted">Last 30 days · sign-ups and decisions</span></div>
                <ul aria-label="Recent activity" className="fit-rows adm-recent-list m-0 list-none px-5 pb-3">
                  {data.recent.slice(0, 8).map((e, i) => (
                    <li key={i}>
                      <span className={`adm-dot ${e.kind}`} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate"><b>{e.name || 'Someone'}</b>{' '}
                        {e.kind === 'joined' ? `signed up as ${e.role === 'employer' ? 'an employer' : 'a student'}`
                          : e.kind === 'approve' ? 'was approved' : e.kind === 'reject' ? 'was not approved'
                          : e.kind === 'deactivate' ? 'was deactivated' : e.kind === 'reactivate' ? 'was reactivated' : e.kind}</span>
                      <span className="shrink-0 text-xs text-muted">{ago(e.at)}</span>
                    </li>
                  ))}
                </ul>
              </section>}
          </div>
        )}
        {data && (
          <div className="adm-col">
            <section className="emp-tile adm-gaps bg-white rounded-2xl border flex flex-col">
              <div className="px-5 pt-4 pb-2">
                <h2 className="adm-tt"><i>{TT.chart}</i>Most common skill gaps</h2>
                <p className="text-xs text-slate-500 mt-1">Skills students most often lack in their top job matches.{before
                  ? <> Change since <span className="whitespace-nowrap"><b className="font-semibold text-ink-soft">{shortDate(before.at)}</b>.{' '}
                    {/* 26 Nov (her review): what the change marks mean, in the ⓘ (tap or click), not on the card */}
                    <InfoTip label="What the change marks mean"><GapKey since={shortDate(before.at)} /></InfoTip></span></> : ' Use it to plan workshops.'}</p>
              </div>
              <div className="flex-1 flex flex-col px-5 py-4">
                {gaps === null && (
                  <div role="status" aria-label="Loading the skill gaps" className="adm-gap-skel">
                    <p className="m-0 text-xs text-muted">Matching every student's profile to the live jobs…</p>
                    {Array.from({ length: 7 }, (_, i) => (
                      <div key={i} className="adm-gap-row text-sm" aria-hidden="true">
                        <span className="h-4 w-4 rounded bg-well" /><SkBar className="h-3.5" style={{ width: `${70 - i * 6}%` }} />
                        <SkBar className="h-2.5 w-full rounded-full" /><SkBar className="h-4 w-12 rounded-full" />
                      </div>
                    ))}
                  </div>
                )}
                {gaps?.length === 0 && <p className="text-sm text-slate-500">No student has a skill profile yet.</p>}
                {/* 22 Nov (her call): a Recharts bar chart; click a bar to pick it for a workshop */}
                {gaps?.length > 0 && <GapsChart gaps={gaps} before={before} since={before ? shortDate(before.at) : ''} picked={plan} onToggle={togglePlan} />}
                {gaps?.length > 0 && (
                  <div className="adm-plan">
                    <span className="text-xs text-muted">{plan.length ? <><b className="text-ink">{plan.length} picked</b> · up to 4 per workshop</> : 'Tick skills to plan a workshop on them'}</span>
                    <Link to={`/admin/workshop?skills=${encodeURIComponent(plan.join('|'))}`} aria-disabled={!plan.length}
                      onClick={e => { if (!plan.length) e.preventDefault() }} className={`head-cta h-9 px-3.5 text-sm ${plan.length ? '' : 'opacity-45 pointer-events-none'}`}>✦ Plan a workshop</Link>
                  </div>
                )}
              </div>
            </section>
            
          </div>
        )}
      </div>
      {rejecting && (
        <ReasonDialog decision={DECISIONS.reject} name={rejecting.company_name || rejecting.name} busy={busy === rejecting.id}
          error={askError} onConfirm={reason => decide(rejecting.id, 'reject', reason)} onCancel={() => setRejecting(null)} />
      )}
    </div>
  )
}
