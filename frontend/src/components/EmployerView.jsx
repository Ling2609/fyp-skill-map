import { Link } from 'react-router-dom'
import { useState } from 'react'
import { levelLabel } from '../pages/student/experienceKinds'
import { monthLabel, projectContext } from '../pages/student/profileUtils'
import { skillName } from '../skillName'

// 21 Oct (her idea: check what the employer sees before applying): the employer's applicant page and the student's
// preview draw the SAME heading and cards from the SAME data (employer._profile_for), so the preview can't differ from
// what the employer sees. `you` only changes the wording ("your record" / "their record").
// 21 Oct (her review, mock-up h1.png): the heading reads in one order: who (name, headline), About on one full-width
// line, then studies, CGPA and languages with the links at the right end, then contact.
// 21 Oct (her pick, mock-up tp.png, references.md "Arranging the applicant page"): two panels, like a CV beside a
// checklist. Left: one reading column (Experience, Projects, Also brings, Strongest modules, Certificates and awards)
// that scrolls on its own; "Show N more" opens a section in place. Right: the match for the job, which scrolls on its
// own too, so it stays in view. No columns to level, so no blank strips and no cut rows (Greenhouse's candidate
// profile has the same main panel + details panel; a single column reads fastest, Aten Design Group).
// With a job, the projects and experience that use its skills come first (backend: showcase job_skills), and those
// skills are ticked.
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
        {/* 21 Oct (her review): the links beside the name, as on My Profile */}
        {links.map(([label, url]) =>
          <a key={label} href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-700 hover:underline">{label} ↗</a>)}
        {s.headline && <p className="text-sm text-slate-500">{s.headline}</p>}
      </div>
      {s.about && <p className="text-sm text-slate-700 mt-1.5 whitespace-pre-line">{s.about}</p>}
      <div className="mt-3 pt-3 border-t border-slate-300 text-sm">
        <p className="text-slate-600 min-w-0">{facts.map((f, i) => <span key={i}>{i > 0 && ' · '}{f}</span>)}</p>
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

// ── The cards ─────────────────────────────────────────────────────────────────

// 21 Oct (her review: "Module: X, A · Module: Y, A · Project: Z" read messy): the evidence grouped by kind, one short
// line per kind, at most 2 names each
const KINDS = { module: 'Modules', project: 'Projects', cert: 'Certificates', certification: 'Certificates', award: 'Awards',
                work: 'Work', activity: 'Activities' }
function Evidence({ items }) {
  const groups = {}
  for (const e of items) (groups[KINDS[e.type] || 'Other'] ||= []).push(`${e.label}${e.grade ? ` (${e.grade})` : ''}`)
  return (
    <dl className="mt-0.5 grid grid-cols-[4.75rem_1fr] gap-x-2 gap-y-0.5 text-xs leading-[1.15rem]">
      {Object.entries(groups).map(([kind, names]) => (
        <div key={kind} className="contents">
          <dt className="text-slate-500">{kind}</dt>
          <dd className="text-slate-600">{names.slice(0, 2).join(', ')}{names.length > 2 && <span className="text-slate-500 whitespace-nowrap"> +{names.length - 2} more</span>}</dd>
        </div>
      ))}
    </dl>
  )
}
const selfDeclared = <span className="ml-auto shrink-0 text-[11px] text-slate-600 bg-slate-100 rounded-full px-2 py-0.5">Self-declared</span>

function Skills({ skills, relevant }) {
  if (!skills?.length) return null
  const rel = new Set((relevant || []).map(x => x.toLowerCase()))
  return (
    <p className="text-xs leading-[1.15rem] text-slate-500 mt-0.5">{skills.map((k, i) => (
      <span key={k}>{i > 0 && ' · '}{rel.has(k.toLowerCase()) ? <span className="text-emerald-700 font-medium">✓ {skillName(k)}</span> : skillName(k)}</span>
    ))}</p>
  )
}


// A section of the reading column: the first `first` items, then "Show N more ▾" opens the rest in place
function Section({ title, sub, items, first, render, cols = 1, empty }) {
  const [all, setAll] = useState(false)
  if (!items.length && !empty) return null
  const limit = items.length - first === 1 ? items.length : first     // never "Show 1 more": just show it
  const shown = all ? items : items.slice(0, limit)
  return (
    <section className="py-5 border-b border-slate-300 last:border-0">
      {/* 21 Oct (her review: titles and content ran together): a larger title with a short blue mark, and more room
          before the items */}
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900"><span aria-hidden="true" className="w-1 h-4 rounded-full bg-blue-600" />{title}</h2>
      {sub && <p className="text-xs text-slate-500 mt-0.5 ml-3">{sub}</p>}
      {!items.length ? <p className="text-sm text-slate-500 mt-2">{empty}</p> : (
        <div className={`mt-3 grid gap-x-8 ${cols === 2 ? 'sm:grid-cols-2' : ''}`}>{shown.map((it, i) => <div key={i}>{render(it)}</div>)}</div>
      )}
      {/* 21 Oct (her review): at the right, where "See all" sat on the cards (references.md "Where See all goes") */}
      {items.length > limit && (
        <div className="mt-1.5 flex justify-end">
          <button type="button" onClick={() => setAll(v => !v)} className="text-xs font-medium text-blue-700 hover:underline">
            {all ? 'Show less ▴' : `Show ${items.length - limit} more ▾`}</button>
        </div>
      )}
    </section>
  )
}

// A plain list with "Show N more ▾" (the panel's Also brings)
function ShowMore({ items, first, render }) {
  const [all, setAll] = useState(false)
  const limit = items.length - first === 1 ? items.length : first
  return (
    <>
      <div className="divide-y divide-slate-100">{(all ? items : items.slice(0, limit)).map((it, i) => <div key={i}>{render(it)}</div>)}</div>
      {items.length > limit && <div className="mt-1.5 flex justify-end"><button type="button" onClick={() => setAll(v => !v)} className="text-xs font-medium text-blue-700 hover:underline">
        {all ? 'Show less ▴' : `Show ${items.length - limit} more ▾`}</button></div>}
    </>
  )
}

// One group of skills in the match panel, with its own heading and count, so the kinds are easy to tell apart
function Group({ title, note, children, count }) {
  // 21 Oct (her review: green titles looked odd): every title in the same dark text; only the chips carry colour
  return (
    <div className="pt-5 mt-5 border-t border-slate-300 first:pt-0 first:mt-0 first:border-0">
      <p className="text-base font-semibold text-slate-900">{title} <span className="font-normal text-slate-500 tabular-nums">{count}</span></p>
      {note && <p className="text-xs text-slate-500 mt-0.5">{note}</p>}
      <div className="mt-2.5">{children}</div>
    </div>
  )
}

function Chips({ skills, tone }) {
  const cls = tone === 'nice' ? 'text-emerald-800 bg-emerald-50 border-emerald-200' : 'text-sky-800 bg-sky-50 border-sky-200'
  return <div className="flex flex-wrap gap-1.5">{skills.map(k => <span key={k} className={`text-xs border rounded-full px-2.5 py-0.5 ${cls}`}>✓ {skillName(k)}</span>)}</div>
}

// The right panel with a job: required skills (each with where it comes from), then what the ad would also welcome
function MatchPanel({ fit, you }) {
  const whose = you ? 'your' : 'their'
  if (!fit) return <p className="text-sm text-slate-500">{you ? 'Your' : "This student's"} profile has no skills to compare at the moment.</p>
  return (
    <>
      <Group title={`${fit.have} of ${fit.total} required skills`} note="For this job. Each skill with where it comes from.">
        <ul className="divide-y divide-slate-100">
          {fit.matched.map(m => (
            <li key={m.skill} className="py-2 flex items-start gap-2.5">
              <span className="text-emerald-600 font-bold" aria-hidden="true">✓</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">{skillName(m.skill)}</p>
                <p className="text-xs text-slate-500">{m.source === 'module' ? `Module: ${m.from}` : m.from}{m.grade && `, ${m.grade}`}</p>
              </div>
              {m.source !== 'module' && selfDeclared}
            </li>
          ))}
          {fit.missing.map(name => (
            <li key={name} className="py-2 flex items-start gap-2.5">
              <span className="text-slate-300 font-bold" aria-hidden="true">–</span>
              <p className="text-sm text-slate-500">{skillName(name)} <span className="text-xs">· not in {whose} record yet</span></p>
            </li>
          ))}
        </ul>
      </Group>
      {/* 21 Oct (her review: make these more obvious): each kind in its own group with a heading, count and colour */}
      {fit.nice_have?.length > 0 && (
        <Group title="Nice-to-have skills" count={fit.nice_have.length} note="The ad lists these as a bonus. This applicant has them.">
          <Chips skills={fit.nice_have} tone="nice" />
        </Group>
      )}
      {fit.on_job_have?.length > 0 && (
        <Group title="Skills taught on the job" count={fit.on_job_have.length} note="The ad says these are learnt after starting. This applicant already has them.">
          <Chips skills={fit.on_job_have} tone="job" />
        </Group>
      )}
    </>
  )
}

export function ApplicantCards({ s, fit, withFit = true, you, aside }) {
  const inJob = new Set([...(fit?.matched || []).map(m => m.skill), ...(fit?.missing || []), ...(fit?.nice_have || []),
    ...(fit?.on_job_have || [])].map(k => k.toLowerCase()))
  const strengths = (s.top_skills || []).filter(t => !withFit || !inJob.has(t.name.toLowerCase()))
  const certs = [...s.certifications.map(c => ({ name: c.name, kind: 'Certificate', url: c.credly_url })),
                 ...s.awards.map(a => ({ name: a.title, kind: 'Award' }))]
  const strengthRow = (t) => (
    <div className="py-1.5">
      <p className="text-sm font-medium text-slate-900">{skillName(t.name)}</p>
      <Evidence items={t.evidence} />
    </div>
  )
  const skillsSection = (
    <Section title={withFit ? 'Also brings' : 'Strongest skills'} first={withFit ? 4 : 6} cols={2} items={strengths}
      sub={withFit ? 'Other skills with the most evidence, beyond this job.' : 'The skills with the most evidence.'} render={strengthRow} />
  )
  return (
    <div className="lg:h-full flex flex-col lg:flex-row bg-white">
      <div className="lg:flex-1 min-w-0 lg:overflow-y-auto px-4 sm:px-8">
        {/* without a job (the student's own preview), her strongest skills lead the reading column */}
        {!withFit && skillsSection}
        {(s.experiences || []).length > 0 && (
          <Section title="Experience" first={2} items={s.experiences}
            sub={withFit ? "Work, then activities; the ones that use this job's skills first." : 'Work, then activities, newest first.'}
            render={(e) => (
              <div className="py-2">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-sm font-medium text-slate-900 min-w-0">{e.role} <span className="font-normal text-slate-600">· {e.organisation}</span></p>
                  <span className="shrink-0 text-xs text-slate-500 whitespace-nowrap">{monthLabel(e.start)} – {e.end ? monthLabel(e.end) : 'now'}</span>
                </div>
                <p className="text-xs leading-5 text-slate-500">{e.category_label}{e.description && ` · ${e.description}`}</p>
                <Skills skills={e.skills} relevant={e.relevant} />
              </div>
            )} />
        )}
        <Section title="Projects" first={4} cols={2} items={s.projects} empty="None added."
          sub={withFit && s.projects.length > 1 ? "The ones that use this job's skills first." : null}
          render={(p) => (
            <div className="py-2">
              <p className="text-sm font-medium text-slate-900 flex flex-wrap items-baseline gap-x-2"><span>{p.name}</span>
                {p.github_url && <a href={p.github_url} target="_blank" rel="noopener noreferrer" className="text-xs font-normal text-blue-700 hover:underline whitespace-nowrap">GitHub ↗</a>}
                {p.demo_url && <a href={p.demo_url} target="_blank" rel="noopener noreferrer" className="text-xs font-normal text-blue-700 hover:underline whitespace-nowrap">Demo ↗</a>}</p>
              {projectContext(p) && <p className="text-xs leading-5 text-slate-600">{projectContext(p)}</p>}
              <Skills skills={p.skills} relevant={p.relevant} />
            </div>
          )} />
        <Section title="Strongest modules" first={6} cols={2} items={s.strongest_modules} empty="No module grades yet."
          sub={`${withFit ? "The ones that teach this job's skills first. " : ''}${s.show_grades_to_employers
            ? (you ? 'Your grades are shown to employers.' : 'Grades shown because the student allows it.')
            : (you ? 'Your grades are hidden from employers.' : "The student doesn't share grades.")}`}
          render={(m) => (
            <div className="py-1.5 border-b border-slate-100">
              <p className="flex justify-between gap-3 text-sm text-slate-700"><span>{m.name}</span>{m.grade && <span className="font-semibold">{m.grade}</span>}</p>
              {m.relevant?.length > 0 && <p className="text-xs text-emerald-700 font-medium">{m.relevant.map(k => `✓ ${skillName(k)}`).join(' · ')}</p>}
            </div>
          )} />
        <Section title="Certificates and awards" first={6} cols={2} items={certs}
          render={(c) => (
            <p className="py-1.5 flex justify-between gap-3 text-sm text-slate-700">
              {c.url ? <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">{c.name} ↗</a> : <span>{c.name}</span>}
              <span className="shrink-0 text-xs text-slate-500">{c.kind}</span></p>
          )} />
      </div>
      {/* the right panel scrolls on its own and stays in view */}
      <aside className="lg:w-92 shrink-0 lg:overflow-y-auto border-t lg:border-t-0 lg:border-l-2 border-slate-300 bg-white px-4 sm:px-5 py-5">
        {/* 21 Oct (her review: blank space under the match): with a job, the skills beyond the job follow the match
            here, so the panel holds every skill and the left column the CV */}
        {withFit ? <><MatchPanel fit={fit} you={you} />
          {strengths.length > 0 && (
            <div className="pt-5 mt-5 border-t border-slate-300">
              <Group title="Also brings" count={strengths.length} note="Other skills with the most evidence, beyond this job.">
                <ShowMore items={strengths} first={4} render={strengthRow} />
              </Group>
            </div>
          )}</> : aside}
      </aside>
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
  if (!boxes.length) return <p className="text-sm text-emerald-800">✓ Every part of your profile has something employers can see.</p>
  return (
    <div className="mb-5">
      <p className="text-xs font-semibold text-slate-500 mb-2">Not shown to employers yet (only you see this part)</p>
      <div className="flex flex-col gap-2.5">
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

// 21 Oct (her pick; references.md "After applying"): which version of the profile this is. By default the copy sent
// when applying; "See latest" when the profile changed since (as Ashby shows a newer CV). Nothing when nothing changed.
const dayLabel = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
export function VersionBar({ versions, onView, you, name }) {
  if (!versions?.changed) return null
  const when = dayLabel(versions.sent_at)
  if (versions.job_changed) {     // the employer edited the job's skills after they applied: latest profile only
    return (
      <div role="status" className="shrink-0 bg-amber-50 border-b border-amber-200 px-4 sm:px-8 py-2 text-sm text-amber-900">
        {you ? `The employer changed this job's skills after you applied on ${when}, so they see your latest profile against the new skills.`
          : `This job's skills were edited after ${name} applied on ${when}, so this is their latest profile against the new skills.`}
      </div>
    )
  }
  const sent = versions.showing === 'sent'
  const text = you
    ? (sent ? `This is what you sent on ${when}. You've changed your profile since; the employer sees this copy first and can open your latest.`
            : `This is your latest profile. You applied on ${when} with an earlier version.`)
    : (sent ? `Showing what ${name} sent on ${when}. Their profile has changed since.`
            : `Showing ${name}'s latest profile. They applied on ${when} with an earlier version.`)
  return (
    <div role="status" className="shrink-0 bg-amber-50 border-b border-amber-200 px-4 sm:px-8 py-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
      <p className="text-amber-900">{text}</p>
      <button type="button" onClick={() => onView(sent ? 'latest' : 'sent')} className="font-semibold text-blue-700 hover:underline whitespace-nowrap">
        {sent ? 'See latest' : 'See what was sent'}</button>
    </div>
  )
}
