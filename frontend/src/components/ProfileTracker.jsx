import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

// 21 Oct (her idea, research: references.md "Reminding students to finish the profile"): a small "Your profile ·
// 3 of 5 done" at the end of My Profile's tab row (LinkedIn shows its profile meter on the profile page). It opens a
// short checklist (Handshake's profile completion tracker; Chameleon: about 5 items, say why each one helps, tick from
// what was really added). Nothing is pushed over the page; it hides with nothing added (the Dashboard's start card
// asks then) and once all five are done (LinkedIn's "Suggested for you" box disappears at All-Star).
const ITEMS = [
  { key: 'modules', tab: 'modules', title: 'Modules and grades', why: 'Your grades are the strongest evidence for your skills.', to: '/profile' },
  { key: 'projects', tab: 'projects', title: 'Projects', why: 'Show what you built, with a link employers can open.', to: '/profile?tab=projects' },
  { key: 'experience', tab: 'experience', title: 'Experience', why: 'Internships and club roles become skills employers can see.', to: '/profile?tab=experience' },
  { key: 'certs', tab: 'certs', title: 'Certificates or awards', why: 'Courses and prizes add skills, with proof.', to: '/profile?tab=certs' },
  { key: 'about', title: 'About you and languages', why: 'The first thing employers read; many ads ask for English.', to: '/profile/settings' },
]

// done: which items are added (profileDone.js). onGo(tab): switches My Profile's tab instead of following the link.
export default function ProfileTracker({ done, onGo }) {
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  useEffect(() => {
    if (!open) return
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])
  if (!done) return null
  const count = ITEMS.filter(i => done[i.key]).length
  if (count === 0 || count === ITEMS.length) return null      // nothing yet: the start card asks; all done: gone

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open}
        className="flex items-center gap-2.5 text-sm font-medium text-blue-700 bg-white border border-slate-300 rounded-lg px-3.5 py-2 hover:bg-slate-50">
        <span className="flex gap-0.5" aria-hidden="true">
          {ITEMS.map(i => <span key={i.key} className={`w-2 h-2 rounded-full ${done[i.key] ? 'bg-blue-600' : 'bg-slate-200'}`} />)}
        </span>
        Your profile · {count} of {ITEMS.length} done <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 z-30 w-[24rem] bg-white border border-slate-200 rounded-xl shadow-lg p-2">
          {ITEMS.map(i => done[i.key] ? (
            <p key={i.key} className="flex items-center gap-3 px-3 py-2 text-sm text-slate-500">
              <span className="w-5 text-emerald-600 font-semibold" aria-hidden="true">✓</span>{i.title}
            </p>
          ) : (
            <Link key={i.key} to={i.to} onClick={onGo && i.tab ? (e) => { e.preventDefault(); setOpen(false); onGo(i.tab) } : undefined}
              className="flex gap-3 px-3 py-2 rounded-lg hover:bg-slate-50">
              <span className="w-5 h-5 mt-0.5 rounded-full border-2 border-slate-300 shrink-0" aria-hidden="true" />
              <span>
                <span className="block text-sm font-medium text-blue-700">{i.title}</span>
                <span className="block text-xs text-slate-500">{i.why}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
