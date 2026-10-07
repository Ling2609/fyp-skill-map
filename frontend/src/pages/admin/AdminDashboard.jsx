import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api'
import PageHeader from '../../components/PageHeader'
import { skillName } from '../../skillName'
import { ADMIN_COUNTS_CHANGED } from '../../components/Sidebar'

// Admin home, layout D (7 Oct, her pick; references.md "Admin layout"): what needs action first and most visible
// (NN/g: "make important information visually salient"), then glanceable counts, then two panels the career office
// can act on. Totals only, never one student's data.

const fmtDay = (iso) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'
const ago = (iso) => {
  const days = Math.floor((Date.now() - new Date(iso)) / 864e5)
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
}

function Bar({ value, max }) {
  const pct = max ? Math.round((value / max) * 100) : 0
  return (
    <div className="h-2 rounded bg-slate-100" aria-hidden="true">
      <div className="h-2 rounded bg-blue-600" style={{ width: `${pct}%` }} />
    </div>
  )
}

export default function AdminDashboard() {
  const [data, setData] = useState(null)
  const [gaps, setGaps] = useState(null)      // null = loading (it runs the matching for every student)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)      // id of the employer being approved / rejected

  const load = useCallback(() => {
    return api.get('/admin/dashboard').then(res => setData(res.data))
      .catch(() => setError("Couldn't load the dashboard. Is the backend running?"))
  }, [])

  useEffect(() => {
    load()
    api.get('/admin/skill-gaps').then(res => setGaps(res.data)).catch(() => setGaps([]))
  }, [load])

  const decide = (id, action) => {
    setBusy(id)
    api.post(`/admin/users/${id}/${action}`)
      .then(() => { window.dispatchEvent(new Event(ADMIN_COUNTS_CHANGED)); return load() })
      .catch(err => setError(err.response?.data?.detail || "Couldn't save that. Try again."))
      .finally(() => setBusy(null))
  }

  const todo = data?.todo
  const waiting = todo ? todo.pending_employers.length : 0
  const toReview = todo?.modules_to_review || 0
  const actions = waiting + (toReview ? 1 : 0)
  const p = data?.profiles

  return (
    <div>
      <PageHeader>
        <div className="pb-5">
          <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-widest mb-2">Admin</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            {!data ? 'Loading…' : actions ? `${actions} thing${actions > 1 ? 's' : ''} need${actions > 1 ? '' : 's'} you today.` : 'Nothing needs you right now.'}
          </p>
        </div>
      </PageHeader>

      <div className="px-8 py-6 space-y-5">
        {error && <p className="text-sm text-rose-600">{error}</p>}

        {data && actions > 0 && (
          <section className="bg-white rounded-xl border border-amber-300">
            <h2 className="px-5 py-3 text-sm font-semibold text-amber-800 bg-amber-50 border-b border-amber-100 rounded-t-xl">
              Needs your action
            </h2>
            <ul className="divide-y divide-slate-100">
              {todo.pending_employers.map(u => (
                <li key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-60">
                    <p className="text-sm font-medium text-slate-800">{u.company_name || u.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Employer · {u.email} · registered {ago(u.created_at)}</p>
                  </div>
                  <button onClick={() => decide(u.id, 'reject')} disabled={busy === u.id}
                    className="px-3.5 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                    Reject
                  </button>
                  <button onClick={() => decide(u.id, 'approve')} disabled={busy === u.id}
                    className="px-3.5 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                    Approve
                  </button>
                </li>
              ))}
              {toReview > 0 && (
                <li className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-60">
                    <p className="text-sm font-medium text-slate-800">Module skills to review</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {toReview} module{toReview > 1 ? 's' : ''} not reviewed yet
                      {todo.modules_to_review_sample.length > 0 && ` · ${todo.modules_to_review_sample.map(m => m.name).join(', ')}${toReview > todo.modules_to_review_sample.length ? '…' : ''}`}
                    </p>
                  </div>
                  <span className="text-xs text-slate-500">Review comes with Academic structure</span>
                </li>
              )}
            </ul>
          </section>
        )}

        {data && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Students', value: data.counts.students, to: '/admin/users?role=student' },
              { label: 'Employers', value: data.counts.employers, to: '/admin/users?role=employer' },
              { label: 'Live jobs', value: data.counts.live_jobs, note: `Newest added ${fmtDay(data.counts.newest_live_job_at)}` },
              { label: 'Modules', value: data.counts.modules },
            ].map(c => {
              const body = (
                <>
                  <span className="block text-xs text-slate-500">{c.label}</span>
                  <span className="block mt-1.5 text-2xl font-semibold text-slate-900">{c.value}</span>
                  {c.note && <span className="block mt-1 text-xs text-slate-500">{c.note}</span>}
                </>
              )
              return c.to
                ? <Link key={c.label} to={c.to} className="bg-white rounded-xl border border-slate-200 px-4 py-3.5 hover:border-blue-300 transition">{body}</Link>
                : <div key={c.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3.5">{body}</div>
            })}
          </div>
        )}

        {data && (
          <div className="grid lg:grid-cols-2 gap-4">
            <section className="bg-white rounded-xl border border-slate-200">
              <div className="px-5 py-3 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-700">Most common skill gaps</h2>
                <p className="text-xs text-slate-500 mt-0.5">Skills students most often lack in their top job matches</p>
              </div>
              <div className="px-5 py-4">
                {gaps === null && <p className="text-sm text-slate-500">Working it out for every student…</p>}
                {gaps?.length === 0 && <p className="text-sm text-slate-500">No student has a skill profile yet.</p>}
                {gaps?.length > 0 && (
                  <ul className="space-y-3">
                    {gaps.map(g => (
                      <li key={g.skill} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm">
                        <span className="truncate text-slate-800">{skillName(g.skill)}</span>
                        <Bar value={g.students} max={g.of_students} />
                        <span className="text-xs text-slate-500 tabular-nums">{g.students} of {g.of_students}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="bg-white rounded-xl border border-slate-200">
              <div className="px-5 py-3 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-700">Student profiles</h2>
                <p className="text-xs text-slate-500 mt-0.5">Matching only works once grades are in</p>
              </div>
              <ul className="px-5 py-4 space-y-4 text-sm">
                {[
                  ['Grades entered', p.with_grades],
                  ['Added a project or certificate', p.with_project_or_cert],
                  ['Visible to employers', p.visible_to_employers],
                ].map(([label, n]) => (
                  <li key={label}>
                    <div className="flex justify-between mb-1.5">
                      <span className="text-slate-800">{label}</span>
                      <span className="text-xs text-slate-500 tabular-nums">{n} of {p.students}</span>
                    </div>
                    <Bar value={n} max={p.students} />
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
