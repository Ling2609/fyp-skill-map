import { NOTE_MAX, REASONS } from './reasons'

// Reason chips for "Not selected" (optional). Picking "Other" opens a box to write the reason (required then); for a
// preset, a short note can't be added, to keep it one tap. value: { reason, note }
export default function ReasonPicker({ value, onChange }) {
  const pick = (r) => onChange({ reason: value.reason === r ? null : r, note: r === 'other' ? value.note : '' })
  return (
    <div>
      <p className="text-xs text-slate-500">Reason <span className="text-slate-500">(optional, the student sees it)</span></p>
      <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Reason">
        {REASONS.map(([key, label]) => (
          <button key={key} type="button" aria-pressed={value.reason === key} onClick={() => pick(key)}
            className={`text-xs font-medium rounded-full px-3 py-1.5 border transition ${value.reason === key
              ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:border-blue-300'}`}>
            {label}
          </button>
        ))}
      </div>
      {value.reason === 'other' && (
        <div className="mt-2">
          <textarea autoFocus rows={2} maxLength={NOTE_MAX} value={value.note || ''} onChange={e => onChange({ ...value, note: e.target.value })}
            placeholder="Write the reason for the student"
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <p className="text-[11px] text-slate-500 flex justify-between"><span>Students read this. Keep it factual.</span>
            <span className="tabular-nums">{(value.note || '').length} / {NOTE_MAX}</span></p>
        </div>
      )}
      {value.reason === 'missing_skills' && <p className="text-[11px] text-slate-500 mt-1.5">Each student sees their own missing skills.</p>}
    </div>
  )
}
