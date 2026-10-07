import { useEffect, useRef, useState } from 'react'

// The "⋯" button at the end of a Users row (7 Oct, her pick B): one button per row, so the table keeps no room for
// buttons a row doesn't have. Few actions shown directly, more behind a kebab menu (uxdesign.cc, "Let's design data
// tables"); the actions column is narrow and last (EUI table layout guidelines). The menu is positioned on the
// screen (not inside the list), so it isn't cut off by the list's scroll area; it opens upwards near the bottom.
// items: [{ label, onSelect, danger? }]. Esc, a click outside or scrolling closes it; arrow keys move between items.
export default function RowMenu({ label, items, disabled }) {
  const [pos, setPos] = useState(null)          // null = closed; else { top | bottom, right }
  const button = useRef(null)
  const menu = useRef(null)

  const open = () => {
    const r = button.current.getBoundingClientRect()
    const below = window.innerHeight - r.bottom > 44 * items.length + 16
    setPos({ right: window.innerWidth - r.right, ...(below ? { top: r.bottom + 4 } : { bottom: window.innerHeight - r.top + 4 }) })
  }
  const close = (refocus) => { setPos(null); if (refocus) button.current?.focus() }

  useEffect(() => {
    if (!pos) return
    menu.current?.querySelector('[role="menuitem"]')?.focus()
    const onDown = (e) => { if (!menu.current?.contains(e.target) && !button.current?.contains(e.target)) close() }
    const onScroll = () => close()
    window.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [pos])

  const onKey = (e) => {
    const all = [...menu.current.querySelectorAll('[role="menuitem"]')]
    const i = all.indexOf(document.activeElement)
    if (e.key === 'Escape') { e.preventDefault(); close(true) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); all[(i + 1) % all.length].focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); all[(i - 1 + all.length) % all.length].focus() }
    else if (e.key === 'Tab') close()
  }

  return (
    <>
      <button ref={button} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={!!pos} disabled={disabled}
        onClick={() => (pos ? close() : open())}
        className={`w-8 h-8 inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-50 ${pos ? 'bg-slate-100' : 'bg-white'}`}>
        <svg aria-hidden="true" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <circle cx="4" cy="10" r="1.6" /><circle cx="10" cy="10" r="1.6" /><circle cx="16" cy="10" r="1.6" />
        </svg>
      </button>
      {pos && (
        <div ref={menu} role="menu" aria-label={label} onKeyDown={onKey} style={{ position: 'fixed', ...pos }}
          className="z-40 w-52 bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 text-sm text-left">
          {items.map(it => (
            <button key={it.label} type="button" role="menuitem" tabIndex={-1}
              onClick={() => { close(); it.onSelect() }}
              className={`w-full text-left px-3 py-2 rounded-lg focus:outline-none hover:bg-slate-100 focus:bg-slate-100 ${
                it.danger ? 'text-rose-700' : 'text-slate-700'}`}>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
