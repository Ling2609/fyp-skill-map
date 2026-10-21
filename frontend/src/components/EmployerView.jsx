import { Link } from 'react-router-dom'
import { Children, cloneElement, isValidElement, useLayoutEffect, useRef, useState } from 'react'
import { levelLabel } from '../pages/student/experienceKinds'
import { monthLabel, projectContext } from '../pages/student/profileUtils'
import { skillName } from '../skillName'

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

// A list card. The card that fills its column measures how many rows fit whole: all rows are drawn once (before the
// screen is painted), measured, then the rest are left out. The other cards show their first `limit` rows. In "See
// all" the card has the whole column and scrolls. 21 Oct (her review: "See all" with blank space under it looked
// unfinished): "See all N" sits in the card's title row, at the right, as in My Applications' sections.
function ListCard({ title, sub, items, render, footer, empty, fill, open, onOpen, onClose, limit = 3 }) {
  const box = useRef(null)
  const [fits, setFits] = useState(items.length)
  const [measuring, setMeasuring] = useState(true)
  useLayoutEffect(() => {
    if (!fill || open || !measuring) return
    const el = box.current
    if (!el) return
    const rows = [...el.querySelectorAll(':scope > ul > [data-row]')]
    const count = (room) => { let n = 0; for (const r of rows) { if (r.offsetTop + r.offsetHeight <= room + 1) n++; else break } return n }
    setFits(count(el.clientHeight))
    setMeasuring(false)
  }, [fill, open, measuring, items.length])
  // measured again when the window is resized (a card closing "See all" remounts the column's cards, see Column).
  // Not on the card's own size: hiding rows can shrink a short profile's cards, which would start it again
  useLayoutEffect(() => {
    if (!fill || open) return
    const again = () => setMeasuring(true)
    window.addEventListener('resize', again)
    return () => window.removeEventListener('resize', again)
  }, [fill, open])
  const shown = open ? items.length : fill ? (measuring ? items.length : fits) : Math.min(limit, items.length)
  const hidden = items.length - shown
  return (
    <section className={`${card} p-4 flex flex-col min-h-0 ${fill || open ? 'lg:flex-1 lg:min-h-28' : 'shrink-0'}`}>
      <div className="shrink-0 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
        {open ? <button type="button" onClick={onClose} className="shrink-0 text-xs font-medium text-blue-700 hover:underline">Show less</button>
          : hidden > 0 && <button type="button" onClick={onOpen} className="shrink-0 text-xs font-medium text-blue-700 hover:underline">
              {shown === 0 ? 'Show' : 'See all'} {items.length} →</button>}
      </div>
      {sub && <p className="shrink-0 text-xs text-slate-500 mt-0.5">{sub}</p>}
      {items.length === 0 ? <p className="text-sm text-slate-400 mt-1">{empty}</p> : (
        <div ref={box} className={`relative min-h-0 ${fill || open ? 'lg:flex-1' : ''} ${open ? 'overflow-y-auto pr-1' : 'overflow-hidden'}`}>
          <ul className="divide-y divide-slate-100">
            {items.slice(0, shown).map((it, i) => <li key={i} data-row>{render(it)}</li>)}
          </ul>
        </div>
      )}
      {footer && <div className="shrink-0">{footer}</div>}
    </section>
  )
}

// One column: the last card fills to the bottom; "See all" on a card gives it the whole column
function Column({ children }) {
  const [openKey, setOpenKey] = useState(null)
  const [round, setRound] = useState(0)          // bumped on "Show less": the cards start again and measure afresh
  const cards = Children.toArray(children).filter(isValidElement)
  const shown = openKey ? cards.filter(c => c.key === openKey) : cards
  return (
    <div className="min-h-0 flex flex-col gap-4">
      {shown.map((c, i) => cloneElement(c, {
        key: `${c.key}-${round}`, fill: i === shown.length - 1, open: openKey === c.key,
        onOpen: () => setOpenKey(c.key), onClose: () => { setOpenKey(null); setRound(n => n + 1) },
      }))}
    </div>
  )
}

// ── The cards ─────────────────────────────────────────────────────────────────

// 21 Oct (her review: "Module: X, A · Module: Y, A · Project: Z" read messy): the evidence grouped by kind, one short
// line per kind, at most 2 names each
const KINDS = { module: 'Modules', project: 'Projects', cert: 'Certificates', certification: 'Certificates', award: 'Awards',
                work: 'Work', activity: 'Activities' }
function Evidence({ items }) {
  const groups = {}
  for (const e of items) (groups[KINDS[e.type] || 'Other'] ||= []).push(`${e.label}${e.grade ? ` (${e.grade})` : ''}`)
  return (
    <dl className="mt-1 grid grid-cols-[4.75rem_1fr] gap-x-2 gap-y-1 text-xs leading-5">
      {Object.entries(groups).map(([kind, names]) => (
        <div key={kind} className="contents">
          <dt className="text-slate-400">{kind}</dt>
          <dd className="text-slate-600">{names.slice(0, 2).join(', ')}{names.length > 2 && <span className="text-slate-400"> +{names.length - 2} more</span>}</dd>
        </div>
      ))}
    </dl>
  )
}
const selfDeclared = <span className="ml-auto shrink-0 text-[11px] text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">Self-declared</span>

function OwnRepo() {
  return (
    <span title="SkillMap checked this repository belongs to, or has commits from, a GitHub account the student signed in with"
      className="inline-flex items-center gap-1 text-xs font-normal text-emerald-700 whitespace-nowrap">
      <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M10 1.944A11.954 11.954 0 012.166 5C2.056 5.649 2 6.319 2 7c0 5.225 3.34 9.67 8 11.317C14.66 16.67 18 12.225 18 7c0-.682-.057-1.35-.166-2.001A11.954 11.954 0 0110 1.944zM13.707 8.707a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
      Own repo
    </span>
  )
}

function Skills({ skills, relevant }) {
  if (!skills?.length) return null
  const rel = new Set((relevant || []).map(x => x.toLowerCase()))
  return (
    <p className="text-xs leading-5 text-slate-500 mt-1">{skills.map((k, i) => (
      <span key={k}>{i > 0 && ' · '}{rel.has(k.toLowerCase()) ? <span className="text-emerald-700 font-medium">✓ {skillName(k)}</span> : skillName(k)}</span>
    ))}</p>
  )
}

export function ApplicantCards({ s, fit, withFit = true, you, stretch = false }) {
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
    <div className="py-3">
      <p className="text-sm font-medium text-slate-900">{skillName(t.name)}</p>
      <Evidence items={t.evidence} />
    </div>
  )
  const certs = [...s.certifications.map(c => ({ name: c.name, kind: 'Certificate', url: c.credly_url })),
                 ...s.awards.map(a => ({ name: a.title, kind: 'Award' }))]
  const experiences = s.experiences || []

  return (
    // 21 Oct (her review of a short profile: big empty cards): the columns are as tall as the longest one's content,
    // never more than the screen, and still end on one line; only when there is more than fits do the cards measure
    // whole rows and show "See all"
    // stretch (the student's own preview, with "Not shown to employers yet" under it): the cards fill the space above
    <div className={`${stretch ? 'lg:h-full' : 'lg:max-h-full'} lg:flex lg:flex-col`}>
    <div className={`lg:min-h-0 ${stretch ? 'lg:flex-1' : ''} grid gap-4 lg:grid-rows-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1fr)]`}>
      <Column>
        {withFit ? (
          <ListCard key="fit" title={fit ? `${fit.have} of ${fit.total} required skills` : 'For this job'}
            sub={fit ? 'For this job. Each skill with where it comes from.' : null} items={fitRows} footer={extras}
            empty={`${you ? 'Your' : "This student's"} profile has no skills to compare at the moment.`}
            render={(r) => r.m ? (
              <div className="py-3 flex items-start gap-2.5">
                <span className="text-emerald-600 font-bold" aria-hidden="true">✓</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{skillName(r.m.skill)}</p>
                  <p className="text-xs text-slate-500">{r.m.source === 'module' ? `Module: ${r.m.from}` : r.m.from}{r.m.grade && `, ${r.m.grade}`}</p>
                </div>
                {r.m.source !== 'module' && selfDeclared}
              </div>
            ) : (
              <div className="py-3 flex items-start gap-2.5">
                <span className="text-slate-300 font-bold" aria-hidden="true">–</span>
                <p className="text-sm text-slate-500">{skillName(r.name)} <span className="text-xs">· not in {whose} record yet</span></p>
              </div>
            )} />
        ) : (
          <ListCard key="strong" title="Strongest skills" sub="The skills with the most evidence." items={s.top_skills || []}
            empty="No skills found yet." render={strengthRow} />
        )}
      </Column>
      <Column>
        {experiences.length > 0 && (
          <ListCard key="exp" title="Experience" limit={fit ? 1 : 2}
            sub={fit ? "Work, then activities; the ones that use this job's skills first." : 'Work, then activities, newest first.'}
            items={experiences} render={(e) => (
              <div className="py-3">
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
            <div className="py-3">
              <p className="text-sm font-medium text-slate-900 flex flex-wrap items-baseline gap-x-2"><span>{p.name}</span>
                {p.github_url && <a href={p.github_url} target="_blank" rel="noopener noreferrer" className="text-xs font-normal text-blue-700 hover:underline whitespace-nowrap">GitHub ↗</a>}
                {p.demo_url && <a href={p.demo_url} target="_blank" rel="noopener noreferrer" className="text-xs font-normal text-blue-700 hover:underline whitespace-nowrap">Demo ↗</a>}
                {/* 14 Oct (Connect GitHub): is the repo the student's own? 21 Oct (her review): a quiet mark, not a pill */}
                {p.github_url && p.repo_check === 'yours' && <OwnRepo />}</p>
              {projectContext(p) && <p className="text-xs text-slate-600">{projectContext(p)}</p>}
              <Skills skills={p.skills} relevant={p.relevant} />
            </div>
          )} />
      </Column>
      <Column>
        <ListCard key="mod" title="Strongest modules" limit={fit ? 2 : 3} items={s.strongest_modules} empty="No module grades yet."
          sub={`${fit ? "The ones that teach this job's skills first. " : ''}${s.show_grades_to_employers
            ? (you ? 'Your grades are shown to employers.' : 'Grades shown because the student allows it.')
            : (you ? 'Your grades are hidden from employers.' : "The student doesn't share grades.")}`}
          render={(m) => (
            <div className="py-2.5">
              <p className="flex justify-between gap-3 text-sm text-slate-700"><span>{m.name}</span>{m.grade && <span className="font-semibold">{m.grade}</span>}</p>
              {/* 21 Oct: with a job, the job's skills this module teaches (and these modules come first) */}
              {m.relevant?.length > 0 && <p className="text-xs text-emerald-700 font-medium">{m.relevant.map(k => `✓ ${skillName(k)}`).join(' · ')}</p>}
            </div>
          )} />
        {certs.length > 0 && (
          <ListCard key="cert" title="Certificates and awards" items={certs} limit={2}
            render={(c) => <p className="py-2.5 flex justify-between gap-3 text-sm text-slate-700">
              {c.url ? <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">{c.name} ↗</a> : <span>{c.name}</span>}
              <span className="shrink-0 text-xs text-slate-400">{c.kind}</span></p>} />
        )}
        {strengths.length > 0 && withFit && (
          <ListCard key="also" title="Also brings" sub="Other skills with the most evidence, beyond this job." items={strengths}
            render={strengthRow} />
        )}
      </Column>
    </div>
    </div>
  )
}

function Extra({ title, skills }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-600">{title}</p>
      <div className="flex flex-wrap gap-1.5 mt-1">
        {skills.map(k => <span key={k} className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-full px-2.5 py-0.5">✓ {skillName(k)}</span>)}
      </div>
    </div>
  )
}

// 21 Oct (her pick pv1): on the student's own preview only, the sections employers can't see yet because they are
// empty, each with a way to add it. Employers never see this part; a box goes once its section has something.
export function NotShownYet({ s }) {
  const boxes = [
    !(s.experiences || []).length && ['Experience', 'Internships, part-time work, clubs and hackathons you took part in.', '/profile?tab=experience'],
    !s.projects.length && ['Projects', 'Something you built, or import it from GitHub.', '/profile?tab=projects'],
    !s.certifications.length && !s.awards.length && ['Certificates and awards', 'Courses, badges, and prizes such as a hackathon win.', '/profile?tab=certs'],
    (!s.about || !(s.languages || []).length) && ['About you and languages', 'A line on the role you want; English with MUET or IELTS.', '/profile/settings'],
  ].filter(Boolean)
  if (!boxes.length) return null
  return (
    <div className="shrink-0 mt-4">
      <p className="text-xs font-semibold text-slate-500 mb-2">Not shown to employers yet (only you see this part)</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-[repeat(var(--n),minmax(0,1fr))] gap-3" style={{ '--n': boxes.length }}>
        {boxes.map(([title, text, to]) => (
          <Link key={title} to={to} className="rounded-2xl border-2 border-dashed border-slate-300 px-4 py-3 flex items-center justify-between gap-3 hover:border-blue-300 hover:bg-blue-50/40">
            <span><span className="block text-sm font-semibold text-slate-600">{title}</span><span className="block text-xs text-slate-500">{text}</span></span>
            <span className="shrink-0 text-sm font-medium text-blue-700">+ Add</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
