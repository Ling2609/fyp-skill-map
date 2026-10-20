import { useEffect, useRef, useState } from 'react'
import api from '../api'
import { useToast } from './Toast'

// 20 Oct (her idea; research in references.md "Recording applications to outside jobs"; mock-up 9): for a job on another
// site, SkillMap can't know whether the student applied, so it asks once, when they come back to this tab after
// "Apply on <site> ↗": an inline banner (not a pop-up that blocks the page; her guide on pop-ups), buttons named by
// what they do, and Undo instead of "Are you sure?". A small "I applied" link stays for later. Only the student sees
// the record; the outside employer doesn't see or update it.
const ASK_KEY = 'askApplied'            // sessionStorage: the job she left to apply for (survives a reload of this tab)

export function useOutsideApplication(jobRef, live) {
  const [rec, setRec] = useState(null)
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const left = useRef(false)
  const recRef = useRef(null)
  const toast = useToast()

  useEffect(() => {
    if (!live || !jobRef) return
    let cancelled = false
    api.get(`/applications/outside/job/${encodeURIComponent(jobRef)}`).then(res => {
      if (cancelled) return
      recRef.current = res.data
      setRec(res.data)
      let pending = null
      try { pending = sessionStorage.getItem(ASK_KEY) } catch { /* storage blocked: just don't ask after a reload */ }
      if (!res.data && pending === jobRef) setAsking(true)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [jobRef, live])

  // Back on this tab after opening the outside site: ask once
  useEffect(() => {
    if (!live) return
    const back = () => {
      if (document.visibilityState !== 'visible' || !left.current) return
      left.current = false
      if (!recRef.current) setAsking(true)
    }
    window.addEventListener('focus', back)
    document.addEventListener('visibilitychange', back)
    return () => { window.removeEventListener('focus', back); document.removeEventListener('visibilitychange', back) }
  }, [live])

  const forget = () => { try { sessionStorage.removeItem(ASK_KEY) } catch { /* fine */ } }
  const leaving = () => {
    if (recRef.current) return
    left.current = true
    try { sessionStorage.setItem(ASK_KEY, jobRef) } catch { /* fine */ }
  }
  const record = () => {
    setBusy(true)
    api.post('/applications/outside', { job_id: jobRef })
      .then(res => {
        recRef.current = res.data; setRec(res.data); setAsking(false); forget()
        toast.show('Recorded in My Applications.', () => {
          api.delete(`/applications/outside/${res.data.id}`)
            .then(() => { recRef.current = null; setRec(null); toast.show('Removed from My Applications.') })
            .catch(() => toast.show("Couldn't undo. Remove it in My Applications.", null, true))
        })
      })
      .catch(() => toast.show("Couldn't record it. Try again.", null, true))
      .finally(() => setBusy(false))
  }
  const notYet = () => { setAsking(false); forget() }
  return { rec, asking, busy, leaving, record, notYet, toastUi: toast.ui }
}
