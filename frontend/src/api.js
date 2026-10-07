import axios from 'axios'

const api = axios.create({
  // Set VITE_API_URL in frontend/.env for Docker/deployment; falls back to local dev
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000',
})

// Attach JWT to every request automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Token expired or invalid → clear it and send the user back to login,
// instead of each page showing a confusing error (e.g. "profile is empty").
// A wrong password on /auth/login is also a 401, so that one is left alone.
// Pages keep slow answers for a short while (pageCache.js), so moving between pages does not reload them (6 Oct).
// Any change to the profile (grades, projects, certificates) makes them out of date: drop them straight away.
export const PAGE_CACHE = 'pageCache'

api.interceptors.response.use(
  (response) => {
    const method = (response.config?.method || 'get').toLowerCase()
    if (method !== 'get' && response.config?.url?.startsWith('/profile')) sessionStorage.removeItem(PAGE_CACHE)
    return response
  },
  (error) => {
    const isLoginCall = error.config?.url?.includes('/auth/login')
    // On public pages (e.g. an old token while opening Register) just drop the token;
    // AuthContext handles that case, no need to reload the page to /login
    const onPublicPage = ['/', '/login', '/register', '/forgot-password'].includes(window.location.pathname)
    if (error.response?.status === 401 && !isLoginCall && !onPublicPage && localStorage.getItem('token')) {
      localStorage.removeItem('token')
      sessionStorage.clear()
      // Password changed on another device (4 Oct): say so, instead of "session expired"
      const detail = error.response.data?.detail || ''
      const reason = detail.startsWith('Your password was changed') ? 'password'
        : detail.startsWith('This account has been deactivated') ? 'deactivated' : '1'
      window.location.href = `/login?expired=${reason}`
    }
    return Promise.reject(error)
  }
)

export default api
