import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../api'
import PasswordStrength from './PasswordStrength'

// the public "most common passwords" list the server sends once; the browser applies the same rule as the server
const COMMON = ['password', 'qwerty123', 'iloveyou', 'letmein'].join('\n')
beforeEach(() => { vi.spyOn(api, 'get').mockResolvedValue({ data: COMMON }) })

const typed = (password, extra = {}) => render(<PasswordStrength password={password} {...extra} />)

describe('PasswordStrength: length is what counts (NIST SP 800-63B-4), no forced mixing', () => {
  it('shows the rules before anything is typed', () => {
    typed('')
    expect(screen.getByText('At least 8 characters. Avoid common passwords and your username.')).toBeInTheDocument()
  })
  it.each([
    ['abc', 'Use at least 8 characters'],
    ['wordsonly', 'OK'],                       // 9
    ['lowercasewords', 'Good'],                // 14
    ['lowercaseonlywords!', 'Strong'],         // 19
  ])('"%s" reads "%s", although it has no capital, number or symbol', async (pw, label) => {
    typed(pw)
    expect(await screen.findByText(new RegExp(`^${label}`))).toBeInTheDocument()
  })
  it('at the first level it also says longer is stronger', async () => {
    typed('wordsonly')
    expect(await screen.findByText(/longer is stronger/)).toBeInTheDocument()
  })
  it('is announced politely to a screen reader', () => {
    const { container } = typed('abc')
    expect(container.querySelector('[aria-live="polite"]')).toBeInTheDocument()
  })
})

describe('PasswordStrength: refuses in the browser, before Save, with a polite reason', () => {
  const HARDER = "Choose a password that's harder to guess, e.g. a few random words"
  it('a password from the common list', async () => {
    typed('qwerty123')
    expect(await screen.findByText(HARDER)).toBeInTheDocument()
  })
  it('a common word with digits or symbols added ("password123!")', async () => {
    typed('Password123!')
    expect(await screen.findByText(HARDER)).toBeInTheDocument()
  })
  it('the same rule as the server: a trailing "²" is a letter-like number, so it is not stripped', async () => {
    typed('password²')
    expect(await screen.findByText(/^Good|^OK/)).toBeInTheDocument()
    expect(screen.queryByText(HARDER)).not.toBeInTheDocument()
  })
  it('a password with the username in it', async () => {
    typed('LingWeiLing-2026', { username: 'lingweiling' })
    expect(await screen.findByText("Choose a password that doesn't include your username, email name or SkillMap")).toBeInTheDocument()
  })
  it('a password with the part of the email before the @ in it', async () => {
    typed('xxkayudigitalxx', { email: 'kayudigital@example.com' })
    expect(await screen.findByText(/doesn't include your username, email name or SkillMap/)).toBeInTheDocument()
  })
  it('a password with "SkillMap" in it', async () => {
    typed('my-skillmap-password')
    expect(await screen.findByText(/doesn't include your username, email name or SkillMap/)).toBeInTheDocument()
  })
  it('a password longer than 72 bytes (the bcrypt limit), counting bytes, not characters', () => {
    typed('é'.repeat(40))                      // 40 characters = 80 bytes
    expect(screen.getByText('Please use a shorter password (up to 72 characters)')).toBeInTheDocument()
  })
  it('a short username in the password is not treated as a match (under 3 characters)', async () => {
    typed('lowercasewords', { username: 'li' })
    expect(await screen.findByText(/^Good/)).toBeInTheDocument()
  })
  it('still shows the length bar when the list cannot be downloaded (Save checks it)', async () => {
    api.get.mockRejectedValue(new Error('offline'))
    typed('lowercasewords')
    expect(await screen.findByText(/^Good/)).toBeInTheDocument()
  })
})
