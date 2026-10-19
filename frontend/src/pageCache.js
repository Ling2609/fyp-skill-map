import api, { PAGE_CACHE, memoryCache } from './api'

// Slow read-only requests (scoring every job with SBERT for Job Matches, Dashboard and the chatbot; one job's skill
// gap; a job's formatted ad) are kept for a while, so moving between pages does not reload them (6 Oct).
// They are dropped straight away after any profile change (api.js), so numbers never go out of date because of
// the student's own edits. The time limit covers changes on the server side (new jobs, a re-extraction).
const MINUTES = 15
const MAX_ENTRIES = 15            // each job's skill gap is one entry; keep sessionStorage small
const MEMORY_ENTRIES = 40         // in memory (no size limit to worry about at this scale)
const token = () => { try { return localStorage.getItem('token') } catch { return null } }
const inFlight = new Map()       // the same request asked for twice at once (two pages, React StrictMode) runs once

const keyOf = (url, body) => `${url} ${body ? JSON.stringify(body) : ''}`

const readAll = () => {
  try { return JSON.parse(sessionStorage.getItem(PAGE_CACHE)) || {} } catch { return {} }
}

const writeAll = (all) => {
  try {
    sessionStorage.setItem(PAGE_CACHE, JSON.stringify(all))
  } catch {
    try { sessionStorage.removeItem(PAGE_CACHE) } catch { /* storage blocked: just no cache */ }
  }
}

// The saved answer if it is still fresh, else null (no request is sent)
export function peek(url, body) {
  const key = keyOf(url, body)
  const fresh = (e) => e && Date.now() - e.savedAt < MINUTES * 60000
  const mem = memoryCache.get(key)
  if (fresh(mem) && mem.token === token()) return mem.data
  const entry = readAll()[key]
  return fresh(entry) ? entry.data : null
}

function remember(key, data) {
  memoryCache.delete(key)                  // re-insert = newest last
  memoryCache.set(key, { data, savedAt: Date.now(), token: token() })
  while (memoryCache.size > MEMORY_ENTRIES) memoryCache.delete(memoryCache.keys().next().value)
}

// The saved answer, or a new request (GET when there is no body, POST otherwise). Errors are axios errors, as before.
export function cached(url, body) {
  const hit = peek(url, body)
  if (hit) return Promise.resolve(hit)
  const key = keyOf(url, body)
  if (inFlight.has(key)) return inFlight.get(key)
  const request = (body ? api.post(url, body) : api.get(url))
    .then(res => {
      remember(key, res.data)
      const all = readAll()
      all[key] = { data: res.data, savedAt: Date.now() }
      const keys = Object.keys(all).sort((a, b) => all[b].savedAt - all[a].savedAt)
      keys.slice(MAX_ENTRIES).forEach(k => delete all[k])
      writeAll(all)
      return res.data
    })
    .finally(() => inFlight.delete(key))
  inFlight.set(key, request)
  return request
}

// The default Job Matches request (all live jobs, Best fit): Dashboard and the chatbot ask for the same one
export const ALL_MATCHES = { top_n: 0, role_filter: '', category: '' }
