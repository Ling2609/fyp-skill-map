import { describe, expect, it } from 'vitest'
import { doneFrom } from './profileDone'

const empty = { module_count: 0, projects: [], experiences: [], certifications: [], awards: [], headline: '', about: '', languages: [] }

describe('doneFrom: which of the five profile items a student has added', () => {
  it('nothing added = nothing done', () => {
    expect(doneFrom(empty)).toEqual({ modules: false, projects: false, experience: false, certs: false, about: false })
  })
  it('each item switches on by itself', () => {
    expect(doneFrom({ ...empty, module_count: 3 }).modules).toBe(true)
    expect(doneFrom({ ...empty, projects: [{}] }).projects).toBe(true)
    expect(doneFrom({ ...empty, experiences: [{}] }).experience).toBe(true)
  })
  it('a certificate OR an award counts for the same item', () => {
    expect(doneFrom({ ...empty, certifications: [{}] }).certs).toBe(true)
    expect(doneFrom({ ...empty, awards: [{}] }).certs).toBe(true)
  })
  it('"About you" needs a headline or text AND at least one language', () => {
    expect(doneFrom({ ...empty, headline: 'Final-year student' }).about).toBe(false)
    expect(doneFrom({ ...empty, languages: [{}] }).about).toBe(false)
    expect(doneFrom({ ...empty, about: 'Hello', languages: [{}] }).about).toBe(true)
    expect(doneFrom({ ...empty, headline: 'Student', languages: [{}] }).about).toBe(true)
  })
})
