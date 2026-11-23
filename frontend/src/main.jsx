import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import App from './App.jsx'
import './index.css'
import { startScrollFade } from './scrollFade'
import { startKeepInView } from './keepInView'

startScrollFade()
startKeepInView()

const router = createBrowserRouter([{
  path: '*',
  element: <AuthProvider><App /></AuthProvider>,
}])

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
