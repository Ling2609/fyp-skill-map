import { Routes, Route, Navigate } from 'react-router-dom'
import { SidebarProvider, useSidebar } from './components/SidebarContext'
import Sidebar from './components/Sidebar'
import Register from './pages/Register'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Recommend from './pages/Recommend'
import JobDetail from './pages/JobDetail'
import Chatbot from './pages/Chatbot'
import Profile from './pages/Profile'

function PrivateRoute({ children }) {
  return localStorage.getItem('token') ? children : <Navigate to="/login" />
}

function Layout({ children }) {
  const { collapsed } = useSidebar()
  return (
    <div className="flex min-h-screen bg-slate-100">
      <Sidebar />
      <main
        className="flex-1 min-h-screen transition-all duration-300"
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
      <Route path="/dashboard" element={<PrivateRoute><Layout><Dashboard /></Layout></PrivateRoute>} />
      <Route path="/modules" element={<Navigate to="/profile?tab=modules" replace />} />
      <Route path="/recommend" element={<PrivateRoute><Layout><Recommend /></Layout></PrivateRoute>} />
      <Route path="/jobs/:jobId" element={<PrivateRoute><Layout><JobDetail /></Layout></PrivateRoute>} />
      <Route path="/chatbot" element={<PrivateRoute><Layout><Chatbot /></Layout></PrivateRoute>} />
      <Route path="/profile" element={<PrivateRoute><Layout><Profile /></Layout></PrivateRoute>} />
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