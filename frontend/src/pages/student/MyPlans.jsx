import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api'
import PageHeader from '../../components/PageHeader'
import { Busy } from '../../components/Spinner'
import ChatMarkdown from './ChatMarkdown'

const dateFormat = new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium' })

function PlanIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9l-6-6ZM13 3v6h6M8 13h8m-8 4h6" />
    </svg>
  )
}

export default function MyPlans() {
  const [order, setOrder] = useState('newest')
  const [removing, setRemoving] = useState(null)
  const [notice, setNotice] = useState('')
  const [removeError, setRemoveError] = useState('')
  const [page, setPage] = useState(1)
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const request = new AbortController()
    api.get('/chatbot/plans', { params: { page, order }, signal: request.signal })
      .then(({ data }) => { if (!request.signal.aborted) setResult(data) })
      .catch(err => {
        if (request.signal.aborted) return
        setError(err.response?.status === 503
          ? 'Chat history is unavailable right now. You can still use the AI Assistant.'
          : 'Couldn’t load your learning plans. Try again.')
      })
    return () => request.abort()
  }, [page, order, attempt])

  const changePage = next => {
    setResult(null)
    setError('')
    setPage(next)
  }

  const removePlan = async plan => {
    if (!window.confirm(`Remove “${plan.title}” from My plans? The original conversation will stay in AI Assistant.`)) return
    setRemoving(plan)
    setNotice('')
    setRemoveError('')
    try {
      await api.delete(`/chatbot/plans/${encodeURIComponent(plan.session_id)}/${plan.key}`)
      setNotice(`Removed “${plan.title}” from My plans.`)
      if (page > 1 && result.plans.length === 1 && !result.has_next) changePage(page - 1)
      else {
        setResult(null)
        setAttempt(n => n + 1)
      }
    } catch (err) {
      if (err.response?.status === 404) {
        setNotice('That plan is no longer available.')
        setResult(null)
        setAttempt(n => n + 1)
      } else {
        setRemoveError('Couldn’t remove the plan. Try again.')
      }
    } finally {
      setRemoving(null)
    }
  }

  return (
    <>
      <PageHeader>
        <div className="flex flex-wrap items-end justify-between gap-3 pb-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">My plans</h1>
            <p className="mt-1 text-sm text-muted">Revisit learning plans from your AI Assistant chats.</p>
          </div>
          <Link to="/chatbot" className="head-cta min-h-11 px-4 text-sm">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
              <path d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-5l-5 5v-5Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Open AI Assistant
          </Link>
        </div>
      </PageHeader>

      <section aria-labelledby="learning-plans-title" className="mx-4 mt-4 mb-8 sm:mx-8">
        {notice && <p role="status" className="mb-3 text-sm text-have-strong">{notice}</p>}
        {removeError && <p role="alert" className="mb-3 text-sm text-rose-700">{removeError}</p>}
        <div className="src-head mb-3 justify-between">
          <h2 id="learning-plans-title">Learning plans</h2>
          <div role="group" aria-label="Sort plans by date" className="flex flex-wrap gap-2">
            {[['newest', 'Newest first'], ['oldest', 'Oldest first']].map(([value, label]) => (
              <button key={value} type="button" aria-pressed={order === value} disabled={!!removing}
                onClick={() => {
                  if (order === value) return
                  setOrder(value)
                  changePage(1)
                }}
                className={`min-h-11 rounded-full border px-3.5 text-sm font-medium disabled:opacity-50 ${order === value
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {error ? (
          <div className="rounded-2xl border border-line bg-white p-5">
            <p role="alert" className="text-sm text-ink-soft">{error}</p>
            <button type="button" className="acad-btn edit mt-3 min-h-11" onClick={() => {
              setError('')
              setAttempt(n => n + 1)
            }}>Try again</button>
          </div>
        ) : result === null ? (
          <div role="status" className="rounded-2xl border border-line bg-white p-5 text-sm text-muted"><Busy>Loading plans…</Busy></div>
        ) : result.plans.length === 0 ? (
          <div className="rounded-2xl border border-line bg-white px-5 py-12 text-center">
            <span aria-hidden="true" className="mx-auto mb-3 grid size-12 place-items-center rounded-xl bg-accent-soft text-accent-strong">
              <PlanIcon />
            </span>
            <h2 className="text-base font-semibold text-ink">{page === 1 ? 'No learning plans yet' : 'No plans on this page'}</h2>
            {page === 1 && <p className="mx-auto mt-1 max-w-sm text-sm text-muted">Ask for a learning plan in AI Assistant. It will appear here when the chat is saved.</p>}
          </div>
        ) : (
          <ul className="grid gap-3">
            {result.plans.map(plan => (
              <li key={`${plan.session_id}-${plan.message_index}`}>
                <details className="group overflow-hidden rounded-2xl border border-line bg-white open:border-line-strong open:shadow-sm">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 hover:bg-well focus-visible:outline-offset-[-3px] sm:px-5 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0">
                      <span className="block wrap-anywhere text-[15px] font-semibold text-blue-700">{plan.title}</span>
                      {plan.created_at && (
                        <time className="mt-0.5 block text-[13px] text-muted" dateTime={plan.created_at}>
                          {dateFormat.format(new Date(plan.created_at))}
                        </time>
                      )}
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-medium text-blue-700">
                      <span className="group-open:hidden">Details</span>
                      <span className="hidden group-open:inline">Hide</span>
                      <svg className="group-open:rotate-180" width="14" height="14" viewBox="0 0 24 24"
                        fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </summary>
                  <div className="min-w-0 border-t border-line px-4 py-4 sm:px-5">
                    <ChatMarkdown>{plan.content}</ChatMarkdown>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 border-t border-blue-200 bg-[#e8f1ff] px-4 py-3 sm:px-5">
                    <Link to="/chatbot" state={{ from: 'My plans', openSession: plan.session_id }}
                      className="inline-flex min-h-11 items-center justify-center rounded-lg bg-accent-strong px-3.5 text-sm font-semibold text-white transition-colors hover:bg-accent active:bg-blue-950">Open conversation</Link>
                    <button type="button" disabled={!!removing} onClick={() => removePlan(plan)}
                      className="min-h-11 rounded-lg border border-rose-300 bg-white px-3.5 text-sm font-semibold text-rose-800 transition-colors hover:border-rose-400 hover:bg-rose-50 enabled:active:bg-rose-200 disabled:opacity-60">
                      {removing === plan ? <Busy>Removing…</Busy> : 'Remove from My plans'}
                    </button>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}

        {(page > 1 || result?.has_next) && (
          <nav aria-label="Learning plan pages" className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" className="acad-btn edit min-h-11 disabled:opacity-50" disabled={removing || page === 1 || (!result && !error)}
              onClick={() => changePage(page - 1)}>Previous</button>
            <span className="text-sm text-muted">Page {page}</span>
            <button type="button" className="acad-btn edit min-h-11 disabled:opacity-50" disabled={removing || !result?.has_next}
              onClick={() => changePage(page + 1)}>Next</button>
          </nav>
        )}
      </section>
    </>
  )
}
