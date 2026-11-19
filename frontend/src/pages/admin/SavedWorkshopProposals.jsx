import { useConfirmation } from '../../components/useConfirmation'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api'
import PageHeader from '../../components/PageHeader'
import { Busy } from '../../components/Spinner'
import { skillName } from '../../skillName'

const updatedDate = new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium' })
const newProposal = '/admin/workshop?new=1'
const unavailable = 'Saving isn’t available right now. Try again in a moment.'

export default function SavedWorkshopProposals() {
  const { confirm, confirmation } = useConfirmation()
  const [proposals, setProposals] = useState(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [deleting, setDeleting] = useState(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api.get('/admin/workshop/proposals')
      .then(({ data }) => { if (active) setProposals(data) })
      .catch(() => { if (active) setLoadFailed(true) })
    return () => { active = false }
  }, [attempt])

  const retry = () => {
    setLoadFailed(false)
    setAttempt(n => n + 1)
  }

  const remove = async proposal => {
    if (!await confirm({
      title: 'Delete saved proposal?',
      message: `“${proposal.title}” will be permanently deleted from Saved proposals.`,
      confirmLabel: 'Delete proposal',
      danger: true,
    })) return
    setDeleting(proposal.id)
    setError('')
    setNotice('')
    try {
      await api.delete(`/admin/workshop/proposals/${proposal.id}`)
      setProposals(items => items.filter(item => item.id !== proposal.id))
      setNotice(`Deleted “${proposal.title}”.`)
    } catch (err) {
      setError(err.response?.status === 503 ? unavailable : 'Couldn’t delete the proposal. Try again.')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <>
      {confirmation}
      <PageHeader>
        <div className="flex flex-wrap items-end justify-between gap-3 pb-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Saved proposals</h1>
            <p className="mt-1 text-sm text-muted">Reopen a workshop proposal to edit it or export a PDF.</p>
          </div>
          <Link to={newProposal} className="head-cta inline-flex min-h-11 items-center px-4 text-sm">+ New proposal</Link>
        </div>
      </PageHeader>

      <section aria-label="Workshop proposals" className="mx-4 mt-4 mb-8 sm:mx-8">
        {notice && <p role="status" className="mb-3 text-sm text-ink-soft">{notice}</p>}
        {error && <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p>}
        {loadFailed ? (
          <div className="rounded-2xl border border-line bg-white p-5">
            <p role="alert" className="text-sm text-ink-soft">{unavailable}</p>
            <button type="button" onClick={retry} className="acad-btn edit mt-3 min-h-11">Try again</button>
          </div>
        ) : proposals === null ? (
          <div role="status" className="p-5 text-sm text-muted"><Busy>Loading proposals…</Busy></div>
        ) : proposals.length === 0 ? (
          <div className="rounded-2xl border border-line bg-white p-5">
            <h2 className="text-base font-semibold text-ink">No saved proposals yet</h2>
            <p className="mt-1 text-sm text-muted">Draft a workshop and save it to see it here.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
            {proposals.map(proposal => (
              <li key={proposal.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-[1_1_16rem]">
                  <h2 className="wrap-anywhere text-base font-semibold text-ink">{proposal.title}</h2>
                  <p className="mt-1 text-sm text-muted">
                    Updated <time dateTime={proposal.updated_at}>{updatedDate.format(new Date(proposal.updated_at))}</time>
                    {proposal.by && <> · Created by {proposal.by}</>}
                  </p>
                  {proposal.skills?.length > 0 && (
                    <p className="mt-1 wrap-anywhere text-sm text-ink-soft">{proposal.skills.map(skillName).join(' · ')}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={`/admin/workshop?proposal=${encodeURIComponent(proposal.id)}`}
                    aria-label={`Open ${proposal.title}`} className="acad-btn edit min-h-11">Open proposal</Link>
                  <button type="button" onClick={() => remove(proposal)} disabled={!!deleting}
                    aria-label={`Delete ${proposal.title}`} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-45">
                    {deleting === proposal.id ? <Busy>Deleting…</Busy> : 'Delete'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
