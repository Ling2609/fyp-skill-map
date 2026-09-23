import { useState, useEffect } from 'react'
import { AuthContext } from './useAuth'
import api from '../api'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      const token = localStorage.getItem('token')
      if (!token) {
        if (!cancelled) { setUser(null); setLoading(false) }
        return
      }
      try {
        const res = await api.get('/auth/me')
        if (!cancelled) setUser(res.data)
      } catch {
        localStorage.removeItem('token')
        if (!cancelled) setUser(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    init()
    return () => { cancelled = true }
  }, [])

  const login = async (token) => {
    localStorage.setItem('token', token)
    try {
      const res = await api.get('/auth/me')
      setUser(res.data)
    } catch {
      localStorage.removeItem('token')
      setUser(null)
    }
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('moduleSelections')
    localStorage.removeItem('selectedModules')
    localStorage.removeItem('extraSkills')
    sessionStorage.removeItem('lastRecommendResults')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}