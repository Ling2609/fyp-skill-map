import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../../api'
import { cached, ALL_MATCHES } from '../../pageCache'
import { useAuth } from '../../context/useAuth'
import { PrivacyBanner } from '../../components/PrivacyUpdate'
import { Bar, RowSkeleton, LoadingLabel } from '../../components/Skeleton'
import { skillName } from '../../skillName'
import { Bell, ADMIN_COUNTS_CHANGED } from '../../components/Sidebar'
import { greeting } from '../../greeting'
import { useLatest } from '../../components/useLatest'
import DeclineInvite from '../../components/DeclineInvite'
import { FitStrip } from '../../components/FitBars'
import { HALF_OR_MORE, shareOf } from '../../fitBands'
import { errText } from './profileUtils'

// Dashboard (9 Oct redesign, her choice after the "Dashboard on One Screen" mock-ups). A dashboard tells the student
// what she doesn't know yet (NN/g: "communicating critical information"), so:
//   left:  the goal card: how close she is to the jobs she wants ("7/10"), what's missing, a plan for it; with no
//          goal, the job categories her skills fit best and the career counsellor
//   right: top job matches and "your skills employers want most", both for her goal (or all jobs), and saying so
// On a laptop it fills the screen under the header; long lists scroll inside their card; narrow screens stack.
// GET /recommend/goal (app/routers/recommend.py) gives the goal card's numbers in one request.

const pct = (share) => `${Math.round(share * 100)}%`
const listAnd = (items) => items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`

// Card title on white with a clear line under it and a stronger title (9 Oct, her review: a grey band matched the
// page, a blue band read as "selected" like the active sidebar item); the action ("View all") sits on the subtitle
// line (items-end)
function Card({ title, sub, action, className = '', children }) {
  return (
    <section className={`bg-card rounded-card border border-line shadow-card flex flex-col min-h-0 overflow-hidden ${className}`}>
      {title && (
        <div className="shrink-0 flex items-start justify-between gap-3 px-4 pt-3 pb-2">
          <div className="min-w-0">
            <h2 className="font-display text-lead font-bold text-ink m-0 tracking-[-0.015em]">{title}</h2>
            {sub && <p className="text-label font-mono uppercase tracking-[0.08em] text-muted m-0 mt-1 leading-snug">{sub}</p>}
          </div>
          {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
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

function GoalPicker({ goal, categories, fit, busy, onChange, showLabel = true }) {
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
        className={`w-full flex items-center gap-3 text-left px-3 py-2 rounded-control text-body hover:bg-canvas focus-visible:outline-none focus-visible:bg-well ${name === current ? 'bg-accent-soft hover:bg-accent-soft' : ''}`}>
        <span className="flex-1 min-w-0 wrap-break-word text-ink">
          {slashBreaks(label)}{name && name === current && <span className="text-small font-semibold text-accent"> · your goal</span>}
        </span>
        {right}
      </button>
    </li>
  )

  return (
    <div ref={box} className="relative flex flex-wrap items-center gap-2 text-body text-faint">
      {showLabel ? 'Your goal' : <span className="sr-only">Your goal</span>}
      <button type="button" disabled={busy} onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="true"
        className="text-body font-semibold text-ink bg-card border border-line-strong rounded-control px-3 py-1.5 max-w-full sm:max-w-md min-w-0 truncate hover:border-accent/40 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        {goal || 'Open to all ICT roles'} <span aria-hidden="true" className="text-faint">▾</span>
      </button>
      {open && (
        <div data-keep-in-view className="absolute left-0 top-full mt-1.5 z-20 w-full sm:w-120 bg-card border border-line-strong rounded-panel shadow-lg p-1.5">
          <p className="px-3 pt-1.5 pb-1 text-small text-faint">
            {failed ? "Couldn't compare careers just now. You can still pick one." : "How many of each career's top skills you have"}
          </p>
          <ul className="max-h-80 overflow-y-auto">
            {!bestFit && !failed ? [0, 1, 2, 3, 4].map(i => (
              <li key={i} className="flex items-center gap-3 px-3 py-2.5"><Bar className="h-3.5 flex-1" /><Bar className="h-1.5 w-20" /><Bar className="h-3 w-12" /></li>
            )) : (<>
              {(bestFit || []).map(b => row(b.category, (<>
                <span aria-hidden="true" className="hidden sm:block w-20 h-1.5 rounded-full bg-well overflow-hidden shrink-0">
                  <span className="block h-full bg-accent" style={{ width: `${(b.have / b.of) * 100}%` }} />
                </span>
                <span className="w-14 text-right text-small text-faint tabular-nums">{b.have} of {b.of}</span>
              </>)))}
              {rest.map(c => row(c.name, <span className="text-small text-faint tabular-nums">{c.jobs} {c.jobs === 1 ? 'job' : 'jobs'}</span>))}
            </>)}
          </ul>
          <ul className="border-t border-line mt-1 pt-1">
            {row('', null, 'Open to all ICT roles')}
          </ul>
        </div>
      )}
    </div>
  )
}

// 18 Nov (her pick after the bento mock, review/dashboard-bento.html): six cards of different sizes that fit one
// laptop screen. Your goal (glass + map, footprint trail) · My Applications (progress track) · Still to learn ·
// Top job matches (fit bands + the jobs that fit) · Skills employers want most (chips) · AI Assistant (ready questions).
// Card names follow the platform's own (menu, Job Matches, AI modes). Every number is an integer the API returns.
const TOPO_PRINT = 'M-1 -6 C 3.5 -6.5 5.5 -3 5 1.5 C 4.6 5 4.6 8 3.4 11 C 2.2 14 -2.6 14 -3.6 10.5 C -4.6 7 -5.4 4 -5.2 0.5 C -5 -3.5 -4 -5.6 -1 -6 Z' +
  ' M-3.4 -9.6 a2.3 2.6 0 1 0 0.01 0 Z M0.4 -10.8 a1.6 1.8 0 1 0 0.01 0 Z M3.1 -9.8 a1.4 1.6 0 1 0 0.01 0 Z M5.2 -7.9 a1.2 1.4 0 1 0 0.01 0 Z M6.7 -5.6 a1 1.2 0 1 0 0.01 0 Z'
const STATEMENT = 'm-0 font-display text-[21px] leading-[1.18] font-bold tracking-[-0.03em] text-ink [text-wrap:balance] dash-short:text-[18px] max-sm:text-[19px]'
const LINK = 'text-small font-bold text-accent-strong underline decoration-accent/30 decoration-2 underline-offset-4 hover:decoration-accent whitespace-nowrap'
// one small icon per card title; cards named like a menu item use that item's own icon (Sidebar.jsx)
const ICONS = {
  goal: 'M5 21V4M5 4h11l-2 4 2 4H5',
  apps: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  learn: 'M12 20V10M12 10c0-4 3-6 7-6 0 4-3 6-7 6zM12 13c0-3-2-5-6-5 0 3 2 5 6 5z',
  jobs: 'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  want: 'M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.8z',
  ai: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z',
}

// A card: white (or glass / soft glow), rises in, and (mouse only) lifts with a light round its edge.
// The title row: icon + name centred on one line, an optional link on the right.
function Tile({ n, look = 'plain', area, labelledBy, icon, title, action, className = '', children }) {
  const ref = useRef(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect() } }, { threshold: 0.25 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
  }
  const looks = { plain: 'border-transparent bg-card', glass: 'dash-glass', glow: 'dash-aiglow border-transparent' }
  return (
    <section ref={ref} aria-labelledby={labelledBy} onPointerMove={onMove} style={{ '--n': n }}
      className={`dash-tile ${area} ${seen ? '' : 'dash-wait'} relative flex min-h-0 flex-col rounded-[24px] border px-5 pt-4 pb-4 dash-short:pt-3.5 dash-short:pb-3.5 ${looks[look]} shadow-card ${className}`}>
      <div className="flex min-h-6 flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        <h2 id={labelledBy} className="m-0 flex min-w-0 items-center gap-2 text-[12px] font-bold uppercase leading-[1.3] tracking-[0.08em] text-muted">
          <span aria-hidden="true" className="grid h-5.25 w-5.25 shrink-0 place-items-center rounded-chip bg-accent-soft text-accent-strong">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[icon]} /></svg>
          </span>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

// Rolls a number from its last value to the new one: from 0 on load, from the old value when it changes
// (ticking a skill). Reduced motion: shows the number straight away.
function CountUp({ to, delay = 300 }) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  const [n, setN] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    if (reduce) return
    const start = from.current
    let raf
    const t0 = performance.now() + (start === 0 ? delay : 0)
    const step = (t) => {
      const p = Math.max(0, Math.min(1, (t - t0) / 450))
      setN(Math.round(start + (to - start) * (1 - (1 - p) ** 3)))
      if (p < 1) raf = requestAnimationFrame(step); else from.current = to
    }
    raf = requestAnimationFrame(step)
    return () => { cancelAnimationFrame(raf); from.current = to }
  }, [to, reduce, delay])
  return reduce ? to : n
}

// The footprint trail: one print per top skill, from You to Job ready. Green = on your profile, solid coral = in
// your plan, dashed coral = still to learn. A soft white glow under the dashed path lifts it off the map lines.
function Trail({ readiness, picked, goal }) {
  const box = useRef(null)
  // 20 Nov (her review: blank space on the right): the drawing's width is scaled to the height it is shown at, so a
  // shorter trail (short screens) still runs the full width instead of shrinking with its height
  const [size, setSize] = useState({ w: 520, h: 104 })
  useEffect(() => {
    const el = box.current
    if (!el) return
    let raf = 0
    const ro = new ResizeObserver(([e]) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) || 104 }))
    })
    ro.observe(el)
    return () => { ro.disconnect(); cancelAnimationFrame(raf) }
  }, [])
  const w = size.w * (104 / size.h)
  const have = readiness.filter(r => r.has).sort((a, b) => b.share - a.share)
  const gaps = readiness.filter(r => !r.has).sort((a, b) => b.opens_count - a.opens_count || b.share - a.share)
  const steps = [...have.map(r => ({ ...r, k: 'have' })), ...gaps.map(r => ({ ...r, k: picked.includes(r.skill) ? 'plan' : 'gap' }))]
  const W = Math.max(280, w), H = 104, x0 = 24, x1 = W - 54
  const pathY = (x) => 50 - 16 * Math.sin((x - x0) / (x1 - x0) * Math.PI * 1.4)
  let d = `M ${x0} ${pathY(x0)}`
  for (let x = x0 + 8; x <= x1; x += 8) d += ` L ${x} ${pathY(x).toFixed(1)}`
  const label = { have: 'on your profile', plan: 'in your plan', gap: 'still to learn' }
  // prints as big as the space between them allows (never overlapping), up to 1.45x
  const stepW = (x1 - x0 - 32) / Math.max(1, steps.length - 1)
  const k = Math.max(0.85, Math.min(1.45, stepW / 26))
  return (
    <div ref={box} className="relative min-h-17.5 min-w-0 max-h-37.5 flex-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 block h-full w-full overflow-visible" role="img"
        aria-label={`Footprints toward ${goal}: ${have.length} skills on your profile (${have.map(r => skillName(r.skill)).join(', ')}); ${picked.length} in your plan; ${gaps.length - picked.length} still to learn`}>
        <path d={d} fill="none" stroke="#fff" strokeWidth="14" strokeLinecap="round" opacity=".75" />
        <path d={d} fill="none" stroke="#5b6b8a" strokeWidth="2.4" strokeDasharray="3 7" strokeLinecap="round" />
        <circle cx={x0 - 12} cy={pathY(x0)} r="7" className="fill-ink" stroke="#fff" strokeWidth="3" />
        <text x={x0 - 12} y={pathY(x0) + 26} textAnchor="middle" className="fill-ink text-[13px] font-extrabold">You</text>
        {steps.map((s, i) => {
          const x = x0 + 16 + i * ((x1 - x0 - 32) / Math.max(1, steps.length - 1)), side = i % 2 ? 1 : -1
          const ang = Math.atan2((pathY(x + 1) - pathY(x - 1)) / 2, 1) * 180 / Math.PI + 90
          return (
            <g key={s.skill} transform={`translate(${x.toFixed(1)} ${(pathY(x) + side * 8 * k).toFixed(1)}) rotate(${ang.toFixed(1)}) scale(${side < 0 ? -k : k} ${k})`}>
              <title>{`${skillName(s.skill)}: ${label[s.k]}`}</title>
              <path d={TOPO_PRINT} style={{ '--i': i }}
                className={`dash-step ${s.k === 'have' ? 'fill-have' : s.k === 'plan' ? 'fill-plan' : 'fill-white stroke-missing-strong stroke-[1.5] [stroke-dasharray:3_2]'}`} />
            </g>
          )
        })}
        <g transform={`translate(${x1 + 26} ${pathY(x1) - 4})`}>
          <path d="M0 14 V -16" className="stroke-ink" strokeWidth="3" />
          <path d="M1.5 -16 L 20 -10 L 1.5 -4 Z" className="fill-ink" />
          <text x="2" y="34" textAnchor="middle" className="fill-ink text-[13px] font-extrabold">Job ready</text>
        </g>
      </svg>
    </div>
  )
}

function GoalTile({ data, picked, busy, onGoal }) {
  const have = data.readiness.filter(r => r.has).length
  const total = data.readiness.length
  return (
    <Tile n={0} look="glass" area="a-goal" labelledBy="t-goal" icon="goal" title="Your goal"
      action={<GoalPicker goal={data.goal} categories={data.categories} busy={busy} onChange={onGoal} showLabel={false} />}>
      {/* 26 Nov (her phone review): phones skip this line; the goal picker right above says the same */}
      <p className="m-0 -mt-0.5 text-small text-muted max-sm:hidden">Here's where you stand for {data.goal}.</p>
      <div className="mt-1 grid min-h-0 flex-1 gap-x-6 gap-y-2 md:grid-cols-[minmax(0,190px)_minmax(0,1fr)]">
        <div className="flex flex-col justify-center">
          <p className="m-0 font-display text-[68px] font-extrabold leading-[.85] tracking-[-0.06em] text-ink tabular-nums dash-short:text-[58px] dash-tight:text-[50px]">
            <CountUp to={have} /><span className="text-[30px] tracking-[-0.04em] text-muted/70">/{total}</span>
          </p>
          <p className="m-0 mt-2 font-display text-[16px] font-bold leading-snug tracking-[-0.02em] text-ink">
            You have {have} of the {total} skills <span className="text-muted">these {data.jobs} jobs ask for.</span>
          </p>
        </div>
        <div className="flex min-w-0 flex-col justify-center pt-1">
          <Trail readiness={data.readiness} picked={picked} goal={data.goal} />
          <p className="dash-goal-key m-0 mt-1 flex flex-wrap gap-x-4 gap-y-1 text-small font-semibold text-ink-soft">
            <span className="inline-flex items-center gap-1.5"><i className="inline-block h-3 w-2.5 rounded-full bg-have" />On your profile · <b className="tabular-nums"><CountUp to={have} /></b></span>
            <span className="inline-flex items-center gap-1.5"><i className="inline-block h-3 w-2.5 rounded-full bg-plan" />In your plan · <b className="tabular-nums"><CountUp to={picked.length} /></b></span>
            <span className="inline-flex items-center gap-1.5"><i className="inline-block h-3 w-2.5 rounded-full border-[1.6px] border-dashed border-missing" />Still to learn · <b className="tabular-nums"><CountUp to={total - have - picked.length} /></b></span>
          </p>
        </div>
      </div>
    </Tile>
  )
}

function AppsTile({ invites, apps, outside = [], onDecline }) {
  // 20 Nov (her review: "overall numbers", say whether other sites count, "something simple and the latest"): the same
  // three counts as the My Applications header, over SkillMap AND other sites, then only the newest update; the
  // full lists and steps are on My Applications
  const list = apps || []
  const total = list.length + outside.length
  const offers = list.filter(a => a.status === 'accepted').length + outside.filter(o => o.status === 'offer').length
  const ended = list.filter(a => a.status === 'rejected').length + outside.filter(o => ['not_selected', 'withdrew'].includes(o.status)).length
  const going = total - offers - ended
  const n = (k, w) => `${k} ${k === 1 ? w : w + 's'}`
  const when = (x) => new Date(x.status_changed_at || x.applied_at || x.created_at || 0)
  const latest = [...list.map(a => ({ ...a, site: null })), ...outside.map(o => ({ ...o, site: o.publisher || 'another site' }))]
    .sort((x, y) => when(y) - when(x))[0]
  const inv = invites[0]
  return (
    <Tile n={1} area="a-apps" labelledBy="t-apps" icon="apps" title="My Applications" action={<Link to="/applications" className={LINK}>Open</Link>}>
      {inv ? (
        <>
          <p className={`${STATEMENT} mt-1.5`}>
            {invites.length > 1 ? <><span className="inv-word">{invites.length} employers</span> invited you to apply.</>
              : <><span className="inv-word">{inv.company}</span> invited you to apply.</>}
          </p>
          <div className="dash-ping invite mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border-2 border-accent bg-card px-3 py-2">
            <span className="min-w-0 flex-1">
              <b className="block text-body leading-snug text-ink">{inv.title}</b>
              <span className="text-small text-muted">{invites.length > 1 ? `${inv.company} · ` : ''}{inv.match ? `You have ${inv.match}` : 'Invitation to apply'}</span>
            </span>
            <Link to={`/jobs/${encodeURIComponent(inv.job_ref)}`} state={{ from: 'Dashboard' }}
              className="rounded-full bg-accent px-3.5 py-1.5 text-small font-bold text-on-accent transition-transform hover:bg-accent-strong active:scale-95">View job</Link>
            <button type="button" onClick={() => onDecline(inv)} className="text-small font-semibold text-muted hover:text-ink">No thanks</button>
          </div>
        </>
      ) : (
        <p className={`${STATEMENT} mt-1.5`}>
          {offers ? <><span className="text-have-strong">{n(offers, 'offer')}</span> from {n(total, 'application')}.</>
            : total ? <>{n(total, 'application')}, <span className="text-muted">{going} in progress.</span></>
            : 'No applications yet.'}
        </p>
      )}
      {apps === null ? <div className="mt-3 h-12 rounded-xl bg-well motion-safe:animate-pulse" /> : total ? (
        <>
          <dl className="dash-appstats m-0 mt-2.5" aria-label="All your applications">
            <div><dt>Applied</dt><dd>{total}</dd></div>
            <div><dt>In progress</dt><dd>{going}</dd></div>
            <div className="good"><dt>Offers</dt><dd>{offers}</dd></div>
          </dl>
          <p className="m-0 mt-1.5 text-[11.5px] text-muted">
            {outside.length ? `Includes ${outside.length} on other sites you recorded.` : 'All on SkillMap.'}
          </p>
          {!inv && latest && (
            <Link to="/applications" className="dash-latest" title={`${latest.title} · ${latest.company}`}>
              <span className="min-w-0 truncate text-small text-muted">
                <b className="mr-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-faint">Latest</b>
                <b className="font-semibold text-ink">{latest.title}</b> · {latest.company}{latest.site ? ` via ${latest.site}` : ''}
              </span>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-bold ${['accepted', 'offer'].includes(latest.status) ? 'bg-have-soft text-have-strong'
                : ['rejected', 'not_selected', 'withdrew'].includes(latest.status) ? 'bg-well text-muted' : 'bg-accent-soft text-accent-strong'}`}>
                {latest.status_label || latest.status}</span>
            </Link>
          )}
        </>
      ) : (
        <p className="m-0 mt-2 text-small text-muted">Apply to a job and you'll see how far it gets here. <Link to="/recommend?fit=half" className={LINK}>Jobs that fit you</Link></p>
      )}
    </Tile>
  )
}

// Still to learn: every gap, close together; those that would open jobs first with "+N jobs you'd fit", the rest
// with how often the ads ask for them. Ticking one puts it in the plan for the Skill Development chat.
function GrowTile({ data, picked, toggle, onPlan, more = [] }) {
  const gaps = data.readiness.filter(r => !r.has).sort((a, b) => b.opens_count - a.opens_count || b.share - a.share)
  const listed = new Set(data.readiness.map(r => skillName(r.skill).toLowerCase()))
  const extra = more.filter(x => !listed.has(skillName(x.skill).toLowerCase()))
  const max = Math.max(1, ...gaps.map(r => r.opens_count))
  const best = gaps[0]
  return (
    <Tile n={2} area="a-grow" labelledBy="t-grow" icon="learn" title="Still to learn" action={<span className="text-small text-muted">{gaps.length} to learn</span>}>
      {best ? (
        <p className={`${STATEMENT} mt-1.5`}>
          Learn <span className="text-missing-strong">{skillName(best.skill)}</span> next.{' '}
          <span className="text-muted">{best.opens_count ? `It opens ${best.opens_count} more ${best.opens_count === 1 ? 'job' : 'jobs'}.` : `It's in ${pct(best.share)} of these ads.`}</span>
        </p>
      ) : <p className={`${STATEMENT} mt-1.5`}>You have every skill on this list.</p>}
      <div role="group" aria-label="Skills still to learn" className="scroll-y dash-gaps mt-2.5 flex min-h-0 flex-1 flex-col gap-1.5">
        {gaps.map((r, k) => {
          const on = picked.includes(r.skill)
          return (
            <label key={r.skill} className="grid shrink-0 cursor-pointer grid-cols-[22px_minmax(0,1fr)] items-center gap-x-2.5 rounded-lg py-0.5 hover:bg-well/60">
              <input type="checkbox" checked={on} onChange={() => toggle(r.skill)} className="dash-check row-span-2 h-5 w-5" />
              <span className="text-body font-semibold leading-tight text-ink">{skillName(r.skill)}</span>
              <span aria-hidden="true" className="relative mt-0.5 h-4.25 rounded-md bg-track">
                <i style={{ width: `${r.opens_count ? Math.max(40, (r.opens_count / max) * 100) : Math.max(22, r.share * 100)}%`, '--k': Math.min(k, 6) }}
                  className={`dash-grow absolute inset-y-0 left-0 min-w-28 rounded-md ${on ? 'bg-[#c4532f]' : 'bg-missing-soft shadow-[inset_0_0_0_2px_var(--color-missing)]'}`} />
                <b className={`absolute left-2 top-1/2 -translate-y-1/2 whitespace-nowrap text-[11.5px] font-extrabold ${on ? 'text-white' : 'text-learn-ink'}`}>
                  {r.opens_count ? `+${r.opens_count} ${r.opens_count === 1 ? 'job' : 'jobs'} you'd fit` : `in ${pct(r.share)} of ads`}
                </b>
              </span>
            </label>
          )
        })}
        {/* 20 Nov (her review: a short list left the card blank): skills missing most often in her best matches (from
            the same /recommend answer as Top job matches) that the goal's top-10 list doesn't already show; tick to plan */}
        {extra.length > 0 && (<>
          <p className="m-0 mt-1 shrink-0 text-small font-bold text-ink-soft">Also missing in your best matches</p>
          <div className="flex shrink-0 flex-wrap gap-1.5">
            {extra.map(x => {
              const on = picked.includes(x.skill)
              return (
                <button key={x.skill} type="button" aria-pressed={on} onClick={() => toggle(x.skill)}
                  className={`rounded-full border px-2.5 py-1 text-[12.5px] font-semibold transition-colors ${on ? 'border-[#c4532f] bg-[#c4532f] text-white' : 'border-missing/50 bg-missing-soft text-learn-ink hover:border-missing'}`}>
                  {on ? '✓ ' : '+ '}{skillName(x.skill)} <span className={on ? 'text-white/80' : 'text-muted'}>· in {x.jobs} of your top {x.of_top}</span>
                </button>
              )
            })}
          </div>
        </>)}
      </div>
      <button type="button" disabled={!picked.length} onClick={() => onPlan(picked.map(skillName))}
        className="dash-breathe mt-3 self-start rounded-full bg-accent px-5 py-2.5 text-body font-bold text-on-accent transition-transform hover:bg-accent-strong active:scale-95 disabled:opacity-45">
        {picked.length === 1 ? `Plan how to learn ${skillName(picked[0])}` : picked.length ? `Plan how to learn these ${picked.length}` : 'Tick a skill to plan'}
      </button>
    </Tile>
  )
}

// Top job matches: the five fit bands (the same chart as Job Matches; each bar opens that band), then up to three
// jobs that fit by half or more ("+N more that fit" when there are more), else the three closest
function JobsTile({ matches, others = [], scope, onOpen, onSee }) {
  const fits = (matches || []).filter(m => HALF_OR_MORE.test(shareOf(m)))
  const SHOW = 6   // 20 Nov: as many as the card holds (the list scrolls), so no blank under it
  const shown = (fits.length ? fits : matches || []).slice(0, SHOW)
  // 20 Nov (her review: blank under the list): when fewer than SHOW fit by half, the next closest follow under their
  // own line, so the card holds useful rows instead of space
  const behind = fits.length ? (matches || []).filter(m => !fits.includes(m)).sort((a, b) => shareOf(b) - shareOf(a)).slice(0, Math.max(0, SHOW - shown.length)) : []
  // 20 Nov (her review: a goal with 1-2 live jobs left the card blank): then the best fits outside the goal follow
  const inGoal = new Set((matches || []).map(m => m.job_id))
  const outside = others.filter(m => !inGoal.has(m.job_id) && shareOf(m) > 0).sort((a, b) => shareOf(b) - shareOf(a))
    .slice(0, Math.max(0, SHOW - shown.length - behind.length))
  const fresh = (matches || []).filter(m => Number.isFinite(m.posted_days_ago) && m.posted_days_ago < 7).length
  const jobRow = (job) => (
    <li key={job.job_id}>
      <button type="button" onClick={() => onOpen(job)} className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg py-1.5 dash-tight:py-1 text-left hover:bg-well/60">
        <span className="min-w-0">
          <span className="block truncate text-body font-bold text-ink group-hover:text-accent-strong">{job.job_title}</span>
          <span className="block truncate text-small text-muted">{job.company}</span>
        </span>
        <span className="text-right text-small text-muted whitespace-nowrap"><b className="text-[15px] text-ink">{job.skills_matched}</b> of {job.skills_total} skills</span>
      </button>
    </li>
  )
  return (
    <Tile n={3} area="a-jobs" labelledBy="t-jobs" icon="jobs" title="Top job matches"
      action={matches?.length > 0 && <button type="button" onClick={() => onSee('all')} className={LINK}>See all {matches.length}</button>}>
      {matches === null ? <div className="mt-4 h-40 rounded-xl bg-well motion-safe:animate-pulse" /> : (
        <>
          <p className={`${STATEMENT} mt-1.5`}>
            <span className="text-have-strong"><CountUp to={fits.length} /></span> {fits.length === 1 ? 'job fits' : 'jobs fit'} you by 50% or more. <span className="text-muted">Out of {matches.length} live.</span>
          </p>
          {fresh > 0 && <p className="m-0 mt-1 text-small text-muted"><b className="text-ink">{fresh}</b> new this week</p>}
          {/* 25 Nov (her phone mock): phones skip the fit chart; the list under it says the same */}
          <FitStrip shares={matches.map(shareOf)} onPick={onSee} className="mt-2.5 shrink-0 max-sm:hidden" />
          <p className="m-0 mt-2 flex items-baseline justify-between gap-3 text-small font-bold text-have-strong">
            {fits.length ? `The ${fits.length === 1 ? 'one' : Math.min(SHOW, fits.length)} that ${fits.length === 1 ? 'fits' : 'fit'} best` : 'Closest matches'}
            {fits.length > SHOW && <button type="button" onClick={() => onSee('half')} className={`${LINK} inline-flex min-h-6 items-center`}>+{fits.length - SHOW} more that fit</button>}
          </p>
          <ul aria-label="Jobs that fit you best" tabIndex={0} className="scroll-y dash-joblist m-0 min-h-13 flex-1 list-none divide-y divide-line p-0">
            {shown.map(job => jobRow(job))}
            {behind.length > 0 && <li className="dash-behind" aria-hidden="true">Close behind</li>}
            {behind.map(job => jobRow(job))}
            {!scope && outside.length > 0 && <li className="dash-behind" aria-hidden="true">Also fit you, outside your goal</li>}
            {!scope && outside.map(job => jobRow(job))}
          </ul>
        </>
      )}
    </Tile>
  )
}

// Skills employers want most: her own skills, as chips; deeper teal = more of these ads ask for it
const wantTone = (s) => (s >= 0.3 ? 'bg-fit3' : s >= 0.19 ? 'bg-fit2' : s >= 0.15 ? 'bg-fit1' : 'bg-have-soft')
function WantTile({ wanted }) {
  return (
    <Tile n={4} area="a-want" labelledBy="t-want" icon="want" title="Skills employers want">
      {wanted?.length ? (
        <>
          <ul aria-label="Your skills employers want, with how often these ads ask for each" tabIndex={0} className="dash-want-list m-0 mt-2.5 flex list-none flex-wrap content-start gap-1.5 p-0">
            {wanted.map(w => (
              <li key={w.skill} className={`inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-[13px] font-semibold text-ink ${wantTone(w.share)}`}>
                <b className="rounded-full bg-card px-1.5 text-[11.5px] tabular-nums">{pct(w.share)}</b><span className="min-w-0 truncate" title={skillName(w.skill)}>{skillName(w.skill)}</span>
              </li>
            ))}
          </ul>
          <p className="dash-key m-0 mt-2 text-[12px] text-muted">Deeper teal = more of these ads ask for it.</p>
        </>
      ) : <p className="m-0 mt-2 text-small text-muted">Add modules or projects in <Link to="/profile" className={LINK}>My Profile</Link> to see which of your skills are in demand.</p>}
    </Tile>
  )
}

// AI Assistant: the two chat modes, three ready questions, and the last chat to continue (if any)
function AiTile({ chat, asks }) {
  return (
    <Tile n={5} look="glow" area="a-ai" labelledBy="t-ai" icon="ai" title="AI Assistant" className="flex-1"
      action={<Link to="/chatbot" state={chat ? { from: 'Dashboard', openSession: chat.id } : { from: 'Dashboard' }} className={LINK}>{chat ? 'Continue' : 'Open'}</Link>}>
      <p className="m-0 mt-1 truncate font-display text-[14px] font-bold tracking-[-0.01em] text-ink" title="Skill Development · Career Counsellor">Skill Development · Career Counsellor</p>
      <ul className="dash-asks m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
        {asks.map(a => (
          <li key={a.text} className="dash-ask"><button type="button" onClick={a.go}
            className="block w-full truncate rounded-xl bg-accent-soft px-3 py-1.5 text-left text-[13px] font-semibold text-accent-strong transition-colors hover:bg-accent hover:text-on-accent">{a.text}</button></li>
        ))}
      </ul>
    </Tile>
  )
}

const jobTone = (r) => (r > 0.6 ? 'bg-seq4' : r > 0.3 ? 'bg-seq3' : r > 0.1 ? 'bg-seq2' : 'bg-seq1 ring-1 ring-inset ring-seq3/40')
const fitTone = (r) => (r >= 0.6 ? 'bg-fit4' : r >= 0.45 ? 'bg-fit3' : r >= 0.3 ? 'bg-fit2' : 'bg-fit1')
// No goal yet (or the saved goal has no live jobs right now): choosing comes first; it takes the goal area over two rows
function ChooseTile({ data, busy, onGoal, onCounsellor }) {
  const nojobs = !!data.goal_saved && !data.goal
  const shown = data.best_fit.slice(0, data.best_fit_shown || (nojobs ? 2 : 3))
  const [choice, setChoice] = useState(shown[0]?.category || '')
  const mx = Math.max(1, ...data.categories.map(c => c.jobs))
  return (
    <Tile n={0} look="glass" area="a-goal" labelledBy="t-goal" icon="goal" title={nojobs ? 'Your goal' : 'Choose a goal'}>
      {nojobs ? (
        <p role="note" className="m-0 mt-2 rounded-2xl bg-missing-soft px-3.5 py-2.5 text-body text-missing-strong">
          No live <b>{data.goal_saved}</b> jobs right now. We check again after the next job update.
        </p>
      ) : <p className={`${STATEMENT} mt-1.5`}>Which job do you want to aim for? <span className="text-muted">These fit your skills best.</span></p>}
      {shown.length > 0 && (
        <div role="radiogroup" aria-label="Job types that fit your skills" className="mt-3 grid gap-2">
          {shown.map(b => (
            <label key={b.category} className={`grid cursor-pointer grid-cols-[20px_minmax(0,1fr)_96px_56px] items-center gap-2.5 rounded-2xl border bg-card px-3 py-2.5 max-sm:grid-cols-[20px_minmax(0,1fr)_auto] ${choice === b.category ? 'border-accent' : 'border-line'}`}>
              <input type="radio" name="best-fit" checked={choice === b.category} onChange={() => setChoice(b.category)} className="h-4 w-4 accent-(--color-accent)" />
              <span className="min-w-0 text-body text-ink">{b.category}</span>
              <span aria-hidden="true" className="h-2.5 overflow-hidden rounded-full bg-track max-sm:hidden"><i className={`block h-full rounded-full ${fitTone(b.have / b.of)}`} style={{ width: `${(b.have / b.of) * 100}%` }} /></span>
              <b className="text-right text-small tabular-nums">{b.have} of {b.of}</b>
            </label>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {shown.length > 0 && (
          <button type="button" disabled={busy || !choice} onClick={() => onGoal(choice)}
            className="dash-breathe rounded-full bg-accent px-5 py-2.5 text-body font-bold text-on-accent transition-transform hover:bg-accent-strong active:scale-95 disabled:opacity-45">
            {nojobs ? 'Switch goal' : 'Set as my goal'}
          </button>
        )}
        {!nojobs && <button type="button" onClick={onCounsellor} className="rounded-full border border-line-strong bg-card px-5 py-2.5 text-body font-bold text-ink hover:bg-well">Not sure? Ask the Career Counsellor</button>}
      </div>
      <div className="dash-frost mt-4 flex min-h-0 flex-1 flex-col rounded-2xl px-4 py-3">
        <h3 className="m-0 text-body font-bold text-ink">Where the {data.categories.reduce((a, c) => a + c.jobs, 0)} live ICT jobs are</h3>
        <p className="m-0 text-small text-muted">Deeper blue = more jobs of that type</p>
        <ul aria-label="Live ICT jobs by job type" className="m-0 mt-2 flex min-h-0 flex-1 list-none flex-col justify-evenly gap-1.5 p-0">
          {data.categories.map((c, k) => (
            <li key={c.name} className="grid grid-cols-[minmax(0,210px)_minmax(0,1fr)_28px] items-center gap-3 text-body max-sm:grid-cols-[minmax(0,1fr)_72px_24px]">
              <span className="truncate font-medium text-ink" title={c.name}>{c.name}</span>
              <span aria-hidden="true" className="h-3 overflow-hidden rounded-full bg-track"><i style={{ width: `${(c.jobs / mx) * 100}%`, '--k': k }} className={`dash-grow block h-full min-w-1.5 rounded-full ${jobTone(c.jobs / mx)}`} /></span>
              <b className="text-right tabular-nums text-ink">{c.jobs}</b>
            </li>
          ))}
        </ul>
      </div>
    </Tile>
  )
}

// While the Dashboard loads: the same two columns and cards, grey bars where the text goes (9 Oct)
function DashboardSkeleton() {
  const side = (rows) => (
    <section className="bg-card rounded-panel border border-line shadow-card flex flex-col lg:flex-1 min-h-56 overflow-hidden">
      <div className="px-6 pt-4 pb-3 border-b border-line space-y-2"><Bar className="h-4 w-36" /><Bar className="h-3 w-52" /></div>
      <div className="px-6 divide-y divide-line">{[...Array(rows)].map((_, i) => <RowSkeleton key={i} />)}</div>
    </section>
  )
  return (
    <div className="grid lg:grid-cols-[1.3fr_1fr] gap-5 lg:flex-1 lg:min-h-0" aria-busy="true">
      <LoadingLabel>Loading your dashboard…</LoadingLabel>
      <div className="flex flex-col gap-5 min-h-0">
        <section className="bg-card rounded-panel border border-line shadow-card lg:flex-1 px-5 sm:px-7 pt-6 pb-6 flex flex-col">
          <div className="flex items-center gap-2"><Bar className="h-3.5 w-16" /><Bar className="h-8 w-64 rounded-control" /></div>
          <div className="flex items-end gap-5 mt-5"><Bar className="h-12 w-24" /><div className="space-y-2 pb-1"><Bar className="h-5 w-64" /><Bar className="h-3.5 w-48" /></div></div>
          <div className="grid grid-cols-10 gap-1.5 mt-4">{[...Array(10)].map((_, i) => <Bar key={i} className="h-3" />)}</div>
          <div className="flex gap-1.5 mt-4">{['w-20', 'w-24', 'w-16', 'w-18'].map(w => <Bar key={w} className={`h-6 ${w} rounded-full`} />)}</div>
          <div className="mt-5 space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="flex items-center gap-3"><Bar className="h-4 w-4 rounded" /><Bar className="h-3.5 w-40" /></div>)}</div>
          <div className="mt-auto pt-5 flex gap-2"><Bar className="h-9 w-48 rounded-panel" /><Bar className="h-9 w-32 rounded-panel" /></div>
        </section>
        <section className="bg-card rounded-panel border border-line shadow-card px-6 py-4 shrink-0"><Bar className="h-4 w-64" /></section>
      </div>
      <div className="flex flex-col gap-5 min-h-0">{side(4)}{side(4)}</div>
    </div>
  )
}

// No modules, projects, experience, certificates or awards yet: one clear way forward, not empty cards (NN/g, empty states)
function StartCard({ onGo }) {
  const steps = [
    { tab: 'modules', icon: '📘', title: 'Modules and grades', text: 'The strongest evidence for your skills.' },
    { tab: 'projects', icon: '🗂️', title: 'Projects', text: 'What you built, or import from GitHub.' },
    { tab: 'experience', icon: '💼', title: 'Experience', text: 'Internships, part-time work, clubs, hackathons.' },
    { tab: 'certs', icon: '🎓', title: 'Certificates', text: 'Courses and badges you earned.' },
    { tab: 'awards', icon: '🏆', title: 'Awards', text: 'Competitions, scholarships, dean\'s list.' },
  ]
  return (
    <Card>
      <div className="px-4 sm:px-8 py-8">
        <p className="text-title font-semibold tracking-tight text-ink">Add what you've done to see your matches</p>
        <p className="text-body text-faint mt-1">SkillMap turns your modules, projects, experience, certificates and awards into skills, then compares them with live jobs.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-6">
          {steps.map(s => (
            <button key={s.tab} type="button" onClick={() => onGo(s.tab)}
              className="text-left border border-line rounded-panel p-4 hover:border-accent/40 hover:bg-accent-soft/40 transition">
              <span aria-hidden="true" className="text-display">{s.icon}</span>
              <p className="text-body font-semibold text-ink mt-2">{s.title}</p>
              <p className="text-small text-faint mt-0.5">{s.text}</p>
            </button>
          ))}
        </div>
      </div>
    </Card>
  )
}


// 19 Oct: every way into the AI Assistant says where it came from, for its "← Back to …" link
const FROM_DASHBOARD = { from: 'Dashboard' }
export default function Dashboard() {
  const navigate = useNavigate()
  const { user, setUser } = useAuth()
  const [goalData, setGoalData] = useState(null)      // GET /recommend/goal
  const [matches, setMatches] = useState(null)        // top job matches for the goal (or all)
  const [moreToLearn, setMoreToLearn] = useState([])  // skills missing most often in those matches (/recommend)
  // every live job (the request Job Matches sends without a category, so it is cached there too): fills the cards
  // when the goal has only a few jobs
  const [allMatches, setAllMatches] = useState([])
  const [allToLearn, setAllToLearn] = useState([])
  useEffect(() => {
    let gone = false
    cached('/recommend/', ALL_MATCHES).then(rec => { if (!gone && rec) { setAllMatches(rec.recommendations || []); setAllToLearn(rec.skills_to_learn || []) } }).catch(() => {})
    return () => { gone = true }
  }, [])
  const [emptyProfile, setEmptyProfile] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)
  // 12 Oct (her review): an employer's invitation to apply shows here, where she looks first; only when there is one
  const [invites, setInvites] = useState([])
  const [chats, setChats] = useState(null)   // the last AI chat, for "Continue"
  useEffect(() => { api.get('/chatbot/sessions').then(res => setChats(res.data.slice(0, 1))).catch(() => setChats([])) }, [])
  const [apps, setApps] = useState(null)   // /applications/mine: her applications through SkillMap, with status
  // the gaps she ticked to plan; the band's segments and the skills card share it (best gap ticked first)
  const [picked, setPicked] = useState([])
  const toggle = (skill) => setPicked(p => p.includes(skill) ? p.filter(x => x !== skill) : [...p, skill])
  useEffect(() => { api.get('/applications/invitations').then(res => setInvites(res.data)).catch(() => {}) }, [])
  // 17 Nov: /applications/counts only returns invitations, so the old "N sent" was always 0; count the real list
  useEffect(() => { api.get('/applications/mine').then(res => setApps(res.data)).catch(() => setApps([])) }, [])
  const [outside, setOutside] = useState([])   // jobs she applied for on other sites (My Applications' second list)
  useEffect(() => { api.get('/applications/outside').then(res => setOutside(res.data)).catch(() => {}) }, [])
  // 25 Oct (option D): "No thanks" asks for an optional reason first; the employer sees the answer
  const [declining, setDeclining] = useState(null)
  const [declineBusy, setDeclineBusy] = useState(false)
  const [declineError, setDeclineError] = useState('')
  const declineInvite = (reason, note) => {
    const inv = declining
    setDeclineBusy(true); setDeclineError('')
    api.patch(`/applications/invitations/${inv.id}`, { dismissed: true, reason, note })
      .then(() => {
        setInvites(list => list.filter(i => i.id !== inv.id)); setDeclining(null)
        window.dispatchEvent(new Event(ADMIN_COUNTS_CHANGED))
      })
      .catch(err => setDeclineError(errText(err, "Couldn't send your answer. Try again.")))
      .finally(() => setDeclineBusy(false))
  }

  // Only sets state when an answer comes back (so it can run from an effect)
  // 23 Oct (bug sweep): changing the goal while the first goal's jobs were still loading could show the old goal's jobs
  // under the new goal; only the latest load may now fill the page
  const start = useLatest()
  const load = useCallback(() => {
    const isLatest = start()
    api.get('/recommend/goal')
      .then(res => {
        if (!isLatest()) return null
        setGoalData(res.data)
        setPicked(res.data.readiness.filter(r => !r.has).sort((x, y) => y.opens_count - x.opens_count).slice(0, 1).map(r => r.skill))
        // The same request Job Matches sends for this category, so the order is the same there
        return cached('/recommend/', { ...ALL_MATCHES, category: res.data.goal || '' })
      })
      .then(rec => { if (rec && isLatest()) { setMatches(rec.recommendations || []); setMoreToLearn(rec.skills_to_learn || []) } })
      .catch(err => {
        if (!isLatest()) return
        if (err.response?.status === 400) setEmptyProfile(true)   // nothing in the profile yet
        else setLoadError("Couldn't load your dashboard. Please check the server is running and refresh.")
      })
  }, [start])

  useEffect(() => {
    load()
  }, [load])

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
    + (goalData?.goal ? `&job=${encodeURIComponent(goalData.goal)}` : ''), { state: FROM_DASHBOARD })
  // The counsellor chat opens with this message in the box, not sent: she can change it first (9 Oct)
  const counsellor = () => {
    const strong = (goalData?.wanted || []).slice(0, 3).map(w => skillName(w.skill))
    const fits = (goalData?.best_fit || []).slice(0, 3).map(b => b.category)
    const ask = "I'm not sure which ICT role suits me."
      + (strong.length ? ` My strongest skills are ${listAnd(strong)}` : '')
      + (fits.length ? `${strong.length ? ', and' : ''} the job categories that fit me best are ${listAnd(fits)}.` : strong.length ? '.' : '')
      + ' Can you help me choose?'
    navigate(`/chatbot?mode=career_counsellor&ask=${encodeURIComponent(ask)}`, { state: FROM_DASHBOARD })
  }

  const chat = chats?.[0]
  const firstName = user?.first_name || 'there'
  const scope = goalData?.goal ? '' : 'all ICT'
  const hasGoal = !!goalData?.goal
  const hasApps = invites.length > 0 || (apps?.length ?? 0) > 0
  const gapsByJobs = (goalData?.readiness || []).filter(r => !r.has).sort((a, b) => b.opens_count - a.opens_count)
  const [firstGap, secondGap] = gapsByJobs
  const askCounsellor = (q) => () => navigate(`/chatbot?mode=career_counsellor&ask=${encodeURIComponent(q)}`, { state: FROM_DASHBOARD })
  // ready questions for the AI Assistant, most useful first; the card shows as many as fit its height (20 Nov, her
  // review: no blank in the card). All are things the two modes already do (Chatbot.jsx starters)
  const asks = [
    firstGap && { text: `How do I learn ${skillName(firstGap.skill)}?`, go: () => plan([skillName(firstGap.skill)]) },
    { text: 'Which job type suits my skills?', go: counsellor },
    { text: 'What should I add to my profile?', go: askCounsellor(`What should I add to my profile next${goalData?.goal ? ` to get closer to ${goalData.goal}` : ''}?`) },
    secondGap && { text: `How do I learn ${skillName(secondGap.skill)}?`, go: () => plan([skillName(secondGap.skill)]) },
    { text: 'Turn my projects into CV points', go: askCounsellor('Turn my projects into CV points') },
    !firstGap && { text: 'Which skills should I learn next?', go: askCounsellor('Which skills should I learn next for the jobs that fit me?') },
    !secondGap && { text: 'How do I prepare for my first job?', go: askCounsellor('How do I prepare for my first job after graduating?') },
    { text: 'Practise interview questions with me', go: askCounsellor(`Practise interview questions with me${goalData?.goal ? ` for a ${goalData.goal} role` : ''}`) },
  ].filter(Boolean)

  return (
    // Laptop/tablet: exactly one screen; the bottom row takes what is left. Phone: one column, AI Assistant last
    <div className="dash-fit mx-auto flex w-full max-w-310 flex-col px-4 pb-4 pt-3 sm:px-6">
      {/* soft colour drifting behind the glass goal card */}
      <div className="dash-orbs" aria-hidden="true"><i /><i /><i /></div>
      <div className="dash-rise-in mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="m-0 font-display text-[32px] font-extrabold leading-tight tracking-[-0.04em] text-ink dash-short:text-[27px] max-sm:text-[26px]">{greeting(firstName)} 👋</h1>
        {goalData && !hasGoal && (
          <p className={`m-0 text-body text-muted ${goalData.goal_saved ? '' : 'max-sm:hidden'}`}>{goalData.goal_saved ? 'Your goal has no live jobs this week. Here are close ones.' : "Let's start by choosing where you want to go."}</p>
        )}
        <Bell className="ml-auto self-center" />
        <div className="w-full empty:hidden"><PrivacyBanner /></div>
        {/* without a goal the My Applications card is hidden, so an invitation shows as a slim violet line */}
        {!hasGoal && invites.length > 0 && (
          <div className="dash-invite w-full">
            <span className="invite-ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7 8 6 8-6" /></svg></span>
            <p className="m-0 min-w-0 flex-1 truncate text-body"><b className="inv-word">{invites.length > 1 ? `${invites.length} employers` : invites[0].company}</b> invited you to apply
              {invites.length === 1 && <span className="text-muted"> · {invites[0].title}</span>}</p>
            <Link to={invites.length > 1 ? '/applications' : `/jobs/${encodeURIComponent(invites[0].job_ref)}`} state={{ from: 'Dashboard' }} className="dash-invite-go">
              {invites.length > 1 ? 'See invitations' : 'View job'}</Link>
            {invites.length === 1 && <button type="button" onClick={() => { setDeclineError(''); setDeclining(invites[0]) }} className="text-small font-semibold text-muted hover:text-ink">No thanks</button>}
          </div>
        )}
      </div>
      {loadError && <p role="alert" className="mb-3 rounded-control bg-missing-soft px-4 py-3 text-body text-missing-strong">{loadError}</p>}
      {declining && <DeclineInvite inv={declining} busy={declineBusy} error={declineError}
        onCancel={() => setDeclining(null)} onDecline={declineInvite} />}

      {emptyProfile ? <StartCard onGo={(tab) => navigate(`/profile?tab=${tab}`)} /> : !goalData ? (
        <DashboardSkeleton />
      ) : (
        <div className={`dash-bento min-h-0 flex-1 ${hasGoal ? '' : 'no-goal'} ${hasApps ? '' : 'no-apps'}`}>
          {hasGoal
            ? <GoalTile key={goalData.goal} data={goalData} picked={picked} busy={busy} onGoal={changeGoal} />
            : <ChooseTile key={goalData.goal_saved || 'none'} data={goalData} busy={busy} onGoal={changeGoal} onCounsellor={counsellor} />}
          {/* 20 Nov (her call): without a goal, choosing one is the point; My Applications and the AI Assistant wait */}
          {hasGoal && <AppsTile invites={invites} apps={apps} outside={outside} onDecline={(inv) => { setDeclineError(''); setDeclining(inv) }} />}
          {hasGoal && <GrowTile data={goalData} picked={picked} toggle={toggle} onPlan={plan} more={[...moreToLearn, ...allToLearn.filter(x => !moreToLearn.some(y => y.skill.toLowerCase() === x.skill.toLowerCase()))]} />}
          <JobsTile matches={matches} others={allMatches} scope={scope}
            onOpen={job => navigate(`/jobs/${encodeURIComponent(job.job_id)}`, { state: { from: 'Dashboard' } })}
            onSee={fit => {
              // Job Matches on the same jobs the chart counted: the goal's category (or all), and the fit band picked
              try { sessionStorage.setItem('lastActiveCategory', goalData.goal || 'all') } catch { /* storage blocked */ }
              navigate(fit === 'all' ? '/recommend' : `/recommend?fit=${fit}`)
            }} />
          <div className="dash-side">
            <WantTile wanted={goalData.wanted} />
            {hasGoal && <AiTile chat={chat} asks={asks} />}
          </div>
        </div>
      )}
    </div>
  )
}
