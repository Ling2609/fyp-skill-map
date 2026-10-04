import { useEffect, useState } from 'react'
import api from '../api'

// Password guidance (4 Oct; NIST SP 800-63B-4, references.md "Password strength"): length is what counts, so the bar
// grows with length and never demands capitals, numbers or symbols (NIST: no forced mixing). From 8 characters the
// same blocklist rule as the server runs IN THE BROWSER, so "too common" or "contains your username" shows before
// Save without the password being sent anywhere while typing (NIST: tell the user why a password is refused).
// The list (public SecLists top 10,000) is downloaded once; the server still makes the real check on Save.
const LEVELS = [
  { min: 0,  label: 'Use at least 8 characters', bars: 1, colour: 'bg-red-400',     text: 'text-red-500' },
  { min: 8,  label: 'OK',        bars: 2, colour: 'bg-amber-400',   text: 'text-amber-600' },
  { min: 12, label: 'Good',      bars: 3, colour: 'bg-emerald-400', text: 'text-emerald-600' },
  { min: 16, label: 'Strong',    bars: 4, colour: 'bg-emerald-500', text: 'text-emerald-700' },
]
const REFUSED = { label: '', bars: 1, colour: 'bg-amber-400', text: 'text-amber-700' }   // advice while typing, not an error

let commonList = null   // one download for the whole app session
const loadCommon = () => {
  commonList ??= api.get('/auth/common-passwords', { responseType: 'text' })
    .then(res => new Set(res.data.split('\n')))
    .catch(() => { commonList = null; return null })   // no list: the bar still shows length; Save checks it
  return commonList
}

// Same rule and wording as backend app/services/password_policy.py. Wording (4 Oct, her request): polite, says what
// to do, never blames (NN/g error-message guidelines; Microsoft: "Choose a password that's harder for people to guess")
function problemWith(password, common, username, email) {
  if (new TextEncoder().encode(password).length > 72) return 'Please use a shorter password (up to 72 characters)'
  const low = password.toLowerCase()
  // "password123!" -> "password". Same characters as the server's [\d\W_]+$ (Python keeps letters and non-digit
  // numbers such as "²"; it drops digits, marks, symbols, "_"): checked on every Unicode character both know (4 Oct)
  const base = low.replace(/[^\p{L}\p{Nl}\p{No}]+$/u, '')
  if (common && (common.has(low) || (base.length >= 4 && common.has(base))))
    return "Choose a password that's harder to guess, e.g. a few random words"
  const personal = ['skillmap', username.toLowerCase(), email.toLowerCase().split('@')[0]]
  if (personal.some(p => p.length >= 3 && low.includes(p)))
    return "Choose a password that doesn't include your username, email name or SkillMap"
  return null
}

export default function PasswordStrength({ password, username = '', email = '' }) {
  const [common, setCommon] = useState(null)

  useEffect(() => {
    if (common || !password || password.length < 8) return
    let stale = false
    loadCommon()?.then(set => { if (!stale && set) setCommon(set) })
    return () => { stale = true }
  }, [password, common])

  // Before typing: the rules up front (NN/g "Password creation": show requirements before, not after). Only rules we
  // really have, no forced mixing (NIST).
  if (!password) return <p className="mt-1.5 text-xs text-gray-400">At least 8 characters. Avoid common passwords and your username.</p>
  const refused = password.length >= 8 ? problemWith(password, common, username || '', email || '') : null
  const level = refused ? REFUSED : [...LEVELS].reverse().find(l => password.length >= l.min)
  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1 mb-1">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full ${i <= level.bars ? level.colour : 'bg-gray-200'}`} />
        ))}
      </div>
      <p className={`text-xs ${level.text}`}>
        {refused || <>{level.label}{level.bars === 2 && <span className="text-gray-400"> · longer is stronger, e.g. a few random words</span>}</>}
      </p>
    </div>
  )
}
