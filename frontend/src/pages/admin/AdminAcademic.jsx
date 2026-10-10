import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../../api'
import PageHeader from '../../components/PageHeader'
import { ADMIN_COUNTS_CHANGED } from '../../components/Sidebar'
import ModuleForm from './ModuleForm'
import RowMenu from './RowMenu'

// Admin > Academic structure (7 Oct, her pick A; references.md "Admin Academic structure layout"). Modules: a list on
// the left (by year, "To review" / "Reviewed") and the chosen module on the right, so the career office can work
// through the modules one after another without opening and closing pop-ups (Microsoft list/details pattern,
// side-by-side on wide screens). Each module's skills come from its description (IR Objective 1); the admin
// checks them, removes or adds one, or finds them again after editing the text. Intakes: the programme's intakes,
// which students pick at setup. Tab, module and filter are kept in the address.
// Intakes (10 Oct, her design; references.md "Module lists per intake"): next to the programme, an intake picker. The
// Modules tab shows the list of the intake picked (the latest by default): each intake has its own list, a new intake
// starts as a copy of the latest, and editing one intake never changes another. Modules new or changed against the
// intake before are marked, and the ones it dropped are listed at the bottom with "Put back".
// Programmes (10 Oct): a picker above the tabs switches between the 17 computing programmes (with each one's "to
// review" count). A module shared by several programmes is one module: its description, skills and review apply to
// all of them; its year and type are per programme, so they show for the programme picked.

const errText = (err, fallback) => err.response?.data?.detail || fallback
const shortDay = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

function SearchBox({ value, onChange, label, placeholder }) {
  return (
    <div className="relative flex-1 min-w-0">
      <svg aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
        fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input aria-label={label} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        onKeyDown={e => { if (e.key === 'Escape') onChange('') }}
        className="w-full pl-9 pr-9 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
      {/* Clear the search (her request 10 Oct); Esc does the same */}
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 inline-flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </div>
  )
}

const Chip = ({ reviewed }) => reviewed
  ? <span className="shrink-0 text-xs font-medium rounded-full px-2 py-0.5 bg-emerald-50 text-emerald-700">Reviewed</span>
  : <span className="shrink-0 text-xs font-medium rounded-full px-2 py-0.5 bg-amber-100 text-amber-800">To review</span>

// ── The chosen module ──────────────────────────────────────────────────────────────────────────────────────────────
function ModuleDetails({ id, programmeId, row, onChanged, onReviewed, onEdit, onRemove }) {
  const [mod, setMod] = useState(null)
  const [draft, setDraft] = useState('')
  const [newSkill, setNewSkill] = useState('')
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState('')          // which action is running
  const [error, setError] = useState('')
  const [showShared, setShowShared] = useState(false)   // the other programmes' codes, on request

  useEffect(() => {
    let cancelled = false     // the component is keyed by module id, so a new module starts with fresh state
    api.get(`/admin/modules/${id}`).then(res => { if (!cancelled) { setMod(res.data); setDraft(res.data.description) } })
      .catch(err => { if (!cancelled) setError(errText(err, "Couldn't load this module.")) })
    return () => { cancelled = true }
  }, [id])

  const run = (what, request, after) => {
    setBusy(what); setError('')
    return request()
      .then(res => { setMod(res.data); setDraft(res.data.description); onChanged(res.data); after?.(res.data) })
      .catch(err => setError(errText(err, "Couldn't save that. Try again.")))
      .finally(() => setBusy(''))
  }

  if (error && !mod) return <div className="p-6 text-sm text-rose-600">{error}</div>
  if (!mod) return <div className="p-6 text-sm text-slate-500">Loading…</div>

  const dirty = draft.trim() !== mod.description.trim()
  const reviewed = !!mod.reviewed_at
  // Year and type as taught in the programme picked; the other programmes that share this module
  const here = row || mod.programmes.find(p => p.id === programmeId) || { year: mod.year, type: mod.type }
  const others = mod.programmes.filter(p => p.id !== programmeId)
  const addSkill = (e) => {
    e.preventDefault()
    if (newSkill.trim()) run('add', () => api.post(`/admin/modules/${id}/skills`, { name: newSkill }), () => setNewSkill(''))
  }

  // Layout (her review 10 Oct, "crowded"): the body scrolls and the action bar stays at the bottom of the panel, so
  // "Mark as reviewed" is always in view; sections are spaced further apart; the list of programmes that share the
  // module is folded into one line ("Shared by 14 programmes") and opens on request.
  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Name and details on top with a line under them (her request 10 Oct); only the body below scrolls */}
      <div className="shrink-0 flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-slate-200">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-900">{mod.name}</h2>
          <p className="text-sm text-slate-500 mt-1">
            {mod.code} · Year {here.year} · {here.type}
            {others.length > 0 && (
              <> · <button type="button" onClick={() => setShowShared(v => !v)} aria-expanded={showShared}
                className="text-blue-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 rounded">
                Shared by {others.length + 1} programmes {showShared ? '▴' : '▾'}
              </button></>
            )}
          </p>
          {showShared && (
            <div className="mt-2.5">
              <ul className="flex flex-wrap gap-1.5" aria-label="Other programmes that teach this module">
                {others.map(p => <li key={p.id} className="text-xs font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600"
                  title={`Year ${p.year} · ${p.type}`}>{p.code}</li>)}
              </ul>
              <p className="text-xs text-slate-500 mt-1.5">Description, skills and review are the same in all of them.</p>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Chip reviewed={reviewed} />
          <RowMenu label={`More for ${mod.name}`} items={[
            { label: 'Edit details', onSelect: () => onEdit({ ...mod, year: here.year, type: here.type, shared: others.length }) },
            { label: 'Remove from this list…', danger: true, onSelect: () => onRemove(mod) },
          ]} />
        </div>
      </div>

    <div className="flex-1 min-h-0 overflow-y-auto px-6 pt-5 pb-5 flex flex-col gap-7">

      <div>
        <div className="flex items-baseline justify-between mb-2">
          <label htmlFor="module-description" className="text-sm font-semibold text-slate-700">Description</label>
          <span className="text-xs text-slate-500">Skills are found in this text</span>
        </div>
        <textarea id="module-description" rows={3} value={draft} onChange={e => setDraft(e.target.value)} maxLength={4000}
          className="w-full px-3 py-2.5 text-sm leading-relaxed text-slate-700 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        {dirty && (
          <div className="flex items-center justify-end gap-2 mt-2">
            <span className="text-xs text-slate-500 mr-auto">Saving marks the module "To review" again.</span>
            <button type="button" onClick={() => setDraft(mod.description)} disabled={!!busy}
              className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50">Cancel</button>
            <button type="button" disabled={!!busy}
              onClick={() => run('save', () => api.put(`/admin/modules/${id}/description`, { description: draft }))}
              className="px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {busy === 'save' ? 'Saving…' : 'Save description'}
            </button>
          </div>
        )}
      </div>

      <div>
        {/* The admin sets one skill list per module; every student who completes it gets the same list (her 10 Oct:
            students never set module skills, so the same module means the same skills for everyone) */}
        <div className="flex items-baseline justify-between mb-2.5">
          <h3 className="text-sm font-semibold text-slate-700">Skills ({mod.skills.length})</h3>
          <span className="text-xs text-slate-500">Every student who completes this module gets these skills</span>
        </div>
        <ul className="flex flex-wrap gap-2" aria-label="Skills">
          {mod.skills.map(s => (
            <li key={s.name} className={`inline-flex items-center gap-1 text-sm pl-3 pr-1.5 py-1 rounded-full border ${s.added_by_admin
              ? 'bg-white border-slate-300 text-slate-700' : 'bg-blue-50 border-blue-200 text-blue-800'}`}
              title={s.added_by_admin ? 'Added by an admin' : 'Found in the description'}>
              {s.name}
              <button type="button" aria-label={`Remove ${s.name}`} disabled={!!busy}
                onClick={() => run('remove', () => api.post(`/admin/modules/${id}/skills/remove`, { name: s.name }))}
                className="w-5 h-5 inline-flex items-center justify-center rounded-full hover:bg-black/10">×</button>
            </li>
          ))}
          <li>
            {adding ? (
              <form onSubmit={addSkill} className="inline-flex items-center gap-1.5">
                <input autoFocus aria-label="New skill" value={newSkill} onChange={e => setNewSkill(e.target.value)} maxLength={80}
                  onKeyDown={e => { if (e.key === 'Escape') { setAdding(false); setNewSkill('') } }} placeholder="e.g. SQL"
                  className="w-40 px-3 py-1 text-sm border border-slate-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button type="submit" disabled={!newSkill.trim() || !!busy}
                  className="px-3 py-1 text-sm font-medium rounded-full bg-blue-600 text-white disabled:opacity-40">Add</button>
              </form>
            ) : (
              <button type="button" onClick={() => setAdding(true)}
                className="text-sm px-3 py-1 rounded-full border border-dashed border-slate-300 text-slate-600 hover:bg-slate-50">+ Add skill</button>
            )}
          </li>
        </ul>
        {mod.skills.length === 0 && <p className="text-sm text-slate-500 mt-2">No skills yet: find them from the description or add one.</p>}
      </div>

      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
    </div>

      <div className="shrink-0 flex flex-wrap items-center justify-end gap-2 px-6 py-3.5 border-t border-slate-200 bg-slate-50/60 rounded-b-xl">
        <span className="text-xs text-slate-500 mr-auto">
          {reviewed ? `Reviewed ${shortDay(mod.reviewed_at)}` : 'Find skills again replaces the AI\'s skills; skills you added stay.'}
        </span>
        <button type="button" disabled={!!busy || dirty}
          title={dirty ? 'Save the description first' : undefined}
          onClick={() => run('extract', () => api.post(`/admin/modules/${id}/extract`))}
          className="px-3.5 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          {busy === 'extract' ? 'Finding skills…' : 'Find skills again'}
        </button>
        {reviewed ? (
          <button type="button" disabled={!!busy}
            onClick={() => run('review', () => api.post(`/admin/modules/${id}/review`, { reviewed: false }))}
            className="px-3.5 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50">
            Mark as to review
          </button>
        ) : (
          <button type="button" disabled={!!busy || dirty || mod.skills.length === 0}
            onClick={() => run('review', () => api.post(`/admin/modules/${id}/review`, { reviewed: true }), onReviewed)}
            className="px-3.5 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
            {busy === 'review' ? 'Saving…' : 'Mark as reviewed'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Intakes ────────────────────────────────────────────────────────────────────────────────────────────────────────
// A new intake's module list starts as a copy of another intake's (the latest is picked). APU gives each year of study
// its own code (APU1F…, APU2F…, APU3F…), so the group's later codes can be listed too: students find their intake by
// the code on their current timetable.
const monthYear = (iso) => new Date(iso).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })

function Intakes({ programmeId, intakes, setIntakes, onOpen }) {
  const [code, setCode] = useState('')
  const [start, setStart] = useState('')
  const [others, setOthers] = useState('')
  const [copyFrom, setCopyFrom] = useState(intakes[0]?.id ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const add = (e) => {
    e.preventDefault(); setBusy(true); setError('')
    api.post('/admin/intakes', { programme_id: programmeId, code, start_date: start, other_codes: others,
      copy_from: copyFrom === '' ? null : Number(copyFrom) })
      .then(res => { setIntakes(res.data.intakes); setCode(''); setStart(''); setOthers(''); setCopyFrom(res.data.intakes[0]?.id ?? '') })
      .catch(err => setError(errText(err, "Couldn't add the intake.")))
      .finally(() => setBusy(false))
  }
  const remove = (i) => {
    setError('')
    api.delete(`/admin/intakes/${i.id}`).then(res => setIntakes(res.data))
      .catch(err => setError(errText(err, "Couldn't delete the intake.")))
  }
  const field = 'w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    // the add form beside the list (same side-by-side layout as Modules), so the page uses its full width
    // only the table scrolls (her 10 Oct): the row fills the space under the header, the table card scrolls inside it
    <div className="flex-1 min-h-0 flex items-start gap-4">
      <form onSubmit={add} className="w-96 shrink-0 bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-700">Add an intake</h2>
        <div>
          <label htmlFor="intake-code" className="block text-xs font-medium text-slate-600 mb-1">Intake code (Year 1)</label>
          <input id="intake-code" value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. APU1F2609CS(DA)" maxLength={30} className={field} />
        </div>
        <div>
          <label htmlFor="intake-start" className="block text-xs font-medium text-slate-600 mb-1">Starts</label>
          <input id="intake-start" type="date" value={start} onChange={e => setStart(e.target.value)} className={field} />
        </div>
        <div>
          <label htmlFor="intake-others" className="block text-xs font-medium text-slate-600 mb-1">Later codes of this group <span className="font-normal text-slate-400">(optional)</span></label>
          <input id="intake-others" value={others} onChange={e => setOthers(e.target.value)} placeholder="e.g. APU2F2709CS(DA), APU3F2805CS(DA)" maxLength={200} className={field} />
        </div>
        <div>
          <label htmlFor="intake-copy" className="block text-xs font-medium text-slate-600 mb-1">Start its module list as a copy of</label>
          <select id="intake-copy" value={copyFrom} onChange={e => setCopyFrom(e.target.value)} className={field}>
            {intakes.length === 0 && <option value="">The programme's list</option>}
            {intakes.map((i, n) => <option key={i.id} value={i.id}>{i.code}{n === 0 ? ' (latest)' : ''} · {i.modules} modules</option>)}
          </select>
        </div>
        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
        <button type="submit" disabled={busy || code.trim().length < 3 || !start}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">Add intake</button>
        <p className="text-xs text-slate-500">Change the copied list with Edit list; other intakes keep their own lists.</p>
      </form>
      <div className="flex-1 min-w-0 self-stretch flex flex-col">
      <div className="min-h-0 bg-white border border-slate-200 rounded-xl overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0">
            <tr className="text-left text-xs text-blue-900 bg-blue-100">
              <th scope="col" className="font-semibold uppercase tracking-wide px-3 py-2.5">Intake</th>
              <th scope="col" className="font-semibold uppercase tracking-wide px-3 py-2.5">Starts</th>
              <th scope="col" className="font-semibold uppercase tracking-wide px-3 py-2.5">Module list</th>
              <th scope="col" className="font-semibold uppercase tracking-wide px-3 py-2.5">Students</th>
              <th scope="col" className="px-3 py-2.5"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {intakes.length === 0 && <tr><td colSpan={5} className="px-4 py-5 text-slate-500">No intakes yet. Add the first one; it copies the programme's list.</td></tr>}
            {intakes.map(i => (
              <tr key={i.id}>
                <td className="px-3 py-3 whitespace-nowrap">
                  <span className="font-medium text-slate-800">{i.code}</span>
                  {i.other_codes && <span className="block text-xs text-slate-500">{i.other_codes}</span>}
                </td>
                <td className="px-3 py-3 text-slate-700 whitespace-nowrap">{i.start_date ? shortDay(i.start_date) : '—'}</td>
                <td className="px-3 py-3 text-slate-700">
                  <span className="whitespace-nowrap">{i.modules} modules
                    {i.latest && <span className="ml-1.5 text-xs font-medium rounded-full px-2 py-0.5 bg-blue-50 text-blue-700">Latest</span>}</span>
                  <span className={`block text-xs ${i.changes ? 'text-amber-700' : 'text-slate-500'}`}>{i.compared_with
                    ? (i.changes ? `${i.changes} change${i.changes > 1 ? 's' : ''} from ${i.compared_with}` : `Same as ${i.compared_with}`)
                    : 'First intake'}</span>
                </td>
                <td className="px-3 py-3 text-slate-700 tabular-nums">{i.students}</td>
                <td className="px-3 py-3 text-right whitespace-nowrap">
                  <button type="button" onClick={() => onOpen(i)} className="text-sm text-blue-700 hover:underline">Edit list</button>
                  {i.students === 0 && (
                    <button type="button" onClick={() => remove(i)} className="ml-3 text-sm text-rose-700 hover:underline">Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  )
}

// ── Add a module to the list: from the catalogue (keeps its description and skills), or a new one ─────────────────
function AddModule({ scope, scopeLabel, onAdded, onNew, onCancel }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)
  const [year, setYear] = useState('')      // '' = as in the catalogue: the year and type the module was created with
  const [type, setType] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const words = q.trim()
    if (words.length < 2) return
    const t = setTimeout(() => api.get('/admin/catalogue', { params: { q: words, ...scope } })
      .then(res => setResults(res.data)).catch(() => setResults([])), 250)
    return () => clearTimeout(t)
  }, [q, scope])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  const shownResults = q.trim().length < 2 ? null : results   // fewer than two letters: nothing searched yet
  const add = (m) => {
    setBusy(true); setError('')
    api.post('/admin/list/modules', { ...scope, module_id: m.id, year: Number(year || m.year), type: type || m.type })
      .then(() => onAdded(m))
      .catch(err => setError(errText(err, "Couldn't add the module.")))
      .finally(() => setBusy(false))
  }
  const field = 'px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 bg-slate-900/30" onMouseDown={() => { if (!busy) onCancel() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="add-module-title" onMouseDown={e => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[80vh] flex flex-col">
        <div className="px-6 pt-5 pb-4 border-b border-slate-100">
          <h2 id="add-module-title" className="text-base font-semibold text-slate-900">Add a module to {scopeLabel}</h2>
          <p className="text-sm text-slate-500 mt-1">Pick one from the catalogue: it keeps its description and skills.</p>
          <div className="mt-3"><SearchBox value={q} onChange={setQ} label="Search the catalogue" placeholder="Search by name or code" /></div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span>Add as</span>
            <select aria-label="Year" value={year} onChange={e => setYear(e.target.value)} className={field}>
              <option value="">Catalogue year</option>
              {[1, 2, 3, 4].map(y => <option key={y} value={y}>Year {y}</option>)}
            </select>
            <select aria-label="Type" value={type} onChange={e => setType(e.target.value)} className={field}>
              <option value="">Catalogue type</option>
              <option value="common">Common</option><option value="specialised">Specialised</option><option value="elective">Elective</option>
            </select>
          </div>
          <p className="text-xs text-slate-500 mt-1.5">Catalogue year and type are those shown under each module. Change them only if this intake teaches it differently.</p>
        </div>
        <ul className="flex-1 overflow-y-auto px-6 py-3 flex flex-col gap-2" aria-label="Catalogue results">
          {shownResults === null && <li className="text-sm text-slate-500 py-2">Type at least two letters.</li>}
          {shownResults?.length === 0 && <li className="text-sm text-slate-500 py-2">Nothing found. Create it as a new module instead.</li>}
          {shownResults?.map(m => (
            <li key={m.id} className={`flex items-center justify-between gap-3 px-3 py-2.5 border border-slate-200 rounded-lg ${m.in_list ? 'text-slate-400' : ''}`}>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{m.name}</span>
                <span className="block text-xs text-slate-500">
                  {m.code} · {m.in_list ? 'already in this list' : `Year ${m.year} · ${m.type.charAt(0).toUpperCase() + m.type.slice(1)} · ${m.skills} skill${m.skills === 1 ? '' : 's'} · ${m.reviewed ? 'Reviewed' : 'To review'} · in ${m.programmes} programme${m.programmes === 1 ? '' : 's'}`}
                </span>
              </span>
              {!m.in_list && <button type="button" disabled={busy} onClick={() => add(m)}
                className="shrink-0 px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">Add</button>}
            </li>
          ))}
        </ul>
        {error && <p role="alert" className="px-6 text-sm text-rose-600">{error}</p>}
        <div className="flex justify-between gap-2 px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl">
          <button type="button" onClick={onNew} className="text-sm font-medium text-blue-700 hover:underline">Not in the catalogue? Create a new module</button>
          <button type="button" onClick={onCancel} disabled={busy}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">Close</button>
        </div>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────────────────────────────────────────
export default function AdminAcademic() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'intakes' ? 'intakes' : 'modules'
  const onlyToReview = params.get('show') === 'todo'
  const selected = Number(params.get('m')) || null
  const programmeParam = Number(params.get('p')) || null
  const intakeParam = Number(params.get('i')) || null
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [form, setForm] = useState(null)        // null, { mode: 'add' } or { mode: 'edit', module }
  const [picking, setPicking] = useState(false) // the "Add a module" pop-up (catalogue)
  const [formBusy, setFormBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [removing, setRemoving] = useState(null) // the module whose "Remove?" pop-up is open
  const [notice, setNotice] = useState('')      // e.g. the AI didn't answer when a module was added
  const [tick, setTick] = useState(0)           // reloads the details after an edit

  const set = useCallback((changes) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) { if (v) next.set(k, v); else next.delete(k) }
    setParams(next, { replace: true })
  }, [params, setParams])

  const reload = useCallback(() => api.get('/admin/academic', {
    params: intakeParam ? { intake_id: intakeParam } : programmeParam ? { programme_id: programmeParam } : {} })
    .then(res => { setData(res.data); return res.data })
    .catch(err => setError(errText(err, "Couldn't load the academic structure. Is the backend running?"))), [programmeParam, intakeParam])
  useEffect(() => { reload() }, [reload])
  const programmeId = data?.programme.id
  const intake = data?.intake || null
  // The list being looked at: the intake's, else (no intakes yet) the programme's own list
  const scope = useMemo(() => (intake ? { intake_id: intake.id } : { programme_id: programmeId }), [intake, programmeId])
  const scopeLabel = intake ? `intake ${intake.code}` : data?.programme.code

  // From the dashboard's "to review" link (no programme picked): open the first programme that has modules to review
  useEffect(() => {
    if (!data || programmeParam || !onlyToReview) return
    if (data.modules.some(m => !m.reviewed)) return
    const next = data.programmes.find(p => p.to_review > 0)
    if (next) set({ p: String(next.id), m: '' })
  }, [data, programmeParam, onlyToReview, set])

  const openForm = (f) => { setFormError(''); setForm(f) }
  const saveForm = (fields) => {
    setFormBusy(true); setFormError('')
    const body = { ...fields, ...scope }
    const req = form.mode === 'add' ? api.post('/admin/modules', body) : api.put(`/admin/modules/${form.module.id}`, body)
    req.then(res => reload().then(() => {
      setForm(null); setNotice(res.data.warning || '')
      setTick(t => t + 1)
      set({ m: String(res.data.id), show: '' })
      window.dispatchEvent(new Event(ADMIN_COUNTS_CHANGED))
    }))
      .catch(err => setFormError(errText(err, "Couldn't save the module.")))
      .finally(() => setFormBusy(false))
  }
  const confirmRemove = () => {
    setFormBusy(true); setFormError('')
    api.delete(`/admin/modules/${removing.id}`, { params: scope })
      .then(() => reload().then(() => {
        setRemoving(null); setNotice(''); set({ m: '' })
        window.dispatchEvent(new Event(ADMIN_COUNTS_CHANGED))
      }))
      .catch(err => setFormError(errText(err, "Couldn't remove the module.")))
      .finally(() => setFormBusy(false))
  }

  const modules = useMemo(() => data?.modules || [], [data])
  const selectedRow = modules.find(m => m.id === selected)
  // "Put back" a module the intake before had (same year and type as there)
  const putBack = (m) => api.post('/admin/list/modules', { ...scope, module_id: m.id, year: m.year,
    type: m.type.toLowerCase() }).then(() => reload().then(() => set({ m: String(m.id) })))
    .catch(err => setNotice(errText(err, "Couldn't put it back.")))
  const toReview = modules.filter(m => !m.reviewed).length
  const shown = useMemo(() => {
    const words = q.trim().toLowerCase()
    return modules.filter(m => (!onlyToReview || !m.reviewed)
      && (!words || `${m.name} ${m.code}`.toLowerCase().includes(words)))
  }, [modules, q, onlyToReview])
  const years = [...new Set(shown.map(m => m.year))]

  // Nothing chosen yet: open the first module to review (or the first one)
  useEffect(() => {
    if (tab === 'modules' && !selected && modules.length) {
      set({ m: String((modules.find(m => !m.reviewed) || modules[0]).id) })
    }
  }, [tab, selected, modules, set])

  const onChanged = (d) => {
    setData(old => {
      const was = old.modules.find(m => m.id === d.id)
      const delta = was ? Number(!!was.reviewed) - Number(!!d.reviewed_at) : 0     // +1 back to review, -1 reviewed
      const inProg = new Set(d.programmes.map(p => p.id))
      return { ...old,
        modules: old.modules.map(m => (m.id === d.id ? { ...m, reviewed: !!d.reviewed_at, skills: d.skills.length } : m)),
        programmes: old.programmes.map(p => (inProg.has(p.id) ? { ...p, to_review: p.to_review + delta } : p)) }
    })
    window.dispatchEvent(new Event(ADMIN_COUNTS_CHANGED))
  }
  // After "Mark as reviewed", move on to the next module still to review
  const onReviewed = (d) => {
    const i = modules.findIndex(m => m.id === d.id)
    const next = [...modules.slice(i + 1), ...modules.slice(0, i)].find(m => !m.reviewed && m.id !== d.id)
    if (next) set({ m: String(next.id) })
  }

  const tabCls = (on) => `pb-3 text-sm border-b-2 -mb-px ${on ? 'border-blue-600 text-blue-700 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-800'}`

  return (
    <div className="h-screen flex flex-col">
      <PageHeader>
        <div className="pt-0">
          <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-widest mb-2">Admin</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Academic structure</h1>
          <p className="text-sm text-slate-500 mt-1">Check the skills found in each module's description.</p>
          {data && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label htmlFor="programme" className="text-sm font-medium text-slate-700">Programme</label>
              <select id="programme" value={programmeId} onChange={e => { setQ(''); set({ p: e.target.value, i: '', m: '' }) }}
                className="w-124 max-w-full min-w-0 px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                {data.programmes.map(p => (
                  <option key={p.id} value={p.id}>{p.name}{p.to_review ? ` (${p.to_review} to review)` : ''}</option>
                ))}
              </select>
              {data.intakes.length > 0 && (<>
                <label htmlFor="intake" className="ml-2 text-sm font-medium text-slate-700">Intake</label>
                <select id="intake" value={intake?.id ?? ''} onChange={e => set({ i: e.target.value, m: '' })}
                  className="min-w-0 px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {data.intakes.map(i => (
                    <option key={i.id} value={i.id}>{i.code}{i.start_date ? ` · ${monthYear(i.start_date)}` : ''}{i.latest ? ' · latest' : ''}</option>
                  ))}
                </select>
              </>)}
            </div>
          )}
          <div role="tablist" className="flex gap-6 mt-4">
            <button role="tab" aria-selected={tab === 'modules'} className={tabCls(tab === 'modules')}
              onClick={() => set({ tab: '' })}>Modules <span className="text-slate-400 font-normal ml-0.5">{modules.length || ''}</span></button>
            <button role="tab" aria-selected={tab === 'intakes'} className={tabCls(tab === 'intakes')}
              onClick={() => set({ tab: 'intakes' })}>Intakes <span className="text-slate-400 font-normal ml-0.5">{data?.intakes.length ?? ''}</span></button>
          </div>
        </div>
      </PageHeader>

      <div className="flex-1 min-h-0 px-8 py-6 flex flex-col">
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {data && tab === 'intakes' && (
          <Intakes key={programmeId} programmeId={programmeId} intakes={data.intakes}
            setIntakes={() => reload()} onOpen={i => set({ tab: '', i: String(i.id), m: '' })} />
        )}
        {data && tab === 'modules' && (
          <p className="-mt-2 mb-3 text-sm text-slate-600">
            {intake
              ? <>Module list of intake <b className="font-semibold">{intake.code}</b>{intake.latest ? ' (latest)' : ''}. Changes apply to this intake only{intake.compared_with ? <>; marked against {intake.compared_with}</> : ''}.</>
              : <>No intakes yet: this is the programme's list, copied into its first intake.</>}
          </p>
        )}
        {data && tab === 'modules' && (
          <div className="flex-1 min-h-0 flex gap-4">
            <section aria-label="Modules" className="w-88 shrink-0 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden">
              <div className="p-3 flex flex-wrap gap-2 border-b border-slate-100">
                <div className="basis-full flex"><SearchBox value={q} onChange={setQ} label="Search modules" placeholder="Search modules" /></div>
                <button type="button" aria-pressed={onlyToReview} onClick={() => set({ show: onlyToReview ? '' : 'todo' })}
                  className={`shrink-0 px-3 py-1.5 text-sm rounded-full border ${onlyToReview
                    ? 'bg-blue-700 border-blue-700 text-white'
                    : toReview ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100' : 'bg-white border-slate-200 text-slate-700'}`}>
                  To review <span className="font-semibold tabular-nums">{toReview}</span>
                </button>
                <button type="button" onClick={() => setPicking(true)}
                  className="ml-auto shrink-0 px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700">+ Add module</button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {shown.length === 0 && <p className="p-4 text-sm text-slate-500">{onlyToReview && !q ? 'All modules are reviewed.' : 'No modules match.'}</p>}
                {years.map(y => (
                  <div key={y}>
                    {/* Light grey band (her pick A, 10 Oct): the dark band drew the eye away from the chosen module */}
                    <p className="sticky top-0 z-10 px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 border-y border-slate-200">
                      Year {y} <span className="font-normal text-slate-500">· {shown.filter(m => m.year === y).length} modules</span>
                    </p>
                    <ul>
                      {shown.filter(m => m.year === y).map(m => (
                        <li key={m.id}>
                          <button type="button" aria-current={m.id === selected ? 'true' : undefined} onClick={() => { setNotice(''); set({ m: String(m.id) }) }}
                            className={`w-full text-left flex items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-50 ${m.id === selected
                              ? 'bg-blue-50 shadow-[inset_3px_0_0_#2563eb]' : 'hover:bg-slate-50'}`}>
                            <span className="min-w-0">
                              <span className="block text-sm text-slate-800 line-clamp-2">{m.name}</span>
                              <span className="block text-xs text-slate-400">{m.code} · {m.skills} skill{m.skills === 1 ? '' : 's'}
                                {m.status === 'new' && <span className="text-emerald-700 font-medium"> · New in this intake</span>}
                                {m.status === 'changed' && <span className="text-amber-700 font-medium"> · {m.type} here</span>}
                              </span>
                            </span>
                            <Chip reviewed={m.reviewed} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {/* Modules the intake before had but this one doesn't (her mock-up: crossed out, "Put back") */}
                {data.removed.length > 0 && !onlyToReview && !q && (
                  <div>
                    <p className="sticky top-0 z-10 px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 border-y border-slate-200">
                      Not in this intake <span className="font-normal text-slate-500">· were in {intake?.compared_with}</span>
                    </p>
                    <ul>
                      {data.removed.map(m => (
                        <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-50">
                          <span className="min-w-0 text-slate-400">
                            <span className="block text-sm line-through">{m.name}</span>
                            <span className="block text-xs">{m.code} · Year {m.year} · {m.type}</span>
                          </span>
                          <button type="button" onClick={() => putBack(m)} className="shrink-0 text-sm text-blue-700 hover:underline">Put back</button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
            <section aria-label="Module details" className="flex-1 min-w-0 flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden">
              {notice && <p role="status" className="mx-6 mt-5 -mb-1 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{notice}</p>}
              {selected ? <ModuleDetails key={`${selected}-${tick}`} id={selected} programmeId={programmeId} row={selectedRow} onChanged={onChanged} onReviewed={onReviewed}
                  onEdit={mod => openForm({ mode: 'edit', module: mod })} onRemove={mod => { setFormError(''); setRemoving(mod) }} />
                : <p className="p-6 text-sm text-slate-500">Choose a module on the left.</p>}
            </section>
          </div>
        )}
      </div>

      {picking && <AddModule scope={scope} scopeLabel={scopeLabel} onCancel={() => setPicking(false)}
        onNew={() => { setPicking(false); openForm({ mode: 'add' }) }}
        onAdded={m => { setPicking(false); reload().then(() => set({ m: String(m.id), show: '' })) }} />}
      {form && <ModuleForm module={form.module} scopeLabel={scopeLabel} busy={formBusy} error={formError} onSave={saveForm} onCancel={() => setForm(null)} />}
      {removing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30" onMouseDown={() => { if (!formBusy) setRemoving(null) }}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="remove-title" onMouseDown={e => e.stopPropagation()}
            onKeyDown={e => { if (e.key === 'Escape' && !formBusy) setRemoving(null) }}
            className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 pt-5">
              <h2 id="remove-title" className="text-base font-semibold text-slate-900">Remove {removing.name}?</h2>
              <p className="text-sm text-slate-600 mt-1.5">
                {removing.code} is taken out of {scopeLabel}. {intake ? 'Other intakes keep their own lists' : 'Other programmes keep it'};
                the module and its skills are deleted only when no list has it any more.
                {' '}Only possible while no student of {intake ? 'this intake' : 'this programme'} has entered a grade for it.
              </p>
              {formError && <p role="alert" className="text-sm text-rose-600 mt-3">{formError}</p>}
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 mt-5 bg-slate-50 border-t border-slate-100 rounded-b-2xl">
              <button type="button" autoFocus onClick={() => setRemoving(null)} disabled={formBusy}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={confirmRemove} disabled={formBusy}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-40">
                {formBusy ? 'Removing…' : 'Remove from list'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
