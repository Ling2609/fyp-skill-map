import { useConfirmation } from '../../components/useConfirmation'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../../api'
import PageHeader from '../../components/PageHeader'
import { Busy } from '../../components/Spinner'
import ChatMarkdown from './ChatMarkdown'
import { downloadLearningPlan } from './downloadLearningPlan'
import RowMenu from '../admin/RowMenu'

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
  const navigate = useNavigate()
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
        setRemoveError("Couldn't remove the plan. Try again.")
      }
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className="flex h-[calc(100dvh-var(--bar-h))] flex-col">
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

      <section aria-labelledby="learning-plans-title" className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-3.5 pb-4 sm:px-8">
        {notice && <p role="status" className="mb-3 shrink-0 text-sm text-have-strong">{notice}</p>}
        {removeError && <p role="alert" className="mb-3 shrink-0 text-sm text-rose-700">{removeError}</p>}
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
          <div className="emp-tile doc-card flex min-h-0 flex-col overflow-hidden! bg-white rounded-2xl border">
            <div className="adm-th shrink-0">
              <h2 id="learning-plans-title" className="adm-tt"><i><PlanIcon /></i>Learning plans</h2>
              <span className="text-xs text-muted">{result.plans.length}{result.has_next || page > 1 ? ` on page ${page}` : ''}</span>
              <div role="group" aria-label="Sort plans by date" className="doc-sort ml-auto">
                {[['newest', 'Newest'], ['oldest', 'Oldest']].map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={order === value} disabled={!!removing}
                    onClick={() => { if (order !== value) { setOrder(value); changePage(1) } }}>{label} first</button>
                ))}
              </div>
            </div>
            {/* 26 Nov (her review): the card head stays put; only the rows scroll */}
            <ul className="doc-list min-h-0 overflow-y-auto">
              {result.plans.map((plan, index) => {
                const id = `${plan.session_id}-${plan.message_index}`
                const open = expanded === id
                const contentId = `plan-content-${index}`
                return (
                  <li key={id}>
                    <div className="doc-row">
                      <div className="min-w-0">
                        <h3 className="doc-title">{plan.title}</h3>
                        <p className="doc-meta">
                          {plan.created_at && <time dateTime={plan.created_at}>{dateFormat.format(new Date(plan.created_at))}</time>}
                          {downloading === plan && <> · <Busy>Making PDF…</Busy></>}
                        </p>
                        {downloadError === plan && <p role="alert" className="doc-meta text-rose-800">Couldn’t make the PDF. Try again.</p>}
                      </div>
                      <div className="doc-acts">
                        <button type="button" aria-expanded={open} aria-controls={contentId} onClick={() => setExpanded(open ? null : id)} className="acad-btn edit h-9">
                          {open ? 'Hide plan' : 'View plan'}</button>
                        <RowMenu label={`More actions for ${plan.title}`} disabled={!!removing || !!downloading} items={[
                          { label: 'Download PDF', onSelect: () => download(plan) },
                          { label: 'Open conversation', onSelect: () => navigate('/chatbot', { state: { from: 'My Plans', openSession: plan.session_id } }) },
                          { label: 'Remove from My Plans…', danger: true, onSelect: () => removePlan(plan) },
                        ]} />
                      </div>
                    </div>
                    <div id={contentId} hidden={!open} className="doc-body">
                      {open && <ChatMarkdown>{plan.content.replace(/^#{1,4}[ \t]*Learning plan:[^\r\n]*\r?\n(?:[ \t]*\r?\n)*/i, '')}</ChatMarkdown>}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {(page > 1 || result?.has_next) && (
          <nav aria-label="Learning plan pages" className="mt-4 flex shrink-0 flex-wrap items-center gap-3">
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

