import { Children, cloneElement, isValidElement, useLayoutEffect, useRef, useState } from 'react'
import { RepoCheck } from '../pages/student/profileSections'
import { levelLabel } from '../pages/student/experienceKinds'
import { monthLabel, projectContext } from '../pages/student/profileUtils'

// 21 Oct (her idea: check what the employer sees before applying): the employer's applicant page and the student's
// preview draw the SAME heading and cards from the SAME data (employer._profile_for), so the preview can't differ from
// what the employer sees. `you` only changes the wording ("your record" / "their record").
// 21 Oct (her review, mock-up h1.png):
//  - the heading reads in one order: who (name, headline), About on one full-width line, then studies, CGPA and
//    languages with the links at the right end, then contact;
//  - three columns that fill the screen and end on the same line. Each column's last card stretches to the bottom;
//    the others take what they need (up to about half the column);
//  - no row is ever cut: a card shows only the rows that fit whole, then "See all N", which opens that card over its
//    whole column (scrolling there), with "Show less" to go back (the same idea as My Applications' See all);
//  - with a job, the projects and experience that use its skills come first (backend: showcase job_skills), and
//    those skills are marked.
export const card = 'bg-white border border-slate-200 rounded-2xl'

// ── The heading ───────────────────────────────────────────────────────────────

export function ApplicantHeading({ s, note }) {
  const links = [['GitHub', s.links?.github], ['LinkedIn', s.links?.linkedin], ['Portfolio', s.links?.portfolio]].filter(([, u]) => u)
  const langs = (s.languages || []).map(l => `${l.language}${l.test ? ` (${l.test})` : ''}`)
  const facts = [s.programme_line, s.cgpa != null && <b key="c" className="font-semibold text-slate-900">CGPA {Number(s.cgpa).toFixed(2)}</b>,
    langs.length > 0 && <span key="l" title={(s.languages || []).map(l => `${l.language}: ${levelLabel(l.level)}`).join('\n')}>{langs.join(', ')}</span>]
    .filter(Boolean)
  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 mt-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{s.name}</h1>
        {s.headline && <p className="text-sm text-slate-500">{s.headline}</p>}
      </div>
      {s.about && <p className="text-sm text-slate-700 mt-1.5 whitespace-pre-line">{s.about}</p>}
      <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-sm">
        <p className="text-slate-600 min-w-0">{facts.map((f, i) => <span key={i}>{i > 0 && ' · '}{f}</span>)}</p>
        {links.length > 0 && <p className="flex gap-4 shrink-0">{links.map(([label, url]) =>
          <a key={label} href={url} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">{label} ↗</a>)}</p>}
      </div>
      {s.contact ? (
        <p className="text-sm text-slate-700 mt-1">
          <a href={`mailto:${s.contact.email}`} className="text-blue-700 hover:underline">{s.contact.email}</a>
          {s.contact.phone && <> · {s.contact.phone}</>}
          {s.contact.city && <> · {s.contact.city}</>}
          {s.contact.available_from && <> · available from {monthLabel(s.contact.available_from)}</>}
        </p>
      ) : note && <p className="text-xs text-slate-500 mt-1">✉ {note}</p>}
    </>
  )
}

// ── A card whose list shows only whole rows ───────────────────────────────────

const SEE_ALL_ROOM = 24      // px kept under the rows for the "See all N" link

// A list card. The card that fills its column measures how many rows fit whole: all rows are drawn once (before the
// screen is painted), measured, then the rest are left out and "See all N" follows the last whole row. The other cards
// show their first `limit` rows. In "See all" the card has the whole column and scrolls.
function ListCard({ title, sub, items, render, footer, empty, fill, open, onOpen, onClose, unit = '', limit = 3 }) {
  const box = useRef(null)
  const [fits, setFits] = useState(items.length)
  const [measuring, setMeasuring] = useState(true)
  useLayoutEffect(() => {
    if (!fill || open || !measuring) return
    const el = box.current
    if (!el) return
    const rows = [...el.querySelectorAll(':scope > ul > [data-row]')]
    const count = (room) => { let n = 0; for (const r of rows) { if (r.offsetTop + r.offsetHeight <= room + 1) n++; else break } return n }
    const all = count(el.clientHeight)
    setFits(all >= rows.length ? rows.length : count(el.clientHeight - SEE_ALL_ROOM))
    setMeasuring(false)
  }, [fill, open, measuring, items.length])
  // measured again whenever the space changes (window resized, a card above opened or closed)
  useLayoutEffect(() => {
    const el = box.current
    if (!el || !fill || open) return
    let last = el.clientHeight
    const ro = new ResizeObserver(() => { if (el.clientHeight !== last) { last = el.clientHeight; setMeasuring(true) } })
    ro.observe(el)
    return () => ro.disconnect()
  }, [fill, open])
  const shown = open ? items.length : fill ? (measuring ? items.length : fits) : Math.min(limit, items.length)
  const hidden = items.length - shown
  return (
    <section className={`${card} p-4 flex flex-col min-h-0 ${fill || open ? 'lg:flex-1 lg:min-h-36' : 'shrink-0'}`}>
      <div className="shrink-0 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
        {open && <button type="button" onClick={onClose} className="text-xs font-medium text-blue-700 hover:underline">Show less</button>}
      </div>
      {sub && <p className="shrink-0 text-xs text-slate-500 mt-0.5">{sub}</p>}
      {items.length === 0 ? <p className="text-sm text-slate-400 mt-1">{empty}</p> : (
        <div ref={box} className={`relative min-h-0 ${fill || open ? 'lg:flex-1' : ''} ${open ? 'overflow-y-auto pr-1' : 'overflow-hidden'}`}>
          <ul className="divide-y divide-slate-100">
            {items.slice(0, shown).map((it, i) => <li key={i} data-row>{render(it)}</li>)}
          </ul>
          {hidden > 0 && (
            <button type="button" onClick={onOpen} className="mt-1 text-xs font-medium text-blue-700 hover:underline">
              {shown === 0 ? 'Show' : 'See all'} {items.length}{unit && ` ${unit}`} →</button>
          )}
        </div>
      )}
      {footer && <div className="shrink-0">{footer}</div>}
    </section>
  )
}

// One column: the last card fills to the bottom; "See all" on a card gives it the whole column
function Column({ children }) {
  const [openKey, setOpenKey] = useState(null)
  const cards = Children.toArray(children).filter(isValidElement)
  const shown = openKey ? cards.filter(c => c.key === openKey) : cards
  return (
    <div className="min-h-0 flex flex-col gap-4">
      {shown.map((c, i) => cloneElement(c, {
        fill: i === shown.length - 1, open: openKey === c.key,
        onOpen: () => setOpenKey(c.key), onClose: () => setOpenKey(null),
      }))}
    </div>
  )
}

// ── The cards ─────────────────────────────────────────────────────────────────

const KIND = { module: 'Module', project: 'Project', cert: 'Certificate', certification: 'Certificate', award: 'Award',
               work: 'Work', activity: 'Activity' }
const selfDeclared = <span className="ml-auto shrink-0 text-[11px] text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">Self-declared</span>

function Skills({ skills, relevant }) {
  if (!skills?.length) return null
  const rel = new Set((relevant || []).map(x => x.toLowerCase()))
  return (
    <p className="text-xs text-slate-500 mt-0.5">{skills.map((k, i) => (
      <span key={k}>{i > 0 && ' · '}{rel.has(k.toLowerCase()) ? <span className="text-emerald-700 font-medium">✓ {k}</span> : k}</span>
    ))}</p>
  )
}

export function ApplicantCards({ s, fit, withFit = true, you }) {
  const whose = you ? 'your' : 'their'
  const inJob = new Set([...(fit?.matched || []).map(m => m.skill), ...(fit?.missing || []), ...(fit?.nice_have || []),
    ...(fit?.on_job_have || [])].map(k => k.toLowerCase()))
  const strengths = (s.top_skills || []).filter(t => !inJob.has(t.name.toLowerCase()))
  const fitRows = fit ? [...fit.matched.map(m => ({ m })), ...fit.missing.map(name => ({ name }))] : []
  const extras = fit && (fit.nice_have?.length > 0 || fit.on_job_have?.length > 0) && (
    <div className="mt-2 pt-2 border-t border-slate-100 space-y-1.5">
      {fit.nice_have?.length > 0 && <Extra title="Also has, from the ad's nice-to-haves" skills={fit.nice_have} />}
      {fit.on_job_have?.length > 0 && <Extra title="Already has, though the ad says it's learnt on the job" skills={fit.on_job_have} />}
    </div>
  )
  const strengthRow = (t) => (
    <div className="py-1.5">
      <p className="text-sm font-medium text-slate-900">{t.name}</p>
      <p className="text-xs text-slate-500">{t.evidence.slice(0, 3).map(e => `${KIND[e.type] || 'From'}: ${e.label}${e.grade ? `, ${e.grade}` : ''}`).join(' · ')}
        {t.evidence.length > 3 && ` · +${t.evidence.length - 3} more`}</p>
    </div>
  )
  const certs = [...s.certifications.map(c => ({ name: c.name, kind: 'Certificate', url: c.credly_url })),
                 ...s.awards.map(a => ({ name: a.title, kind: 'Award' }))]
  const experiences = s.experiences || []

  return (
    <div className="lg:h-full grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1fr)]">
      <Column>
        {withFit ? (
          <ListCard key="fit" title={fit ? `For this job: ${fit.have} of ${fit.total} required skills` : 'For this job'}
            sub={fit ? 'Each skill with where it comes from.' : null} items={fitRows} unit="skills" footer={extras}
            empty={`${you ? 'Your' : "This student's"} profile has no skills to compare at the moment.`}
            render={(r) => r.m ? (
              <div className="py-2 flex items-start gap-2.5">
                <span className="text-emerald-600 font-bold" aria-hidden="true">✓</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{r.m.skill}</p>
                  <p className="text-xs text-slate-500">{r.m.source === 'module' ? `Module: ${r.m.from}` : r.m.from}{r.m.grade && `, ${r.m.grade}`}</p>
                </div>
                {r.m.source !== 'module' && selfDeclared}
              </div>
            ) : (
              <div className="py-2 flex items-start gap-2.5">
                <span className="text-slate-300 font-bold" aria-hidden="true">–</span>
                <p className="text-sm text-slate-500">{r.name} <span className="text-xs">· not in {whose} record yet</span></p>
              </div>
            )} />
        ) : (
          <ListCard key="strong" title="Strongest skills" sub="The skills with the most evidence." items={s.top_skills || []}
            unit="skills" empty="No skills found yet." render={strengthRow} />
        )}
      </Column>
      <Column>
        {experiences.length > 0 && (
          <ListCard key="exp" title="Experience" unit="" limit={2}
            sub={fit ? "Work, then activities; the ones that use this job's skills first." : 'Work, then activities, newest first.'}
            items={experiences} render={(e) => (
              <div className="py-2">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium text-slate-900 min-w-0">{e.role} <span className="font-normal text-slate-600">· {e.organisation}</span></p>
                  <span className="shrink-0 text-xs text-slate-400 whitespace-nowrap">{monthLabel(e.start)} – {e.end ? monthLabel(e.end) : 'now'}</span>
                </div>
                <p className="text-xs text-slate-500"><span className="text-slate-600">{e.category_label}</span>{e.description && ` · ${e.description}`}</p>
                <Skills skills={e.skills} relevant={e.relevant} />
              </div>
            )} />
        )}
        <ListCard key="proj" title="Projects" items={s.projects} empty="None added."
          sub={fit && s.projects.length > 1 ? "The ones that use this job's skills first." : null}
          render={(p) => (
            <div className="py-2">
              <p className="text-sm font-medium text-slate-900 flex flex-wrap items-baseline gap-x-2"><span>{p.name}</span>
                {p.github_url && <a href={p.github_url} target="_blank" rel="noopener noreferrer" className="text-xs font-normal text-blue-700 hover:underline whitespace-nowrap">GitHub ↗</a>}
                {p.demo_url && <a href={p.demo_url} target="_blank" rel="noopener noreferrer" className="text-xs font-normal text-blue-700 hover:underline whitespace-nowrap">Demo ↗</a>}
                {/* 14 Oct (Connect GitHub): is the repo the student's own? */}
                {p.github_url && <span className="whitespace-nowrap"><RepoCheck project={p} who={you && p.repo_check === 'yours' ? 'your' : "the student's"} /></span>}</p>
              {projectContext(p) && <p className="text-xs text-slate-600">{projectContext(p)}</p>}
              <Skills skills={p.skills} relevant={p.relevant} />
            </div>
          )} />
      </Column>
      <Column>
        <ListCard key="mod" title="Strongest modules" limit={3} items={s.strongest_modules} empty="No module grades yet."
          sub={s.show_grades_to_employers
            ? (you ? 'Your grades are shown to employers.' : 'Grades shown because the student allows it.')
            : (you ? 'Your grades are hidden from employers.' : "The student doesn't share grades.")}
          render={(m) => <p className="py-1 flex justify-between gap-3 text-sm text-slate-700"><span>{m.name}</span>{m.grade && <span className="font-semibold">{m.grade}</span>}</p>} />
        {certs.length > 0 && (
          <ListCard key="cert" title="Certificates and awards" items={certs}
            render={(c) => <p className="py-1 flex justify-between gap-3 text-sm text-slate-700">
              {c.url ? <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">{c.name} ↗</a> : <span>{c.name}</span>}
              <span className="shrink-0 text-xs text-slate-400">{c.kind}</span></p>} />
        )}
        {strengths.length > 0 && withFit && (
          <ListCard key="also" title="Also brings" sub="Other skills with the most evidence, beyond this job." items={strengths}
            unit="skills" render={strengthRow} />
        )}
      </Column>
    </div>
  )
}

function Extra({ title, skills }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-600">{title}</p>
      <div className="flex flex-wrap gap-1.5 mt-1">
        {skills.map(k => <span key={k} className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-full px-2.5 py-0.5">✓ {k}</span>)}
      </div>
    </div>
  )
}
