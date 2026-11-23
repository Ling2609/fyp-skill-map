import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../api'
import VerifyEmail from './VerifyEmail'

// 23 Nov: Check your email (registration email verification). The network is replaced by api.post.
vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal()),
  default: { get: vi.fn(), post: vi.fn() },
}))

const inMin = (m) => new Date(Date.now() + m * 60_000).toISOString()
const SENT = { result: 'sent', email: 'student@example.com', role: 'student', sent_at: inMin(0), expires_at: inMin(10),
  next_send_at: inMin(1), limit: 'cooldown', minutes: 10 }

function SignIn() {
  const { state } = useLocation()
  return <p>Sign in page{state?.verified ? ' · verified' : ''}</p>
}
const open = (state) => render(
  <MemoryRouter initialEntries={[{ pathname: '/verify-email', state }]}>
    <Routes>
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/login" element={<SignIn />} />
    </Routes>
  </MemoryRouter>)

// the intro beside the card measures its stage; the test browser (jsdom) has no ResizeObserver or matchMedia
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
if (!window.matchMedia) vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))

beforeEach(() => { vi.resetAllMocks() })

describe('Check your email', () => {
  it('without a ticket (a reload or a new tab) says the page expired and offers Sign in', () => {
    open(undefined)
    expect(screen.getByText('This page has expired')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
  })

  it('puts focus in the code box and shows where the code went and until when it works', () => {
    open({ ticket: 't', verification: SENT, from: 'register' })
    expect(screen.getByLabelText('6-digit code')).toHaveFocus()
    expect(screen.getByText('student@example.com')).toBeInTheDocument()
    expect(screen.getByText(/Works until/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Send again in/ })).toBeDisabled()   // the 60 s cooldown
  })

  it('cleans a pasted code with spaces or a dash', async () => {
    open({ ticket: 't', verification: SENT })
    const box = screen.getByLabelText('6-digit code')
    await userEvent.click(box)
    await userEvent.paste('123 456')
    expect(box).toHaveValue('123456')
  })

  it('a wrong code is announced with the tries left, and focus stays on the code', async () => {
    api.post.mockRejectedValue({ response: { status: 400, data: { detail: { message: 'Wrong or expired code.', tries_left: 3 } } } })
    open({ ticket: 't', verification: SENT })
    await userEvent.type(screen.getByLabelText('6-digit code'), '000000{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('3 tries left for this code')
    expect(screen.getByLabelText('6-digit code')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('6-digit code')).toHaveFocus()
  })

  it('the right code goes to Sign in with "verified", without signing in', async () => {
    api.post.mockResolvedValue({ data: { verified: true, role: 'student' } })
    open({ ticket: 't', verification: SENT })
    await userEvent.type(screen.getByLabelText('6-digit code'), '123456{Enter}')
    expect(await screen.findByText('Sign in page · verified')).toBeInTheDocument()
    expect(api.post).toHaveBeenCalledWith('/auth/verify-email', { ticket: 't', code: '123456' })
  })

  it('at the daily limit the code box still works while the code is usable, and says when to ask again', () => {
    open({ ticket: 't', verification: { ...SENT, result: 'limited', limit: 'daily', next_send_at: inMin(600) } })
    expect(screen.getByLabelText('6-digit code')).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Verify email' })).toBeInTheDocument()
    expect(screen.getAllByText(/New codes paused until|You can ask again at/).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /Send again/ })).not.toBeInTheDocument()
  })

  it('an expired ticket while on the page switches to "This page has expired"', async () => {
    api.post.mockRejectedValue({ response: { status: 400, data: { detail: 'This page has expired. Sign in again to get a new code.' } } })
    open({ ticket: 't', verification: SENT })
    await userEvent.type(screen.getByLabelText('6-digit code'), '123456{Enter}')
    expect(await screen.findByText('This page has expired')).toBeInTheDocument()
  })
})
