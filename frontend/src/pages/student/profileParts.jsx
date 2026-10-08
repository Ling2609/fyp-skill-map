import { useState, useEffect, useCallback } from 'react'
import { skillName } from '../../skillName'
import { errText } from './profileUtils'

// Pieces shared by the My Profile cards and pop-ups (moved out of the old Profile.jsx on 8 Oct, so every card
// and pop-up uses exactly the same chips, pop-ups and buttons).

// ── Shared ────────────────────────────────────────────────────────────────────

// One skill. title = hover text (the student's own words, "GitHub: …", "Added by you", "Suggested by AI"); onRemove adds
// an ✕ (4 Oct: the student can take out a wrong skill, Nielsen "user control and freedom"). Looks: AI estimate = dashed
// border; added by the student = grey; everything with evidence = blue.
export function SkillChip({ skill, title, onRemove, estimated = false, added = false }) {
  const look = added ? 'bg-gray-100 text-gray-700 border-gray-200'
    : estimated ? 'bg-white text-blue-700 border-blue-200 border-dashed'
    : 'bg-blue-50 text-blue-700 border-blue-100'
  return (
    <span title={title} className={`group/chip inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium border ${look}`}>
      {skillName(skill)}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${skill}`}
          className="-mr-1 ml-0.5 w-4 h-4 inline-flex items-center justify-center rounded-full text-current opacity-40 hover:text-red-500 hover:bg-red-50 group-hover/chip:opacity-100 focus:opacity-100">
          ×
        </button>
      )}
    </span>
  )
}

export function EmptyState({ icon, title, subtitle }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-55 gap-3 text-center">
      <span className="text-4xl">{icon}</span>
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
      </div>
    </div>
  )
}

export function Spinner({ size = 'md' }) {
  const sz = size === 'sm' ? 'w-3.5 h-3.5 border-2' : 'w-5 h-5 border-2'
  return <div className={`${sz} border-current border-t-transparent rounded-full animate-spin`} />
}


// ── Projects and certificates (4 Oct, her review) ─────────────────────────────
// Layout C: the list uses the full width; "+ Add" and each card's Edit open the same form in a pop-up (one form for
// both, as LinkedIn's "Add licence or certification"). One page scrollbar, no nested scroll areas (references.md).


// dirty = something has been typed: clicking outside, Esc or the corner ✕ then asks before throwing it away
// (5 Oct: a stray click outside lost a long description). The form's own Cancel closes straight away.
export function Modal({ title, onClose, dirty = false, children }) {
  const [asking, setAsking] = useState(false)
  const tryClose = useCallback(() => { if (dirty) setAsking(true); else onClose() }, [dirty, onClose])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') tryClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tryClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30" onMouseDown={tryClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onMouseDown={e => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-5 pb-1">
          <h3 className="text-base font-semibold text-gray-800">{title}</h3>
          <button type="button" onClick={tryClose} aria-label="Close" className="text-gray-400 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        {asking && (
          <div role="alertdialog" aria-label="Discard changes" className="mx-6 mt-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-sm text-amber-800">Discard your changes?</p>
            <div className="flex gap-2 shrink-0">
              <button type="button" onClick={() => setAsking(false)} autoFocus className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">Keep editing</button>
              <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg">Discard</button>
            </div>
          </div>
        )}
        <div className="px-6 pb-6 pt-3">{children}</div>
      </div>
    </div>
  )
}

// "Delete X?" before a project or certificate goes (5 Oct: the card's ✕ sits near the chips' ×)
// onDelete must throw if the delete failed: the question then stays open and says so (5 Oct audit: a failed delete
// used to close it silently, so the student couldn't tell whether anything was deleted)
export function ConfirmDelete({ name, onCancel, onDelete }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const del = async () => {
    setBusy(true); setFailed(false)
    try { await onDelete() } catch { setFailed(true); setBusy(false) }
  }
  return (
    <Modal title="Delete?" onClose={onCancel}>
      <p className="text-sm text-gray-600">Delete <span className="font-medium text-gray-800">“{name}”</span>? Its skills will leave your profile.</p>
      {failed && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 mt-3">Couldn't delete it. Please try again.</p>}
      <div className="flex justify-end gap-2 pt-5">
        <button type="button" onClick={onCancel} autoFocus className="px-4 py-2 text-sm text-gray-500 hover:text-gray-800">Cancel</button>
        <button type="button" disabled={busy} onClick={del}
          className="bg-red-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-red-700 disabled:opacity-40">Delete</button>
      </div>
    </Modal>
  )
}

export function Field({ label, optional, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1.5">
        {label} {optional ? <span className="text-gray-300 font-normal">(optional)</span> : <span className="text-red-400">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1.5">{hint}</p>}
    </div>
  )
}

export function FormButtons({ loading, busyText, label, onCancel, disabled }) {
  return (
    <div className="flex items-center justify-end gap-2 pt-2">
      <button type="button" onClick={onCancel} className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-800">Cancel</button>
      <button type="submit" disabled={loading || disabled}
        className="bg-blue-700 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-blue-800 disabled:opacity-40 transition flex items-center gap-2">
        {loading ? <><Spinner size="sm" />{busyText}</> : label}
      </button>
    </div>
  )
}

// "You already have one called X. Are you sure…?" (her wording, 5 Oct): shown in the pop-up in place of the buttons;
// "Yes, add it" sends the form again with allow_duplicate. Changing the name hides it.
export function DuplicateAsk({ message, yesLabel, onYes, onBack, busy }) {
  return (
    <div role="alertdialog" aria-label="Same name" className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
      <p className="text-sm text-amber-800">{message}</p>
      <div className="flex justify-end gap-2 mt-3">
        <button type="button" onClick={onBack} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Go back</button>
        <button type="button" onClick={onYes} disabled={busy} autoFocus
          className="bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-blue-800 disabled:opacity-40">{yesLabel}</button>
      </div>
    </div>
  )
}

export function IconButton({ label, onClick, children, danger }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label}
      className={`text-gray-300 transition shrink-0 p-1 rounded-lg ${danger ? 'hover:text-red-400 hover:bg-red-50' : 'hover:text-blue-600 hover:bg-blue-50'}`}>
      {children}
    </button>
  )
}
export const PencilIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.536-6.536a2.5 2.5 0 113.536 3.536L12.536 16.536 8 17l.464-4.536z" /></svg>
export const CrossIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>

// "+ Add skill": a chip that turns into a small box; Enter adds, Esc cancels
export function AddSkillChip({ onAdd }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const close = () => { setOpen(false); setValue(''); setError('') }
  const submit = async () => {
    if (!value.trim()) { close(); return }
    setBusy(true); setError('')
    try { await onAdd(value.trim()); close() }
    catch (err) { setError(errText(err, "Couldn't add the skill")) }
    finally { setBusy(false) }
  }
  if (!open) return (
    <button type="button" onClick={() => setOpen(true)}
      className="text-xs px-2.5 py-1 rounded-full font-medium border border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-700">
      + Add skill
    </button>
  )
  return (
    <span className="inline-flex flex-col">
      <input autoFocus value={value} disabled={busy} maxLength={60} placeholder="Skill, then Enter"
        onChange={e => setValue(e.target.value)} onBlur={() => !value.trim() && close()}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit() } if (e.key === 'Escape') close() }}
        className="text-xs px-2.5 py-1 rounded-full border border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-200 w-40" />
      {error && <span className="text-[11px] text-red-500 mt-1">{error}</span>}
    </span>
  )
}

export function SkillsRow({ children, empty, emptyText }) {
  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      {empty && <p className="text-xs text-gray-500 mb-2">{emptyText}</p>}
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  )
}

// An on/off switch (moved from the old About & links tab, 8 Oct). Keyboard: Tab to it, Space to flip.
export function Toggle({ id, checked, onChange, label, hint, disabled = false }) {
  return (
    <div className="flex items-start gap-3">
      <button type="button" id={id} role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={`mt-0.5 relative w-9 h-5 rounded-full shrink-0 transition disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${checked ? 'bg-blue-600' : 'bg-gray-300'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${checked ? 'left-4.5' : 'left-0.5'}`} />
      </button>
      <label htmlFor={id} className="cursor-pointer">
        <span className="block text-sm text-gray-800">{label}</span>
        {hint && <span className="block text-xs text-gray-500 mt-0.5">{hint}</span>}
      </label>
    </div>
  )
}
