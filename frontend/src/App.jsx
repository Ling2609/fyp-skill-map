import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { SidebarProvider, useSidebar } from './components/SidebarContext'
import { useAuth } from './context/useAuth'
import Sidebar from './components/Sidebar'
// 13 Oct (audit: one 759 kB file): each page's code loads when it is first opened, so a student never downloads the
// admin or employer pages, and the sign-in page opens faster. The sign-in pages stay in the first file.
import Register from './pages/auth/Register';
import Login from './pages/auth/Login';
import ForgotPassword from './pages/auth/ForgotPassword'
const Dashboard = lazy(() => import('./pages/student/Dashboard'))
const Recommend = lazy(() => import('./pages/student/Recommend'))
const JobDetail = lazy(() => import('./pages/student/JobDetail'))
const Chatbot = lazy(() => import('./pages/student/Chatbot'))
const MyProfile = lazy(() => import('./pages/student/MyProfile'))
const StudySetup = lazy(() => import('./pages/student/StudySetup'))
const AccountSettings = lazy(() => import('./pages/AccountSettings'))
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'))
const AdminAcademic = lazy(() => import('./pages/admin/AdminAcademic'))
const EmployerHome = lazy(() => import('./pages/employer/EmployerHome'))
const EmployerJobs = lazy(() => import('./pages/employer/EmployerJobs'))
const PostJob = lazy(() => import('./pages/employer/PostJob'))
const Applicants = lazy(() => import('./pages/employer/Applicants'))
const ApplicantProfile = lazy(() => import('./pages/employer/ApplicantProfile'))
const MyApplications = lazy(() => import('./pages/student/MyApplications'))
const Privacy = lazy(() => import('./pages/Privacy'))

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
  // An employer the career office hasn't approved only sees their status (on /dashboard) and account settings
  if (user.role === 'employer' && user.employer_status !== 'approved' && !['/dashboard', '/account'].includes(pathname)) return <Navigate to="/dashboard" replace />
  // First sign-in setup (8 Oct): a student without a programme picks one before anything else
  // 10 Oct: also a student whose programme has intakes but who hasn't picked one (each intake has its own module list)
  if (user.role === 'student' && (!user.programme_id || user.needs_study) && pathname !== '/setup') return <Navigate to="/setup" replace />
  return children
}

// One /dashboard address for everyone (Login goes there); each role sees its own home (7 Oct)
function Home() {
  const { user } = useAuth()
  if (user?.role === 'admin') return <AdminDashboard />
  if (user?.role === 'employer') return <EmployerHome />     // 12 Oct: the employer dashboard, or "waiting for approval"
  return <Dashboard />
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
    // fallback null: a page's code arrives in well under a second, too short to need a loading sign (NN/g)
    <Suspense fallback={null}>
    <Routes>
      <Route path="/" element={<Navigate to="/login" />} />
      <Route path="/register" element={<Register />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/dashboard" element={<RoleRoute><Layout><Home /></Layout></RoleRoute>} />
      <Route path="/admin/users" element={<RoleRoute roles={['admin']}><Layout><AdminUsers /></Layout></RoleRoute>} />
      <Route path="/admin/academic" element={<RoleRoute roles={['admin']}><Layout><AdminAcademic /></Layout></RoleRoute>} />
      <Route path="/employer/post" element={<RoleRoute roles={['employer']}><Layout><PostJob /></Layout></RoleRoute>} />
      <Route path="/employer/jobs" element={<RoleRoute roles={['employer']}><Layout><EmployerJobs /></Layout></RoleRoute>} />
      <Route path="/employer/graduates/:studentId" element={<RoleRoute roles={['employer']}><Layout><ApplicantProfile /></Layout></RoleRoute>} />
      <Route path="/employer/jobs/:jobId/edit" element={<RoleRoute roles={['employer']}><Layout><PostJob /></Layout></RoleRoute>} />
      <Route path="/employer/jobs/:jobId" element={<RoleRoute roles={['employer']}><Layout><Applicants /></Layout></RoleRoute>} />
      <Route path="/employer/applications/:appId" element={<RoleRoute roles={['employer']}><Layout><ApplicantProfile /></Layout></RoleRoute>} />
      <Route path="/applications" element={<RoleRoute roles={['student']}><Layout><MyApplications /></Layout></RoleRoute>} />
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
    </Suspense>
  )
}

export default function App() {
  return (
    <SidebarProvider>
      <AppRoutes />
    </SidebarProvider>
  )
}