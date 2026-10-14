import { useEffect, useRef, useState } from 'react'

// ⓘ that opens on click or tap and stays until closed (14 Oct; Carbon "toggletip": opens on click or Enter, closes
// on Escape or a click outside; for supplementary text only, never what someone needs to act). Hover-only tooltips
// don't work on phones.
export default function InfoTip({ label, children }) {
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    const onClick = (e) => { if (!box.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick) }
  }, [open])
  return (
    <span ref={box} className="relative inline-flex align-middle">
      <button type="button" aria-label={label} aria-expanded={open} onClick={() => setOpen(o => !o)}
        className="ml-1.5 w-4 h-4 rounded-full border border-blue-600 text-blue-700 text-[10px] font-bold leading-none inline-flex items-center justify-center hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">i</button>
      {open && (
        <span role="status" className="absolute left-0 top-6 z-20 w-64 rounded-lg bg-slate-900 text-white text-xs leading-relaxed px-3 py-2 shadow-lg">
          {children}
        </span>
      )}
    </span>
  )
}
