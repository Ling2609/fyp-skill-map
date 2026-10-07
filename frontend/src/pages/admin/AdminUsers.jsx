import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../../api'
import PageHeader from '../../components/PageHeader'
import { useAuth } from '../../context/useAuth'
import { ADMIN_COUNTS_CHANGED } from '../../components/Sidebar'

// Admin > Users (7 Oct): every account, filtered by role / status / search (kept in the URL, so the dashboard's
// count cards open a filtered list). Employers are approved or rejected here; any account but an admin can be
// deactivated (signed out at once, can't sign in; nothing is deleted) and reactivated.

const STATUS = {
  pending: { label: 'Waiting', cls: 'bg-amber-100 text-amber-800' },
  approved: { label: 'Approved', cls: 'bg-emerald-50 text-emerald-700' },
  rejected: { label: 'Rejected', cls: 'bg-slate-100 text-slate-600' },
}
const ROLE = { student: 'Student', employer: 'Employer', admin: 'Admin' }
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
  const [confirmId, setConfirmId] = useState(null)   // asks "Deactivate?" inline before doing it

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

  const act = (id, action) => {
    setBusy(id)
    setConfirmId(null)
    api.post(`/admin/users/${id}/${action}`)
      .then(res => {
        setUsers(list => list.map(u => (u.id === id ? res.data : u)))
        window.dispatchEvent(new Event(ADMIN_COUNTS_CHANGED))
      })
      .catch(err => setError(err.response?.data?.detail || "Couldn't save that. Try again."))
      .finally(() => setBusy(null))
  }

  const btn = 'px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-50 whitespace-nowrap'
  const quiet = `${btn} border border-slate-200 text-slate-700 hover:bg-slate-50`

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
            className="flex-1 min-w-56 px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <label className="sr-only" htmlFor="role-filter">Role</label>
          <select id="role-filter" value={role} onChange={e => setFilter('role', e.target.value)}
            className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg">
            <option value="">All roles</option>
            <option value="student">Students</option>
            <option value="employer">Employers</option>
            <option value="admin">Admins</option>
          </select>
          <label className="sr-only" htmlFor="status-filter">Status</label>
          <select id="status-filter" value={status} onChange={e => setFilter('status', e.target.value)}
            className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg">
            <option value="">Any status</option>
            <option value="pending">Waiting for approval</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="inactive">Deactivated</option>
          </select>
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex-1 min-h-0 overflow-auto bg-white rounded-xl border border-slate-200">
          <table className="w-full text-sm min-w-190">
            <thead>
              <tr className="text-left text-xs text-slate-500 shadow-[inset_0_-1px_0_#f1f5f9]">
                <th scope="col" className="sticky top-0 z-10 bg-white font-medium px-4 py-3">Name</th>
                <th scope="col" className="sticky top-0 z-10 bg-white font-medium px-4 py-3">Role</th>
                <th scope="col" className="sticky top-0 z-10 bg-white font-medium px-4 py-3">Joined</th>
                <th scope="col" className="sticky top-0 z-10 bg-white font-medium px-4 py-3">Status</th>
                <th scope="col" className="sticky top-0 z-10 bg-white px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users === null && <tr><td colSpan={5} className="px-4 py-6 text-slate-500">Loading…</td></tr>}
              {users?.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-slate-500">No accounts match.</td></tr>}
              {users?.map(u => {
                const s = STATUS[u.employer_status]
                const self = u.id === me?.id
                return (
                  <tr key={u.id} className={u.is_active ? '' : 'bg-slate-50'}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{u.role === 'employer' && u.company_name ? u.company_name : u.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
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
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {u.role === 'employer' && u.employer_status !== 'approved' && (
                          <button className={`${btn} bg-blue-600 text-white hover:bg-blue-700`} disabled={busy === u.id}
                            onClick={() => act(u.id, 'approve')}>Approve</button>
                        )}
                        {u.role === 'employer' && u.employer_status === 'pending' && (
                          <button className={quiet} disabled={busy === u.id} onClick={() => act(u.id, 'reject')}>Reject</button>
                        )}
                        {!self && u.role !== 'admin' && u.is_active && confirmId !== u.id && (
                          <button className={quiet} disabled={busy === u.id} onClick={() => setConfirmId(u.id)}>Deactivate</button>
                        )}
                        {confirmId === u.id && (
                          <>
                            <span className="text-xs text-slate-600 self-center">Deactivate?</span>
                            <button className={`${btn} bg-rose-600 text-white hover:bg-rose-700`} onClick={() => act(u.id, 'deactivate')}>Yes</button>
                            <button className={quiet} onClick={() => setConfirmId(null)}>No</button>
                          </>
                        )}
                        {!self && !u.is_active && (
                          <button className={quiet} disabled={busy === u.id} onClick={() => act(u.id, 'reactivate')}>Reactivate</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {users?.length > 0 && <p className="shrink-0 text-xs text-slate-500">{users.length} account{users.length > 1 ? 's' : ''}</p>}
      </div>
    </div>
  )
}
