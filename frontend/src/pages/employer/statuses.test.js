import { describe, expect, it } from 'vitest'
import { fmtDay, STATUSES, STATUS_CLS } from './statuses'

describe('application statuses', () => {
  it('has the four statuses an employer can set, each with a colour', () => {
    expect(STATUSES.map(([key]) => key)).toEqual(['applied', 'shortlisted', 'accepted', 'rejected'])
    STATUSES.forEach(([key]) => expect(STATUS_CLS[key]).toBeTruthy())
  })
  it('fmtDay writes a short day and month, and nothing for a missing date', () => {
    expect(fmtDay('2026-10-28T10:00:00Z')).toBe('28 Oct')
    expect(fmtDay('')).toBe('')
    expect(fmtDay(null)).toBe('')
  })
})
