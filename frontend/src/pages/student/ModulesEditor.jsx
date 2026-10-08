import { useState, useEffect } from 'react'
import api from '../../api'
import { Spinner } from './profileParts'
import { skillName } from '../../skillName'

// Modules & grades: the year-by-year grid (4 Oct), shown straight in My Profile's Modules tab (9 Oct, her choice: no
// separate read-only list and side panel, one click fewer). Leaving the tab with grades not saved asks first
// (My Profile handles that through onUnsavedChange).

const GRADE_OPTIONS = [
  { label: 'A (4.0)', value: 4.0 },
  { label: 'A- (3.7)', value: 3.7 },
  { label: 'B+ (3.3)', value: 3.3 },
  { label: 'B (3.0)', value: 3.0 },
  { label: 'B- (2.7)', value: 2.7 },
  { label: 'C+ (2.3)', value: 2.3 },
  { label: 'C (2.0)', value: 2.0 },
]

// Under each module: its code and "3 skills ▾" (9 Oct, her idea: shows where the skill count comes from, i.e. why a
// grade matters). Closed by default, so rows keep their size; open, the module's skills show as small chips.
function ModuleSkills({ mod }) {
  const [open, setOpen] = useState(false)
  const names = (mod.skills || []).map(skillName)
  return (
    <div>
      <p className="text-xs text-gray-400">
        {mod.code}
        {names.length > 0 && (
          <> · <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
            className="text-blue-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 rounded">
            {names.length} {names.length === 1 ? 'skill' : 'skills'} {open ? '▴' : '▾'}
          </button></>
        )}
      </p>
      {open && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {names.map(n => <span key={n} className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">{n}</span>)}
        </div>
      )}
    </div>
  )
}

export default function ModulesEditor({ onUnsavedChange, onSaved }) {
  const [modules, setModules] = useState([])
  const [selections, setSelections] = useState({})
  const [savedSelections, setSavedSelections] = useState({})
  const [selectedYear, setSelectedYear] = useState(1)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState('') // '', 'saved', 'error'

  // Only entries with a real grade value (number, not '' or undefined)
  const gradedSelections = (s) =>
    Object.fromEntries(Object.entries(s).filter(([, v]) => v !== '' && v !== undefined))

  const hasUnsaved = JSON.stringify(gradedSelections(selections)) !== JSON.stringify(gradedSelections(savedSelections))

  // Notify parent of unsaved state changes
  useEffect(() => {
    onUnsavedChange?.(hasUnsaved)
  }, [hasUnsaved, onUnsavedChange])

  useEffect(() => {
    Promise.all([
      api.get('/modules/'),
      api.get('/profile/modules'),
    ]).then(([modRes, gradeRes]) => {
      setModules(modRes.data)
      const saved = {}
      for (const { module_code, grade } of gradeRes.data.grades) {
        saved[module_code] = grade
      }
      setSelections(saved)
      setSavedSelections(saved)
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  const saveGrades = async () => {
    // Send only entries with a real grade — backend will delete anything not in this list
    const grades = Object.entries(selections)
      .filter(([, g]) => g !== '' && g !== undefined)
      .map(([module_code, grade]) => ({ module_code, grade }))
    setSaving(true)
    try {
      await api.post('/profile/modules', { grades })
      setSavedSelections(gradedSelections(selections))
      setSaveStatus('saved')
      onSaved?.()  // My Profile reloads its counts
      setTimeout(() => setSaveStatus(''), 2500)
    } catch {
      setSaveStatus('error')
    } finally { setSaving(false) }
  }

  const yearModules = modules.filter(m => m.level === selectedYear)
  const compulsory = yearModules.filter(m => m.type === 'common' || m.type === 'specialised')
  const electives = yearModules.filter(m => m.type === 'elective')

  const toggleElective = (code) => setSelections(prev => {
    if (prev[code] !== undefined) { const u = { ...prev }; delete u[code]; return u }
    return { ...prev, [code]: '' }
  })

  // "Not graded yet" ('') clears a grade picked by mistake; only graded modules are saved (IR §1.6.1: completed modules)
  const setGrade = (code, grade) => setSelections(prev => ({ ...prev, [code]: grade === '' ? '' : parseFloat(grade) }))

  if (loading) return (
    <div className="flex items-center justify-center py-24 gap-3 text-gray-400">
      <Spinner /><span className="text-sm">Loading modules…</span>
    </div>
  )

  return (
    // Her layout (4 Oct 23:31): on a wide screen the tab fills the window; the year row and each card's title stay put
    // and only the module lists scroll, each in its own panel. The panels can take keyboard focus (tabIndex) so they
    // can be scrolled without a mouse (the accessibility risk of separate scroll areas, references.md). Below the lg
    // breakpoint the cards stack and the page scrolls as normal.
    <div className="lg:h-full flex flex-col gap-5">

      {/* Year tabs + save status */}
      <div className="shrink-0 flex items-center justify-between gap-3">
        <div className="flex gap-2">
          {[1, 2, 3].map(year => (
            <button key={year} onClick={() => setSelectedYear(year)}
              className={`px-5 py-2 rounded-xl text-sm font-medium border transition ${
                selectedYear === year
                  ? 'bg-blue-700 text-white border-blue-700 shadow-sm'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-700'
              }`}>
              Year {year}
            </button>
          ))}
        </div>

        {/* Right side: status text + always-visible Save Grades button */}
        <div className="flex items-center gap-3">
          {hasUnsaved && (
            <div className="flex items-center gap-1.5 text-amber-600">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <span className="text-xs font-medium">Unsaved changes</span>
            </div>
          )}
          {!hasUnsaved && saveStatus === 'saved' && (
            <span className="text-xs text-green-600 font-medium flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
              Saved
            </span>
          )}
          {!hasUnsaved && saveStatus === 'error' && (
            <span className="text-xs text-red-500 font-medium">Failed to save — try again</span>
          )}
          <button
            onClick={saveGrades}
            disabled={!hasUnsaved || saving}
            className={`px-4 py-2 rounded-xl text-sm font-medium border transition flex items-center gap-2 ${
              hasUnsaved
                ? 'bg-blue-700 text-white border-blue-700 hover:bg-blue-800'
                : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
            }`}
          >
            {saving ? <><Spinner size="sm" />Saving…</> : 'Save Grades'}
          </button>
        </div>
      </div>

      {/* Split panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:flex-1 lg:min-h-0">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 flex flex-col lg:min-h-0 overflow-hidden">
          {/* Title and hint on one line, so the list gets more room (her request 9 Oct) */}
          <div className="shrink-0 px-6 py-3 border-b border-gray-200 flex flex-wrap items-baseline gap-x-2">
            <p className="text-sm font-semibold text-gray-800">Compulsory Modules</p>
            {/* Users are final-year students and recent graduates (IR §3.2.2); only completed modules count (IR §1.6.1),
                so a final-year student leaves current modules blank. No honesty checkbox (Kristal et al. 2020) */}
            <p className="text-xs text-gray-400">{compulsory.length} modules · leave blank if not completed yet</p>
          </div>
          {/* key = year: a new year opens at the top of its list, not where the last year was scrolled to */}
          <div key={`c${selectedYear}`} tabIndex={0} aria-label="Compulsory modules"
            className="px-6 py-2 divide-y divide-gray-200 lg:flex-1 lg:overflow-y-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-300">
            {compulsory.map(mod => (
              <div key={mod.code} className="flex items-start justify-between py-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">{mod.name}</p>
                    <ModuleSkills mod={mod} />
                  </div>
                </div>
                <select
                  value={selections[mod.code] ?? ''}
                  onChange={e => setGrade(mod.code, e.target.value)}
                  className="ml-4 border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shrink-0"
                >
                  <option value="">Not graded yet</option>
                  {GRADE_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 flex flex-col lg:min-h-0 overflow-hidden">
          <div className="shrink-0 px-6 py-3 border-b border-gray-200 flex flex-wrap items-baseline gap-x-2">
            <p className="text-sm font-semibold text-gray-800">Elective Modules</p>
            <p className="text-xs text-gray-400">Tick the ones you took</p>
          </div>
          <div key={`e${selectedYear}`} tabIndex={0} aria-label="Elective modules"
            className="px-6 py-3 divide-y divide-gray-200 lg:flex-1 lg:overflow-y-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-300">
            {electives.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">No electives for Year {selectedYear}</p>
            ) : electives.map(mod => (
              <div key={mod.code} className="py-3">
                <div className="flex items-start gap-3">
                  <input type="checkbox" checked={selections[mod.code] !== undefined}
                    onChange={() => toggleElective(mod.code)}
                    className="w-4 h-4 mt-0.5 accent-blue-700 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{mod.name}</p>
                    <ModuleSkills mod={mod} />
                    {selections[mod.code] !== undefined && (
                      <select value={selections[mod.code] ?? ''} onChange={e => setGrade(mod.code, e.target.value)}
                        className="mt-2 border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full">
                        <option value="">Not graded yet</option>
                        {GRADE_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  )
}
