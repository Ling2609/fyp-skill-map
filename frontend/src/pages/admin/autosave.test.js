import { describe, expect, it } from 'vitest'
import { ago, copyTitle, factsFor, saveState, statusText } from './autosave'

describe('workshop autosave status', () => {
  it('says what is happening, MongoDB off first', () => {
    expect(saveState({ dirty: true, saving: true, failed: false, available: false })).toBe('off')
    expect(saveState({ dirty: true, saving: true, failed: false, available: true })).toBe('saving')
    expect(saveState({ dirty: true, saving: false, failed: true, available: true })).toBe('error')
    expect(saveState({ dirty: true, saving: false, failed: false, available: true })).toBe('pending')
    expect(saveState({ dirty: false, saving: false, failed: false, available: true })).toBe('saved')
  })
  it('shows how long ago it saved', () => {
    expect(ago(1000, 20_000)).toBe('just now')
    expect(ago(null, 0)).toBe('')
    expect(statusText('saved', 0, 5 * 60_000)).toBe('Saved · 5 min ago')
    expect(statusText('saved', 1, 2)).toBe('Saved · just now')
    expect(statusText('pending')).toBe('Saving…')
  })
  it('names a copy once', () => {
    expect(copyTitle('Git workshop')).toBe('Git workshop (copy)')
    expect(copyTitle('Git workshop (copy)')).toBe('Git workshop (copy)')
  })
  it('rewrites the set-up facts and keeps the rest', () => {
    const facts = ['Half day (4 hours)', 'In person', 'Open to all students · 6 benefit most', 'Prepared 19 Nov 2026']
    expect(factsFor(facts, { length: '2h', format: 'online', audience: 'final_year' }))
      .toEqual(['2 hours', 'Online', 'Final-year students · 6 benefit most', 'Prepared 19 Nov 2026'])
  })
})
