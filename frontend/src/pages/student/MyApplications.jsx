import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../../api'
import PageHeader from '../../components/PageHeader'
import { ADMIN_COUNTS_CHANGED } from '../../components/Sidebar'
import { errText } from './profileUtils'
import { Bar, LoadingLabel } from '../../components/Skeleton'
import InfoTip from '../../components/InfoTip'
import EmployerRecord from '../../components/EmployerRecord'
import { useToast } from '../../components/Toast'
import BackLink from '../../components/BackLink'

// My Applications (11 Oct, Employer flow batch 2; mock-up board 6): every job the student applied for on SkillMap.
// 12 Oct (her request; mock-up P2): one card per application with its progress, Applied -> Viewed -> Shortlisted ->
// Decision, each with its date, so the student isn't left waiting in silence (LinkedIn shows "Application viewed";
// Talent Board: nearly half of candidates never get a status update). After 14 quiet days the card says to keep
// applying elsewhere, after 30 that this one is unlikely (MyCareersFuture: follow up after 1-2 weeks, move on after
// about a month). Employers' invitations to apply sit on top. One column across the page width, newest update first (her review, 12 Oct). References: references.md "Application progress".
const fmtDay = (iso) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''
// 20 Oct (her review; blue is kept for things to click): grey = waiting, violet = moving forward, green = good news,
// red = not selected. Statuses on other sites use the same colours (their select).
const PILL = {
  applied: 'bg-slate-100 text-slate-700', viewed: 'bg-slate-100 text-slate-700', shortlisted: 'bg-violet-50 text-violet-800',
  accepted: 'bg-green-50 text-green-800', rejected: 'bg-rose-50 text-rose-700', closed: 'bg-slate-100 text-slate-500',
  interviewing: 'bg-violet-50 text-violet-800', offer: 'bg-green-50 text-green-800', not_selected: 'bg-rose-50 text-rose-700',
  withdrew: 'bg-slate-50 text-slate-500 border border-slate-200',
}
// 14 Oct (transparency flow): every outcome says why. Reasons the employer picked, or why the job closed.
const REASON_TEXT = {
  missing_skills: 'missing required skills', position_filled: 'position filled', experience: 'more experience needed',
}

// While waiting: what is happening on the job, where you stand among the applicants (skills only, from 5 applicants),
// and the employer's record of deciding by their own date (research: references.md "Employer replies, ghosting")
// 20 Oct (her pick S4): the three numbers are boxes exactly as tall as the steps beside them: the number on the
// circles' line, the caption on the step names' line
function Numbers({ r }) {
  const st = r.job_stats
  return (
    <div className="grid grid-cols-3 gap-2">
      {/* 20 Oct (her review): "1 applied" read like her own count; now says it's everyone who applied */}
      {[[st?.applied, st?.applied === 1 ? 'person applied' : 'people applied'], [st?.shortlisted, 'shortlisted so far'],
        [r.decide_by ? fmtDay(r.decide_by) : '—', 'reply promised by']].map(([v, k]) => (
        <div key={k} className="rounded-lg bg-slate-50 h-13 px-3 flex flex-col justify-center">
          <p className="text-[15px] font-semibold text-slate-900 tabular-nums leading-6">{v ?? '—'}</p>
          <p className="text-xs leading-4 text-slate-500">{k}</p>
        </div>
      ))}
    </div>
  )
}

// What is happening on the job, where you stand among the applicants (skills only, from 5 applicants), and the
// employer's record of deciding by their own date (research: references.md "Employer replies, ghosting")
function Facts({ r }) {
  const me = r.stand
  return (
    <div className="mt-3 space-y-2.5">
      {/* 21 Oct (references.md "Changing a job's requirements after people applied"): after she applied the employer may
          only ask for less; she is told what the job no longer requires, so a changed match count isn't a mystery */}
      {r.job_changed && <p className="text-xs text-slate-600">{r.company} no longer requires {r.job_changed.no_longer_required.join(', ')} for this job (changed after you applied).
        {r.match && r.job_changed.was && <> Your match is now {r.match.replace(' required', '')} ({r.job_changed.was} when you applied).</>}</p>}
      {r.decide_extended_reason && <p className="text-xs text-slate-600">Reply date moved{r.decide_by_original ? ` from ${fmtDay(r.decide_by_original)}` : ''}: “{r.decide_extended_reason}”</p>}
      {!r.taking_applications && <p className="text-xs text-slate-600">Not taking new applications. {r.company} is still deciding.</p>}
      {me && (
        <div>
          <p className="text-sm text-slate-700">Skills: <b className="font-semibold text-slate-900">{me.have} of {me.total} required</b> · ahead of {me.ahead_of} of {me.others} applicants
            <InfoTip label="About this comparison">Compared on skills only, using everyone's profile from the last day. Employers also look at experience and interviews.</InfoTip></p>
          <div className="mt-1.5 h-1.5 rounded-full bg-slate-200 overflow-hidden" aria-hidden="true">
            <div className="h-full bg-blue-700" style={{ width: `${me.others ? (me.ahead_of / me.others) * 100 : 0}%` }} />
          </div>
        </div>
      )}
      {/* shown from 3 judged jobs (audit, 14 Oct): below that one late job would define the employer */}
      <EmployerRecord company={r.company} record={r.employer_record} />
    </div>
  )
}

// 20 Oct (her pick F1): the steps in Details, a band as tall as the number boxes beside them: circles joined by a
// line through their middle, each step's name under its circle with the date of a step that happened
function DetailSteps({ steps, decided }) {
  const last = steps.findLastIndex(x => x.at)
  return (
    <ol className="flex h-13" aria-label="Progress">
      {steps.map((s, i) => {
        const done = !!s.at
        const skipped = !done && decided && s.key !== 'decision'
        return (
          <li key={s.key} className="flex-1 flex flex-col items-center relative">
            {i > 0 && <span aria-hidden="true" className={`absolute z-0 top-3.25 right-1/2 w-full h-0.5 ${done || skipped ? 'bg-blue-500' : 'bg-slate-200'}`} />}
            {/* 20 Oct (her review): the circle is drawn above the line, not under it */}
            <span aria-hidden="true" className={`relative z-10 mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center text-[11px] leading-none text-white ${
              done ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300'}`}>{done ? '✓' : ''}</span>
            <span className={`text-xs leading-4 mt-1.5 whitespace-nowrap ${i === last ? 'font-semibold text-slate-900' : done ? 'text-slate-600' : 'text-slate-400'}`}>
              {s.label}{done ? ` · ${fmtDay(s.at)}` : skipped ? ' · —' : ''}
            </span>
            <span className="sr-only">{done ? 'done' : skipped ? 'skipped' : 'not yet'}</span>
          </li>
        )
      })}
    </ol>
  )
}

const similar = (r) => { try { sessionStorage.setItem('lastActiveCategory', r.category || '') } catch { /* storage blocked */ } }

function Outcome({ r }) {
  const why = r.reason === 'job_filled' ? <><b className="font-semibold">Position filled{r.close_reason === 'filled_other' ? ' another way' : ''}.</b> You were not selected.</>
    : r.reason === 'job_cancelled' ? <><b className="font-semibold">The job was closed without being filled.</b> No one was selected.</>
    : r.reason === 'other' ? <><b className="font-semibold">Reason from {r.company}:</b> “{r.note}”</>
    : r.reason ? <><b className="font-semibold">Reason from {r.company}:</b> {REASON_TEXT[r.reason]}</>
    : <>{r.company} gave no reason.</>
  return (
    <div className="mt-4 text-sm text-slate-700 space-y-2">
      <p>{why}</p>
      {r.reason !== 'other' && r.note && <p><b className="font-semibold">Note from {r.company}:</b> “{r.note}”</p>}
      {r.reason_skills.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {r.reason_skills.map(k => <span key={k} className="text-xs rounded-full px-2.5 py-0.5 border border-dashed border-slate-400 text-slate-700">{k}</span>)}
          <Link to={`/chatbot?skill=${encodeURIComponent(r.reason_skills.join(', '))}&job=${encodeURIComponent(r.title)}`} state={{ from: 'My Applications' }}
            className="ml-1 text-xs font-medium text-blue-700 border border-blue-200 rounded-lg px-2.5 py-1 hover:bg-blue-50">Plan these</Link>
        </div>
      )}
      <p className="text-sm">
        <Link to={`/jobs/${encodeURIComponent(r.job_ref)}`} state={{ from: 'My Applications' }} className="text-blue-700 hover:underline">See your skill gap for this job</Link>
        {' · '}<Link to="/recommend" onClick={() => similar(r)} className="text-blue-700 hover:underline">Similar jobs</Link>
      </p>
    </div>
  )
}

// 20 Oct (her review; Indeed's My Jobs keeps jobs applied for elsewhere in the same lists, references.md "My
// Applications: one list or two?"): the filters count both SkillMap applications and ones on other sites, so the
// names fit both: In progress, Offer (accepted on SkillMap), Ended (not selected, withdrew, closed without a decision)
const TABS = [['all', 'All'], ['progress', 'In progress'], ['offer', 'Offer'], ['ended', 'Ended']]
const groupOf = (r) => r.status === 'accepted' ? 'offer' : r.status === 'rejected' || r.progress.closed_without_decision ? 'ended' : 'progress'
const outsideGroup = (o) => o.status === 'offer' ? 'offer' : ['not_selected', 'withdrew'].includes(o.status) ? 'ended' : 'progress'
const inTab = (r, t) => t === 'all' || groupOf(r) === t
const outsideInTab = (o, t) => t === 'all' || outsideGroup(o) === t

function Note({ r }) {
  const p = r.progress
  // 14 Oct: the employer's own date passed with no decision (B1 wording, her pick): not a rejection
  if (p.nudge === 'no_decision') return (
    <p className="mt-4 text-sm text-amber-900 bg-amber-50 rounded-lg px-3.5 py-2.5">
      <b>{r.company} missed its promised reply date ({fmtDay(r.decide_by)}).</b> Focus on other jobs; any reply will still appear here.
    </p>
  )
  if (p.nudge === 'move_on') return (
    <p className="mt-4 text-sm text-amber-900 bg-amber-50 rounded-lg px-3.5 py-2.5">
      <b>No update for {p.quiet_days} days.</b> Employers who are interested usually reply within a month, so treat this one as
      unlikely and put your time into other jobs. It stays here in case they reply.
    </p>
  )
  if (p.nudge === 'keep_applying') return (
    <p className="mt-4 text-sm text-amber-900 bg-amber-50 rounded-lg px-3.5 py-2.5">
      <b>No update for {p.quiet_days} days.</b> Keep applying to other jobs while you wait; this one stays open.
    </p>
  )
  if (p.closed_without_decision) return <p className="mt-4 text-sm text-slate-600">The employer closed this job without a decision.</p>
  // 21 Oct (her pick S1; research: references.md "Telling a shortlisted student"): what Shortlisted means and the one
  // thing to do, with a way to prepare in the AI Assistant (objective 4)
  if (r.status === 'shortlisted') {
    const ask = `I've been shortlisted for ${r.title} at ${r.company}. Help me prepare for this interview: what they are likely to ask about this job, and how to answer with my own projects.`
    return (
      <div className="mt-4 text-sm text-violet-900 bg-violet-50 rounded-lg px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p><b>Get ready: {r.company} may contact you soon.</b> Keep an eye on your email and phone.</p>
        <Link to={`/chatbot?ask=${encodeURIComponent(ask)}&job=${encodeURIComponent(r.title)}&job_id=${encodeURIComponent(r.job_ref)}&purpose=interview`}
          state={{ from: 'My Applications' }} className="shrink-0 font-medium text-blue-700 hover:underline">Prepare for the interview →</Link>
      </div>
    )
  }
  if (r.status === 'rejected') return <Outcome r={r} />
  if (r.status === 'accepted') return <p className="mt-4 text-sm text-slate-600">{r.company} has your email and will contact you about the next step.</p>
  if (r.employer_usually_days) return (
    <p className="mt-4 text-sm text-slate-500">{r.company} usually views applications within {r.employer_usually_days} day{r.employer_usually_days === 1 ? '' : 's'}.</p>
  )
  return null
}

function pill(r) {
  if (r.progress.closed_without_decision) return ['closed', 'Job closed']
  if (r.progress.nudge === 'no_decision') return ['closed', 'No decision']
  if (r.status === 'accepted' || r.status === 'rejected' || r.status === 'shortlisted') return [r.status, r.status_label]
  return [r.progress.stage, r.progress.stage === 'viewed' ? 'Viewed' : 'Applied']
}

// 20 Oct (her review of 10 + 10 applications: four screens long; research: references.md "My Applications with many
// applications"): progressive disclosure, one level. Each SkillMap card shows by default what is needed every visit
// (stage, reply date, status); "Details" opens the steps with their dates and the numbers. Each section shows its
// newest 3, then "See all N" (later 20 Oct changes: see the components below).
const FIRST = 3
// 20 Oct (her review: one section short, the other cut at 3): the main view has room for `room` rows; each section
// gets up to 3, and rows one section doesn't need go to the other (1 SkillMap + 4 other sites shows all 5).
// `room` is measured on her screen (her review: 6 rows started scrolling on her laptop), see MyApplications.
function share(a, b, ROOM) {
  const x = Math.min(a, FIRST), y = Math.min(b, FIRST)
  let spare = ROOM - Math.max(x, 1) - Math.max(y, 1)      // an empty section still takes one line ("None …")
  const ax = Math.min(a - x, spare); spare -= ax
  return [x + ax, y + Math.min(b - y, spare)]
}
// 20 Oct (her review: the gaps between cards looked odd): each section is one card with a line between applications
const LIST = 'bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100'
// 20 Oct (her review: big empty middle): one row = job | progress | reply date or site | status, as columns on laptops
// One line per row from 1024 px (her review: consistency); the progress column never wraps and starts at the same place
// 20 Oct (her review: big gap after the job name): the job column grows only to 22rem; any spare width is shared
// equally between the four columns (space-between), so the gaps match
const ROW = 'grid gap-x-4 gap-y-2 lg:grid-cols-[minmax(0,22rem)_11.5rem_8.5rem_10.5rem] xl:grid-cols-[minmax(0,22rem)_24rem_8.5rem_10.5rem] 2xl:grid-cols-[minmax(0,22rem)_24rem_10.5rem_10.5rem] lg:justify-between lg:items-center lg:min-h-12'

function MiniSteps({ steps }) {
  // 20 Oct (her review): always ONE line. Laptops: every step named, the date on the latest one (all dates are in
  // Details). Narrower screens (phones, small laptops): dots joined by lines and only the latest step named.
  const last = steps.findLastIndex(x => x.at)
  const cur = steps[last]
  const date = (s) => (s?.at && s.at !== true ? fmtDay(s.at) : '')
  return (
    <div aria-label="Progress">
      <ol className="hidden xl:flex flex-nowrap items-center gap-2 whitespace-nowrap">
        {steps.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden="true" className={`w-3 h-px ${s.at ? 'bg-blue-500' : 'bg-slate-300'}`} />}
            <span className={`flex items-center gap-1 text-[13px] ${i === last ? 'font-semibold text-slate-900' : s.at ? 'text-slate-600' : 'text-slate-400'}`}>
              <span aria-hidden="true" className={`w-2 h-2 rounded-full ${s.at ? 'bg-blue-600' : 'bg-slate-300'}`} />
              {s.label}{i === last && date(s) && <span className="font-normal text-slate-500"> {date(s)}</span>}
              <span className="sr-only">{s.at ? ' done' : ' not yet'}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="xl:hidden flex items-center gap-2 whitespace-nowrap text-[13px]">
        <span aria-hidden="true" className="flex items-center">
          {steps.map((s, i) => (
            <span key={s.key} className="flex items-center">
              {i > 0 && <span className={`w-2.5 h-px ${s.at ? 'bg-blue-500' : 'bg-slate-300'}`} />}
              <span className={`w-2 h-2 rounded-full ${s.at ? 'bg-blue-600' : 'bg-slate-300'}`} />
            </span>
          ))}
        </span>
        <span className="font-semibold text-slate-900">{cur?.label}</span>
        {date(cur) && <span className="text-slate-500">{date(cur)}</span>}
      </p>
    </div>
  )
}

// 20 Oct (her review): "Show all" sits on the section title's line, so it is seen before the list, not after it
function SectionHead({ id, title, note, more }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <div>
        <h2 id={id} className="text-base font-semibold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">{note}</p>
      </div>
      {more}
    </div>
  )
}

function Labelled({ label, value }) {
  // 20 Oct (her review: keep things on one line): "Reply by 9 Nov", the value darker and bold so it is noticed
  if (!value) return <span className="hidden lg:block" />
  // a long site name ("Randstad Singapore") ends in "…" inside its column instead of running under the select
  return <p className="text-[13px] text-slate-500 whitespace-nowrap min-w-0 truncate" title={`${label} ${value}`}>{label} <b className="font-semibold text-slate-900">{value}</b></p>
}

// 20 Oct (her review: "Show all" growing one section while the other stays short looked odd; research:
// references.md "See all"): "See all N" opens that section on its own, as a normal list the page scrolls
function Empty({ children }) {
  return <p data-row className="px-5 py-3.5 text-sm text-slate-500">{children}</p>
}

function MoreButton({ total, shown, onClick }) {
  if (total <= shown) return null
  return (
    <button type="button" onClick={onClick} className="shrink-0 text-sm font-medium text-blue-700 hover:underline">
      See all {total} →
    </button>
  )
}

function AppCard({ r, open, onToggle }) {
  // 20 Oct (her review): every row starts as one line (none opens by itself) and only one is open at a time; what
  // needs her attention shows in the row instead: the pill's colour, and an amber note where "Reply by" sits
  const ref = useRef(null)
  useEffect(() => { if (open) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [open])
  const [key, label] = pill(r)
  const decided = ['accepted', 'rejected'].includes(r.status)
  const steps = r.progress.steps.map(s => s.key === 'decision' && decided ? { ...s, label: r.status_label } : s)
  const p = r.progress
  const warn = p.nudge === 'no_decision' ? ['Reply date', 'passed'] : p.nudge ? ['No update for', `${p.quiet_days} days`] : null
  const when = decided || r.job_closed ? '' : r.decide_by ? fmtDay(r.decide_by) : ''
  const numbers = !decided && !r.job_closed
  return (
    <article ref={ref} data-row className="px-5 py-3.5 scroll-mt-4">
      <div className={ROW}>
        <div className="min-w-0">
          <Link to={`/jobs/${encodeURIComponent(r.job_ref)}`} state={{ from: 'My Applications' }} className={`${TITLE} ${ONE}`} title={r.title}>{r.title}</Link>
          <p className={`text-xs text-slate-500 mt-0.5 ${ONE}`}>{r.company}{r.match && ` · ${short(r.match)}`}</p>
        </div>
        {/* opened, the steps and the numbers below say these, so the row doesn't repeat them */}
        {open ? <span className="hidden lg:block" /> : <MiniSteps steps={steps} />}
        {open ? <span className="hidden lg:block" />
          : warn ? <p className="text-[13px] text-amber-700 whitespace-nowrap">{warn[0]} <b className="font-semibold">{warn[1]}</b></p>
          : r.status === 'shortlisted' ? <p className="text-[13px] text-violet-800 whitespace-nowrap"><b className="font-semibold">Get ready</b> · watch your email</p>
          : <Labelled label="Reply by" value={when} />}
        <div className="flex items-center gap-3 lg:justify-end">
          <span className={`shrink-0 text-xs font-semibold rounded-full px-2.5 py-0.5 ${PILL[key]}`}>{label}</span>
          <button type="button" onClick={onToggle} aria-expanded={open}
            className="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap">{open ? 'Hide ▴' : 'Details ▾'}</button>
        </div>
      </div>
      {open && (
        <div className="pb-1">
          <div className={`mt-3 ${numbers ? 'grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-x-6 gap-y-3 items-start' : ''}`}>
            <DetailSteps steps={steps} decided={decided} />
            {numbers && <Numbers r={r} />}
          </div>
          {numbers && <Facts r={r} />}
          <Note r={r} />
        </div>
      )}
    </article>
  )
}

// While it loads: two application cards in grey bars, with the four progress steps (13 Oct, same as other pages)
function AppsSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <LoadingLabel>Loading your applications…</LoadingLabel>
      {[0, 1].map(i => (
        <div key={i} aria-hidden="true" className="bg-white border border-slate-200 rounded-2xl px-5 py-4">
          <div className="flex justify-between gap-3"><div className="space-y-2"><Bar className="h-4 w-56" /><Bar className="h-3 w-40" /></div><Bar className="h-5 w-20 rounded-full" /></div>
          <div className="grid grid-cols-4 gap-6 mt-5 px-8">{[0, 1, 2, 3].map(j => <div key={j} className="flex flex-col items-center gap-2"><Bar className="h-6 w-6 rounded-full" /><Bar className="h-3 w-16" /></div>)}</div>
        </div>
      ))}
    </div>
  )
}

// 20 Oct (her idea; mock-up 9): jobs she applied for on other sites, recorded by her. SkillMap can't see those
// employers' replies, so she sets the status; no reply date or employer record. Statuses as in the research (Indeed,
// Huntr). Removing is undone with Undo (her guide on pop-ups: no "Are you sure?" for what can be taken back).
// 20 Oct (her review): titles in blue, since they open the job again (Job Description and Skill Gap Analysis)
const TITLE = 'text-[15px] font-semibold text-blue-700 hover:underline underline-offset-2'
// 20 Oct (her review: one line each): in rows, the title and the line under it don't wrap (full text on hover)
const ONE = 'lg:block lg:truncate'
// "3 of 5 required" -> "3/5 required", as on Job Matches, so the line under the title fits on one line
const short = (m) => m.replace(' of ', '/')
const OUTSIDE = [['applied', 'Applied'], ['interviewing', 'Interviewing'], ['offer', 'Offer'], ['not_selected', 'Not selected'], ['withdrew', 'Withdrew']]
// 20 Oct (her review): the same columns as the SkillMap rows: job | progress | site | status
const OUT_STEPS = ['applied', 'interviewing', 'offer']
function outsideSteps(o) {
  const at = OUT_STEPS.indexOf(o.status)
  if (at === -1) return [{ key: 'applied', label: 'Applied', at: o.created_at },
    { key: o.status, label: o.status_label, at: o.status_changed_at || true }]
  return OUT_STEPS.map((k, i) => ({ key: k, label: OUTSIDE.find(x => x[0] === k)[1],
    at: i === 0 ? o.created_at : i < at ? true : i === at ? (o.status_changed_at || true) : null }))
}
function OutsideCard({ o, onStatus, onRemove }) {
  return (
    <article data-row className="px-5 py-3.5">
      <div className={ROW}>
        <div className="min-w-0">
          <Link to={`/jobs/${encodeURIComponent(o.job_ref)}`} state={{ from: 'My Applications' }} className={`${TITLE} ${ONE}`} title={o.title}>{o.title}</Link>
          <p className={`text-xs text-slate-500 mt-0.5 ${ONE}`}>{o.company}{o.match && ` · ${short(o.match)}`}{o.listed === false && <span className="text-slate-400"> · ad no longer listed</span>}</p>
        </div>
        <MiniSteps steps={outsideSteps(o)} />
        <Labelled label="Applied via" value={o.publisher || 'another site'} />
        <div className="flex items-center gap-3 lg:justify-end">
          <label className="sr-only" htmlFor={`os-${o.id}`}>Status of {o.title}</label>
          <select id={`os-${o.id}`} value={o.status} onChange={e => onStatus(o, e.target.value)}
            className={`text-xs font-semibold rounded-lg pl-2 pr-1 py-1 border border-transparent ${PILL[o.status] || 'bg-white border-slate-300'}`}>
            {OUTSIDE.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <button type="button" onClick={() => onRemove(o)} className="text-xs font-medium text-slate-500 hover:text-rose-700 hover:underline">Remove</button>
        </div>
      </div>
    </article>
  )
}

export default function MyApplications() {
  const [rows, setRows] = useState(null)
  const [invites, setInvites] = useState([])
  const [tab, setTab] = useState('all')
  const [error, setError] = useState('')
  const [outside, setOutside] = useState([])
  // "See all": one section on its own (?see=skillmap / ?see=other), so the browser's Back returns to both
  const [openId, setOpenId] = useState(null)       // 20 Oct (her pick F1): one SkillMap row open at a time
  // 20 Oct (her review: 6 rows scrolled on her laptop): how many closed rows fit this screen, measured: the rows
  // shown now, plus or minus the rows the spare (or missing) height holds. Not while a row is open (opening one
  // shouldn't hide others) or in "See all". At least one row per section.
  const scrollBox = useRef(null)
  const [room, setRoom] = useState(6)
  const [params, setParams] = useSearchParams()
  const see = params.get('see')
  const seeAll = (which) => setParams(which ? { see: which } : {})
  const toast = useToast()
  useEffect(() => {
    api.get('/applications/mine').then(res => setRows(res.data)).catch(err => setError(errText(err, "Couldn't load your applications.")))
    api.get('/applications/outside').then(res => setOutside(res.data)).catch(() => {})
    api.get('/applications/invitations').then(res => setInvites(res.data)).catch(() => {})
  }, [])
  const dismiss = (inv) => {
    setInvites(list => list.filter(i => i.id !== inv.id))
    api.patch(`/applications/invitations/${inv.id}`, { dismissed: true })
      .then(() => window.dispatchEvent(new Event(ADMIN_COUNTS_CHANGED)))
      .catch(err => { setInvites(list => [inv, ...list]); setError(errText(err, "Couldn't update the invitation. Try again.")) })
  }
  const setStatus = (o, status) => {
    const prev = o.status
    api.patch(`/applications/outside/${o.id}`, { status })
      .then(res => {
        setOutside(list => list.map(x => x.id === o.id ? res.data : x))
        toast.show(`Status changed to ${res.data.status_label}.`, () => setStatus(res.data, prev))
      })
      .catch(err => toast.show(errText(err, "Couldn't change the status. Try again."), null, true))
  }
  const remove = (o) => {
    api.delete(`/applications/outside/${o.id}`)
      .then(() => {
        setOutside(list => list.filter(x => x.id !== o.id))
        toast.show(`Removed ${o.title}.`, () => api.post('/applications/outside', { job_id: o.job_ref })
          .then(res => o.status === 'applied' ? res : api.patch(`/applications/outside/${res.data.id}`, { status: o.status }))
          .then(res => setOutside(list => [res.data, ...list]))
          .catch(() => toast.show("Couldn't undo.", null, true)))
      })
      .catch(err => toast.show(errText(err, "Couldn't remove it. Try again."), null, true))
  }
  // 20 Oct (her review): in "See all" the filter counts are for that section only
  const count = (t) => (see === 'other' ? 0 : (rows || []).filter(r => inTab(r, t)).length)
    + (see === 'skillmap' ? 0 : outside.filter(o => outsideInTab(o, t)).length)
  const outsideShown = outside.filter(o => outsideInTab(o, tab))
  // 12 Oct (her review): one column, the application with the newest update first
  const shown = (rows || []).filter(r => inTab(r, tab))
    .sort((a, b) => new Date(b.progress.last_update) - new Date(a.progress.last_update))
  const [nApps, nOut] = share(shown.length, outsideShown.length, room)
  const hasAny = rows !== null && (rows.length > 0 || outside.length > 0)
  useLayoutEffect(() => {
    const el = scrollBox.current
    if (!el || see || openId !== null || !hasAny) return
    const measure = () => {
      const rowsNow = el.querySelectorAll('[data-row]')
      const rowH = rowsNow[0]?.getBoundingClientRect().height
      if (!rowH) return
      const cs = getComputedStyle(el)
      const used = el.firstElementChild.getBoundingClientRect().height + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
      const fit = rowsNow.length + Math.floor((el.clientHeight - used) / rowH)
      setRoom(r => {
        const next = Math.max(2, Math.min(12, fit))
        return next === r ? r : next
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [see, openId, hasAny, tab, rows, outside])

  return (
    <div className="flex flex-col h-screen">
      <PageHeader>
        <div className="pb-5">
          <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-widest mb-2">My Applications</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Where your applications stand</h1>
          <p className="text-sm text-slate-500 mt-1">Newest update first. Jobs on SkillMap update as the employer acts; jobs on other sites you update yourself.</p>
        </div>
      </PageHeader>
      {see && <BackLink label="all applications" onClick={() => seeAll(null)} />}
      {/* 20 Oct (her review): full screen width, no blank strip on the right */}
      {/* 20 Oct (her review): in "See all" only the list of records scrolls; the filters and the section title stay */}
      <div ref={scrollBox} className={`flex-1 min-h-0 px-4 sm:px-8 py-4 ${see ? 'flex flex-col' : 'overflow-y-auto'}`}><div className={`flex flex-col gap-3.5 ${see ? 'flex-1 min-h-0' : ''}`}>
        {error && <p role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5">{error}</p>}

        {!see && invites.map(inv => (
          <section key={inv.id} className="bg-violet-50 border border-violet-200 rounded-2xl px-5 py-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex-1 min-w-60">
              <h2 className="text-[15px] font-semibold text-slate-900">{inv.company} invited you to apply</h2>
              <p className="text-sm text-slate-600">{inv.title}{inv.match && ` · you have ${inv.match} skills`} · {fmtDay(inv.invited_at)}</p>
            </div>
            <Link to={`/jobs/${encodeURIComponent(inv.job_ref)}`} state={{ from: 'My Applications' }} className="text-sm font-medium text-violet-800 bg-white border border-violet-200 rounded-lg px-3.5 py-1.5 hover:bg-violet-100">View job</Link>
            <button onClick={() => dismiss(inv)} className="text-sm text-slate-500 hover:text-slate-800">Not interested</button>
          </section>
        ))}

        {rows === null && !error && <AppsSkeleton />}
        {(rows?.length > 0 || outside.length > 0) && (
          <div role="tablist" className="flex flex-wrap gap-2 shrink-0">
            {TABS.map(([t, text]) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                className={`text-sm font-medium px-3.5 py-1.5 rounded-full border ${tab === t
                  ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'}`}>
                {text} {count(t)}
              </button>
            ))}
          </div>
        )}
        {rows?.length === 0 && outside.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
            <h2 className="text-base font-semibold text-slate-900">No applications yet</h2>
            <p className="text-sm text-slate-500 mt-1">Jobs marked "Apply on SkillMap" in Job Matches can be applied for here with your profile.</p>
            <Link to="/recommend" className="inline-block mt-4 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700">Go to Job Matches</Link>
          </div>
        )}
        {/* 20 Oct (her review): both sections always show, so the page keeps its shape; an empty one says why in one line */}
        {see !== 'other' && hasAny && (
          <section aria-labelledby="skillmap-h" className={`flex flex-col gap-3 ${see ? 'min-h-0' : ''}`}>
            <SectionHead id="skillmap-h" title={see ? `On SkillMap · ${shown.length}` : 'On SkillMap'} note="The employer updates these as they act."
              more={!see && <MoreButton total={shown.length} shown={nApps} onClick={() => seeAll('skillmap')} />} />
            <div className={`${LIST} ${see ? 'min-h-0 overflow-y-auto' : ''}`}>
              {(see ? shown : shown.slice(0, nApps)).map(r => <AppCard key={r.id} r={r} open={openId === r.id} onToggle={() => setOpenId(id => id === r.id ? null : r.id)} />)}
              {shown.length === 0 && (rows?.length
                ? <Empty>None {tab === 'all' ? 'here' : `with “${TABS.find(t => t[0] === tab)[1]}”`}.</Empty>
                : <Empty>No applications on SkillMap yet. Jobs marked “Apply on SkillMap” are applied for with your profile.{' '}
                    <Link to="/recommend" className="font-medium text-blue-700 hover:underline">Go to Job Matches</Link></Empty>)}
            </div>
          </section>
        )}
        {see !== 'skillmap' && hasAny && (
          <section aria-labelledby="outside-h" className={`flex flex-col gap-3 ${see ? 'min-h-0' : 'mt-1'}`}>
            <SectionHead id="outside-h" title={see ? `On other sites · ${outsideShown.length}` : 'On other sites'}
              note="Jobs you applied for through “Apply on …”. Their employers won't see these, so you update the status."
              more={!see && <MoreButton total={outsideShown.length} shown={nOut} onClick={() => seeAll('other')} />} />
            <div className={`${LIST} ${see ? 'min-h-0 overflow-y-auto' : ''}`}>
              {(see ? outsideShown : outsideShown.slice(0, nOut)).map(o => <OutsideCard key={o.id} o={o} onStatus={setStatus} onRemove={remove} />)}
              {outsideShown.length === 0 && (outside.length
                ? <Empty>None {tab === 'all' ? 'here' : `with “${TABS.find(t => t[0] === tab)[1]}”`}.</Empty>
                : <Empty>None yet. After you apply on another site through “Apply on …”, answer “Yes, I applied” on the job and it shows here.</Empty>)}
            </div>
          </section>
        )}

      </div></div>
      {toast.ui}
    </div>
  )
}
