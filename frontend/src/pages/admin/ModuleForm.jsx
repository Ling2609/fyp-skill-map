import { useEffect, useState } from 'react'
import api from '../../api'
import { errText } from '../student/profileUtils'

// Pop-up to add a new module to the list being looked at, or edit a module's name, year and type (7 Oct).
// Adding (10 Oct, her flow, the same as a student's certificate): fill in the details, "Find skills" in the
// description (IR Objective 1), check the chips (× removes, type to add), then "Add module". Nothing is saved until
// then, so the module starts "Reviewed" with skills somebody has looked at (Amershi et al. 2019, references.md
// "Reviewing AI-suggested skills"). The code can't change later because students' grades are stored under it.
// Year and type are for the list being looked at (a module can be common in one programme and an elective in another).
const TYPES = [['common', 'Common'], ['specialised', 'Specialised'], ['elective', 'Elective']]

export default function ModuleForm({ module, scopeLabel, busy, error, onSave, onCancel }) {
  const editing = !!module
  const [code, setCode] = useState('')
  const [name, setName] = useState(module?.name || '')
  const [year, setYear] = useState(module?.year || 1)
  const [type, setType] = useState(module ? Object.fromEntries(TYPES.map(([v, l]) => [l, v]))[module.type] || 'common' : 'common')
  const [description, setDescription] = useState('')
  const [skills, setSkills] = useState([])          // [{ name, added_by_admin }]
  const [foundFor, setFoundFor] = useState(null)    // the description the skills were found in
  const [draft, setDraft] = useState('')
  const [finding, setFinding] = useState(false)
  const [findError, setFindError] = useState('')
  const working = busy || finding

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !working) onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [working, onCancel])

  const detailsReady = name.trim().length >= 3 && (editing || (code.trim().length >= 3 && description.trim().length >= 20))
  // What still stops "Find skills" (10 Oct: her test with a 1-letter name and a 2-letter description gave a greyed-out
  // button and no reason)
  const missing = [
    !editing && code.trim().length < 3 && 'a module code (3+ characters)',
    name.trim().length < 3 && 'a name (3+ characters)',
    !editing && description.trim().length < 20 && `a description of at least one sentence (${description.trim().length} / 20 characters)`,
  ].filter(Boolean)
  const found = foundFor !== null
  const stale = found && foundFor !== description.trim()

  const addChips = (list) => setSkills(prev => {
    const have = new Set(prev.map(s => s.name.toLowerCase()))
    return [...prev, ...list.filter(s => s.name && !have.has(s.name.toLowerCase()) && have.add(s.name.toLowerCase()))]
  })
  const takeDraft = () => {
    const typed = draft.split(/[,;\n]/).map(s => s.trim().replace(/\s+/g, ' ')).filter(s => s && s.length <= 80)
    if (typed.length) addChips(typed.map(n => ({ name: n, added_by_admin: true })))
    setDraft('')
  }
  // Finding again replaces the AI's chips; the ones the admin typed stay (as "Find skills again" does for a saved module)
  const findSkills = () => {
    setFinding(true); setFindError('')
    api.post('/admin/modules/suggest', { name, description })
      .then(res => {
        setSkills(prev => {
          const mine = prev.filter(s => s.added_by_admin)
          const have = new Set(mine.map(s => s.name.toLowerCase()))
          return [...res.data.skills.filter(n => !have.has(n.toLowerCase())).map(n => ({ name: n, added_by_admin: false })), ...mine]
        })
        setFoundFor(description.trim())
      })
      .catch(err => { setFindError(errText(err, "Couldn't find skills. Try again, or type them yourself.")); setFoundFor(description.trim()) })
      .finally(() => setFinding(false))
  }

  const finalSkills = () => {
    const typed = draft.split(/[,;\n]/).map(s => s.trim().replace(/\s+/g, ' ')).filter(Boolean)
    const have = new Set(skills.map(s => s.name.toLowerCase()))
    return [...skills, ...typed.filter(n => !have.has(n.toLowerCase())).map(n => ({ name: n, added_by_admin: true }))]
  }
  const canAdd = detailsReady && found && !stale && finalSkills().length > 0
  const submit = (e) => {
    e.preventDefault()
    if (working || !detailsReady) return
    if (editing) return onSave({ name, year: Number(year), type })
    if (!found || stale) return findSkills()           // the main button finds skills first
    if (canAdd) onSave({ code, name, year: Number(year), type, description, skills: finalSkills() })
  }
  const field = 'w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500'
  const mainLabel = editing ? (busy ? 'Saving…' : 'Save')
    : finding ? 'Finding skills…' : busy ? 'Adding…' : !found ? 'Find skills' : stale ? 'Find skills again' : 'Add module'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30" onMouseDown={() => { if (!working) onCancel() }}>
      <form role="dialog" aria-modal="true" aria-labelledby="module-form-title" onSubmit={submit} onMouseDown={e => e.stopPropagation()}
        className={`bg-white rounded-2xl shadow-xl w-full max-h-[calc(100vh-2rem)] flex flex-col ${editing ? 'max-w-lg' : 'max-w-2xl'}`}>
        <div className="px-6 pt-5 flex flex-col gap-4 overflow-y-auto">
          <h2 id="module-form-title" className="text-base font-semibold text-slate-900">
            {editing ? `Edit ${module.code}` : `New module in ${scopeLabel || 'the programme'}`}
          </h2>
          {editing && (
            <p className="-mt-2 text-sm text-slate-600">Year and type are for {scopeLabel} only.{module.shared > 0 ? ` The name changes everywhere the module is taught.` : ''}</p>
          )}
          <div className="flex gap-3">
            {!editing && (
              <div className="w-40">
                <label htmlFor="mf-code" className="block text-sm font-medium text-slate-700 mb-1">Module code</label>
                <input id="mf-code" autoFocus value={code} onChange={e => setCode(e.target.value)} maxLength={20} placeholder="e.g. SE-L2-014" className={field} />
              </div>
            )}
            <div className="flex-1">
              <label htmlFor="mf-name" className="block text-sm font-medium text-slate-700 mb-1">Name</label>
              <input id="mf-name" autoFocus={editing} value={name} onChange={e => setName(e.target.value)} maxLength={120} placeholder="e.g. Cloud Computing" className={field} />
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-40">
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
              {!found && <p className="text-xs text-slate-500 mt-1">SkillMap finds the skills in this text for you to check before adding.</p>}
              {!found && missing.length > 0 && (
                <p className="text-xs text-amber-800 mt-1">To find skills, add {missing.join(', ')}.</p>
              )}
            </div>
          )}
          {!editing && found && (
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <label htmlFor="mf-skill" className="text-sm font-medium text-slate-700">Skills ({skills.length})</label>
                <span className="text-xs text-slate-500">Remove any that don't fit; type to add one</span>
              </div>
              <div className="border border-slate-300 rounded-lg px-2.5 py-2 flex flex-wrap items-center gap-1.5 focus-within:ring-2 focus-within:ring-blue-500">
                {skills.map(s => (
                  <span key={s.name} className={`inline-flex items-center gap-1 text-sm pl-3 pr-1.5 py-0.5 rounded-full border ${s.added_by_admin
                    ? 'bg-white border-slate-300 text-slate-700' : 'bg-blue-50 border-blue-200 text-blue-800'}`}
                    title={s.added_by_admin ? 'Typed by you' : 'Found in the description'}>
                    {s.name}
                    <button type="button" aria-label={`Remove ${s.name}`} onClick={() => setSkills(prev => prev.filter(x => x !== s))}
                      className="w-5 h-5 inline-flex items-center justify-center rounded-full hover:bg-black/10">×</button>
                  </span>
                ))}
                <input id="mf-skill" value={draft} onChange={e => setDraft(e.target.value)} onBlur={takeDraft} maxLength={200}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); takeDraft() }
                    if (e.key === 'Backspace' && !draft && skills.length) setSkills(prev => prev.slice(0, -1))
                  }}
                  placeholder={skills.length ? 'Add a skill' : 'e.g. SQL, Data modelling'} className="flex-1 min-w-32 text-sm py-0.5 focus:outline-none" />
              </div>
              {stale && <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2 mt-2">The description changed: find the skills again so they match it. Skills you typed stay.</p>}
              {findError && <p role="alert" className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2 mt-2">{findError}</p>}
            </div>
          )}
          {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
        </div>
        <div className="shrink-0 flex items-center justify-end gap-2 px-6 py-4 mt-5 bg-slate-50 border-t border-slate-100 rounded-b-2xl">
          {!editing && found && !stale && (
            <button type="button" onClick={findSkills} disabled={working || !detailsReady}
              className="mr-auto text-sm font-medium text-blue-700 hover:underline disabled:text-slate-300 disabled:no-underline">Find skills again</button>
          )}
          <button type="button" onClick={onCancel} disabled={working}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={working || !detailsReady || (!editing && found && !stale && !canAdd)}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
            {mainLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
