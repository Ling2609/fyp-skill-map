// 22 Nov (her approved mock review/plans-pages.html?page=edit): the workshop proposal saves by itself. These are the
// small pure pieces, kept apart so they can be tested: when a save is due, and what the status line says.
export const AUTOSAVE_MS = 1500     // 22 Nov: saves 1.5 s after typing stops (never per key)

// 'saving' | 'saved' | 'pending' (typed, not saved yet) | 'error' | 'off' (MongoDB unavailable)
export function saveState({ dirty, saving, failed, available }) {
  if (!available) return 'off'
  if (saving) return 'saving'
  if (failed) return 'error'
  return dirty ? 'pending' : 'saved'
}

export function ago(at, now = Date.now()) {
  if (at == null) return ''
  const s = Math.round((now - at) / 1000)
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`
}

export function statusText(state, savedAt, now) {
  return {
    off: 'Saving is off right now · export still works',
    saving: 'Saving…',
    error: 'Not saved',
    pending: 'Saving…',
    saved: `Saved · ${ago(savedAt, now) || 'just now'}`,
  }[state]
}

export const copyTitle = (title) => /\(copy\)$/i.test(title) ? title : `${title} (copy)`.slice(0, 160)

const FACT_LENGTH = { '2h': '2 hours', half: 'Half day (4 hours)', full: 'Full day (7 hours)' }
const FACT_FORMAT = { in_person: 'In person', online: 'Online', hybrid: 'Hybrid' }
const FACT_AUDIENCE = { all: 'Open to all students', final_year: 'Final-year students' }
// 22 Nov (her question): the first three facts come from the set-up, so they are rewritten when it changes; the
// rest ("6 benefit most", "Prepared …") are kept
export function factsFor(facts, { length, format, audience }) {
  const benefit = (facts[2] || '').split(' · ').slice(1).join(' · ')
  return [FACT_LENGTH[length], FACT_FORMAT[format], benefit ? `${FACT_AUDIENCE[audience]} · ${benefit}` : FACT_AUDIENCE[audience], ...facts.slice(3)]
}
