import { describe, expect, it } from 'vitest'
import { DECISIONS } from './decisions'

describe('admin decisions that open the reason pop-up', () => {
  it('names the person in the title', () => {
    expect(DECISIONS.deactivate.title('Aisha')).toBe('Deactivate Aisha?')
    expect(DECISIONS.reactivate.title('Aisha')).toBe('Reactivate Aisha?')
    expect(DECISIONS.reject.title('Kayu Digital')).toBe('Reject Kayu Digital?')
  })
  it('asks for a reason when switching an account off or on, but not when rejecting an employer', () => {
    expect(DECISIONS.deactivate.required).toBe(true)
    expect(DECISIONS.reactivate.required).toBe(true)
    expect(DECISIONS.reject.required).toBe(false)
  })
  it('shows the red (danger) button only for the two that take something away', () => {
    expect(DECISIONS.deactivate.danger).toBe(true)
    expect(DECISIONS.reject.danger).toBe(true)
    expect(DECISIONS.reactivate.danger).toBe(false)
  })
  it('every decision has an example reason and a button that says what it does', () => {
    Object.values(DECISIONS).forEach(d => { expect(d.example).toBeTruthy(); expect(d.action).toBeTruthy() })
  })
})
