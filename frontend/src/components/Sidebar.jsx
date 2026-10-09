import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import api from '../api'
import { useSidebar } from './SidebarContext'
import { useAuth } from '../context/useAuth'

const NAV_ITEMS = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    // 8 Oct: one page for the showcase and editing; 9 Oct: second, because the student fills it in before the
    // results on Job Matches and the AI Assistant mean much (input first, then results)
    to: '/profile',
    label: 'My Profile',
    icon: (
      <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  {
    to: '/recommend',
    label: 'Job Matches',
    icon: (
      <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    to: '/chatbot',
    label: 'AI Assistant',
    icon: (
      <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
  },
]

export const ADMIN_COUNTS_CHANGED = 'admin-counts-changed'

// Admin = the career office (7 Oct, layout D): Users carries a badge for employers waiting for approval
const ADMIN_ITEMS = [
  NAV_ITEMS[0],
  {
    to: '/admin/users',
    label: 'Users',
    badge: 'pending_employers',
    icon: (
      <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    to: '/admin/academic',
    label: 'Academics',          // page title "Academic structure"; the full name doesn't fit the 192px sidebar with its badge
    badge: 'modules_to_review',
    badgeLabel: 'to review',
    icon: (
      <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422A12.083 12.083 0 0118.82 17.9 11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.155 12.083 12.083 0 01.665-7.322L12 14zm-4 6v-7.5l4-2.222" />
      </svg>
    ),
  },
]

const ROLE_LABEL = { student: 'For Graduates', employer: 'For Employers', admin: 'Admin Panel' }
const ROLE_NAME = { student: 'Student', employer: 'Employer', admin: 'Admin' }

export default function Sidebar() {
  const navigate = useNavigate()
  const { collapsed, setCollapsed } = useSidebar()
  const { user, logout: authLogout } = useAuth()
  const location = useLocation()
  const isAdmin = user?.role === 'admin'
  const items = isAdmin ? ADMIN_ITEMS : NAV_ITEMS

  // Admin badges, asked again on every page change (two small counts), so an approval shows straight away
  // and when an admin page says something changed (an approval on the dashboard doesn't change the page)
  const [counts, setCounts] = useState({})
  const [countsTick, setCountsTick] = useState(0)
  useEffect(() => {
    const bump = () => setCountsTick(t => t + 1)
    window.addEventListener(ADMIN_COUNTS_CHANGED, bump)
    return () => window.removeEventListener(ADMIN_COUNTS_CHANGED, bump)
  }, [])
  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    api.get('/admin/counts').then(res => { if (!cancelled) setCounts(res.data) }).catch(() => {})
    return () => { cancelled = true }
  }, [isAdmin, location.pathname, location.search, countsTick])

  const logout = () => {
    sessionStorage.clear()
    authLogout()
    navigate('/login')
  }

  // User menu (4 Oct): the name opens a small menu with Account settings and Logout (LinkedIn "Me" menu pattern,
  // references.md "Personal details page"). Closes on a click outside, Esc, or choosing an item.
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey) }
  }, [menuOpen])
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || 'Account'
  const initials = ((user?.first_name?.[0] || '') + (user?.last_name?.[0] || '')).toUpperCase() || '?'

  return (
    <div className={`${collapsed ? 'w-14' : 'w-48'} bg-white border-r border-slate-200 flex flex-col h-screen fixed left-0 top-0 z-10 transition-all duration-200`}>

      {/* Logo + collapse */}
      <div className="px-3 py-4 border-b border-slate-100 flex items-center justify-between min-h-15">
        {!collapsed && (
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 leading-none tracking-tight">SkillMap</p>
              <p className="text-[10px] text-slate-400 mt-0.5 font-medium tracking-wide uppercase">{ROLE_LABEL[user?.role] ?? 'SkillMap'}</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center mx-auto">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition shrink-0"
        >
          {collapsed ? (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          )}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {items.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            title={collapsed ? item.label : ''}
            className={({ isActive }) =>
              `relative flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-all ${
                collapsed ? 'justify-center' : ''
              } ${
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`shrink-0 w-4.5 h-4.5 flex items-center justify-center ${isActive ? 'text-blue-600' : 'text-slate-400'}`}>
                  {item.icon}
                </span>
                {!collapsed && <span className="truncate flex-1">{item.label}</span>}
                {item.badge && counts[item.badge] > 0 && (
                  <span aria-label={`${counts[item.badge]} ${item.badgeLabel || 'waiting'}`}
                    className={`text-[11px] font-semibold bg-amber-100 text-amber-800 rounded-full px-1.5 min-w-5 text-center ${
                      collapsed ? 'absolute ml-5 -mt-4' : ''}`}>
                    {counts[item.badge]}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User menu */}
      <div ref={menuRef} className="relative px-2 pb-4 pt-2 border-t border-slate-100">
        {menuOpen && (
          <div role="menu"
            className={`absolute z-20 w-52 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 ${
              collapsed ? 'left-full bottom-3 ml-2' : 'left-2 right-2 w-auto bottom-full mb-1'}`}>
            <div className="px-3.5 pt-1.5 pb-2.5 border-b border-slate-100 mb-1">
              <p className="text-sm font-medium text-slate-800 truncate">{fullName}</p>
              <p className="text-xs text-slate-400 truncate">{user?.email}</p>
            </div>
            <button role="menuitem" onClick={() => { setMenuOpen(false); navigate('/account') }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Account settings
            </button>
            <button role="menuitem" onClick={logout}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-600 hover:bg-red-50 hover:text-red-600">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>
        )}
        <button onClick={() => setMenuOpen(o => !o)} aria-haspopup="menu" aria-expanded={menuOpen}
          title={collapsed ? fullName : ''}
          className={`w-full flex items-center gap-2.5 px-1.5 py-1.5 rounded-lg text-left transition ${
            menuOpen ? 'bg-slate-100' : 'hover:bg-slate-50'} ${collapsed ? 'justify-center' : ''}`}>
          <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold flex items-center justify-center shrink-0">
            {initials}
          </span>
          {!collapsed && (
            <>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-slate-800 truncate">{fullName}</span>
                <span className="block text-xs text-slate-400">{ROLE_NAME[user?.role] ?? ''}</span>
              </span>
              <svg className={`w-4 h-4 text-slate-400 shrink-0 transition ${menuOpen ? '-rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </>
          )}
        </button>
      </div>
    </div>
  )
}