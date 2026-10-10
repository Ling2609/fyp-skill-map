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
        className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
  )
}

const Chip = ({ reviewed }) => reviewed
  ? <span className="shrink-0 text-xs font-medium rounded-full px-2 py-0.5 bg-emerald-50 text-emerald-700">Reviewed</span>
  : <span className="shrink-0 text-xs font-medium rounded-full px-2 py-0.5 bg-amber-100 text-amber-800">To review</span>

// ── The chosen module ──────────────────────────────────────────────────────────────────────────────────────────────
function ModuleDetails({ id, programmeId, onChanged, onReviewed, onEdit, onRemove }) {
  const [mod, setMod] = useState(null)
  const [draft, setDraft] = useState('')
  const [newSkill, setNewSkill] = useState('')
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState('')          // which action is running
  const [error, setError] = useState('')

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
  const here = mod.programmes.find(p => p.id === programmeId) || { year: mod.year, type: mod.type }
  const others = mod.programmes.filter(p => p.id !== programmeId)
  const addSkill = (e) => {
    e.preventDefault()
    if (newSkill.trim()) run('add', () => api.post(`/admin/modules/${id}/skills`, { name: newSkill }), () => setNewSkill(''))
  }

  return (
    <div className="p-6 flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-900">{mod.name}</h2>
          <p className="text-sm text-slate-500 mt-0.5">{mod.code} · Year {here.year} · {here.type}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Chip reviewed={reviewed} />
          <RowMenu label={`More for ${mod.name}`} items={[
            { label: 'Edit details', onSelect: () => onEdit({ ...mod, year: here.year, type: here.type, shared: others.length }) },
            { label: 'Remove module…', danger: true, onSelect: () => onRemove(mod) },
          ]} />
        </div>
      </div>

      {others.length > 0 && (
        <p className="-mt-2 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          Also taught in {others.length} other programme{others.length > 1 ? 's' : ''}: {others.map(p => p.code).join(', ')}.
          The description, skills and review apply to all of them.
        </p>
      )}

      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <label htmlFor="module-description" className="text-sm font-semibold text-slate-700">Description</label>
          <span className="text-xs text-slate-500">Skills are found in this text</span>
        </div>
        <textarea id="module-description" rows={4} value={draft} onChange={e => setDraft(e.target.value)} maxLength={4000}
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
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-700">Skills ({mod.skills.length})</h3>
          <span className="text-xs text-slate-500">
            {mod.students
              ? `${mod.students} student${mod.students > 1 ? 's have' : ' has'} this module; their matches use these skills`
              : 'Students who enter a grade for this module get these skills'}
          </span>
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

      <div className="flex flex-wrap items-center justify-end gap-2 pt-4 border-t border-slate-100">
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
function Intakes({ programmeId, intakes, setIntakes }) {
  const [code, setCode] = useState('')
  const [start, setStart] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const add = (e) => {
    e.preventDefault(); setBusy(true); setError('')
    api.post('/admin/intakes', { programme_id: programmeId, code, start_date: start })
      .then(res => { setIntakes(res.data); setCode(''); setStart('') })
      .catch(err => setError(errText(err, "Couldn't add the intake.")))
      .finally(() => setBusy(false))
  }
  const remove = (i) => {
    setError('')
    api.delete(`/admin/intakes/${i.id}`).then(res => setIntakes(res.data))
      .catch(err => setError(errText(err, "Couldn't delete the intake.")))
  }

  return (
    // the add form beside the list (same side-by-side layout as Modules), so the page uses its full width
    <div className="flex items-start gap-4">
      <form onSubmit={add} className="w-88 shrink-0 bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-700">Add an intake</h2>
        <div>
          <label htmlFor="intake-code" className="block text-xs font-medium text-slate-600 mb-1">Intake code</label>
          <input id="intake-code" value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. APD3F2409SE" maxLength={30}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label htmlFor="intake-start" className="block text-xs font-medium text-slate-600 mb-1">Starts</label>
          <input id="intake-start" type="date" value={start} onChange={e => setStart(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
        <button type="submit" disabled={busy || code.trim().length < 3 || !start}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">Add intake</button>
        <p className="text-xs text-slate-500">Students pick their intake when they first sign in.</p>
      </form>
      <div className="flex-1 min-w-0 bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-blue-900 bg-blue-100">
              <th scope="col" className="font-semibold uppercase tracking-wide px-4 py-2.5">Intake</th>
              <th scope="col" className="font-semibold uppercase tracking-wide px-4 py-2.5">Starts</th>
              <th scope="col" className="font-semibold uppercase tracking-wide px-4 py-2.5">Students</th>
              <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {intakes.length === 0 && <tr><td colSpan={4} className="px-4 py-5 text-slate-500">No intakes yet. Add the first one above.</td></tr>}
            {intakes.map(i => (
              <tr key={i.id}>
                <td className="px-4 py-3 font-medium text-slate-800">{i.code}</td>
                <td className="px-4 py-3 text-slate-700">{i.start_date ? shortDay(i.start_date) : '—'}</td>
                <td className="px-4 py-3 text-slate-700 tabular-nums">{i.students}</td>
                <td className="px-4 py-3 text-right">
                  {i.students === 0 && (
                    <button type="button" onClick={() => remove(i)} className="text-sm text-rose-700 hover:underline">Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [form, setForm] = useState(null)        // null, { mode: 'add' } or { mode: 'edit', module }
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

  const reload = useCallback(() => api.get('/admin/academic', { params: programmeParam ? { programme_id: programmeParam } : {} })
    .then(res => { setData(res.data); return res.data })
    .catch(err => setError(errText(err, "Couldn't load the academic structure. Is the backend running?"))), [programmeParam])
  useEffect(() => { reload() }, [reload])
  const programmeId = data?.programme.id

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
    const body = { ...fields, programme_id: programmeId }
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
    api.delete(`/admin/modules/${removing.id}`, { params: { programme_id: programmeId } })
      .then(() => reload().then(() => {
        setRemoving(null); setNotice(''); set({ m: '' })
        window.dispatchEvent(new Event(ADMIN_COUNTS_CHANGED))
      }))
      .catch(err => setFormError(errText(err, "Couldn't remove the module.")))
      .finally(() => setFormBusy(false))
  }

  const modules = useMemo(() => data?.modules || [], [data])
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
              <select id="programme" value={programmeId} onChange={e => { setQ(''); set({ p: e.target.value, m: '' }) }}
                className="max-w-full min-w-0 px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                {data.programmes.map(p => (
                  <option key={p.id} value={p.id}>{p.name}{p.to_review ? ` (${p.to_review} to review)` : ''}</option>
                ))}
              </select>
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
          <Intakes key={programmeId} programmeId={programmeId} intakes={data.intakes} setIntakes={list => setData(d => ({ ...d, intakes: list }))} />
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
                <button type="button" onClick={() => openForm({ mode: 'add' })}
                  className="ml-auto shrink-0 px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700">+ Add module</button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {shown.length === 0 && <p className="p-4 text-sm text-slate-500">{onlyToReview && !q ? 'All modules are reviewed.' : 'No modules match.'}</p>}
                {years.map(y => (
                  <div key={y}>
                    <p className="sticky top-0 z-10 px-4 py-2 text-xs font-semibold tracking-widest text-white bg-slate-600">YEAR {y}</p>
                    <ul>
                      {shown.filter(m => m.year === y).map(m => (
                        <li key={m.id}>
                          <button type="button" aria-current={m.id === selected ? 'true' : undefined} onClick={() => { setNotice(''); set({ m: String(m.id) }) }}
                            className={`w-full text-left flex items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-50 ${m.id === selected
                              ? 'bg-blue-50 shadow-[inset_3px_0_0_#2563eb]' : 'hover:bg-slate-50'}`}>
                            <span className="min-w-0">
                              <span className="block text-sm text-slate-800 truncate">{m.name}</span>
                              <span className="block text-xs text-slate-400">{m.code} · {m.skills} skill{m.skills === 1 ? '' : 's'}</span>
                            </span>
                            <Chip reviewed={m.reviewed} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
            <section aria-label="Module details" className="flex-1 min-w-0 self-start max-h-full overflow-y-auto bg-white border border-slate-200 rounded-xl">
              {notice && <p role="status" className="mx-6 mt-5 -mb-1 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{notice}</p>}
              {selected ? <ModuleDetails key={`${selected}-${tick}`} id={selected} programmeId={programmeId} onChanged={onChanged} onReviewed={onReviewed}
                  onEdit={mod => openForm({ mode: 'edit', module: mod })} onRemove={mod => { setFormError(''); setRemoving(mod) }} />
                : <p className="p-6 text-sm text-slate-500">Choose a module on the left.</p>}
            </section>
          </div>
        )}
      </div>

      {form && <ModuleForm module={form.module} programme={data?.programme} busy={formBusy} error={formError} onSave={saveForm} onCancel={() => setForm(null)} />}
      {removing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30" onMouseDown={() => { if (!formBusy) setRemoving(null) }}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="remove-title" onMouseDown={e => e.stopPropagation()}
            onKeyDown={e => { if (e.key === 'Escape' && !formBusy) setRemoving(null) }}
            className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 pt-5">
              <h2 id="remove-title" className="text-base font-semibold text-slate-900">Remove {removing.name}?</h2>
              <p className="text-sm text-slate-600 mt-1.5">
                {removing.programmes.length > 1
                  ? `${removing.code} is taken out of ${data?.programme.code}. The ${removing.programmes.length - 1} other programme${removing.programmes.length > 2 ? 's keep' : ' keeps'} it, with its skills.`
                  : `${removing.code} and its skills are deleted: no other programme teaches it.`}
                {' '}Only possible while no student of this programme has entered a grade for it.
              </p>
              {formError && <p role="alert" className="text-sm text-rose-600 mt-3">{formError}</p>}
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 mt-5 bg-slate-50 border-t border-slate-100 rounded-b-2xl">
              <button type="button" autoFocus onClick={() => setRemoving(null)} disabled={formBusy}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={confirmRemove} disabled={formBusy}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-40">
                {formBusy ? 'Removing…' : 'Remove module'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
