import { useState, useEffect } from 'react'
import { AuthContext } from './useAuth'
import api from '../api'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [serverDown, setServerDown] = useState(false)

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      const token = localStorage.getItem('token')
      if (!token) {
        if (!cancelled) { setUser(null); setLoading(false) }
        return
      }
      // Only a 401 means the token is bad. A network error or 500 (e.g. uvicorn reloading) used to log the
      // user out too (F22): now retry for a few seconds, and if the server is still down keep the token and
      // show "can't reach the server" instead of the login page.
      for (let attempt = 0; attempt < 4 && !cancelled; attempt++) {
        try {
          const res = await api.get('/auth/me')
          if (!cancelled) { setUser(res.data); setServerDown(false) }
          break
        } catch (err) {
          if (err.response?.status === 401) {
            localStorage.removeItem('token')
            if (!cancelled) setUser(null)
            break
          }
          if (attempt === 3) { if (!cancelled) setServerDown(true); break }
          await new Promise(r => setTimeout(r, 1500))
        }
      }
      if (!cancelled) setLoading(false)
    }

    init()
    return () => { cancelled = true }
  }, [])

  const login = async (token) => {
    sessionStorage.clear()   // don't show a previous user's cached job matches
    localStorage.setItem('token', token)
    try {
      const res = await api.get('/auth/me')
      setUser(res.data)
      setServerDown(false)
    } catch (err) {
      localStorage.removeItem('token')
      setUser(null)
      throw err   // let Login show an error instead of moving to a page that bounces back (F22)
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
    <AuthContext.Provider value={{ user, loading, serverDown, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}