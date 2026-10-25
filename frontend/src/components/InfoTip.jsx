import { useEffect, useRef, useState } from 'react'

// ⓘ that opens on click or tap and stays until closed (14 Oct; Carbon "toggletip": opens on click or Enter, closes
// on Escape or a click outside; for supplementary text only, never what someone needs to act). Hover-only tooltips
// don't work on phones.
// 25 Oct (her report: the reply-record tip was cut off): the tip is placed on the screen itself (position: fixed, kept
// inside the window), so a card that hides its overflow can't cut it; it closes when the page scrolls or resizes.
const TIP_W = 256
export default function InfoTip({ label, children }) {
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState(null)
  const box = useRef(null)
  const btn = useRef(null)
  const toggle = () => {
    if (!open && btn.current) {
      const r = btn.current.getBoundingClientRect()
      setAt({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - TIP_W - 8)) })
    }
    setOpen(o => !o)
  }
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    const onClick = (e) => { if (!box.current?.contains(e.target)) setOpen(false) }
    const close = () => setOpen(false)
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    window.addEventListener('resize', close)
    document.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick)
      window.removeEventListener('resize', close); document.removeEventListener('scroll', close, true)
    }
  }, [open])
  return (
    <span ref={box} className="relative inline-flex align-middle">
      <button ref={btn} type="button" aria-label={label} aria-expanded={open} onClick={toggle}
        className="ml-1.5 w-4 h-4 rounded-full border border-blue-600 text-blue-700 text-[10px] font-bold leading-none inline-flex items-center justify-center hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">i</button>
      {open && at && (
        <span role="status" style={{ position: 'fixed', top: at.top, left: at.left, width: TIP_W }} className="z-50 rounded-lg bg-slate-900 text-white text-xs leading-relaxed px-3 py-2 shadow-lg">
          {children}
        </span>
      )}
    </span>
  )
}
