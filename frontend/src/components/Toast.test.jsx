import { useEffect } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToast } from './Toast'

let toast
function Harness({ onToast }) {
  const t = useToast()
  useEffect(() => { onToast(t) })          // hand the latest show() to the test after each render
  return <div>{t.ui}</div>
}
const show = (...args) => act(() => toast.show(...args))

beforeEach(() => { vi.useFakeTimers(); render(<Harness onToast={(t) => { toast = t }} />) })
afterEach(() => vi.useRealTimers())

describe('useToast: a short message that closes itself', () => {
  it('shows nothing until asked', () => {
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
  it('shows the text and closes by itself after 6 seconds', () => {
    show('Recorded')
    expect(screen.getByRole('status')).toHaveTextContent('Recorded')
    act(() => vi.advanceTimersByTime(5900))
    expect(screen.getByRole('status')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(200))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
  it('a newer message restarts the 6 seconds', () => {
    show('First')
    act(() => vi.advanceTimersByTime(4000))
    show('Second')
    act(() => vi.advanceTimersByTime(4000))
    expect(screen.getByRole('status')).toHaveTextContent('Second')
    act(() => vi.advanceTimersByTime(2100))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
  it('Undo runs the given function and closes the message', () => {
    const undo = vi.fn()
    show('Marked as shortlisted', undo)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(undo).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
  it('has no Undo button when there is nothing to undo', () => {
    show('Saved')
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
  })
  it('the × button closes it', () => {
    show('Saved')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
  it('an error is announced as an alert, not a status', () => {
    show('Could not save', null, true)
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
