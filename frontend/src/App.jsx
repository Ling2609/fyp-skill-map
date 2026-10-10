import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
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
import MyProfile from './pages/student/MyProfile'
import StudySetup from './pages/student/StudySetup'
import AccountSettings from './pages/AccountSettings'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminUsers from './pages/admin/AdminUsers'
import AdminAcademic from './pages/admin/AdminAcademic'

function RoleRoute({ children, roles }) {
  const { user, loading, serverDown } = useAuth()
  const { pathname } = useLocation()
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
  // First sign-in setup (8 Oct): a student without a programme picks one before anything else
  // 10 Oct: also a student whose programme has intakes but who hasn't picked one (each intake has its own module list)
  if (user.role === 'student' && (!user.programme_id || user.needs_study) && pathname !== '/setup') return <Navigate to="/setup" replace />
  return children
}

// One /dashboard address for everyone (Login goes there); each role sees its own home (7 Oct)
function Home() {
  const { user } = useAuth()
  return user?.role === 'admin' ? <AdminDashboard /> : <Dashboard />
}

function Layout({ children }) {
  const { collapsed } = useSidebar()
  return (
    <div className="flex min-h-screen bg-slate-100">
      <Sidebar />
      {/* Same width classes and timing as the sidebar (w-14 / w-48, 200 ms; 192px since 9 Oct, was 224px with empty space after the labels); 64px left an 8px gap when collapsed */}
      <main
        className={`flex-1 min-h-screen min-w-0 overflow-x-hidden transition-all duration-200 ${collapsed ? 'ml-14' : 'ml-48'}`}
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
      <Route path="/dashboard" element={<RoleRoute><Layout><Home /></Layout></RoleRoute>} />
      <Route path="/admin/users" element={<RoleRoute roles={['admin']}><Layout><AdminUsers /></Layout></RoleRoute>} />
      <Route path="/admin/academic" element={<RoleRoute roles={['admin']}><Layout><AdminAcademic /></Layout></RoleRoute>} />
      <Route path="/setup" element={<RoleRoute roles={['student']}><StudySetup /></RoleRoute>} />
      <Route path="/modules" element={<Navigate to="/profile?tab=modules" replace />} />
      <Route path="/recommend" element={<RoleRoute roles={['student']}><Layout><Recommend /></Layout></RoleRoute>} />
      <Route path="/jobs/:jobId" element={<RoleRoute><Layout><JobDetail /></Layout></RoleRoute>} />
      <Route path="/chatbot" element={<RoleRoute roles={['student']}><Layout><Chatbot /></Layout></RoleRoute>} />
      {/* 8 Oct: My Profile and Skill Profile are one page; the old /my-profile address still works */}
      <Route path="/profile" element={<RoleRoute roles={['student']}><Layout><MyProfile /></Layout></RoleRoute>} />
      <Route path="/my-profile" element={<Navigate to="/profile" replace />} />
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