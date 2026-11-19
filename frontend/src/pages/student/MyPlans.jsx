import { useConfirmation } from '../../components/useConfirmation'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api'
import PageHeader from '../../components/PageHeader'
import { Busy } from '../../components/Spinner'
import ChatMarkdown from './ChatMarkdown'
import { downloadLearningPlan } from './downloadLearningPlan'

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
  const { confirm, confirmation } = useConfirmation()
  const [expanded, setExpanded] = useState(null)
  const [order, setOrder] = useState('newest')
  const [downloading, setDownloading] = useState(null)
  const [downloadError, setDownloadError] = useState(null)
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
    setExpanded(null)
    setResult(null)
    setError('')
    setPage(next)
  }

  const download = async plan => {
    setDownloading(plan)
    setDownloadError(null)
    try {
      await downloadLearningPlan(plan.content, plan.job_id)
    } catch {
      setDownloadError(plan)
    } finally {
      setDownloading(null)
    }
  }

  const removePlan = async plan => {
    if (!await confirm({
      title: 'Remove learning plan?',
      message: `“${plan.title}” will be removed from My Plans. You can still find it in the original conversation.`,
      confirmLabel: 'Remove plan',
      danger: true,
    })) return
    setRemoving(plan)
    setNotice('')
    setRemoveError('')
    try {
      await api.delete(`/chatbot/plans/${encodeURIComponent(plan.session_id)}/${plan.key}`)
      setNotice(`Removed “${plan.title}” from My Plans.`)
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
    <div className="flex h-[calc(100dvh-var(--bar-h))] flex-col max-sm:h-[calc(100dvh_-_var(--bar-h)_-_6rem)]">
      {confirmation}
      <PageHeader>
        <div className="flex flex-wrap items-start justify-between gap-3 pb-4 pt-1">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-accent">My Plans</p>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">My Learning Plans</h1>
            <p className="mt-1 text-sm text-muted">Revisit learning plans from your AI Assistant chats.</p>
          </div>
          <Link to="/chatbot" className="head-cta mt-1 min-h-11 px-4 text-sm">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
              <path d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-5l-5 5v-5Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Open AI Assistant
          </Link>
        </div>
      </PageHeader>

      <section aria-labelledby="learning-plans-title" className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-8">
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
            {result.plans.map((plan, index) => {
              const id = `${plan.session_id}-${plan.message_index}`
              const open = expanded === id
              const contentId = `plan-content-${index}`
              return (
                <li key={id} className={`relative rounded-2xl border bg-white ${open ? 'border-line-strong shadow-sm' : 'border-line'}`}>
                  <div className="relative flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 sm:px-5">
                    <div className="min-w-0 flex-1 basis-32">
                      <h3 className="wrap-anywhere text-[15px] font-semibold text-blue-700">{plan.title}</h3>
                      {plan.created_at && (
                        <time className="mt-0.5 block text-[13px] text-muted" dateTime={plan.created_at}>
                          {dateFormat.format(new Date(plan.created_at))}
                        </time>
                      )}
                    </div>
                    <div className={`ml-auto flex flex-wrap items-center justify-end gap-2 ${open ? 'max-sm:w-full' : ''}`}>
                      {open && <>
                        <button type="button" disabled={!!downloading} onClick={() => download(plan)}
                          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-accent-strong px-3 text-[13px] font-bold text-white transition-colors hover:bg-accent active:bg-blue-950 disabled:opacity-60 sm:px-3.5">
                          {downloading === plan ? <Busy>Making PDF…</Busy> : (
                            <>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                <path d="M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                              Download PDF
                            </>
                          )}
                        </button>
                        <details className="relative" onBlur={event => {
                          if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false
                        }} onKeyDown={event => {
                          if (event.key !== 'Escape' || !event.currentTarget.open) return
                          event.stopPropagation()
                          event.currentTarget.open = false
                          event.currentTarget.querySelector('summary').focus()
                        }}>
                          <summary className="acad-btn edit min-h-11 cursor-pointer list-none gap-1.5 px-3 sm:px-3.5 [&::-webkit-details-marker]:hidden">
                            More actions
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                              <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </summary>
                          <div className="absolute right-0 z-10 mt-1 w-48 rounded-xl border border-line bg-white p-1 shadow-lg">
                            <Link to="/chatbot" state={{ from: 'My Plans', openSession: plan.session_id }}
                              className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-ink hover:bg-well">
                              Open conversation
                            </Link>
                            <button type="button" disabled={!!removing} onClick={() => removePlan(plan)}
                              className="flex min-h-11 w-full items-center rounded-lg border-t border-line px-3 text-left text-sm font-medium text-rose-800 hover:bg-rose-50 disabled:opacity-60">
                              {removing === plan ? <Busy>Removing…</Busy> : 'Remove from My Plans'}
                            </button>
                          </div>
                        </details>
                      </>}
                      <button type="button" aria-expanded={open} aria-controls={contentId}
                        onClick={() => setExpanded(open ? null : id)}
                        className={`inline-flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 text-xs font-medium text-blue-700 hover:bg-well ${open ? '' : 'after:absolute after:inset-0 after:rounded-2xl'}`}>
                        {open ? 'Hide' : 'Details'}
                        <svg className={open ? 'rotate-180' : ''} width="14" height="14" viewBox="0 0 24 24"
                          fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </div>
                    {open && downloadError === plan && <p role="alert" className="basis-full text-right text-sm text-rose-800">Couldn’t make the PDF. Try again.</p>}
                  </div>
                  <div id={contentId} hidden={!open} className="min-w-0 border-t border-line px-4 py-4 sm:px-5">
                    {open && <ChatMarkdown>{plan.content}</ChatMarkdown>}
                  </div>
                </li>
              )
            })}
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
    </div>
  )
}

