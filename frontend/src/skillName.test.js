import { describe, expect, it } from 'vitest'
import { skillName } from './skillName'

describe('skillName: how a skill is shown (Title Case, the saved name never changes)', () => {
  it('gives an all-lower-case word a capital', () => {
    expect(skillName('business process analysis')).toBe('Business Process Analysis')
  })
  it('keeps small joining words lower, except at the start', () => {
    expect(skillName('version control with git')).toBe('Version Control with Git')
    expect(skillName('the art of testing')).toBe('The Art of Testing')
  })
  it('keeps a word that already has capitals', () => {
    expect(skillName('UI/UX design')).toBe('UI/UX Design')
    expect(skillName('iOS development')).toBe('iOS Development')
    expect(skillName('JavaScript')).toBe('JavaScript')
  })
  it('keeps the brands that are written in lower case on purpose', () => {
    expect(skillName('dbt')).toBe('dbt')
    expect(skillName('pytest')).toBe('pytest')
    expect(skillName('shadcn/ui')).toBe('shadcn/ui')
  })
  it('does not break on empty input', () => {
    expect(skillName('')).toBe('')
    expect(skillName(undefined)).toBeUndefined()
    expect(skillName(null)).toBeNull()
  })
})
