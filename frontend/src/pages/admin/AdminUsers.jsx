import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../../api'
import PageHeader from '../../components/PageHeader'
import { useAuth } from '../../context/useAuth'
import { ADMIN_COUNTS_CHANGED } from '../../components/Sidebar'
import ReasonDialog from './ReasonDialog'
import Select from './Select'
import { DECISIONS } from './decisions'

// Admin > Users (7 Oct): every account, filtered by role / status / search (kept in the URL, so the dashboard's
// count cards open a filtered list). Employers are approved or rejected here; any account but an admin can be
// deactivated (signed out at once, can't sign in; nothing is deleted) and reactivated.

const STATUS = {
  pending: { label: 'Waiting', cls: 'bg-amber-100 text-amber-800' },
  approved: { label: 'Approved', cls: 'bg-emerald-50 text-emerald-700' },
  rejected: { label: 'Rejected', cls: 'bg-slate-100 text-slate-600' },
}
const ROLE = { student: 'Student', employer: 'Employer', admin: 'Admin' }
// The latest decision, shown under the status: "Deactivated 7 Oct by Career Office · Graduated"
const DONE = { approve: 'Approved', reject: 'Rejected', deactivate: 'Deactivated', reactivate: 'Reactivated' }
// The column titles sit in their own strip above the scrolling list, so the scroll bar starts at the first account.
// Both tables share these widths; the strip keeps a scroll-bar gutter so the columns line up. Actions is measured
// from the buttons actually on screen (7 Oct, her review: no space kept for buttons a list doesn't have), so a list
// of students gets one button's width and a list with waiting employers gets three. Name takes what is left.
const COLS = [['Name', null], ['Role', '13%'], ['Joined', '15%'], ['Status', '24%'], ['Actions', 'measured']]
const colgroupFor = (actionsPx) => (
  <colgroup>
    {COLS.map(([n, w]) => <col key={n} style={w === 'measured' ? { width: actionsPx } : w ? { width: w } : undefined} />)}
  </colgroup>
)
const short = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export default function AdminUsers() {
  const { user: me } = useAuth()
  const [params, setParams] = useSearchParams()
  const role = params.get('role') || ''
  const status = params.get('status') || ''
  const [q, setQ] = useState(params.get('q') || '')
  const [users, setUsers] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)
  const [asking, setAsking] = useState(null)   // { user, action }: the decision whose reason pop-up is open
  const [askError, setAskError] = useState('')
  const strip = useRef(null)                     // the column titles follow the list when it scrolls sideways
  const body = useRef(null)
  const [actionsPx, setActionsPx] = useState(0)  // widest row of buttons + the cell's padding

  // Measure the widest row of buttons after each change, so the Actions column is exactly as wide as it needs to be
  useLayoutEffect(() => {
    const widths = [...(body.current?.querySelectorAll('[data-actions]') || [])].map(e => e.scrollWidth)
    setActionsPx(widths.length ? Math.max(...widths) + 32 : 0)
  }, [users])

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value); else next.delete(key)
    setParams(next, { replace: true })
  }

  // Search waits until typing pauses, so each key press doesn't ask the server
  useEffect(() => {
    const t = setTimeout(() => { if (q !== (params.get('q') || '')) setFilter('q', q.trim()) }, 300)
    return () => clearTimeout(t)
  }, [q])   // eslint-disable-line react-hooks/exhaustive-deps

  const query = params.toString()
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
        window.dispatchEvent(new Event(ADMIN_COUNTS_CHANGED))
      })
      .catch(err => {
        const msg = err.response?.data?.detail || "Couldn't save that. Try again."
        if (reason === undefined) setError(msg); else setAskError(msg)   // a pop-up shows its own error
      })
      .finally(() => setBusy(null))
  }

  const btn = 'px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-50 whitespace-nowrap'
  const quiet = `${btn} border border-slate-200 text-slate-700 hover:bg-slate-50`
  const ask = (user, action) => { setAskError(''); setAsking({ user, action }) }
  const display = (u) => (u.role === 'employer' && u.company_name ? u.company_name : u.name)

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
        <div className="flex flex-wrap items-center gap-3">
          <label className="sr-only" htmlFor="user-search">Search users</label>
          <input id="user-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, email or company"
            className="flex-1 min-w-56 max-w-xl px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <Select id="role-filter" label="Role" value={role} onChange={e => setFilter('role', e.target.value)}>
            <option value="">All roles</option>
            <option value="student">Students</option>
            <option value="employer">Employers</option>
            <option value="admin">Admins</option>
          </Select>
          <Select id="status-filter" label="Status" value={status} onChange={e => setFilter('status', e.target.value)}>
            <option value="">Any status</option>
            <option value="pending">Waiting for approval</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="inactive">Deactivated</option>
          </Select>
          {/* PatternFly: with no pagination, the item count is the toolbar's last element */}
          {users && (
            <span className="ml-auto text-sm text-slate-600 whitespace-nowrap tabular-nums" aria-live="polite">
              <span className="font-semibold text-slate-900">{users.length}</span> account{users.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex-1 min-h-0 flex flex-col bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div ref={strip} aria-hidden="true" className="overflow-hidden [scrollbar-gutter:stable] bg-blue-100 border-b border-blue-200">
            <table className="w-full min-w-190 table-fixed text-xs">
              {colgroupFor(actionsPx)}
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
            {colgroupFor(actionsPx)}
            {/* real column titles for screen readers; the visible ones are the strip above */}
            <thead>
              <tr>{COLS.map(([n]) => <th key={n} scope="col" className="p-0 h-0"><span className="sr-only">{n}</span></th>)}</tr>
            </thead>
            <tbody ref={body} className="divide-y divide-slate-100">
              {users === null && <tr><td colSpan={COLS.length} className="px-4 py-6 text-slate-500">Loading…</td></tr>}
              {users?.length === 0 && <tr><td colSpan={COLS.length} className="px-4 py-6 text-slate-500">No accounts match.</td></tr>}
              {users?.map(u => {
                const s = STATUS[u.employer_status]
                const self = u.id === me?.id
                return (
                  <tr key={u.id} className={u.is_active ? '' : 'bg-slate-50'}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800 truncate">{display(u)}</p>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">
                        {u.role === 'employer' && u.company_name ? `${u.name} · ` : ''}{u.email}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{ROLE[u.role] || u.role}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{day(u.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {!u.is_active && <span className="text-xs font-medium rounded-full px-2 py-0.5 bg-rose-50 text-rose-700">Deactivated</span>}
                        {u.is_active && s && <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${s.cls}`}>{s.label}</span>}
                        {u.is_active && !s && <span className="text-xs text-slate-500">Active</span>}
                      </div>
                      {u.last_action && (
                        <p className="text-xs text-slate-500 mt-1">
                          {DONE[u.last_action.action]} {short(u.last_action.at)} by {u.last_action.by}
                          {u.last_action.reason && <span className="text-slate-600"> · {u.last_action.reason}</span>}
                        </p>
                      )}
                    </td>
                    {/* right-aligned, so in a mixed list every Deactivate lines up under the others */}
                    <td className="px-4 py-3 text-right">
                      <div data-actions className="inline-flex gap-2">
                        {u.role === 'employer' && u.employer_status !== 'approved' && (
                          <button className={`${btn} bg-blue-600 text-white hover:bg-blue-700`} disabled={busy === u.id}
                            onClick={() => act(u.id, 'approve')}>Approve</button>
                        )}
                        {u.role === 'employer' && u.employer_status === 'pending' && (
                          <button className={quiet} disabled={busy === u.id} onClick={() => ask(u, 'reject')}>Reject</button>
                        )}
                        {!self && u.role !== 'admin' && u.is_active && (
                          <button className={quiet} disabled={busy === u.id} onClick={() => ask(u, 'deactivate')}>Deactivate</button>
                        )}
                        {!self && !u.is_active && (
                          <button className={quiet} disabled={busy === u.id} onClick={() => ask(u, 'reactivate')}>Reactivate</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      {asking && (
        <ReasonDialog decision={DECISIONS[asking.action]} name={display(asking.user)} busy={busy === asking.user.id}
          error={askError} onConfirm={reason => act(asking.user.id, asking.action, reason)} onCancel={() => setAsking(null)} />
      )}
    </div>
  )
}
