import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import api from '../../api'
import PageHeader from '../../components/PageHeader'
import BackLink from '../../components/BackLink'
import { errText } from '../student/profileUtils'
import { NOT_VIEWED_TIP, STATUSES, STATUS_CLS, fmtDay } from './statuses'
import { useStatusChange } from './statusChange'
import ConfirmDecision from './ConfirmDecision'
import { ADMIN_COUNTS_CHANGED } from '../../components/Sidebar'
import { CardSkeleton, LoadingLabel } from '../../components/Skeleton'
import InviteLabel from '../../components/InviteLabel'
import InfoTip from '../../components/InfoTip'
import { useToast } from '../../components/Toast'

// Employer > one job's applicants (11 Oct, batch 2; her pick 3A "applicants as a list"). Best match first: the
// share of the job's required skills each student has, the same match the student sees. Changing a status shows on
// the student's My Applications page.
// 14 Oct (transparency flow): tick several -> Not selected (21 Oct: or Shortlist) with one optional reason (each student sees their own
// missing skills for "missing skills"); the decision date and the numbers students see are in the header; contact
// details appear only after shortlisting.
const WAITING = ['applied', 'shortlisted']
const CARD = 'bg-white border border-slate-200 rounded-2xl'
const left = (iso) => {
  const d = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
  return d === 0 ? 'today' : `${d} day${d === 1 ? '' : 's'} left`
}
// 25 Oct (as My Applications' share()): each list gets up to 3 of the rows that fit; spare rows go to the applicants
// first, then to the graduates. An empty list still takes one line.
const FIRST = 3
// On a short screen (fewer rows fit than 3 + 3), each list gives up rows down to one, graduates first.
function share(a, b, room, withB) {
  let x = Math.min(a, FIRST), y = withB ? Math.min(b, FIRST) : 0
  while (x + y > room && (y > 1 || x > 1)) { if (y > 1 && y >= x - 1) y--; else x-- }
  let spare = Math.max(0, room - Math.max(x, 1) - (withB ? Math.max(y, 1) : 0))
  const ax = Math.min(a - x, spare); spare -= ax
  return [x + ax, y + Math.min(b - y, spare)]
}
// the section title with "See all N" on its line, as on My Applications
function SectionHead({ id, title, note, more }) {
  return (
    <div className="shrink-0 flex items-end justify-between gap-x-4">
      <div className="min-w-0">
        <h2 id={id} className="text-base font-semibold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-600">{note}</p>
      </div>
      {more}
    </div>
  )
}
// 25 Oct (her bug: ticking one graduate made the next one disappear, then "refine the placement"): with something
// ticked, the table's column-title strip becomes its action bar, beside the select-all box (as in Gmail and most data
// tables): "2 selected", the actions, Clear. Same height as the titles, so ticking never moves or hides a row.
const PICK_BTN = 'text-xs font-semibold px-3 py-1.5 rounded-lg text-white'
const STRIP_TD = 'px-5 h-11 py-0 align-middle'
function Titles({ names }) {
  return names.map(n => <td key={n} aria-hidden="true" className={STRIP_TD}>{n}</td>)
}
function Picked({ n, onClear, children }) {
  return (
    <td colSpan={4} className={STRIP_TD}>
      {/* on the right, where the eye ends the title strip (her review) */}
      <div role="status" className="flex items-center justify-end gap-3 text-sm">
        <span className="font-semibold text-slate-800">{n} selected</span>
        {children}
        <button type="button" onClick={onClear} className="text-sm font-medium text-slate-600 hover:text-slate-900">Clear</button>
      </div>
    </td>
  )
}
function MoreButton({ total, shown, onClick }) {
  if (total <= shown) return null
  return <button type="button" onClick={onClick} className="shrink-0 text-sm font-medium text-blue-700 hover:underline">See all {total} →</button>
}
// 25 Oct (her pick): the graduates table uses the same columns, so it lines up with the applicants table
const APP_COLS = <colgroup><col className="w-12" /><col /><col className="w-64" /><col className="w-28" /><col className="w-40" /></colgroup>

export default function Applicants() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('all')
  const [error, setError] = useState('')
  const [picked, setPicked] = useState([])          // application ids ticked
  const [askMany, setAskMany] = useState(null)      // 'rejected' | 'shortlisted': the action being confirmed
  const [savingMany, setSavingMany] = useState(false)
  // 25 Oct (her review: the green banner stayed and pushed the tables down): "done" messages use the same short toast
  // at the bottom as a single status change (it closes itself, nothing moves); errors stay as a banner until acted on
  const toast = useToast()
  const strip = useRef(null)
  const gstrip = useRef(null)

  const load = () => api.get(`/employer/jobs/${jobId}/applicants`).then(res => setData(res.data))
    .catch(err => setError(errText(err, "Couldn't load the applicants.")))
  useEffect(() => { load() }, [jobId])   // eslint-disable-line react-hooks/exhaustive-deps

  // 25 Oct (her plan; references.md "Invitations"): graduates who fit THIS job and haven't applied; tick some and
  // "Invite N selected". No "invite all" across jobs: bulk only for people the employer picks; a select-all box over
  // the graduates shown was added later on 25 Oct (her ask), still confirmed first.
  const [grads, setGrads] = useState(null)
  const [ticked, setTicked] = useState([])
  const [askInvite, setAskInvite] = useState(false)
  const [inviting, setInviting] = useState(false)
  const loadGrads = () => api.get(`/employer/jobs/${jobId}/graduates`).then(res => setGrads(res.data)).catch(() => setGrads([]))
  useEffect(() => { loadGrads() }, [jobId])   // eslint-disable-line react-hooks/exhaustive-deps
  const tick = (id) => setTicked(t => t.includes(id) ? t.filter(x => x !== id) : [...t, id])
  const inviteSelected = () => {
    setInviting(true)
    api.post('/employer/invitations/bulk', { job_id: Number(jobId), student_ids: selG })
      .then(res => {
        const n = res.data.invited.length, skip = res.data.skipped.length
        toast.show(`${n} graduate${n === 1 ? '' : 's'} invited. Their answer${n === 1 ? '' : 's'} will appear here.`
          + (skip ? ` ${skip} skipped: they had already applied or been invited.` : ''))
        setTicked([]); setAskInvite(false); loadGrads()
      })
      .catch(err => { setAskInvite(false); setError(errText(err, "Couldn't send the invitations. Try again.")) })
      .finally(() => setInviting(false))
  }

  const toggle = (id) => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  // 21 Oct (her question): Shortlist several as well as Not selected (references.md "Actions on several applicants
  // at once"); only those still at Applied are shortlisted, and it asks first because contact details are shared
  const toShortlist = (ids) => (data?.applicants || []).filter(p => ids.includes(p.id) && p.status === 'applied').length
  const many = (why) => {
    const st = askMany
    setSavingMany(true)
    api.post('/employer/applications/bulk', { ids: sel, status: st, ...(st === 'rejected' ? why : {}) })
      .then(res => {
        const n = res.data.updated
        toast.show(st === 'rejected'
          ? `${n} marked Not selected. They see it on My Applications${why.reason ? ', with your reason' : ''}.`
          : `${n} shortlisted. Their email and phone now show on their profiles.`)
        setPicked([]); setAskMany(null); load(); window.dispatchEvent(new Event(ADMIN_COUNTS_CHANGED))
      })
      .catch(err => { setAskMany(null); setError(errText(err, "Couldn't save. Try again.")) })
      .finally(() => setSavingMany(false))
  }

  // 12 Oct: Rejected / Accepted ask first; Shortlisted / Applied change at once with Undo (statusChange.jsx)
  const status = useStatusChange((id, res) =>
    setData(d => ({ ...d, applicants: d.applicants.map(x => x.id === id ? { ...x, ...res } : x) })))

  const people = data?.applicants || []
  const count = (s) => people.filter(p => s === 'all' || p.status === s).length
  const shown = people.filter(p => tab === 'all' || p.status === tab)
  const job = data?.job
  const fitList = job?.status === 'open' ? (grads || []) : []
  const showGrads = fitList.length > 0

  // 25 Oct (her review: "like My Applications": both lists fit one screen, "See all" on a page of its own): the main
  // view shows the rows that fit (measured, as on My Applications; applicants get any spare rows first), each section
  // with "See all N" on its title line. ?see=applicants / ?see=graduates shows one list alone; Back returns to both.
  const [params, setParams] = useSearchParams()
  const see = params.get('see')
  const seeAll = (which) => setParams(which ? { see: which } : {})
  const box = useRef(null)
  const [room, setRoom] = useState(6)
  const [nApps, nGrads] = share(shown.length, fitList.length, room, showGrads)
  const appsNow = see === 'applicants' ? shown : shown.slice(0, nApps)
  const gradsNow = see === 'graduates' ? fitList : fitList.slice(0, nGrads)

  // 25 Oct (her bug: tick someone, then change their status in the row: "1 selected" stayed with no tick box): the
  // selection is only the ticked rows you can see and still act on (still Applied or Shortlisted)
  const selectable = appsNow.filter(p => WAITING.includes(p.status)).map(p => p.id)
  const sel = picked.filter(id => selectable.includes(id))
  const allTicked = selectable.length > 0 && sel.length === selectable.length
  const tickAll = () => setPicked(allTicked ? [] : selectable)
  const invitable = gradsNow.filter(g => !g.invite).map(g => g.student_id)
  const selG = ticked.filter(id => invitable.includes(id))
  // 25 Oct (her ask): a select-all box for the graduates too; it ticks the ones shown who haven't been invited (up to
  // 50, the most one "Invite selected" sends) and you still confirm before anything is sent
  const allG = invitable.length > 0 && selG.length === Math.min(invitable.length, 50)
  const tickAllG = () => setTicked(allG ? [] : invitable.slice(0, 50))

  useLayoutEffect(() => {
    const el = box.current
    if (!el || see || !data) return
    const measure = () => {
      const rowsNow = el.querySelectorAll('[data-row]')
      const rowH = rowsNow[0]?.getBoundingClientRect().height
      if (!rowH) return
      const cs = getComputedStyle(el)
      const used = el.firstElementChild.getBoundingClientRect().height + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
      const fit = rowsNow.length + Math.floor((el.clientHeight - used) / rowH)
      setRoom(r => {
        const next = Math.max(2, Math.min(15, fit))
        return next === r ? r : next
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [see, tab, data, grads, error, room])   // room: measure again after the rows change, until it settles

  return (
    <div className="flex flex-col h-screen">
      {/* 21 Oct (her review: every back link the same, near the left edge) */}
      {see ? <BackLink label={job?.title || 'this job'} onClick={() => seeAll(null)} />
        : <BackLink label="My Jobs" onClick={() => navigate('/employer/jobs')} />}
      <PageHeader>
        <div className="pb-5">
          <div className="flex items-center gap-3 mt-1">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{job?.title || 'Applicants'}</h1>
            {job && <span className={`text-xs font-medium border rounded-full px-2.5 py-0.5 ${job.status === 'open'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>{job.status === 'open' ? 'Open' : 'Closed'}</span>}
          </div>
          {job && <p className="text-sm text-slate-500 mt-1">
            {[job.location, `posted ${fmtDay(job.posted_at)}`].filter(Boolean).join(' · ')}
            {job.required_names?.length > 0 && ` · requires ${job.required_names.join(', ')}`}
          </p>}
          {job?.decide_by && <p className={`text-sm mt-1 ${job.past_date ? 'text-rose-700 font-medium' : 'text-slate-700'}`}>
            {job.past_date ? `Your decision date (${fmtDay(job.decide_by)}) has passed: applicants still waiting see "No decision".`
              : <>Decide by {fmtDay(job.decide_by)} · {left(job.decide_by)}{' '}
                {/* 25 Oct (her question: "Decide by 17 Nov means what?"): days left, and what the date means */}
                <InfoTip label="What the decision date means">Applicants see "Reply by {fmtDay(job.decide_by)}" on My Applications.
                  Anyone still waiting after this date sees "No decision", and it counts in your reply record.</InfoTip></>}
            {job.stopped && ' · Not taking new applications'}
          </p>}
        </div>
      </PageHeader>

      <div ref={box} className={`flex-1 min-h-0 px-8 py-6 ${see ? 'flex flex-col' : 'overflow-y-auto'}`}>
      <div className={`flex flex-col gap-4 ${see ? 'flex-1 min-h-0' : ''}`}>
        {error && <p role="alert" className="shrink-0 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5">{error}</p>}
        {!data && !error && <><LoadingLabel>Loading applicants…</LoadingLabel><CardSkeleton rows={5} /></>}
        {data && see !== 'graduates' && people.length > 0 && (
          <div role="tablist" className="flex flex-wrap gap-2 shrink-0">
            {[['all', 'All'], ...STATUSES].map(([key, text]) => (
              <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
                className={`text-sm font-medium px-3.5 py-1.5 rounded-full border ${tab === key
                  ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'}`}>{text} {count(key)}</button>
            ))}
          </div>
        )}

        {data && see !== 'graduates' && (
          <section aria-labelledby="apps-h" className={`flex flex-col gap-3 ${see ? 'min-h-0' : ''}`}>
            <SectionHead id="apps-h" title={see ? `Applicants · ${shown.length}` : 'Applicants'}
              note={people.length ? 'Best match first. Students see your decisions on My Applications; email and phone show once you shortlist.'
                : 'Students see this job in Job Matches, marked "Apply on SkillMap", and apply with their SkillMap profile.'}
              more={!see && <MoreButton total={shown.length} shown={appsNow.length} onClick={() => seeAll('applicants')} />} />
            {people.length === 0 ? <p data-row className={`${CARD} px-5 py-3.5 text-sm text-slate-500`}>No applicants yet.</p> : (
            /* 21 Oct (her report: not scrollable in a narrow window): the table keeps a minimum width, the column titles
               sit in their own strip and only the rows scroll under them (sideways too; the strip follows) */
            <div className={`${CARD} ${see ? 'min-h-0' : ''} flex flex-col overflow-hidden`}>
              {/* 25 Oct (her ask): a tick box in the title strip selects every applicant shown that can still be
                  decided (Applied or Shortlisted); the strip is a layout-only table, so only that box is read out */}
              <div ref={strip} className={`shrink-0 overflow-hidden scrollbar-gutter-stable border-b ${sel.length ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'}`}>
                <table role="presentation" className="w-full min-w-3xl table-fixed text-sm">
                  {APP_COLS}
                  <thead className="text-left text-xs font-semibold text-slate-500">
                    <tr><td className="pl-5 h-11 py-0 align-middle">
                      {selectable.length > 0 && <input type="checkbox" aria-label={`Select all ${selectable.length} still to decide`}
                        title="Select all still to decide" checked={allTicked} onChange={tickAll}
                        ref={el => { if (el) el.indeterminate = sel.length > 0 && !allTicked }} className="w-4 h-4 accent-blue-700 align-middle" />}
                    </td>
                      {sel.length > 0 ? (
                        <Picked n={sel.length} onClear={() => setPicked([])}>
                          {toShortlist(sel) > 0 && <button type="button" onClick={() => setAskMany('shortlisted')} className={`${PICK_BTN} bg-blue-600 hover:bg-blue-700`}>
                            Shortlist{toShortlist(sel) < sel.length ? ` ${toShortlist(sel)}` : ''}</button>}
                          <button type="button" onClick={() => setAskMany('rejected')} className={`${PICK_BTN} bg-rose-600 hover:bg-rose-700`}>Mark as Not selected</button>
                        </Picked>
                      ) : <Titles names={['Student', 'Required skills they have', 'Applied', 'Status']} />}</tr>
                  </thead>
                </table>
              </div>
              <div className="relative min-h-0 overflow-auto scrollbar-gutter-stable"
                onScroll={e => { if (strip.current) strip.current.scrollLeft = e.currentTarget.scrollLeft }}>
              <table className="w-full min-w-3xl table-fixed text-sm">
                {APP_COLS}
                {/* real column titles for screen readers; the visible ones are the strip above */}
                <thead>
                  <tr>{['Select', 'Student', 'Required skills they have', 'Applied', 'Status'].map(n =>
                    <th key={n} scope="col" className="p-0 h-0"><span className="sr-only">{n}</span></th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {appsNow.map(p => {
                    const full = p.total > 0 && p.have === p.total
                    return (
                      <tr key={p.id} data-row onClick={() => navigate(`/employer/applications/${p.id}`)} className="cursor-pointer hover:bg-blue-50/40">
                        <td className="pl-5 py-3.5" onClick={e => e.stopPropagation()}>
                          {WAITING.includes(p.status) && (
                            <input type="checkbox" aria-label={`Select ${p.name}`} checked={sel.includes(p.id)} onChange={() => toggle(p.id)}
                              className="w-4 h-4 accent-blue-700" />
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          {/* 12 Oct: an application not opened yet reads bold with "Not viewed yet" (25 Oct wording), like an unread email
                              (DfE design history: a bold row for messages not viewed) */}
                          <p className={`text-slate-900 ${p.opened ? 'font-medium' : 'font-bold'}`}>
                            {/* 22 Oct (accessibility check): the name is a real link (Tab + Enter); the row still opens on a click */}
                            <Link to={`/employer/applications/${p.id}`} onClick={e => e.stopPropagation()}
                              className="hover:text-blue-700 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">{p.name}</Link>
                            {!p.opened && <span className="ml-2 text-[11px] font-semibold text-blue-700" title={NOT_VIEWED_TIP}>Not viewed yet</span>}
                            {p.invited && <span className="ml-2 text-[11px] font-semibold text-violet-700 bg-violet-50 rounded-full px-2 py-0.5">Invited</span>}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">{p.programme}</p>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`text-xs font-semibold rounded-full px-2.5 py-0.5 ${full ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
                            {p.have} of {p.total}
                          </span>
                          {p.missing.length > 0 && <span className="ml-2 text-xs text-slate-500">missing {p.missing.join(', ')}</span>}
                        </td>
                        <td className="px-5 py-3.5 text-slate-600">{fmtDay(p.applied_at)}</td>
                        <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                          <select aria-label={`Status for ${p.name}`} value={p.status} disabled={status.busy === p.id}
                            onChange={e => status.request({ ...p, job_title: job.title }, e.target.value)}
                            className={`text-xs font-semibold border rounded-full pl-2.5 pr-7 py-1 ${STATUS_CLS[p.status]}`}>
                            {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        </td>
                      </tr>
                    )
                  })}
                  {shown.length === 0 && <tr data-row><td colSpan={5} className="px-5 py-8 text-center text-sm text-slate-500">None here.</td></tr>}
                </tbody>
              </table>
              </div>
            </div>
            )}
          </section>
        )}

        {/* 25 Oct: graduates who fit this job and haven't applied; invite the ones you pick */}
        {showGrads && see !== 'applicants' && (
          <section aria-labelledby="fit-job-h" className={`flex flex-col gap-3 ${see ? 'min-h-0' : 'mt-1'}`}>
            <SectionHead id="fit-job-h" title={see ? `Graduates who fit this job · ${fitList.length}` : 'Graduates who fit this job'}
              note="Visible students who haven't applied, best match first; anyone already invited is listed last."
              more={!see && <MoreButton total={fitList.length} shown={gradsNow.length} onClick={() => seeAll('graduates')} />} />
            <div className={`${CARD} ${see ? 'min-h-0' : ''} flex flex-col overflow-hidden`}>
              <div ref={gstrip} className={`shrink-0 overflow-hidden scrollbar-gutter-stable border-b ${selG.length ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'}`}>
                <table role="presentation" className="w-full min-w-3xl table-fixed text-sm">
                  {APP_COLS}
                  <thead className="text-left text-xs font-semibold text-slate-500">
                    <tr><td className="pl-5 h-11 py-0 align-middle">
                      {invitable.length > 0 && <input type="checkbox" aria-label={`Select all ${Math.min(invitable.length, 50)} not invited yet`}
                        title="Select all not invited yet" checked={allG} onChange={tickAllG}
                        ref={el => { if (el) el.indeterminate = selG.length > 0 && !allG }} className="w-4 h-4 accent-blue-700 align-middle" />}
                    </td>
                      {selG.length > 0 ? (
                        <Picked n={selG.length} onClear={() => setTicked([])}>
                          <button type="button" onClick={() => setAskInvite(true)} className={`${PICK_BTN} bg-blue-600 hover:bg-blue-700`}>Invite</button>
                        </Picked>
                      ) : <Titles names={['Graduate', 'Required skills they have', 'Nice to have', 'Invitation']} />}</tr>
                  </thead>
                </table>
              </div>
              <div className="relative min-h-0 overflow-auto scrollbar-gutter-stable"
                onScroll={e => { if (gstrip.current) gstrip.current.scrollLeft = e.currentTarget.scrollLeft }}>
              <table className="w-full min-w-3xl table-fixed text-sm">
                {APP_COLS}
                <thead>
                  <tr>{['Select', 'Graduate', 'Required skills they have', 'Nice to have', 'Invitation'].map(n =>
                    <th key={n} scope="col" className="p-0 h-0"><span className="sr-only">{n}</span></th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {gradsNow.map(g => (
                    <tr key={g.student_id} data-row>
                      <td className="pl-5 py-3.5">
                        {!g.invite && <input type="checkbox" aria-label={`Select ${g.name}`} checked={selG.includes(g.student_id)}
                          onChange={() => tick(g.student_id)} className="w-4 h-4 accent-blue-700" />}
                      </td>
                      <td className="px-5 py-3.5 min-w-0">
                        <Link to={`/employer/graduates/${g.student_id}?job=${jobId}`} className="block font-medium text-slate-900 truncate hover:text-blue-700 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">{g.name}</Link>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{g.programme}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`text-xs font-semibold rounded-full px-2.5 py-0.5 ${g.have === g.total ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
                          {g.have} of {g.total}
                        </span>
                        {g.missing?.length > 0 && <span className="ml-2 text-xs text-slate-500">missing {g.missing.join(', ')}</span>}
                      </td>
                      {/* her 21 Oct rule: strengths only. The nice-to-haves they have, by name; never "0 of 2" */}
                      <td className="px-5 py-3.5 text-slate-600 truncate" title={g.nice_have?.join(', ') || undefined}>
                        {g.nice_have?.length ? g.nice_have.join(', ') : <span className="text-slate-400">—</span>}</td>
                      <td className="px-5 py-3.5">{g.invite ? <InviteLabel invite={g.invite} /> : <span className="text-xs text-slate-400">Not invited</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </section>
        )}
      </div>
      </div>
      {status.ui}
      {toast.ui}
      {askMany === 'rejected' && <ConfirmDecision d={{ action: 'Mark as Not selected', danger: true }} busy={savingMany}
        title={`Mark ${sel.length} ${sel.length === 1 ? 'applicant' : 'applicants'} as Not selected?`}
        text={<>They will see <b>"Not selected"</b> for {job.title} on their My Applications page straight away.</>}
        onConfirm={many} onCancel={() => setAskMany(null)} />}
      {askMany === 'shortlisted' && <ConfirmDecision d={{ action: 'Shortlist' }} busy={savingMany}
        title={`Shortlist ${toShortlist(sel)} ${toShortlist(sel) === 1 ? 'applicant' : 'applicants'}?`}
        text={<>They will see <b>"Shortlisted"</b> for {job.title} on their My Applications page, and their email and
          phone will show on their profiles for you.{toShortlist(sel) < sel.length ? ' Only the ones still at Applied are shortlisted.' : ''}</>}
        onConfirm={many} onCancel={() => setAskMany(null)} />}
      {askInvite && <ConfirmDecision d={{ action: 'Invite' }} busy={inviting}
        title={`Invite ${selG.length} ${selG.length === 1 ? 'graduate' : 'graduates'} to apply for ${job.title}?`}
        text={<>They'll see it on their Dashboard and can apply or decline. Their answer appears here, or "No reply" after 14 days.</>}
        onConfirm={inviteSelected} onCancel={() => setAskInvite(false)} />}
    </div>
  )
}
