import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../../api'
import { Spinner } from './profileParts'
import { errText } from './profileUtils'
import { startGithubConnect } from './githubConnect'

// GitHub sends the student back here after signing in (14 Oct, Connect GitHub). The code goes to the backend, which
// checks it was this student who started it, reads the account and returns to where she was.
// 14 Oct (her review): a proper waiting card. The steps are honest: "Signed in on GitHub" is already done when this
// page opens; checking the account and her projects' GitHub links happen in ONE request, so they finish together
// (no fake timer). The projects step shows only if she has projects with a GitHub link; the notice afterwards says
// how many now show as hers, and nothing when none do.

function Step({ state, children }) {
  return (
    <li className={`flex items-center gap-2.5 text-sm ${state === 'todo' ? 'text-gray-400' : state === 'busy' ? 'text-gray-900 font-medium' : 'text-gray-700'}`}>
      {state === 'done'
        ? <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-xs flex items-center justify-center" aria-hidden="true">✓</span>
        : <span className={`w-5 h-5 flex items-center justify-center ${state === 'busy' ? 'text-blue-700' : 'text-gray-300'}`} aria-hidden="true">
            {state === 'busy' ? <Spinner /> : <span className="w-4 h-4 rounded-full border-2 border-current" />}</span>}
      {children}
    </li>
  )
}

export default function GithubCallback() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [failed, setFailed] = useState('')
  const [done, setDone] = useState(false)
  const [withProjects, setWithProjects] = useState(false)
  const sent = useRef(false)          // React's development double-run must not send the one-time code twice
  // GitHub says no (she pressed Cancel there): shown straight away, nothing sent
  const refused = params.get('error') ? (params.get('error') === 'access_denied'
    ? 'You cancelled on GitHub, so nothing was connected.' : "GitHub didn't connect the account. Please try again.") : ''
  const error = refused || failed

  useEffect(() => {
    if (sent.current || refused) return
    sent.current = true
    let back = '/profile/settings'
    try { back = sessionStorage.getItem('githubReturn') || back; sessionStorage.removeItem('githubReturn') } catch { /* blocked */ }
    api.get('/profile/github/accounts').then(res => setWithProjects(res.data.repo_projects > 0)).catch(() => {})
    api.post('/profile/github/connect', { code: params.get('code') || '', state: params.get('state') || '' })
      .then(res => {
        setDone(true)
        const note = `github=${encodeURIComponent(res.data.connected)}&linked=${res.data.newly_yours || 0}`
        setTimeout(() => navigate(`${back}${back.includes('?') ? '&' : '?'}${note}`, { replace: true }), 600)
      })
      .catch(err => setFailed(errText(err, "Couldn't connect GitHub. Please try again.")))
  }, [params, navigate, refused])

  const retry = () => startGithubConnect('/profile/settings')
    .catch(err => setFailed(errText(err, "Couldn't start connecting to GitHub. Please try again.")))

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm w-full max-w-sm p-7 text-center" role="status" aria-live="polite">
        {error ? (
          <>
            <div className="mx-auto w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center text-xl font-bold" aria-hidden="true">!</div>
            <p className="mt-4 text-base font-semibold text-slate-900">GitHub wasn't connected</p>
            <p className="mt-2 text-sm text-slate-600">{error}</p>
            <div className="mt-5 flex justify-center items-center gap-3">
              <Link to="/profile/settings" className="text-sm text-slate-600 hover:text-slate-900 px-3 py-2">Back to Profile &amp; privacy</Link>
              <button type="button" onClick={retry} className="text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg px-4 py-2">Try again</button>
            </div>
          </>
        ) : (
          <>
            <div className="mx-auto w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center" aria-hidden="true">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <p className="mt-4 text-base font-semibold text-slate-900">{done ? 'GitHub connected' : 'Connecting your GitHub'}</p>
            <ul className="mt-4 space-y-2.5 text-left inline-block">
              <Step state="done">Signed in on GitHub</Step>
              <Step state={done ? 'done' : 'busy'}>Checking the account is yours</Step>
              {withProjects && <Step state={done ? 'done' : 'busy'}>Checking your projects' GitHub links</Step>}
            </ul>
            <p className="mt-5 text-xs text-slate-400">{done ? 'Going back to My Profile…' : 'This takes a few seconds.'}</p>
          </>
        )}
      </div>
    </div>
  )
}
