import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../api'

export default function Register() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    username: '',
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    role: 'student'
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Username availability state
  const [usernameStatus, setUsernameStatus] = useState('idle') // idle | checking | available | taken | invalid
  const [usernameMessage, setUsernameMessage] = useState('')
  const debounceRef = useRef(null)

  // Real-time username check with 500ms debounce
  useEffect(() => {
    const username = form.username
    if (!username) {
      setTimeout(() => {
        setUsernameStatus('idle')
        setUsernameMessage('')
      }, 0)
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)

    // Basic client-side format check
    if (username.length < 3) {
      setTimeout(() => {
        setUsernameStatus('invalid')
        setUsernameMessage('At least 3 characters required')
      }, 0)
      return
    }
    if (!/^[a-zA-Z0-9]/.test(username)) {
      setTimeout(() => {
        setUsernameStatus('invalid')
        setUsernameMessage('Must start with a letter or number')
      }, 0)
      return
    }
    if (!/^[a-zA-Z0-9._]+$/.test(username)) {
      setTimeout(() => {
        setUsernameStatus('invalid')
        setUsernameMessage('Only letters, numbers, dots and underscores allowed')
      }, 0)
      return
    }

    // Server check after 500ms
    setTimeout(() => {
      setUsernameStatus('checking')
      setUsernameMessage('Checking availability...')
    }, 0)

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

  const getUsernameMessageColor = () => {
    if (usernameStatus === 'available') return 'text-green-600'
    if (usernameStatus === 'taken' || usernameStatus === 'invalid') return 'text-red-500'
    return 'text-gray-400'
  }

  const isFormValid = () => {
    return usernameStatus === 'available' &&
      form.first_name.trim().length >= 1 &&
      form.last_name.trim().length >= 1 &&
      form.email.length > 0 &&
      form.password.length >= 6
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!isFormValid()) return
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/register', form)
      navigate('/login')
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh)] bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-md p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Create account</h1>
        <p className="text-gray-500 text-sm mb-6">Start mapping your skills to your career</p>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Username */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <div className="relative">
              <input
                type="text"
                value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })}
                className={`w-full border rounded-lg px-3 py-2 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  usernameStatus === 'available' ? 'border-green-400' :
                  usernameStatus === 'taken' || usernameStatus === 'invalid' ? 'border-red-400' :
                  'border-gray-300'
                }`}
                placeholder="johndoe_123"
                required
              />
              <div className="absolute right-3 top-2.5">
                {getUsernameIcon()}
              </div>
            </div>
            {usernameMessage && (
              <p className={`text-xs mt-1 ${getUsernameMessageColor()}`}>
                {usernameMessage}
              </p>
            )}
            <p className="text-xs text-gray-400 mt-1">
              Letters, numbers, dots and underscores only
            </p>
          </div>

          {/* First & Last Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
              <input
                type="text"
                value={form.first_name}
                onChange={e => setForm({ ...form, first_name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="John"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
              <input
                type="text"
                value={form.last_name}
                onChange={e => setForm({ ...form, last_name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Doe"
                required
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="jane@example.com"
              required
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
              required
              minLength={6}
            />
            <p className="text-xs text-gray-400 mt-1">At least 6 characters</p>
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
            disabled={loading || !isFormValid()}
            className="w-full bg-blue-700 text-white py-2 rounded-lg font-medium hover:bg-blue-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="text-sm text-center text-gray-500 mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-blue-700 font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
