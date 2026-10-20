import { useEffect, useRef, useState } from 'react'

// 20 Oct (her guide on pop-ups: "if it can be undone, don't ask first: do it and offer Undo"): a short message at the
// bottom of the screen, same look as the employer's status-change toast. Closes itself after 6 s; Undo runs the
// given function. Use: const toast = useToast(); toast.show('Recorded', undoFn); ... {toast.ui}
export function useToast() {
  const [t, setT] = useState(null)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  const show = (text, undo = null, error = false) => {
    clearTimeout(timer.current)
    setT({ text, undo, error })
    timer.current = setTimeout(() => setT(null), 6000)
  }
  const ui = t && (
    <div role={t.error ? 'alert' : 'status'}
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-5 rounded-xl px-4 py-3 text-sm shadow-lg ${
        t.error ? 'bg-rose-700 text-white' : 'bg-slate-900 text-white'}`}>
      <span>{t.text}</span>
      {t.undo && <button type="button" onClick={() => { setT(null); t.undo() }} className="font-semibold text-blue-300 hover:text-blue-200">Undo</button>}
      <button type="button" onClick={() => setT(null)} aria-label="Close" className="text-slate-400 hover:text-white">×</button>
    </div>
  )
  return { show, ui }
}
