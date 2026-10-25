import { useState } from 'react'
import { Modal } from '../pages/student/profileParts'
import { Busy } from './Spinner'

// 25 Oct (her plan, option D; references.md "Invitations: declining and ending"): "No thanks" to an employer's
// invitation, with an optional reason (one tap, or her own words). The employer sees "Declined" and the reason, or
// "No reason given". She can still apply while the job is open. Used on the Dashboard and My Applications.
const REASONS = [['not_looking', 'Not looking right now'], ['wrong_role', 'Not the right role for me'],
                 ['have_offer', 'Already have an offer'], ['other', 'Other']]
const NOTE_MAX = 200

export default function DeclineInvite({ inv, busy, error, onCancel, onDecline }) {
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const needsNote = reason === 'other' && !note.trim()
  return (
    <Modal title={`No thanks to ${inv.title} at ${inv.company}?`} onClose={onCancel} dirty={!!(reason || note)}>
      <fieldset>
        <legend className="text-sm text-slate-600">Tell them why, if you like. {inv.company} will see your answer.</legend>
        <div className="mt-3 space-y-2">
          {REASONS.map(([key, label]) => (
            <label key={key} className="flex items-center gap-2.5 text-sm text-slate-800 cursor-pointer">
              <input type="radio" name="decline-reason" value={key} checked={reason === key}
                onChange={() => setReason(key)} className="w-4 h-4 accent-blue-600" />
              {label}
            </label>
          ))}
        </div>
        {reason === 'other' && (
          <div className="mt-3 ml-6">
            <label htmlFor="decline-note" className="sr-only">Your reason</label>
            <input id="decline-note" value={note} onChange={e => setNote(e.target.value)} maxLength={NOTE_MAX} autoFocus
              placeholder="Your reason" className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <p className="text-xs text-slate-500 mt-1 text-right">{note.length} / {NOTE_MAX}</p>
          </div>
        )}
      </fieldset>
      <p className="text-xs text-slate-500 mt-4">Giving a reason is optional. You can still apply while the job is open.</p>
      {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">Cancel</button>
        <button type="button" disabled={busy || needsNote} onClick={() => onDecline(reason || null, reason === 'other' ? note.trim() : null)}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
          {busy ? <Busy>Sending…</Busy> : 'No thanks'}
        </button>
      </div>
    </Modal>
  )
}
