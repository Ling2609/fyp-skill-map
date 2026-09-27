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
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginCall = error.config?.url?.includes('/auth/login')
    if (error.response?.status === 401 && !isLoginCall && localStorage.getItem('token')) {
      localStorage.removeItem('token')
      sessionStorage.clear()
      window.location.href = '/login?expired=1'
    }
    return Promise.reject(error)
  }
)

export default api
