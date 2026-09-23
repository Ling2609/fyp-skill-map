import { Routes, Route, Navigate } from 'react-router-dom'
import { SidebarProvider, useSidebar } from './components/SidebarContext'
import { useAuth } from './context/useAuth'
import Sidebar from './components/Sidebar'
import Register from './pages/Register'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Recommend from './pages/Recommend'
import JobDetail from './pages/JobDetail'
import Chatbot from './pages/Chatbot'
import Profile from './pages/Profile'

function RoleRoute({ children, roles }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" />
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" />
  return children
}

function Layout({ children }) {
  const { collapsed } = useSidebar()
  return (
    <div className="flex min-h-screen bg-slate-100">
      <Sidebar />
      <main
        className="flex-1 min-h-screen min-w-0 overflow-x-hidden transition-all duration-300"
        style={{ marginLeft: collapsed ? '64px' : '224px' }}
      >
        {children}
      </main>
    </div>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" />} />
      <Route path="/register" element={<Register />} />
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<RoleRoute><Layout><Dashboard /></Layout></RoleRoute>} />
      <Route path="/modules" element={<Navigate to="/profile?tab=modules" replace />} />
      <Route path="/recommend" element={<RoleRoute roles={['student']}><Layout><Recommend /></Layout></RoleRoute>} />
      <Route path="/jobs/:jobId" element={<RoleRoute><Layout><JobDetail /></Layout></RoleRoute>} />
      <Route path="/chatbot" element={<RoleRoute><Layout><Chatbot /></Layout></RoleRoute>} />
      <Route path="/profile" element={<RoleRoute><Layout><Profile /></Layout></RoleRoute>} />
    </Routes>
  )
}

export default function App() {
  return (
    <SidebarProvider>
      <AppRoutes />
    </SidebarProvider>
  )
}