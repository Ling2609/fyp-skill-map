import { useEffect, useRef, useState } from 'react'
import api from '../api'
import { useToast } from './Toast'

// 20 Oct (her idea; research in references.md "Recording applications to outside jobs"; mock-up 9): for a job on another
// site, SkillMap can't know whether the student applied, so it asks once, when they come back to this tab after
// "Apply on <site> ↗": an inline banner (not a pop-up that blocks the page; her guide on pop-ups), buttons named by
// what they do, and Undo instead of "Are you sure?". A small "I applied" link stays for later. Only the student sees
// the record; the outside employer doesn't see or update it.
// 20 Oct (her pick): the "Already applied? Record it" line shows only on jobs she has clicked "Apply on …" for. The
// clicks are remembered in this browser only (localStorage), never sent to the server; a cleared browser just hides
// the line until the next click.
const CLICKED_KEY = 'applyClicked'
const readClicked = () => { try { return JSON.parse(localStorage.getItem(CLICKED_KEY)) || [] } catch { return [] } }
const ASK_KEY = 'askApplied'            // sessionStorage: the job she left to apply for (survives a reload of this tab)

export function useOutsideApplication(jobRef, live) {
  const [rec, setRec] = useState(null)
  const [clickedNow, setClicked] = useState(false)
  const clicked = clickedNow || (jobRef ? readClicked().includes(jobRef) : false)   // jobRef arrives after loading
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
    try {
      const list = readClicked().filter(r => r !== jobRef)
      localStorage.setItem(CLICKED_KEY, JSON.stringify([jobRef, ...list].slice(0, 200)))
    } catch { /* storage blocked: the line just stays hidden */ }
    setClicked(true)
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
  return { rec, asking, busy, clicked, leaving, record, notYet, toastUi: toast.ui }
}
