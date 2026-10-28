import { describe, expect, it } from 'vitest'
import { greeting } from './greeting'

const at = (hour, day = 28, month = 9) => new Date(2026, month, day, hour, 0, 0)   // local time, 28 Oct 2026

describe('greeting: follows the time of day, varies from day to day', () => {
  it.each([
    [4, 'night'], [5, 'morning'], [11, 'morning'], [12, 'afternoon'], [16, 'afternoon'],
    [17, 'evening'], [22, 'evening'], [23, 'night'], [0, 'night'],
  ])('at %i:00 it is a %s greeting', (hour, part) => {
    const all = {
      morning: ['Good morning', 'Morning', 'Welcome back', 'Hi Ling, good to see you'],
      afternoon: ['Good afternoon', 'Hello', 'Welcome back', 'Hi Ling, good to see you'],
      evening: ['Good evening', 'Evening', 'Welcome back', 'Hi Ling, good to see you'],
      night: ['Working late', 'Hi Ling', 'Welcome back', 'Still up'],
    }[part]
    // try the 4 wordings (4 consecutive days): the one shown on every day must belong to this part of the day
    for (let d = 1; d <= 4; d++) expect(all.some(w => greeting('Ling', at(hour, d)).startsWith(w))).toBe(true)
  })
  it('shows the name, or "there" when there is none', () => {
    expect(greeting('Ling', at(9))).toContain('Ling')
    expect(greeting('', at(9))).toContain('there')
    expect(greeting(undefined, at(9))).toContain('there')
  })
  it('stays the same all day part long (it never changes while the page is open)', () => {
    expect(greeting('Ling', at(6))).toBe(greeting('Ling', at(11)))
    expect(greeting('Ling', at(13))).toBe(greeting('Ling', at(16)))
  })
  it('changes the wording from day to day', () => {
    const week = new Set([1, 2, 3, 4].map(d => greeting('Ling', at(9, d))))
    expect(week.size).toBe(4)
  })
})
