import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../../api'
import { FormButtons, Modal, SkillChecker, SkillChip, Spinner } from './profileParts'
import { ADDED_BY_YOU, MIN_DESCRIPTION, errText, inputCls, mergeFound, projectKey } from './profileUtils'

// Import from GitHub (8 Oct, her choice: alongside "+ Add", not instead of it).
// 10 Oct (her review: repos were saved first and had to be edited afterwards): two steps, check before adding
// (references.md "Projects tab and GitHub import": check answers; Microsoft wizard guidance, smart defaults).
//  1. Pick: her public repos (GET /profile/github/repos, one GitHub call); ones already added are greyed out.
//  2. Check: every picked repo gets a description (GitHub's, else the README's first paragraph, GET
//     /profile/github/readme) and its skills (POST /profile/projects/suggest: her words + the repo's languages), all
//     at once. Each card says Ready or what it needs; she glances at the ready ones and fixes only the rest. One button
//     adds the ready ones as ordinary projects, with the skills she checked.

const keyOf = (it) => projectKey({ name: it.name, description: it.description, github_url: it.url })
const isReady = (it) => it.description.trim().length >= MIN_DESCRIPTION && it.skills.length > 0
  && it.foundFor === keyOf(it) && !it.busy

export default function GithubImport({ githubLink, onClose, onDone }) {
  const [account, setAccount] = useState(githubLink || '')
  const [repos, setRepos] = useState(null)        // null = not listed yet
  const [picked, setPicked] = useState([])        // repo urls ticked
  const [listing, setListing] = useState(!!githubLink)   // the GitHub link is known: listing starts at once
  const [items, setItems] = useState(null)        // step 2: the picked repos being checked
  const [adding, setAdding] = useState('')        // "Adding 2 of 3…"
  const [error, setError] = useState('')

  // Ask the backend for the account's public repos; state changes only when the answer comes back
  const fetchRepos = useCallback((name) => api.get('/profile/github/repos', { params: { account: name } })
    .then(res => setRepos(res.data.repos))
    .catch(err => { setRepos(null); setError(errText(err, "Couldn't list the repositories. Please try again.")) })
    .finally(() => setListing(false)), [])
  const list = (name) => { setListing(true); setError(''); setPicked([]); fetchRepos(name) }
  useEffect(() => { if (githubLink) fetchRepos(githubLink) }, [githubLink, fetchRepos])
  const toggle = (url) => setPicked(prev => prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url])

  const update = (url, changes) => setItems(prev => prev.map(it => (it.url === url
    ? { ...it, ...(typeof changes === 'function' ? changes(it) : changes) } : it)))

  // Skills for one card (her words if there is a sentence, plus the repo's languages); nothing is saved
  const inFlight = useRef(new Set())   // leaving the box and clicking "Find skills" must not ask twice
  const find = async (it) => {
    if (inFlight.current.has(it.url)) return
    inFlight.current.add(it.url)
    update(it.url, { busy: true, notes: [] })
    try {
      const res = await api.post('/profile/projects/suggest', { name: it.name, description: it.description.trim(), github_url: it.url })
      update(it.url, cur => ({ skills: mergeFound(cur.skills, res.data.skills), foundFor: keyOf(it), busy: false,
        notes: [res.data.skills_note, res.data.github_note].filter(Boolean) }))
    } catch (err) {
      update(it.url, { busy: false, foundFor: keyOf(it), notes: [errText(err, "Couldn't find skills right now. Type them yourself.")] })
    } finally { inFlight.current.delete(it.url) }
  }

  // Step 1 -> 2: fill in each description, then find each one's skills, one repo after another
  const check = async () => {
    const chosen = repos.filter(r => picked.includes(r.url))
    const start = chosen.map(r => ({ url: r.url, name: r.name.slice(0, 100), description: r.description || '',
      source: r.description ? 'github' : '', skills: [], foundFor: null, busy: true, notes: [], open: false }))
    setItems(start)
    for (const it of start) {
      let current = it
      if (!it.description) {
        try {
          const res = await api.get('/profile/github/readme', { params: { url: it.url } })
          if (res.data.text) current = { ...it, description: res.data.text.slice(0, 3000), source: 'readme' }
        } catch { /* no README text: she writes the description */ }
        update(it.url, { description: current.description, source: current.source })
      }
      await find(current)
    }
    // Cards that still need something open by themselves
    setItems(prev => prev.map(x => ({ ...x, open: !isReady(x) })))
  }

  const ready = (items || []).filter(isReady)
  const addReady = async () => {
    const failed = []
    for (const [i, it] of ready.entries()) {
      setAdding(`Adding ${i + 1} of ${ready.length}…`)
      try {
        await api.post('/profile/projects', { name: it.name, description: it.description.trim(), github_url: it.url,
          skills: Object.fromEntries(it.skills.map(s => [s.name, s.evidence])) })
      } catch (err) {
        failed.push(`${it.name} wasn't added: ${errText(err, 'please try again.')}`)
      }
    }
    setAdding('')
    onDone(failed.join(' '))
  }

  const dirty = picked.length > 0
  if (items) return (
    <Modal title={`Check your ${items.length} project${items.length === 1 ? '' : 's'}`} onClose={onClose} dirty wide>
      <p className="text-sm text-gray-500 -mt-1 mb-4">Skills were found in each description and in the repo's code. Remove any that don't fit, then add.</p>
      <ul className="space-y-3">
        {items.map(it => <CheckCard key={it.url} it={it} update={update} find={find}
          onRemove={() => setItems(prev => prev.filter(x => x.url !== it.url))} />)}
      </ul>
      <div className="flex flex-wrap items-center gap-3 pt-5">
        <button type="button" onClick={() => setItems(null)} disabled={!!adding} className="text-sm text-blue-700 hover:underline">Back to the list</button>
        <span className="flex-1" />
        <span className="text-sm text-gray-500">{ready.length} of {items.length} ready</span>
        <button type="button" onClick={addReady} disabled={!ready.length || !!adding || items.some(x => x.busy)}
          className="bg-blue-700 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-blue-800 disabled:opacity-40 flex items-center gap-2">
          {adding ? <><Spinner size="sm" />{adding}</> : ready.length ? `Add ${ready.length} project${ready.length === 1 ? '' : 's'}` : 'Add projects'}
        </button>
      </div>
    </Modal>
  )

  const busy = listing
  return (
    <Modal title="Add projects from GitHub" onClose={onClose} dirty={dirty}>
      <form onSubmit={e => { e.preventDefault(); if (picked.length) check() }} className="space-y-4">
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
              <p className="text-xs text-gray-500 mb-2">{repos.length} public {repos.length === 1 ? 'repository' : 'repositories'}. Tick the ones to add; you check each one next.</p>
              <ul className="space-y-2 max-h-80 overflow-y-auto -mx-1 px-1">
                {repos.map(r => (
                  <li key={r.url}>
                    <label className={`flex gap-3 border rounded-xl p-3 ${r.added ? 'border-gray-100 opacity-50' : 'border-gray-200 cursor-pointer hover:border-blue-300 hover:bg-blue-50/40'}`}>
                      <input type="checkbox" className="mt-0.5 w-4 h-4 accent-blue-700 shrink-0" disabled={r.added || busy}
                        checked={picked.includes(r.url)} onChange={() => toggle(r.url)} />
                      <span className="min-w-0">
                        <span className="text-sm font-medium text-gray-800">{r.name}</span>
                        {r.added && <span className="text-xs text-gray-500 ml-2">already added</span>}
                        <span className="block text-xs text-gray-500 mt-0.5 truncate">
                          {[r.language, r.description || 'No description on GitHub'].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}

        <FormButtons loading={false} onCancel={onClose} disabled={!picked.length || busy}
          label={picked.length ? `Next: check ${picked.length} project${picked.length === 1 ? '' : 's'}` : 'Next'} />
      </form>
    </Modal>
  )
}

// One picked repo on the check page. Ready ones stay closed (description on one line + skills); "Edit" opens them.
function CheckCard({ it, update, find, onRemove }) {
  const length = it.description.trim().length
  const found = it.foundFor !== null
  const stale = found && it.foundFor !== keyOf(it)
  const ready = isReady(it)
  // The description changed (or was too short) since the skills were found: they must be found for this text.
  // 10 Oct (her test): the status said "Find the skills again" but wasn't a button, so she couldn't tell what to do.
  const canFind = length >= MIN_DESCRIPTION && !it.busy && (!found || stale)
  const status = it.busy ? { text: 'Finding skills…', cls: 'text-blue-700' }
    : ready ? { text: 'Ready', cls: 'text-green-700' }
    : length < MIN_DESCRIPTION ? { text: 'Needs a description', cls: 'text-amber-700' }
    : canFind ? { text: 'Skills not updated', cls: 'text-amber-700' }
    : { text: 'Needs a skill', cls: 'text-amber-700' }
  const tip = (e) => (!e || e === ADDED_BY_YOU || e.startsWith('GitHub:') ? e : `“${e}”`)

  return (
    <li className={`border rounded-xl px-4 py-3 ${ready || it.busy ? 'border-gray-200' : 'border-amber-300 bg-amber-50/40'}`}>
      <div className="flex items-baseline gap-3">
        <span className="text-sm font-semibold text-gray-800 flex-1 min-w-0 truncate">{it.name}</span>
        <span className={`text-xs font-medium ${status.cls}`}>{status.text}</span>
        {canFind && (
          <button type="button" onClick={() => find(it)}
            className="text-xs font-medium text-white bg-blue-700 rounded-md px-2.5 py-1 hover:bg-blue-800">Find skills</button>
        )}
        {!it.busy && (
          <button type="button" onClick={() => update(it.url, { open: !it.open })} aria-expanded={it.open}
            className="text-xs font-medium text-blue-700 hover:underline">{it.open ? 'Close' : 'Edit'}</button>
        )}
        <button type="button" onClick={onRemove} disabled={it.busy} className="text-xs text-gray-500 hover:text-red-600">Don't add</button>
      </div>

      {!it.open ? (
        <>
          {it.description && <p className="text-xs text-gray-500 mt-1 truncate">{it.description}</p>}
          {it.skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {it.skills.map(s => <SkillChip key={s.name} skill={s.name} title={tip(s.evidence)} added={s.evidence === ADDED_BY_YOU} />)}
            </div>
          )}
        </>
      ) : (
        <div className="mt-3 space-y-3">
          <div>
            <label htmlFor={`desc-${it.url}`} className="block text-xs font-medium text-gray-600 mb-1.5">What you built and the tools you used</label>
            <textarea id={`desc-${it.url}`} rows={3} value={it.description} maxLength={3000}
              onChange={e => update(it.url, { description: e.target.value })}
              onBlur={() => { if (canFind) find(it) }}
              placeholder="e.g. REST API for a fitness app in FastAPI with PostgreSQL"
              className={`${inputCls} resize-none bg-white`} />
            <p className="flex justify-between text-xs mt-1">
              <span className={length < MIN_DESCRIPTION ? 'text-amber-700' : 'text-gray-400'}>
                {length < MIN_DESCRIPTION ? `Write at least ${MIN_DESCRIPTION} characters. Skills are found when you click outside the box.`
                  : it.source === 'readme' ? "Filled in from the repo's README. Change it to say what you did."
                  : it.source === 'github' ? 'From the repo’s description on GitHub.' : ''}
              </span>
              <span className="text-gray-400 tabular-nums shrink-0 ml-3">{it.description.length} / 3000</span>
            </p>
          </div>
          <SkillChecker id={`skills-${it.url}`} skills={it.skills} onChange={skills => update(it.url, { skills })} />
          {it.notes.map(n => <p key={n} className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2">{n}</p>)}
          <div className="flex justify-end">
            <button type="button" onClick={() => find(it)} disabled={length < MIN_DESCRIPTION || it.busy}
              className="text-sm font-medium text-blue-700 border border-blue-200 bg-white rounded-lg px-3 py-1.5 hover:bg-blue-50 disabled:opacity-40">
              {it.busy ? 'Finding skills…' : found && !stale && length >= MIN_DESCRIPTION ? 'Find skills again' : 'Find skills'}
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
