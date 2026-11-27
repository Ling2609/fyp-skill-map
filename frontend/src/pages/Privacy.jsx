import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import BackLink from '../components/BackLink'
import { VERSIONS } from './privacyText'
import NewTag, { NewRays } from '../components/NewTag'

// The privacy notice (14 Oct). Content: the eight items Malaysia's PDPA 2010 s.7 asks for, in English and Bahasa
// Malaysia (s.7(3)); question-style headings as in the UK Ministry of Justice template. Layout from NN/g "Privacy
// policies and terms of use pages": a plain-language summary on top, a linked table of contents in a left rail, short
// bullet points with key phrases in bold, the dates and a summary of changes.
// 14 Oct (her review, compared with JobStreet's and Monzo's notices): one white document with headed sections and thin
// rules, not a card per section; the summary is the only box. Her review (14 Oct): the same look as the app's detail pages ("← Back to SkillMap" above the title, blue primary
// button), and only the content scrolls. Every version is kept
// (privacyText.js VERSIONS); ?version=<date> shows an earlier one.
const LABELS = {
  en: { title: 'Privacy notice', contents: 'Contents', back: 'Back to SkillMap', backSignup: 'Back to sign-up',
        backSignin: 'Back to sign in', backAccount: 'Back to Account settings', other: 'Bahasa Malaysia',
        eyebrow: 'Privacy',
        updated: 'Last updated', older: 'You are reading an earlier version, dated', current: 'Read the current version',
        history: 'Changes to this notice', thisOne: 'this version', view: 'View',
        whatsNew: "What's new in this version", newTag: 'New', since: 'marks changes since' },
  ms: { title: 'Notis privasi', contents: 'Kandungan', back: 'Kembali ke SkillMap', backSignup: 'Kembali ke pendaftaran',
        backSignin: 'Kembali ke log masuk', backAccount: 'Kembali ke Tetapan Akaun', other: 'English',
        eyebrow: 'Privasi',
        updated: 'Kemas kini terakhir', older: 'Anda sedang membaca versi terdahulu, bertarikh', current: 'Baca versi semasa',
        history: 'Perubahan kepada notis ini', thisOne: 'versi ini', view: 'Lihat',
        whatsNew: 'Apa yang baharu dalam versi ini', newTag: 'Baharu', since: 'menandakan perubahan sejak' },
}

// The data user under the PDPA is the university's career office that runs SkillMap, not its developer; its address
// is set when SkillMap is deployed (frontend/.env VITE_PRIVACY_CONTACT). The demo default is on the reserved
// .example domain, so it can never be mistaken for a real university's address.
const CONTACT = import.meta.env.VITE_PRIVACY_CONTACT || 'careers@university.example'

// "**bold**" in the text -> <b>; "{contact}" -> the career office's email as a link
const rich = (text) => text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
  i % 2 ? <b key={i} className="font-semibold text-slate-900">{part}</b>
    : part.split('{contact}').flatMap((bit, j) => j
      ? [<a key={`c${i}${j}`} href={`mailto:${CONTACT}`} className="text-blue-700 underline hover:no-underline">{CONTACT}</a>, bit] : [bit]))

// her review: the back link in blue, underlined on hover or tap, so it is easy to see
const card = 'pt-6 border-t border-slate-200 first:border-t-0 first:pt-0'

export default function Privacy() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // Where "back" goes (14 Oct, her question): from sign-up the notice opened in a new tab, so going back = closing
  // this tab, which leaves the half-filled form as it was (a new tab can close itself; if not, open sign-up here)
  const fromSignup = params.get('from') === 'signup' && !user
  const fromAccount = params.get('from') === 'account' && !!user     // opened from Account settings
  const [lang, setLang] = useState(() => (navigator.language || '').startsWith('ms') ? 'ms' : 'en')
  const version = VERSIONS.find(v => v.date === params.get('version')) || VERSIONS[0]
  const isCurrent = version === VERSIONS[0]
  const L = LABELS[lang]
  const { inShort, table, sections } = version.text
  const short = inShort[lang], rows = table[lang], body = sections[lang]
  // 27 Nov (her ask): what differs from the version before is marked "New", found by comparing the two texts, so a
  // later version is marked the same way with no extra work
  const prev = VERSIONS[VERSIONS.indexOf(version) + 1]
  const before = new Set(prev ? [...prev.text.sections[lang].flatMap(([, , items]) => items),
    ...prev.text.table[lang].rows.map(r => r.join('|')), ...prev.text.inShort[lang].lines.map(l => l.join('|'))] : [])
  const isNew = (key) => !!prev && !before.has(key)
  const newIn = new Set(body.filter(([, , items]) => items.some(isNew)).map(([id]) => id))
  if (rows.rows.some(r => isNew(r.join('|')))) newIn.add('collect')
  const toc = [...body.map(([id, title]) => [id, title]), ['changes', L.history]]

  return (
    <div className="h-dvh flex flex-col">
      {/* 14 Oct (her review): like the app's detail pages (Job detail, an applicant's profile): a grey "← back"
          link above the title on the left, no logo row; the language button on the right */}
      {/* 20 Nov (her approved mock): the glass header every page has, at the page width */}
      {/* 25 Nov (her review): the back link sits outside the header, on the page colour, as on every other page */}
      {fromSignup
        ? <BackLink text={L.backSignup} onClick={() => { window.close(); setTimeout(() => navigate('/register'), 150) }} />
        : <BackLink text={fromAccount ? L.backAccount : user ? L.back : L.backSignin}
            onClick={() => navigate(fromAccount ? '/account' : user ? '/dashboard' : '/login')} />}
      <header className="shrink-0 mx-auto w-full max-w-314 px-4 sm:px-8 pt-4 sm:pt-0">
        {/* 25 Nov (her phone check): on a phone the language button wraps under the text, so the title stays on one line */}
        <div className="page-glass relative pr-4 pb-5 sm:pr-7 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <span className="page-glass-ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 5 6v6c0 4 3 7.5 7 9 4-1.5 7-5 7-9V6Z" /><path d="m9 12 2 2 4-4" /></svg></span>
          <div className="min-w-0 flex-1 basis-60 page-glass-body pt-5">
            {/* 27 Nov (her review): the blue eyebrow every other page header has, so this header sits the same way
                (mock review/admin-account-pages.html?page=privacy: "Privacy" over "Privacy notice") */}
            <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-widest mb-2">{L.eyebrow}</p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{L.title}</h1>
            <p className="text-sm text-slate-500 mt-1 max-sm:block!">{L.updated} {version.label[lang]}</p>
            {/* 27 Nov (her review): the key for the New tag sits at the top, tag first, and names the version it compares
                with, so the marks in Contents and the tables are explained before they are met */}
            {prev && (
              <p className="mt-2 hidden sm:block text-sm text-slate-600"><NewTag label={L.newTag} className="mr-1 align-[1px]" /> {L.since} {prev.label[lang]}</p>
            )}
          </div>
          <button type="button" onClick={() => setLang(lang === 'en' ? 'ms' : 'en')} lang={lang === 'en' ? 'ms' : 'en'}
            className="shrink-0 ml-4 sm:ml-0 h-10 px-4 text-sm font-bold rounded-xl bg-white border border-[#c8d7f4] text-accent-strong shadow-card hover:bg-accent-soft transition">
            {L.other}
          </button>
        </div>
      </header>

      {/* only the content scrolls; the header stays */}
      <main lang={lang} className="flex-1 min-h-0 mx-auto w-full max-w-314 px-4 sm:px-8 pt-3.5 pb-4 flex flex-col">
        <div className="emp-tile flex-1 min-h-0 overflow-y-auto bg-white border rounded-2xl px-5 sm:px-8 py-6">
          {!isCurrent && (
            <p role="status" className="mb-5 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              {L.older} {version.label[lang]}. <Link to="/privacy" className="font-medium text-blue-700 underline hover:no-underline">{L.current}</Link>
            </p>
          )}

          {prev && (
            <section aria-labelledby="whats-new" className="mb-4 rounded-xl border border-accent/25 bg-white px-5 sm:px-6 py-4">
              <h2 id="whats-new" className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-base font-semibold text-accent-strong">
                <span className="flex items-center gap-2"><NewRays className="h-3.5 w-3.5" />{L.whatsNew}</span>
                <span className="basis-full sm:basis-auto font-normal text-slate-500">· {version.label[lang]}</span></h2>
              <p className="mt-1.5 text-[15px] leading-relaxed text-slate-700">{version.changes[lang]}</p>
            </section>
          )}

          <section aria-labelledby="in-short" className="rounded-xl bg-accent-soft/60 border border-[#c8d7f4] px-5 sm:px-6 py-4">
            <h2 id="in-short" className="text-base font-semibold text-slate-900">{short.title}</h2>
            <dl className="mt-3 divide-y divide-slate-100">
              {short.lines.map(([k, v]) => (
                <div key={k} className="py-2.5 sm:grid sm:grid-cols-[11rem_1fr] sm:gap-4">
                  <dt className="text-[15px] font-semibold text-slate-900">{isNew(`${k}|${v}`) && <NewTag label={L.newTag} className="mr-1 align-[1px]" />} {k}</dt>
                  <dd className="text-[15px] text-slate-700 leading-relaxed">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <div className="mt-8 lg:grid lg:grid-cols-[13rem_1fr] lg:gap-10">
            <nav aria-label={L.contents} className="mb-6 lg:mb-0">
              <div className="lg:sticky lg:top-0">
                <p className="text-xs font-semibold text-slate-500 mb-2">{L.contents}</p>
                <ol className="space-y-1 text-sm">
                  {toc.map(([id, title], i) => (
                    <li key={id}><a href={`#${id}`} className="flex gap-2 text-slate-700 hover:text-blue-700 py-0.5">
                      <span className="w-5 shrink-0 text-slate-500 tabular-nums">{i + 1}.</span>
                      <span>{title}{newIn.has(id) && <NewRays mirrored className="ml-1.5 inline h-2.5 w-2.5 align-[-1px] text-accent-strong" />}</span></a></li>
                  ))}
                </ol>
              </div>
            </nav>

            <div className="space-y-6 max-w-3xl">
              {body.map(([id, title, points], i) => (
                <section key={id} id={id} className={`scroll-mt-4 ${card}`}>
                  <h2 className="text-lg font-semibold text-slate-900"><span className="text-slate-500 tabular-nums mr-2">{i + 1}.</span>{title}</h2>
                  <ul className="mt-3 space-y-2 text-[15px] text-slate-700 leading-relaxed list-disc pl-5">
                    {points.map(p => <li key={p}>{isNew(p) && <NewTag label={L.newTag} className="mr-1" />} {rich(p)}</li>)}
                  </ul>
                  {id === 'collect' && (
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead><tr className="border-b border-slate-200 text-slate-500">
                          {rows.head.map(h => <th key={h} scope="col" className="py-2 pr-4 font-medium">{h}</th>)}
                        </tr></thead>
                        <tbody>
                          {rows.rows.map(([what, need, why]) => (
                            <tr key={what} className="border-b border-slate-200 last:border-0">
                              <td className="py-2 pr-4 text-slate-800">{isNew([what, need, why].join('|')) && <NewTag label={L.newTag} className="mr-1 align-[1px]" />} {what}</td>
                              <td className="py-2 pr-4"><span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${
                                need === 'Required' || need === 'Wajib' ? 'bg-slate-100 text-slate-700' : 'bg-emerald-50 text-emerald-700'}`}>{need}</span></td>
                              <td className="py-2 text-slate-600">{why}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="text-sm text-slate-600 mt-3">{rows.note}</p>
                    </div>
                  )}
                </section>
              ))}

              {/* Every version with what changed; earlier ones can still be opened (NN/g: summarise changes) */}
              <section id="changes" className={`scroll-mt-4 ${card}`}>
                <h2 className="text-lg font-semibold text-slate-900"><span className="text-slate-500 tabular-nums mr-2">{toc.length}.</span>{L.history}</h2>
                <ul className="mt-3 divide-y divide-slate-100">
                  {VERSIONS.map(v => (
                    <li key={v.date} className="py-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[15px]">
                      <span className="w-40 shrink-0 font-semibold text-slate-900">{v.label[lang]}</span>
                      <span className="flex-1 min-w-48 text-slate-700">{v.changes[lang]}</span>
                      {v === version
                        ? <span className="text-xs font-semibold text-blue-700 bg-blue-50 rounded-full px-2 py-0.5">{L.thisOne}</span>
                        : <Link to={(v === VERSIONS[0] ? '/privacy' : `/privacy?version=${v.date}`) + (fromSignup || fromAccount ? `${v === VERSIONS[0] ? '?' : '&'}from=${fromSignup ? 'signup' : 'account'}` : '')} className="text-sm text-blue-700 hover:underline">{L.view}</Link>}
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
