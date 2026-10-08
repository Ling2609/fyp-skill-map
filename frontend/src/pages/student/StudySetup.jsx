import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api'
import { useAuth } from '../../context/useAuth'
import { Spinner } from './profileParts'
import { StudyFields } from './profileForms'
import { errText, studyComplete } from './profileUtils'

// First sign-in setup (8 Oct; decided 7 Oct, references.md "Programme + intake"): one step, two drop-downs, before
// anything else. A student without a programme is sent here by the route guard in App.jsx; this also catches
// accounts made before the step existed. Like Handshake's onboarding: account first, then these, editable later
// (My Profile → Modules → Change programme). Next stop: the Modules tab, since modules and grades are what the profile is built on.

export default function StudySetup() {
  const { user, setUser, logout } = useAuth()
  const navigate = useNavigate()
  const [options, setOptions] = useState(null)
  const [study, setStudy] = useState({ programme_id: null, intake_id: null })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/profile/study')
      .then(res => {
        setOptions(res.data)
        // Only one programme (the prototype): picked already, so only the intake is left to choose
        const only = res.data.programmes.length === 1 ? res.data.programmes[0].id : null
        setStudy({ programme_id: res.data.programme_id ?? only, intake_id: res.data.intake_id })
      })
      .catch(() => setError("Couldn't load the programmes. Please refresh the page."))
  }, [])

  const save = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await api.put('/profile/study', study)
      setUser(u => ({ ...u, ...study }))
      navigate('/profile?tab=modules', { replace: true })
    } catch (err) {
      setError(errText(err, "Couldn't save. Please try again."))
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <form onSubmit={save} className="bg-white rounded-2xl border border-slate-200 shadow-sm w-full max-w-lg p-8 space-y-5">
        <div>
          <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-widest mb-2">One step to go</p>
          <h1 className="text-xl font-semibold text-slate-900">Welcome{user?.first_name ? `, ${user.first_name}` : ''}</h1>
          <p className="text-sm text-slate-500 mt-1">Pick your programme and intake, so SkillMap can list your modules.</p>
        </div>
        {options && options.programmes.length === 0 && (
          <p className="text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2">The career office hasn't added any programmes yet. Please try again later.</p>
        )}
        {options && options.programmes.length > 0 && <StudyFields options={options} value={study} onChange={setStudy} />}
        {!options && !error && <div className="flex justify-center py-4 text-blue-600"><Spinner /></div>}
        {error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex items-center justify-between pt-1">
          <button type="button" onClick={logout} className="text-sm text-slate-500 hover:text-slate-800">Sign out</button>
          <button type="submit" disabled={busy || !studyComplete(options, study)}
            className="bg-blue-700 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-blue-800 disabled:opacity-40 transition flex items-center gap-2">
            {busy ? <><Spinner size="sm" />Saving…</> : 'Continue'}
          </button>
        </div>
      </form>
    </div>
  )
}
