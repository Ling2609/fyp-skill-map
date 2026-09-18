import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../api'

const getPasswordStrength = (password) => {
  if (!password) return { score: 0, label: '', color: '' }

  // Below minimum length = always Weak regardless of complexity
  if (password.length < 8) return { score: 1, label: 'Weak', color: 'bg-red-400' }

  let score = 1 // base score for meeting minimum length
  if (password.length >= 12) score++ // bonus for longer
  if (password.length >= 16) score++ // bonus for even longer
  if (/[A-Z]/.test(password)) score++ // uppercase letter
  if (/[0-9]/.test(password)) score++ // number
  if (/[^a-zA-Z0-9]/.test(password)) score++ // symbol

  score = Math.min(score, 5) // cap at 5

  if (score <= 2) return { score, label: 'Weak', color: 'bg-red-400' }
  if (score <= 4) return { score, label: 'Medium', color: 'bg-yellow-400' }
  return { score, label: 'Strong', color: 'bg-green-500' }
}

const validateName = (name) => {
  if (!name || name.trim().length < 1) return 'This field is required'
  if (name.trim().length > 50) return 'Must be under 50 characters'
  if (!/^[a-zA-Z\s\-']+$/.test(name.trim())) return 'Only letters, spaces, hyphens and apostrophes allowed'
  return ''
}

const EyeIcon = ({ show }) => show ? (
  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
  </svg>
) : (
  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
)

export default function Register() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    username: '', first_name: '', last_name: '',
    email: '', password: '', confirm_password: '', role: 'student'
  })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [focused, setFocused] = useState('')
  const [attemptedSubmit, setAttemptedSubmit] = useState(false)

  const [usernameStatus, setUsernameStatus] = useState('idle')
  const [usernameMessage, setUsernameMessage] = useState('')
  const debounceRef = useRef(null)

  useEffect(() => {
    const username = form.username
    if (!username) {
      setTimeout(() => { setUsernameStatus('idle'); setUsernameMessage('') }, 0)
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (username.length < 3) {
      setTimeout(() => { setUsernameStatus('invalid'); setUsernameMessage('At least 3 characters required') }, 0)
      return
    }
    if (!/^[a-zA-Z0-9]/.test(username)) {
      setTimeout(() => { setUsernameStatus('invalid'); setUsernameMessage('Must start with a letter or number') }, 0)
      return
    }
    if (!/^[a-zA-Z0-9._]+$/.test(username)) {
      setTimeout(() => { setUsernameStatus('invalid'); setUsernameMessage('Only letters, numbers, dots and underscores allowed') }, 0)
      return
    }

    setTimeout(() => { setUsernameStatus('checking'); setUsernameMessage('Checking availability...') }, 0)

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get(`/auth/check-username/${username}`)
        if (res.data.available) {
          setUsernameStatus('available')
          setUsernameMessage('Username is available')
        } else {
          setUsernameStatus('taken')
          setUsernameMessage(res.data.message)
        }
      } catch {
        setUsernameStatus('idle')
        setUsernameMessage('')
      }
    }, 500)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [form.username])

  const passwordStrength = getPasswordStrength(form.password)

  const getUsernameIcon = () => {
    if (usernameStatus === 'checking') return (
      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    )
    if (usernameStatus === 'available') return (
      <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    )
    if (usernameStatus === 'taken' || usernameStatus === 'invalid') return (
      <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    )
    return null
  }

  const isFormValid = () => {
    return usernameStatus === 'available' &&
      !validateName(form.first_name) &&
      !validateName(form.last_name) &&
      form.email.length > 0 &&
      form.password.length >= 8 &&
      form.password === form.confirm_password &&
      passwordStrength.score >= 3
  }

  const handleBlur = (field) => {
    setFocused('')
    const newErrors = { ...errors }
    if (field === 'first_name') newErrors.first_name = validateName(form.first_name)
    if (field === 'last_name') newErrors.last_name = validateName(form.last_name)
    setErrors(newErrors)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setAttemptedSubmit(true)

    const newErrors = {
      first_name: validateName(form.first_name),
      last_name: validateName(form.last_name),
    }
    setErrors(newErrors)

    if (!isFormValid()) return

    setError('')
    setLoading(true)
    try {
      await api.post('/auth/register', {
        username: form.username,
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        password: form.password,
        role: form.role,
      })
      navigate('/login', { state: { message: 'Account created successfully! Please sign in.' } })
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const inputClass = (hasError) =>
    `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${hasError ? 'border-red-400' : 'border-gray-300'}`

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-5 w-full max-w-md">
        <div className="mb-3">
          <h1 className="text-2xl font-bold text-gray-900 leading-tight">Create account</h1>
          <p className="text-gray-500 text-sm mt-1">Start mapping your skills to your career</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg mb-4">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">

          {/* Username */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <div className="relative">
              <input
                type="text"
                value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })}
                onFocus={() => setFocused('username')}
                onBlur={() => setFocused('')}
                className={`w-full border rounded-lg px-3 py-2 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  usernameStatus === 'available' ? 'border-green-400' :
                  usernameStatus === 'taken' || usernameStatus === 'invalid' ? 'border-red-400' :
                  attemptedSubmit && usernameStatus !== 'available' ? 'border-red-400' :
                  'border-gray-300'
                }`}
                placeholder="johndoe_123"
                required
              />
              <div className="absolute right-3 top-2.5">{getUsernameIcon()}</div>
            </div>
            {usernameMessage && (
              <p className={`text-xs mt-1 ${
                usernameStatus === 'available' ? 'text-green-600' :
                usernameStatus === 'taken' || usernameStatus === 'invalid' ? 'text-red-500' :
                'text-gray-400'
              }`}>{usernameMessage}</p>
            )}
            {attemptedSubmit && usernameStatus !== 'available' && !usernameMessage && (
              <p className="text-xs text-red-500 mt-1">Please enter a valid available username</p>
            )}
            {focused === 'username' && !usernameMessage && (
              <p className="text-xs text-gray-400 mt-1">Letters, numbers, dots and underscores only</p>
            )}
          </div>

          {/* First & Last Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
              <input
                type="text"
                value={form.first_name}
                onChange={e => setForm({ ...form, first_name: e.target.value })}
                onFocus={() => setFocused('first_name')}
                onBlur={() => handleBlur('first_name')}
                className={inputClass(errors.first_name)}
                placeholder="John"
                required
              />
              {errors.first_name && <p className="text-xs text-red-500 mt-1">{errors.first_name}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
              <input
                type="text"
                value={form.last_name}
                onChange={e => setForm({ ...form, last_name: e.target.value })}
                onFocus={() => setFocused('last_name')}
                onBlur={() => handleBlur('last_name')}
                className={inputClass(errors.last_name)}
                placeholder="Doe"
                required
              />
              {errors.last_name && <p className="text-xs text-red-500 mt-1">{errors.last_name}</p>}
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              onFocus={() => setFocused('email')}
              onBlur={() => setFocused('')}
              className={inputClass(attemptedSubmit && !form.email)}
              placeholder="jane@example.com"
              required
            />
            {attemptedSubmit && !form.email && (
              <p className="text-xs text-red-500 mt-1">Email is required</p>
            )}
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                onFocus={() => setFocused('password')}
                onBlur={() => setFocused('')}
                className={`w-full border rounded-lg px-3 py-2 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  attemptedSubmit && (form.password.length < 8 || passwordStrength.score < 3)
                    ? 'border-red-400' : 'border-gray-300'
                }`}
                placeholder="••••••••"
                required
                minLength={8}
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-2.5">
                <EyeIcon show={showPassword} />
              </button>
            </div>

            {/* Strength bar — shows when typing */}
            {form.password && (
              <div className="mt-2">
                <div className="flex gap-1 mb-1">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-all ${
                        i <= passwordStrength.score ? passwordStrength.color : 'bg-gray-200'
                      }`}
                    />
                  ))}
                </div>
                <p className={`text-xs ${
                  passwordStrength.score <= 2 ? 'text-red-500' :
                  passwordStrength.score <= 4 ? 'text-yellow-600' : 'text-green-600'
                }`}>
                  {passwordStrength.label} password
                </p>
              </div>
            )}

            {/* Error messages on submit */}
            {attemptedSubmit && form.password.length < 8 && (
              <p className="text-xs text-red-500 mt-1">Password must be at least 8 characters</p>
            )}
            {attemptedSubmit && form.password.length >= 8 && passwordStrength.score < 3 && (
              <p className="text-xs text-red-500 mt-1">Password is too weak — Medium strength required</p>
            )}

            {/* Hint — only when focused */}
            {focused === 'password' && (
              <p className="text-xs text-gray-400 mt-1">
                Min 8 characters with uppercase, numbers and symbols.
                <br />
                At least <span className="text-yellow-600 font-medium">Medium</span> strength required.
              </p>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={form.confirm_password}
                onChange={e => setForm({ ...form, confirm_password: e.target.value })}
                onFocus={() => setFocused('confirm_password')}
                onBlur={() => setFocused('')}
                className={`w-full border rounded-lg px-3 py-2 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  form.confirm_password && form.password === form.confirm_password ? 'border-green-400' :
                  (form.confirm_password && form.password !== form.confirm_password) ||
                  (attemptedSubmit && !form.confirm_password) ? 'border-red-400' :
                  'border-gray-300'
                }`}
                placeholder="••••••••"
                required
              />
              <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-2.5">
                <EyeIcon show={showConfirm} />
              </button>
            </div>
            {form.confirm_password && form.password !== form.confirm_password && (
              <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
            )}
            {form.confirm_password && form.password === form.confirm_password && (
              <p className="text-xs text-green-600 mt-1">Passwords match</p>
            )}
            {attemptedSubmit && !form.confirm_password && (
              <p className="text-xs text-red-500 mt-1">Please confirm your password</p>
            )}
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select
              value={form.role}
              onChange={e => setForm({ ...form, role: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="student">Student</option>
              <option value="employer">Employer</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-700 text-white py-2.5 rounded-lg font-medium hover:bg-blue-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="text-sm text-center text-gray-500 mt-3">
          Already have an account?{' '}
          <Link to="/login" className="text-blue-700 font-medium hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
