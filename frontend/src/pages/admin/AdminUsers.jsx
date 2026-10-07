import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../../api'
import PageHeader from '../../components/PageHeader'
import { useAuth } from '../../context/useAuth'
import { ADMIN_COUNTS_CHANGED } from '../../components/Sidebar'
import ReasonDialog from './ReasonDialog'
import HistoryDialog from './HistoryDialog'
import RowMenu from './RowMenu'
import { DECISIONS } from './decisions'

// Admin > Users (7 Oct, her pick B after mock-ups; references.md "Admin Users table"). Every account, with:
//  - filter buttons with counts (All / Students / Employers / Waiting / Deactivated) instead of two dropdowns:
//    one click, and the number says what is there (Hearst, query previews); kept in the URL, so the dashboard's
//    cards still open a filtered list
//  - one "⋯" menu per row (Approve / Reject / Deactivate / Reactivate / View history), so no column keeps room for
//    buttons a row doesn't have; the reasons live in View history, so every row is one line high
//  - full width, with the spare space shared between Name, Role, Joined and Status and only the ⋯ column narrow,
//    so no single gap stands out (option B)
// Employers are approved here or from the dashboard's "Needs your action" (one click there).

const ROLE = { student: 'Student', employer: 'Employer', admin: 'Admin' }
// The column titles sit in their own strip above the scrolling list, so the scroll bar starts at the first account;
// both tables share these widths, and the strip keeps a scroll-bar gutter so the columns line up
const COLS = [['Name', '31%'], ['Role', '20%'], ['Joined', '22%'], ['Status', '20%'], ['Actions', '7%']]
const colgroup = <colgroup>{COLS.map(([n, w]) => <col key={n} style={{ width: w }} />)}</colgroup>
const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const LIMIT = 500   // the server returns at most this many accounts

// Filter buttons: each sets role / status in the URL
const FILTERS = [
  { key: 'all', label: 'All', role: '', status: '' },
  { key: 'students', label: 'Students', role: 'student', status: '' },
  { key: 'employers', label: 'Employers', role: 'employer', status: '' },
  { key: 'waiting', label: 'Waiting', role: 'employer', status: 'pending', warn: true },
  { key: 'deactivated', label: 'Deactivated', role: '', status: 'inactive' },
]

function Status({ u }) {
  if (!u.is_active) return <span className="text-xs font-medium rounded-full px-2 py-0.5 bg-rose-50 text-rose-700">Deactivated</span>
  if (u.employer_status === 'pending') return <span className="text-xs font-medium rounded-full px-2 py-0.5 bg-amber-100 text-amber-800">Waiting</span>
  if (u.employer_status === 'approved') return <span className="text-xs font-medium rounded-full px-2 py-0.5 bg-emerald-50 text-emerald-700">Approved</span>
  if (u.employer_status === 'rejected') return <span className="text-xs font-medium rounded-full px-2 py-0.5 bg-slate-100 text-slate-600">Rejected</span>
  return <span className="text-sm font-medium text-emerald-700">Active</span>
}

export default function AdminUsers() {
  const { user: me } = useAuth()
  const [params, setParams] = useSearchParams()
  const role = params.get('role') || ''
  const status = params.get('status') || ''
  const [q, setQ] = useState(params.get('q') || '')
  const [users, setUsers] = useState(null)
  const [counts, setCounts] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)
  const [asking, setAsking] = useState(null)     // { user, action }: the decision whose reason pop-up is open
  const [askError, setAskError] = useState('')
  const [history, setHistory] = useState(null)   // the user whose history pop-up is open
  const strip = useRef(null)                     // the column titles follow the list when it scrolls sideways

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value); else next.delete(key)
    setParams(next, { replace: true })
  }
  const pick = (f) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of [['role', f.role], ['status', f.status]]) { if (v) next.set(k, v); else next.delete(k) }
    setParams(next, { replace: true })
  }

  // Search waits until typing pauses, so each key press doesn't ask the server
  useEffect(() => {
    const t = setTimeout(() => { if (q !== (params.get('q') || '')) setFilter('q', q.trim()) }, 300)
    return () => clearTimeout(t)
  }, [q])   // eslint-disable-line react-hooks/exhaustive-deps

  const query = params.toString()
  const search = params.get('q') || ''
  const loadCounts = useCallback(() => {
    api.get(`/admin/users/counts${search ? `?q=${encodeURIComponent(search)}` : ''}`)
      .then(res => setCounts(res.data)).catch(() => setCounts(null))
  }, [search])
  useEffect(() => { loadCounts() }, [loadCounts])
  useEffect(() => {
    let cancelled = false
    api.get(`/admin/users${query ? `?${query}` : ''}`)
      .then(res => { if (!cancelled) { setUsers(res.data); setError('') } })
      .catch(() => { if (!cancelled) setError("Couldn't load the users. Is the backend running?") })
    return () => { cancelled = true }
  }, [query])

  const act = (id, action, reason) => {
    setBusy(id)
    api.post(`/admin/users/${id}/${action}`, reason === undefined ? undefined : { reason })
      .then(res => {
        setUsers(list => list.map(u => (u.id === id ? res.data : u)))
        setAsking(null)
        loadCounts()
        window.dispatchEvent(new Event(ADMIN_COUNTS_CHANGED))
      })
      .catch(err => {
        const msg = err.response?.data?.detail || "Couldn't save that. Try again."
        if (reason === undefined) setError(msg); else setAskError(msg)   // a pop-up shows its own error
      })
      .finally(() => setBusy(null))
  }

  const ask = (user, action) => { setAskError(''); setAsking({ user, action }) }
  const display = (u) => (u.role === 'employer' && u.company_name ? u.company_name : u.name)
  const active = FILTERS.find(f => f.role === role && f.status === status)?.key

  // What each row's ⋯ menu offers: approve / reject while waiting, reactivate when deactivated, history always
  const menuFor = (u) => {
    const self = u.id === me?.id
    const items = []
    if (u.is_active && u.role === 'employer' && u.employer_status !== 'approved') items.push({ label: 'Approve', onSelect: () => act(u.id, 'approve') })
    if (u.is_active && u.role === 'employer' && u.employer_status === 'pending') items.push({ label: 'Reject…', onSelect: () => ask(u, 'reject') })
    if (!self && !u.is_active) items.push({ label: 'Reactivate account…', onSelect: () => ask(u, 'reactivate') })
    items.push({ label: 'View history', onSelect: () => setHistory(u) })
    if (!self && u.role !== 'admin' && u.is_active) items.push({ label: 'Deactivate account…', danger: true, onSelect: () => ask(u, 'deactivate') })
    return items
  }

  return (
    <div className="h-screen flex flex-col">
      <PageHeader>
        <div className="pb-5">
          <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-widest mb-2">Admin</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Users</h1>
          <p className="text-sm text-slate-500 mt-1">Approve employers, and deactivate accounts that shouldn't sign in.</p>
        </div>
      </PageHeader>

      <div className="flex-1 min-h-0 flex flex-col gap-4 px-8 py-6">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* magnifying glass and ✕ to clear, the same as the Job Matches search (7 Oct, her review) */}
          <div className="relative w-80 max-w-full mr-1">
            <svg aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <label className="sr-only" htmlFor="user-search">Search users</label>
            <input id="user-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, email or company"
              onKeyDown={e => { if (e.key === 'Escape' && q) setQ('') }}
              className="w-full pl-9 pr-8 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {q && (
              <button type="button" onClick={() => setQ('')} aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-700">
                <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
            {FILTERS.map(f => {
              const on = active === f.key
              const n = counts?.[f.key]
              return (
                <button key={f.key} type="button" aria-pressed={on} onClick={() => pick(f)}
                  className={`px-3 py-1.5 text-sm rounded-full border transition ${on
                    ? 'bg-blue-700 border-blue-700 text-white'
                    : f.warn && n ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                  {f.label}
                  {n !== undefined && <span className={`ml-1.5 font-semibold tabular-nums ${on ? 'text-blue-100' : 'opacity-70'}`}>{n}</span>}
                </button>
              )
            })}
          </div>
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex-1 min-h-0 flex flex-col bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div ref={strip} aria-hidden="true" className="overflow-hidden [scrollbar-gutter:stable] bg-blue-100 border-b border-blue-200">
            <table className="w-full min-w-190 table-fixed text-xs">
              {colgroup}
              <thead>
                <tr className="text-left text-blue-900">
                  {COLS.map(([n]) => <th key={n} className="font-semibold uppercase tracking-wide px-4 py-2.5">{n === 'Actions' ? '' : n}</th>)}
                </tr>
              </thead>
            </table>
          </div>
          <div className="flex-1 min-h-0 overflow-auto [scrollbar-gutter:stable]"
            onScroll={e => { if (strip.current) strip.current.scrollLeft = e.currentTarget.scrollLeft }}>
            <table className="w-full text-sm min-w-190 table-fixed">
              {colgroup}
              {/* real column titles for screen readers; the visible ones are the strip above */}
              <thead>
                <tr>{COLS.map(([n]) => <th key={n} scope="col" className="p-0 h-0"><span className="sr-only">{n}</span></th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users === null && <tr><td colSpan={COLS.length} className="px-4 py-6 text-slate-500">Loading…</td></tr>}
                {users?.length === 0 && <tr><td colSpan={COLS.length} className="px-4 py-6 text-slate-500">No accounts match.</td></tr>}
                {users?.map(u => (
                  <tr key={u.id} className={u.is_active && u.employer_status === 'pending' ? 'bg-amber-50/70' : ''}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800 truncate">{display(u)}</p>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">
                        {u.role === 'employer' && u.company_name ? `${u.name} · ` : ''}{u.email}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{ROLE[u.role] || u.role}</td>
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{day(u.created_at)}</td>
                    <td className="px-4 py-3"><Status u={u} /></td>
                    <td className="px-4 py-3 text-right">
                      <RowMenu label={`Actions for ${display(u)}`} items={menuFor(u)} disabled={busy === u.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {users?.length >= LIMIT && (
          <p className="text-xs text-slate-500 -mt-2">Showing the newest {LIMIT} accounts. Search to find others.</p>
        )}
      </div>

      {asking && (
        <ReasonDialog decision={DECISIONS[asking.action]} name={display(asking.user)} busy={busy === asking.user.id}
          error={askError} onConfirm={reason => act(asking.user.id, asking.action, reason)} onCancel={() => setAsking(null)} />
      )}
      {history && <HistoryDialog user={history} name={display(history)} onClose={() => setHistory(null)} />}
    </div>
  )
}
