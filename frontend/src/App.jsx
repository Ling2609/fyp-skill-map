import { Routes, Route, Navigate} from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Register from './pages/Register'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Modules from './pages/Modules'
import Recommend from './pages/Recommend'
import JobDetail from './pages/JobDetail'

function PrivateRoute({ children }) {
  return localStorage.getItem('token') ? children : <Navigate to="/login" />
}

function Layout({ children }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 ml-56 min-h-screen">
        {children}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" />} />
      <Route path="/register" element={<Register />} />
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={
        <PrivateRoute><Layout><Dashboard /></Layout></PrivateRoute>
      } />
      <Route path="/modules" element={
        <PrivateRoute><Layout><Modules /></Layout></PrivateRoute>
      } />
      <Route path="/recommend" element={
        <PrivateRoute><Layout><Recommend /></Layout></PrivateRoute>
      } />
      <Route path="/jobs/:jobId" element={
        <PrivateRoute><Layout><JobDetail /></Layout></PrivateRoute>
      } />
      <Route path="/chatbot" element={
        <PrivateRoute><Layout><div className="p-8"><h1 className="text-2xl font-bold text-gray-800">AI Assistant</h1><p className="text-gray-500 mt-2">Coming soon — Sprint 5</p></div></Layout></PrivateRoute>
      } />
    </Routes>
  )
}