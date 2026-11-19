import { useLayoutEffect, useRef } from 'react'

export default function ConfirmationDialog({ wording, onAnswer }) {
  const dialogRef = useRef(null)
  const initialFocus = useRef(null)

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    const previous = document.activeElement
    dialog.showModal()
    initialFocus.current.focus()
    return () => {
      dialog.close()
      if (previous?.isConnected) previous.focus()
    }
  }, [])

  return (
    <dialog ref={dialogRef} aria-label={wording.title} className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-2xl border border-line bg-white p-5 text-ink shadow-xl backdrop:bg-slate-900/35 sm:p-6"
      onCancel={event => { event.preventDefault(); onAnswer(false) }}>
      <h2 className="text-base font-semibold">{wording.title}</h2>
      <p className="mt-2 wrap-anywhere text-sm text-ink-soft">{wording.message}</p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        {wording.cancelLabel !== null && <button ref={initialFocus} type="button" className="acad-btn edit min-h-11" onClick={() => onAnswer(false)}>
          {wording.cancelLabel || 'Cancel'}
        </button>}
        <button ref={wording.cancelLabel === null ? initialFocus : undefined} type="button" className={`acad-btn min-h-11 ${wording.danger ? 'red' : 'edit'}`} onClick={() => onAnswer(true)}>
          {wording.confirmLabel}
        </button>
      </div>
    </dialog>
  )
}

