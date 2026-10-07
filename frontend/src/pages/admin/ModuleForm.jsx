import { useEffect, useState } from 'react'

// Pop-up to add a module to the programme, or edit a module's name, year and type (7 Oct). A new module's skills
// are found in its description straight after saving (IR Objective 1), so the description is required; the code
// can't change later because students' grades are stored under it.
const TYPES = [['common', 'Common'], ['specialised', 'Specialised'], ['elective', 'Elective']]

export default function ModuleForm({ module, busy, error, onSave, onCancel }) {
  const editing = !!module
  const [code, setCode] = useState('')
  const [name, setName] = useState(module?.name || '')
  const [year, setYear] = useState(module?.year || 1)
  const [type, setType] = useState(module ? Object.fromEntries(TYPES.map(([v, l]) => [l, v]))[module.type] || 'common' : 'common')
  const [description, setDescription] = useState('')

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  const ready = name.trim().length >= 3 && (editing || (code.trim().length >= 3 && description.trim().length >= 20))
  const submit = (e) => {
    e.preventDefault()
    if (ready && !busy) onSave(editing ? { name, year: Number(year), type } : { code, name, year: Number(year), type, description })
  }
  const field = 'w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30" onMouseDown={() => { if (!busy) onCancel() }}>
      <form role="dialog" aria-modal="true" aria-labelledby="module-form-title" onSubmit={submit} onMouseDown={e => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="px-6 pt-5 flex flex-col gap-4">
          <h2 id="module-form-title" className="text-base font-semibold text-slate-900">
            {editing ? `Edit ${module.code}` : 'Add a module'}
          </h2>
          {!editing && (
            <div>
              <label htmlFor="mf-code" className="block text-sm font-medium text-slate-700 mb-1">Module code</label>
              <input id="mf-code" autoFocus value={code} onChange={e => setCode(e.target.value)} maxLength={20} placeholder="e.g. SE-L2-014" className={field} />
            </div>
          )}
          <div>
            <label htmlFor="mf-name" className="block text-sm font-medium text-slate-700 mb-1">Name</label>
            <input id="mf-name" autoFocus={editing} value={name} onChange={e => setName(e.target.value)} maxLength={120} placeholder="e.g. Cloud Computing" className={field} />
          </div>
          <div className="flex gap-3">
            <div className="w-28">
              <label htmlFor="mf-year" className="block text-sm font-medium text-slate-700 mb-1">Year</label>
              <select id="mf-year" value={year} onChange={e => setYear(e.target.value)} className={field}>
                {[1, 2, 3, 4].map(y => <option key={y} value={y}>Year {y}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label htmlFor="mf-type" className="block text-sm font-medium text-slate-700 mb-1">Type</label>
              <select id="mf-type" value={type} onChange={e => setType(e.target.value)} className={field}>
                {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          {!editing && (
            <div>
              <label htmlFor="mf-description" className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <textarea id="mf-description" rows={4} value={description} onChange={e => setDescription(e.target.value)} maxLength={4000}
                placeholder="What the module teaches, e.g. from its module descriptor or learning outcomes" className={`${field} resize-none leading-relaxed`} />
              <p className="text-xs text-slate-500 mt-1">After saving, SkillMap finds the module's skills in this text for you to check.</p>
            </div>
          )}
          {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 mt-5 bg-slate-50 border-t border-slate-100 rounded-b-2xl">
          <button type="button" onClick={onCancel} disabled={busy}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={!ready || busy}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
            {busy ? (editing ? 'Saving…' : 'Saving and finding skills…') : editing ? 'Save' : 'Add module'}
          </button>
        </div>
      </form>
    </div>
  )
}
