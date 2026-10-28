import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import LevelTag from './LevelTag'

describe('LevelTag: the job level read from the title', () => {
  it.each([['junior', 'Entry level'], ['senior', 'Senior'], ['lead', 'Lead'], ['manager', 'Manager']])('%s shows "%s"', (level, label) => {
    render(<LevelTag level={level} />)
    expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.getByTitle('Level from the job title')).toBeInTheDocument()
  })
  it.each(['unspecified', undefined, null, ''])('shows nothing for %s (an unstated level is not assumed senior)', (level) => {
    const { container } = render(<LevelTag level={level} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('entry level is green and the senior levels are amber, so they read differently', () => {
    const { rerender } = render(<LevelTag level="junior" />)
    expect(screen.getByText('Entry level').className).toContain('emerald')
    rerender(<LevelTag level="manager" />)
    expect(screen.getByText('Manager').className).toContain('amber')
  })
})
