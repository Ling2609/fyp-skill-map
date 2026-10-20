import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api'
import PageHeader from '../../components/PageHeader'
import { ADMIN_COUNTS_CHANGED } from '../../components/Sidebar'
import { errText } from './profileUtils'
import { Bar, LoadingLabel } from '../../components/Skeleton'
import InfoTip from '../../components/InfoTip'
import EmployerRecord from '../../components/EmployerRecord'
import { useToast } from '../../components/Toast'

// My Applications (11 Oct, Employer flow batch 2; mock-up board 6): every job the student applied for on SkillMap.
// 12 Oct (her request; mock-up P2): one card per application with its progress, Applied -> Viewed -> Shortlisted ->
// Decision, each with its date, so the student isn't left waiting in silence (LinkedIn shows "Application viewed";
// Talent Board: nearly half of candidates never get a status update). After 14 quiet days the card says to keep
// applying elsewhere, after 30 that this one is unlikely (MyCareersFuture: follow up after 1-2 weeks, move on after
// about a month). Employers' invitations to apply sit on top. One column across the page width, newest update first (her review, 12 Oct). References: references.md "Application progress".
const fmtDay = (iso) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''
const PILL = {
  applied: 'bg-slate-100 text-slate-700', viewed: 'bg-slate-100 text-slate-700', shortlisted: 'bg-blue-50 text-blue-700',
  accepted: 'bg-emerald-50 text-emerald-700', rejected: 'bg-rose-50 text-rose-700', closed: 'bg-slate-100 text-slate-500',
}
// 14 Oct (transparency flow): every outcome says why. Reasons the employer picked, or why the job closed.
const REASON_TEXT = {
  missing_skills: 'missing required skills', position_filled: 'position filled', experience: 'more experience needed',
}

// While waiting: what is happening on the job, where you stand among the applicants (skills only, from 5 applicants),
// and the employer's record of deciding by their own date (research: references.md "Employer replies, ghosting")
function Facts({ r }) {
  const st = r.job_stats, me = r.stand, rec = r.employer_record
  return (
    <div className="mt-4 space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        {/* 20 Oct (her review): "1 applied" read like her own count; now says it's everyone who applied. The reply
            date is in the row itself ("Reply by …"), so it is no longer a third box */}
        {[[st?.applied, st?.applied === 1 ? 'person applied' : 'people applied'], [st?.shortlisted, 'shortlisted so far']].map(([v, k]) => (
          <div key={k} className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-lg font-semibold text-slate-900 tabular-nums leading-tight">{v ?? '—'}</p>
            <p className="text-xs text-slate-500">{k}</p>
          </div>
        ))}
      </div>
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
      <EmployerRecord company={r.company} record={rec} />
    </div>
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
// (stage, reply date, status); "Show details" opens the full steps and numbers as before. A card that needs her
// attention opens by itself. Each section shows its newest 5, then "Show all N (x more)", so "On other sites" is
// reached without scrolling past every SkillMap card.
const FIRST = 3
// 20 Oct (her review of 10 + 10: still long): each section shows 3, and "Show all" opens the rest in a box that
// scrolls on its own (her rule: cards scroll, not the page), so the page stays about one screen whatever the count
const SCROLL = 'max-h-[60vh] overflow-y-auto'
// 20 Oct (her review: the gaps between cards looked odd): each section is one card with a line between applications
const LIST = 'bg-white border border-slate-200 rounded-2xl divide-y divide-slate-200'
// 20 Oct (her review: no large blank space below): with only a few SkillMap applications every card opens, as before
const FEW = 3
// 20 Oct (her review: big empty middle): one row = job | progress | reply date or site | status, as columns on laptops
const ROW = 'grid gap-x-6 gap-y-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,2.4fr)_7rem_12rem] lg:items-center'
const RECENT_DAYS = 14
const daysSinceIso = (iso) => iso ? (Date.now() - new Date(iso).getTime()) / 86400000 : Infinity
const needsAttention = (r) => !!r.progress.nudge || (['accepted', 'rejected'].includes(r.status) && daysSinceIso(r.status_changed_at) <= RECENT_DAYS)

function MiniSteps({ steps }) {
  // 20 Oct (her review: big empty middle in each row): every step that happened shows its date, so this one line
  // replaces the large step circles; it fills the middle column of the row
  const last = steps.findLastIndex(x => x.at)
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1" aria-label="Progress">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-2">
          {i > 0 && <span aria-hidden="true" className={`w-4 h-px ${s.at ? 'bg-blue-500' : 'bg-slate-300'}`} />}
          <span className={`flex items-center gap-1 text-xs whitespace-nowrap ${i === last ? 'font-semibold text-slate-900' : s.at ? 'text-slate-600' : 'text-slate-400'}`}>
            <span aria-hidden="true" className={`w-2 h-2 rounded-full ${s.at ? 'bg-blue-600' : 'bg-slate-300'}`} />
            {s.label}{s.date ?? (s.at && s.at !== true ? fmtDay(s.at) : '') ? <span className="font-normal text-slate-500"> {s.date ?? fmtDay(s.at)}</span> : null}
            <span className="sr-only">{s.at ? ' done' : ' not yet'}</span>
          </span>
        </li>
      ))}
    </ol>
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

function MoreButton({ total, open, onClick }) {
  if (total <= FIRST) return null
  return (
    <button type="button" onClick={onClick} className="shrink-0 text-sm font-medium text-blue-700 hover:underline">
      {open ? 'Show fewer' : `Show all ${total} (${total - FIRST} more)`}
    </button>
  )
}

function AppCard({ r, openAll }) {
  const [open, setOpen] = useState(openAll || needsAttention(r))
  const [key, label] = pill(r)
  const decided = ['accepted', 'rejected'].includes(r.status)
  const when = decided ? '' : r.decide_by && !r.job_closed ? `Reply by ${fmtDay(r.decide_by)}` : ''
  const details = (!decided && !r.job_closed) || r.progress.nudge || decided || r.employer_usually_days
  return (
    <article className="px-5 py-3.5">
      <div className={ROW}>
        <div className="min-w-0">
          <Link to={`/jobs/${encodeURIComponent(r.job_ref)}`} state={{ from: 'My Applications' }} className={TITLE}>{r.title}</Link>
          <p className="text-xs text-slate-500 mt-0.5">{r.company}{r.match && ` · your match ${r.match}`}</p>
        </div>
        <MiniSteps steps={r.progress.steps} />
        <p className="text-xs font-medium text-slate-700">{when}</p>
        <div className="flex items-center gap-3 lg:justify-end">
          <span className={`shrink-0 text-xs font-semibold rounded-full px-2.5 py-0.5 ${PILL[key]}`}>{label}</span>
          {details && <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
            className="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap">{open ? 'Hide ▴' : 'Details ▾'}</button>}
        </div>
      </div>
      {open && (
        <div className="lg:pr-[13rem]">
          {!decided && !r.job_closed && <Facts r={r} />}
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
    <article className="px-5 py-3.5">
      <div className={ROW}>
        <div className="min-w-0">
          <Link to={`/jobs/${encodeURIComponent(o.job_ref)}`} state={{ from: 'My Applications' }} className={TITLE}>{o.title}</Link>
          <p className="text-xs text-slate-500 mt-0.5">{o.company}{o.listed === false && <span className="text-slate-400"> · ad no longer listed</span>}</p>
        </div>
        <MiniSteps steps={outsideSteps(o)} />
        <p className="text-xs text-slate-600">on {o.publisher || 'another site'}</p>
        <div className="flex items-center gap-3 lg:justify-end">
          <label className="sr-only" htmlFor={`os-${o.id}`}>Status of {o.title}</label>
          <select id={`os-${o.id}`} value={o.status} onChange={e => onStatus(o, e.target.value)}
            className="text-sm font-medium text-slate-800 border border-slate-300 rounded-lg px-2 py-1 bg-white">
            {OUTSIDE.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <button type="button" onClick={() => onRemove(o)} className="text-sm text-slate-500 hover:text-rose-700">Remove</button>
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
  const [allApps, setAllApps] = useState(false)          // "Show all N (x more)", per section
  const [allOutside, setAllOutside] = useState(false)
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
  const count = (t) => (rows || []).filter(r => inTab(r, t)).length + outside.filter(o => outsideInTab(o, t)).length
  const outsideShown = outside.filter(o => outsideInTab(o, tab))
  // 12 Oct (her review): one column, the application with the newest update first
  const shown = (rows || []).filter(r => inTab(r, tab))
    .sort((a, b) => new Date(b.progress.last_update) - new Date(a.progress.last_update))

  return (
    <div className="flex flex-col h-screen">
      <PageHeader>
        <div className="pb-5">
          <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-widest mb-2">My Applications</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Where your applications stand</h1>
          <p className="text-sm text-slate-500 mt-1">Newest update first. Jobs on SkillMap update as the employer acts; jobs on other sites you update yourself.</p>
        </div>
      </PageHeader>
      {/* 20 Oct (her review): full screen width, no blank strip on the right */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-8 py-6"><div className="flex flex-col gap-4">
        {error && <p role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5">{error}</p>}

        {invites.map(inv => (
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
        {rows?.length === 0 && outside.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
            <h2 className="text-base font-semibold text-slate-900">No applications yet</h2>
            <p className="text-sm text-slate-500 mt-1">Jobs marked "Apply on SkillMap" in Job Matches can be applied for here with your profile.</p>
            <Link to="/recommend" className="inline-block mt-4 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700">Go to Job Matches</Link>
          </div>
        )}
        {(rows?.length > 0 || outside.length > 0) && (
          <>
            <div role="tablist" className="flex flex-wrap gap-2">
              {TABS.map(([t, text]) => (
                <button key={t} role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setAllApps(false); setAllOutside(false) }}
                  className={`text-sm font-medium px-3.5 py-1.5 rounded-full border ${tab === t
                    ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'}`}>
                  {text} {count(t)}
                </button>
              ))}
            </div>
            {shown.length > 0 && (
              <section aria-labelledby="skillmap-h" className="flex flex-col gap-3">
                <SectionHead id="skillmap-h" title="On SkillMap" note="The employer updates these as they act."
                  more={<MoreButton total={shown.length} open={allApps} onClick={() => setAllApps(v => !v)} />} />
                <div className={`${LIST} ${allApps ? SCROLL : ''}`}>
                  {(allApps ? shown : shown.slice(0, FIRST)).map(r => <AppCard key={r.id} r={r} openAll={shown.length <= FEW} />)}
                </div>
              </section>
            )}
            {shown.length === 0 && outsideShown.length === 0 && <p className="text-sm text-slate-400">None here.</p>}
          </>
        )}
        {outsideShown.length > 0 && (
          <section aria-labelledby="outside-h" className="flex flex-col gap-3 mt-2">
            <SectionHead id="outside-h" title="On other sites" note="Jobs you applied for through “Apply on …”. Their employers won't see these, so you update the status."
              more={<MoreButton total={outsideShown.length} open={allOutside} onClick={() => setAllOutside(v => !v)} />} />
            <div className={`${LIST} ${allOutside ? SCROLL : ''}`}>
              {(allOutside ? outsideShown : outsideShown.slice(0, FIRST)).map(o => <OutsideCard key={o.id} o={o} onStatus={setStatus} onRemove={remove} />)}
            </div>
          </section>
        )}
      </div></div>
      {toast.ui}
    </div>
  )
}
