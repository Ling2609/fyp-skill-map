import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Popconfirm from './Popconfirm'

const setup = (props = {}) => {
  const onConfirm = vi.fn(), onCancel = vi.fn()
  render(<Popconfirm text="Delete this project?" confirmLabel="Delete project" onConfirm={onConfirm} onCancel={onCancel} {...props} />)
  return { onConfirm, onCancel }
}

describe('Popconfirm: one question beside the button that was clicked', () => {
  it('is an alert dialog named by its question, with buttons that say what they do', () => {
    setup()
    expect(screen.getByRole('alertdialog', { name: 'Delete this project?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete project' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })
  it('puts the keyboard on Cancel first, so Enter never confirms by accident', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  })
  it('the confirm button confirms, and only it', async () => {
    const { onConfirm, onCancel } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Delete project' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })
  it('the cancel button cancels, and only it; its label can be changed', async () => {
    const { onConfirm, onCancel } = setup({ cancelLabel: 'Keep it' })
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })
  it('the danger style is red, the normal one blue', () => {
    setup({ danger: true })
    expect(screen.getByRole('button', { name: 'Delete project' }).className).toContain('bg-rose-600')
  })
  it('is blue when it is not a danger', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Delete project' }).className).toContain('bg-blue-700')
  })
})
