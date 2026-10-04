import { Routes, Route, Navigate } from 'react-router-dom'
import { SidebarProvider, useSidebar } from './components/SidebarContext'
import { useAuth } from './context/useAuth'
import Sidebar from './components/Sidebar'
import Register from './pages/auth/Register';
import Login from './pages/auth/Login';
import ForgotPassword from './pages/auth/ForgotPassword'
import Dashboard from './pages/student/Dashboard';
import Recommend from './pages/student/Recommend';
import JobDetail from './pages/student/JobDetail';
import Chatbot from './pages/student/Chatbot';
import Profile from './pages/student/Profile';
import AccountSettings from './pages/AccountSettings'

function RoleRoute({ children, roles }) {
  const { user, loading, serverDown } = useAuth()
  if (loading) return null
  if (!user && serverDown) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="bg-white rounded-xl shadow p-6 text-center max-w-sm">
        <p className="font-semibold text-slate-800">Can't reach the server</p>
        <p className="text-sm text-slate-500 mt-1">You're still signed in. Check that the backend is running, then retry.</p>
        <button onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">Retry</button>
      </div>
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" />
  return children
}

function Layout({ children }) {
  const { collapsed } = useSidebar()
  return (
    <div className="flex min-h-screen bg-slate-100">
      <Sidebar />
      {/* Same width classes and timing as the sidebar (w-14 / w-56, 200 ms); 64px left an 8px gap when collapsed */}
      <main
        className={`flex-1 min-h-screen min-w-0 overflow-x-hidden transition-all duration-200 ${collapsed ? 'ml-14' : 'ml-56'}`}
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
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/dashboard" element={<RoleRoute><Layout><Dashboard /></Layout></RoleRoute>} />
      <Route path="/modules" element={<Navigate to="/profile?tab=modules" replace />} />
      <Route path="/recommend" element={<RoleRoute roles={['student']}><Layout><Recommend /></Layout></RoleRoute>} />
      <Route path="/jobs/:jobId" element={<RoleRoute><Layout><JobDetail /></Layout></RoleRoute>} />
      <Route path="/chatbot" element={<RoleRoute><Layout><Chatbot /></Layout></RoleRoute>} />
      <Route path="/profile" element={<RoleRoute><Layout><Profile /></Layout></RoleRoute>} />
      <Route path="/account" element={<RoleRoute><Layout><AccountSettings /></Layout></RoleRoute>} />
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