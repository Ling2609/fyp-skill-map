import { useState } from 'react'
import { Link } from 'react-router-dom'
import { DATA_TABLE, IN_SHORT, SECTIONS, UPDATED } from './privacyText'

// The privacy notice (14 Oct, redone after her review). Layout from NN/g "Privacy policies and terms of use pages": a
// plain-language summary on top, a linked table of contents in a left rail, short bullet points with key phrases in
// bold, the dates. Content: the eight items Malaysia's PDPA 2010 s.7 asks for, in English and Bahasa Malaysia (s.7(3)).
// Question-style headings as in the UK Ministry of Justice template. Public page: it can be read before signing up.
const LABELS = {
  en: { title: 'Privacy notice', contents: 'Contents', back: 'Back to SkillMap', other: 'Bahasa Malaysia' },
  ms: { title: 'Notis privasi', contents: 'Kandungan', back: 'Kembali ke SkillMap', other: 'English' },
}

// The data user under the PDPA is the university's career office that runs SkillMap, not its developer; its address
// is set when SkillMap is deployed (frontend/.env VITE_PRIVACY_CONTACT). The demo default is on the reserved
// .example domain, so it can never be mistaken for a real university's address.
const CONTACT = import.meta.env.VITE_PRIVACY_CONTACT || 'careers@university.example'

// "**bold**" in the text -> <b>; "{contact}" -> the career office's email as a link
const rich = (text) => text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
  i % 2 ? <b key={i} className="font-semibold text-slate-900">{part}</b>
    : part.split('{contact}').flatMap((bit, j) => j
      ? [<a key={`c${i}${j}`} href={`mailto:${CONTACT}`} className="text-blue-700 hover:underline">{CONTACT}</a>, bit] : [bit]))

export default function Privacy() {
  const [lang, setLang] = useState(() => (navigator.language || '').startsWith('ms') ? 'ms' : 'en')
  const L = LABELS[lang], short = IN_SHORT[lang], table = DATA_TABLE[lang], sections = SECTIONS[lang]
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link to="/login" className="font-semibold text-slate-900">SkillMap</Link>
          <button type="button" onClick={() => setLang(lang === 'en' ? 'ms' : 'en')} lang={lang === 'en' ? 'ms' : 'en'}
            className="text-sm font-medium text-blue-700 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50">
            {L.other}
          </button>
        </div>
      </header>

      <main lang={lang} className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{L.title}</h1>
        <p className="text-sm text-slate-500 mt-1">{UPDATED[lang]}</p>

        <section aria-labelledby="in-short" className="mt-6 bg-white border border-slate-200 rounded-2xl px-5 sm:px-7 py-5">
          <h2 id="in-short" className="text-lg font-semibold text-slate-900">{short.title}</h2>
          <dl className="mt-3 divide-y divide-slate-100">
            {short.lines.map(([k, v]) => (
              <div key={k} className="py-2.5 sm:grid sm:grid-cols-[11rem_1fr] sm:gap-4">
                <dt className="text-[15px] font-semibold text-slate-900">{k}</dt>
                <dd className="text-[15px] text-slate-700 leading-relaxed">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="mt-8 lg:grid lg:grid-cols-[14rem_1fr] lg:gap-10">
          <nav aria-label={L.contents} className="mb-6 lg:mb-0">
            <div className="lg:sticky lg:top-6">
              <p className="text-xs font-semibold text-slate-500 mb-2">{L.contents}</p>
              <ol className="space-y-1 text-sm">
                {sections.map(([id, title], i) => (
                  <li key={id}><a href={`#${id}`} className="flex gap-2 text-slate-700 hover:text-blue-700 py-0.5">
                    <span className="w-5 shrink-0 text-slate-400 tabular-nums">{i + 1}.</span>{title}</a></li>
                ))}
              </ol>
            </div>
          </nav>

          <div className="space-y-4">
            {sections.map(([id, title, points], i) => (
              <section key={id} id={id} className="scroll-mt-6 bg-white border border-slate-200 rounded-2xl px-5 sm:px-7 py-5">
                <h2 className="text-lg font-semibold text-slate-900"><span className="text-slate-400 tabular-nums mr-2">{i + 1}.</span>{title}</h2>
                <ul className="mt-3 space-y-2 text-[15px] text-slate-700 leading-relaxed list-disc pl-5">
                  {points.map(p => <li key={p}>{rich(p)}</li>)}
                </ul>
                {id === 'collect' && (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead><tr className="border-b border-slate-200 text-slate-500">
                        {table.head.map(h => <th key={h} scope="col" className="py-2 pr-4 font-medium">{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {table.rows.map(([what, need, why]) => (
                          <tr key={what} className="border-b border-slate-100 last:border-0">
                            <td className="py-2 pr-4 text-slate-800">{what}</td>
                            <td className="py-2 pr-4"><span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${
                              need === 'Required' || need === 'Wajib' ? 'bg-slate-100 text-slate-700' : 'bg-emerald-50 text-emerald-700'}`}>{need}</span></td>
                            <td className="py-2 text-slate-600">{why}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="text-sm text-slate-600 mt-3">{table.note}</p>
                  </div>
                )}
              </section>
            ))}
            <p className="pt-2 text-sm"><Link to="/login" className="text-blue-700 hover:underline">{L.back}</Link></p>
          </div>
        </div>
      </main>
    </div>
  )
}
