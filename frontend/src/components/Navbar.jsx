import { Link, useNavigate } from 'react-router-dom'

export default function Navbar() {
  const navigate = useNavigate()
  const token = localStorage.getItem('token')

  const logout = () => {
    localStorage.removeItem('token')
    navigate('/login')
  }

  return (
    <nav className="bg-blue-700 text-white px-6 py-4 flex items-center justify-between shadow-md">
      <Link to="/dashboard" className="text-xl font-bold tracking-tight">
        SkillMap
      </Link>
      {token && (
        <div className="flex gap-6 items-center text-sm">
          <Link to="/dashboard" className="hover:text-blue-200 transition">Dashboard</Link>
          <Link to="/modules" className="hover:text-blue-200 transition">My Modules</Link>
          <Link to="/recommend" className="hover:text-blue-200 transition">Jobs</Link>
          <button
            onClick={logout}
            className="bg-white text-blue-700 px-3 py-1 rounded font-medium hover:bg-blue-100 transition"
          >
            Logout
          </button>
        </div>
      )}
    </nav>
  )
}