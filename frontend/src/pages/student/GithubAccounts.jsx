import { useEffect, useState } from 'react'
import api from '../../api'
import { Spinner } from './profileParts'
import { errText } from './profileUtils'
import { startGithubConnect } from './githubConnect'

// Connect GitHub (14 Oct; her design after research, references.md "Verifying GitHub and LinkedIn accounts"): the
// GitHub link is proved by signing in to GitHub, not typed, so a repo can show it is really hers. Several accounts
// are allowed (personal, school). SkillMap only reads public information; GitHub's token isn't kept.
// 14 Oct (her review "make it nicer"): one card, as connected-account rows in settings pages: icon, name, what it
// does, and the action on the right; connected accounts listed inside the same card. The icon is a neutral </>, not
// GitHub's logo (their trademark).

export const IconTile = ({ on, children }) => (
  <span aria-hidden="true" className={`w-10 h-10 shrink-0 rounded-lg flex items-center justify-center ${on ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{children}</span>
)
const CodeIcon = ({ on }) => (
  <span aria-hidden="true" className={`w-10 h-10 shrink-0 rounded-lg flex items-center justify-center font-mono text-sm ${on ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>&lt;/&gt;</span>
)

export default function GithubAccounts({ blocked }) {
  const [accounts, setAccounts] = useState(null)
  const [setUp, setSetUp] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/profile/github/accounts')
      .then(res => { setAccounts(res.data.accounts); setSetUp(res.data.set_up) })
      .catch(() => setAccounts([]))
  }, [])

  const connect = async () => {
    setBusy('connect'); setError('')
    try { await startGithubConnect('/profile?open=links') }      // the page leaves for GitHub; busy stays on
    catch (err) { setError(errText(err, "Couldn't start connecting to GitHub. Please try again.")); setBusy('') }
  }
  const disconnect = async (a) => {
    if (!window.confirm(`Disconnect ${a.login}? Projects from its repositories will show as not linked to your GitHub.`)) return
    setBusy(String(a.id)); setError('')
    try { setAccounts((await api.delete(`/profile/github/accounts/${a.id}`)).data.accounts) }
    catch (err) { setError(errText(err, "Couldn't disconnect. Please try again.")) }
    finally { setBusy('') }
  }

  const connected = accounts?.length > 0
  const opening = busy === 'connect'
  const cantConnect = !!busy || blocked || !setUp
  const status = !setUp ? "Connecting GitHub isn't set up on this SkillMap yet."
    : blocked ? 'Save your other changes first, then connect.'
    : opening ? 'Taking you to GitHub to sign in…'
    : connected ? 'Your repositories show as yours to employers' : 'You sign in on GitHub, so employers see your repositories are yours'

  return (
    <div>
      <div>
        <div className="p-4 flex items-center gap-4">
          <CodeIcon on={connected} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">GitHub
              {connected && <span className="ml-2 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5">✓ Connected</span>}</p>
            <p className="text-xs text-gray-500 mt-0.5">{accounts === null ? 'Loading…' : status}</p>
          </div>
          {accounts !== null && !connected && (
            <button type="button" onClick={connect} disabled={cantConnect}
              className="shrink-0 flex items-center gap-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg px-4 py-2 disabled:opacity-60">
              {opening ? <><Spinner size="sm" />Opening</> : 'Connect'}
            </button>
          )}
        </div>
        {connected && (
          <ul className="border-t border-gray-100 divide-y divide-gray-100">
            {accounts.map(a => (
              <li key={a.id} className="flex items-center gap-3 pr-4 py-2.5 pl-[4.5rem]">
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 truncate text-sm text-gray-800 hover:text-blue-700">
                  github.com/<b className="font-semibold">{a.login}</b> <span className="text-blue-700">↗</span>
                </a>
                <button type="button" onClick={() => disconnect(a)} disabled={!!busy}
                  className="text-xs text-gray-500 hover:text-red-600 disabled:opacity-40">{busy === String(a.id) ? 'Disconnecting…' : 'Disconnect'}</button>
              </li>
            ))}
            <li className="pr-4 py-2.5 pl-[4.5rem]">
              <button type="button" onClick={connect} disabled={cantConnect}
                className="flex items-center gap-2 text-sm font-medium text-blue-700 hover:underline disabled:text-gray-400 disabled:no-underline">
                {opening ? <><Spinner size="sm" />Taking you to GitHub…</> : '+ Connect another account'}
              </button>
            </li>
          </ul>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 mx-4 mb-3">{error}</p>}
    </div>
  )
}
