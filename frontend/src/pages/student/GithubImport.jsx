import { useState, useEffect, useCallback } from 'react'
import api from '../../api'
import { FormButtons, Modal, Spinner } from './profileParts'
import { errText, inputCls } from './profileUtils'

// Import from GitHub (8 Oct, her choice: alongside "+ Add", not instead of it). Lists the student's public repos
// (GET /profile/github/repos, one GitHub call), she ticks some, and each one is added through the normal
// POST /profile/projects, so an imported repo is an ordinary project: same skill extraction from the description,
// same languages rule (>= 10% of the code), and she can edit it afterwards. Repos already added are greyed out.

const NO_DESCRIPTION = 'Imported from GitHub. Edit this project to say what you built and the tools you used.'

export default function GithubImport({ githubLink, onClose, onDone }) {
  const [account, setAccount] = useState(githubLink || '')
  const [repos, setRepos] = useState(null)        // null = not listed yet
  const [picked, setPicked] = useState([])        // repo urls ticked
  const [listing, setListing] = useState(!!githubLink)   // the GitHub link is known: listing starts at once
  const [progress, setProgress] = useState('')    // "Adding 2 of 3…"
  const [error, setError] = useState('')

  // Ask the backend for the account's public repos; state changes only when the answer comes back
  const fetchRepos = useCallback((name) => api.get('/profile/github/repos', { params: { account: name } })
    .then(res => setRepos(res.data.repos))
    .catch(err => { setRepos(null); setError(errText(err, "Couldn't list the repositories. Please try again.")) })
    .finally(() => setListing(false)), [])

  const list = (name) => { setListing(true); setError(''); setPicked([]); fetchRepos(name) }

  // The GitHub link from Profile details is known: list straight away
  useEffect(() => { if (githubLink) fetchRepos(githubLink) }, [githubLink, fetchRepos])

  const toggle = (url) => setPicked(prev => prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url])

  // One at a time: each project asks the AI for its skills and GitHub for its languages
  const importPicked = async (e) => {
    e.preventDefault()
    const chosen = repos.filter(r => picked.includes(r.url))
    const notes = []
    for (const [i, r] of chosen.entries()) {
      setProgress(`Adding ${i + 1} of ${chosen.length}…`)
      try {
        const res = await api.post('/profile/projects', { name: r.name.slice(0, 100), github_url: r.url,
          description: r.description || NO_DESCRIPTION })
        if (!r.description) notes.push(`${r.name}: no description on GitHub, so add one (✎) to find more skills.`)
        const extra = [res.data.github_note, res.data.skills_note].filter(Boolean).join(' ')
        if (extra) notes.push(`${r.name}: ${extra}`)
      } catch (err) {
        notes.push(`${r.name} wasn't added: ${errText(err, 'please try again.')}`)
      }
    }
    setProgress('')
    onDone(notes.join(' '))
  }

  const busy = listing || progress !== ''
  return (
    <Modal title="Add projects from GitHub" onClose={onClose} dirty={picked.length > 0}>
      <form onSubmit={importPicked} className="space-y-4">
        <div className="flex gap-2">
          <input aria-label="GitHub username or profile link" value={account} onChange={e => setAccount(e.target.value)}
            placeholder="GitHub username or https://github.com/your-name" className={inputCls} disabled={busy}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (account.trim()) list(account) } }} />
          <button type="button" onClick={() => list(account)} disabled={busy || !account.trim()}
            className="shrink-0 px-4 text-sm font-medium text-blue-700 border border-blue-200 rounded-xl hover:bg-blue-50 disabled:opacity-40">
            {repos ? 'Refresh' : 'List'}
          </button>
        </div>

        {listing && <div className="flex justify-center py-6 text-blue-600"><Spinner /></div>}
        {error && <p role="alert" className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        {repos && !listing && (repos.length === 0
          ? <p className="text-sm text-gray-500">No public repositories of your own on this account.</p>
          : (
            <div>
              <p className="text-xs text-gray-500 mb-2">{repos.length} public {repos.length === 1 ? 'repository' : 'repositories'}. Tick the ones to add.</p>
              <ul className="space-y-2 max-h-80 overflow-y-auto -mx-1 px-1">
                {repos.map(r => (
                  <li key={r.url}>
                    <label className={`flex gap-3 border rounded-xl p-3 ${r.added ? 'border-gray-100 opacity-50' : 'border-gray-200 cursor-pointer hover:border-blue-300'}`}>
                      <input type="checkbox" className="mt-0.5 w-4 h-4 accent-blue-700 shrink-0" disabled={r.added || busy}
                        checked={picked.includes(r.url)} onChange={() => toggle(r.url)} />
                      <span className="min-w-0">
                        <span className="text-sm font-medium text-gray-800">{r.name}</span>
                        {r.added && <span className="text-xs text-gray-500 ml-2">already added</span>}
                        <span className="block text-xs text-gray-500 mt-0.5 truncate">
                          {[r.language, r.description || 'No description: add one after importing'].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}

        <FormButtons loading={progress !== ''} busyText={progress} onCancel={onClose} disabled={!picked.length || busy}
          label={picked.length === 1 ? 'Add 1 project' : picked.length ? `Add ${picked.length} projects` : 'Add projects'} />
      </form>
    </Modal>
  )
}
