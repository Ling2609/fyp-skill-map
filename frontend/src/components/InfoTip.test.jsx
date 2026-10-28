import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import InfoTip from './InfoTip'

const setup = () => render(<div><InfoTip label="About the reply record">Counted from the employer's own date.</InfoTip><p>outside</p></div>)
const button = () => screen.getByRole('button', { name: 'About the reply record' })

describe('InfoTip: opens on click, never on hover only', () => {
  it('is closed to start with', () => {
    setup()
    expect(button()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
  it('a click opens it and says so to a screen reader', async () => {
    setup()
    await userEvent.click(button())
    expect(button()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('status')).toHaveTextContent("Counted from the employer's own date.")
  })
  it('a second click closes it', async () => {
    setup()
    await userEvent.click(button())
    await userEvent.click(button())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
  it('Escape closes it', async () => {
    setup()
    await userEvent.click(button())
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
  it('a click outside closes it, a click inside the tip does not', async () => {
    setup()
    await userEvent.click(button())
    await userEvent.click(screen.getByRole('status'))
    expect(screen.getByRole('status')).toBeInTheDocument()
    await userEvent.click(screen.getByText('outside'))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
  it('closes when the window is resized or the page scrolls (it is placed on the screen, not in the card)', async () => {
    setup()
    await userEvent.click(button())
    fireEvent(window, new Event('resize'))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    await userEvent.click(button())
    fireEvent.scroll(document)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
