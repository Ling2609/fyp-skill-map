import { useConfirmation } from '../../components/useConfirmation'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api'
import PageHeader from '../../components/PageHeader'
import { Busy } from '../../components/Spinner'
import { skillName } from '../../skillName'
import RowMenu from './RowMenu'

const FOLDER = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
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
  const [exporting, setExporting] = useState(null)

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

  // the PDF straight from the list (22 Nov): the saved version, through the same export as the planner
  const exportPdf = async proposal => {
    setExporting(proposal.id); setError(''); setNotice('')
    try {
      const { data } = await api.get(`/admin/workshop/proposals/${proposal.id}`)
      const res = await api.post('/admin/workshop/pdf', data.proposal, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `workshop-proposal-${proposal.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'workshop'}.pdf`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      setError(err.response?.status === 503 ? unavailable : 'Couldn’t make the PDF. Try again.')
    } finally { setExporting(null) }
  }

  return (
    <>
      {confirmation}
      <PageHeader>
        <div className="pb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-widest mb-2">Admin · Workshops</p>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Workshops</h1>
            <p className="mt-1 text-sm text-muted">Plan workshops on the skills students lack. Saved proposals stay here to edit or export.</p>
          </div>
          <Link to={newProposal} className="head-cta inline-flex min-h-11 items-center px-4 text-sm">+ Plan a workshop</Link>
        </div>
      </PageHeader>

      <section aria-label="Workshop proposals" className="mx-4 mt-3.5 mb-4 sm:mx-8">
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
          <div className="emp-tile doc-card bg-white rounded-2xl border">
            <div className="adm-th"><h2 className="adm-tt"><i>{FOLDER}</i>Saved proposals</h2><span className="text-xs text-muted">{proposals.length} · newest first</span></div>
            <ul className="doc-list">
              {proposals.map(proposal => (
                <li key={proposal.id} className="doc-row">
                  <div className="min-w-0">
                    <h3 className="doc-title">{proposal.title}</h3>
                    <p className="doc-meta">Updated <time dateTime={proposal.updated_at}>{updatedDate.format(new Date(proposal.updated_at))}</time>
                      {proposal.by && <> · by {proposal.by}</>}{exporting === proposal.id && <> · <Busy>Making PDF…</Busy></>}</p>
                    {proposal.skills?.length > 0 && <p className="doc-chips">{proposal.skills.map(k => <span key={k}>{skillName(k)}</span>)}</p>}
                  </div>
                  <div className="doc-acts">
                    <Link to={`/admin/workshop?proposal=${encodeURIComponent(proposal.id)}`} aria-label={`Open ${proposal.title}`} className="acad-btn edit h-9">Open</Link>
                    <RowMenu label={`More actions for ${proposal.title}`} disabled={!!deleting || !!exporting} items={[
                      { label: 'Export PDF', onSelect: () => exportPdf(proposal) },
                      { label: 'Delete…', danger: true, onSelect: () => remove(proposal) },
                    ]} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </>
  )
}
