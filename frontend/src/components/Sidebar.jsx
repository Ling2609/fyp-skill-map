import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import api from '../api'
import { useAuth } from '../context/useAuth'
import { Logo } from './ui/index.jsx'
import { useSidebar } from './SidebarContext'

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
    // 11 Oct (Employer flow batch 2): jobs applied for on SkillMap and their status
    to: '/applications',
    label: 'My Applications',
    badge: 'invitations',            // 12 Oct: employers' invitations to apply, waiting for an answer
    badgeLabel: 'invitations',
    icon: (
      <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
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

function useMedia(q) {
  return useSyncExternalStore(
    (cb) => { const m = matchMedia(q); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb) },
    () => matchMedia(q).matches, () => false)
}

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

// Employer (11 Oct, batch 1; 12 Oct dashboard E): Dashboard is their home (/dashboard), My Jobs carries a badge for
// new applications, Post a Job. Not approved yet: home only (it shows where they stand)
const EMPLOYER_ITEMS = [
  NAV_ITEMS[0],
  { ...NAV_ITEMS[2], to: '/employer/jobs', label: 'My Jobs', badge: 'new_applicants', badgeLabel: 'new' },
  {
    to: '/employer/post',
    label: 'Post a Job',
    icon: (
      <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 4v16m8-8H4" />
      </svg>
    ),
  },
]

// 19 Nov (her pick B, glass headers): every page header shows its menu item's icon. Pages not in the menu borrow
// the nearest one (a job -> Job Matches, an applicant -> Users); Account settings gets a gear
const GEAR = (
  <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.3 4.3c.4-1.7 3-1.7 3.4 0a1.7 1.7 0 0 0 2.6 1.1c1.5-.9 3.3.8 2.4 2.4a1.7 1.7 0 0 0 1 2.5c1.8.4 1.8 3 0 3.4a1.7 1.7 0 0 0-1 2.6c.9 1.5-.9 3.3-2.4 2.4a1.7 1.7 0 0 0-2.6 1c-.4 1.8-3 1.8-3.4 0a1.7 1.7 0 0 0-2.5-1c-1.6.9-3.3-.9-2.4-2.4a1.7 1.7 0 0 0-1.1-2.6c-1.7-.4-1.7-3 0-3.4a1.7 1.7 0 0 0 1.1-2.5c-.9-1.6.8-3.3 2.4-2.4a1.7 1.7 0 0 0 2.5-1.1Z" />
    <circle cx="12" cy="12" r="3" strokeWidth={1.75} />
  </svg>
)
const ICON_ROUTES = [
  ...NAV_ITEMS, ...ADMIN_ITEMS, ...EMPLOYER_ITEMS,
  { to: '/account', icon: GEAR },
  { to: '/jobs', icon: NAV_ITEMS[2].icon },
  { to: '/employer/applications', icon: ADMIN_ITEMS[1].icon },
  { to: '/employer/graduates', icon: ADMIN_ITEMS[1].icon },
  { to: '/admin/workshop', icon: NAV_ITEMS[0].icon },
]
// eslint-disable-next-line react-refresh/only-export-components
export function navIcon(path) {
  const hits = ICON_ROUTES.filter(r => path === r.to || path.startsWith(r.to + '/'))
  return hits.sort((a, b) => b.to.length - a.to.length)[0]?.icon ?? null
}

const ROLE_NAME = { student: 'Student', employer: 'Employer', admin: 'Admin' }

const itemsFor = (user) => user?.role === 'admin' ? ADMIN_ITEMS
  : user?.role === 'employer' ? (user.employer_status === 'approved' ? EMPLOYER_ITEMS : EMPLOYER_ITEMS.slice(0, 1))
  : NAV_ITEMS

// The menu badges and the bell read the same small counts; asked again on every page change and when a page says
// something changed (an approval on the dashboard doesn't change the page)
function useNavCounts() {
  const { user } = useAuth()
  const location = useLocation()
  const [counts, setCounts] = useState({})
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const bump = () => setTick(t => t + 1)
    window.addEventListener(ADMIN_COUNTS_CHANGED, bump)
    return () => window.removeEventListener(ADMIN_COUNTS_CHANGED, bump)
  }, [])
  const url = user?.role === 'admin' ? '/admin/counts'
    : user?.role === 'employer' && user.employer_status === 'approved' ? '/employer/counts'
    : user?.role === 'student' ? '/applications/counts' : null
  useEffect(() => {
    if (!url) return
    let cancelled = false
    api.get(url).then(res => { if (!cancelled) setCounts(res.data) }).catch(() => {})
    return () => { cancelled = true }
  }, [url, location.pathname, location.search, tick])
  const items = itemsFor(user)
  const waiting = items.reduce((n, item) => n + (item.badge ? counts[item.badge] || 0 : 0), 0)
  const bellTo = user?.role === 'admin' ? '/admin/users' : user?.role === 'employer' ? '/employer/jobs' : '/applications'
  return { items, counts, waiting, bellTo }
}

const BELL = <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0" /></svg>

// 20 Nov (her review): on laptops and tablets the bell sits at the page's top right (the greeting line, or the page
// header); phones keep it in their top bar
export function Bell({ className = '' }) {
  const { waiting, bellTo } = useNavCounts()
  const label = waiting ? `${waiting} waiting for you` : 'Nothing new'
  return (
    <Link to={bellTo} title={label} aria-label={label} className={`page-bell ${className}`}>
      {BELL}
      {waiting > 0 && <span className="page-bell-n" aria-hidden="true">{waiting}</span>}
    </Link>
  )
}

export default function Sidebar() {
  const navigate = useNavigate()
  const { user, logout: authLogout } = useAuth()
  const { items, counts, waiting, bellTo } = useNavCounts()
  // 20 Nov (her review): the sidebar folds to an icon rail (remembered); under 1280px it is always the rail
  // the same fold state as her sidebar before the redesign (SidebarContext: open by default)
  const { collapsed: folded, setCollapsed } = useSidebar()
  const narrow = useMedia('(min-width: 640px) and (max-width: 1359px)')
  const rail = folded || narrow
  const fold = () => setCollapsed(!folded)

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

  // 20 Nov (her pick, after a review of her ~1440x735 screen): a SIDEBAR, not a top bar. A wide, short laptop has spare
  // width and too little height, so the menu moves to the side and gives every page ~60px of height back.
  //   >= 1280px: a floating card on the left, icons + labels, bell and account at its foot
  //   640-1279px: the same card as an icon rail (labels stay for screen readers and as tooltips)
  //   < 640px (phones): a slim top bar (logo, bell, account) and the menu as a bottom tab bar (thumb reach)
  // Styles: .sb-* in index.css. The page column's offsets follow in App.jsx (#main) and --bar-h.
  return (
    <header className={`sb${rail ? ' rail' : ''}`}>
      {/* 20 Nov (her review): the fold button sits at the sidebar's top right */}
      <div className="sb-top">
        <Link to="/" aria-label="SkillMap home" className="sb-brand">
          <Logo />
          <span className="sb-name">SkillMap</span>
        </Link>
        {/* her 21 Oct rule kept: open, « sits beside the logo; folded, a small round » on the sidebar's edge */}
        {!narrow && (
          <button type="button" onClick={fold} className={`sb-fold${folded ? ' edge' : ''}`} aria-label={folded ? 'Expand the sidebar' : 'Collapse the sidebar'}
            title={folded ? 'Expand the sidebar' : 'Collapse the sidebar'}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={folded ? 'M13 5l7 7-7 7M5 5l7 7-7 7' : 'M11 19l-7-7 7-7m8 14l-7-7 7-7'} />
            </svg>
          </button>
        )}
      </div>

      <nav aria-label="SkillMap menu" className="sb-nav">
        {items.map(item => (
          <NavLink key={item.to} to={item.to} title={item.label} className={({ isActive }) => `sb-item${isActive ? ' on' : ''}`}>
            <span className="sb-ic" aria-hidden="true">{item.icon}</span>
            <span className="sb-label">{item.label}</span>
            {item.badge && counts[item.badge] > 0 && (
              <span className={`sb-badge${item.badge === 'invitations' ? ' inv' : ''}`} aria-label={`${counts[item.badge]} ${item.badgeLabel || 'waiting'}`}>{counts[item.badge]}</span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="sb-foot">
        <Link to={bellTo} title={waiting ? `${waiting} waiting for you` : 'Nothing new'} aria-label={waiting ? `${waiting} waiting for you` : 'Nothing new'} className="sb-item sb-bell">
          <span className="sb-ic" aria-hidden="true">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0" />
            </svg>
            {waiting > 0 && <span className="sb-dot" />}
          </span>
          <span className="sb-label" aria-hidden="true">{waiting ? `${waiting} waiting for you` : 'Nothing new'}</span>
        </Link>



        <div ref={menuRef} className="sb-acct">
          {menuOpen && (
            <div role="menu" className="sb-menu">
              <div className="px-3.5 pt-1.5 pb-2.5 border-b border-line mb-1">
                <p className="text-body font-medium text-ink truncate m-0">{fullName}</p>
                <p className="text-small text-faint truncate m-0">{user?.email}</p>
              </div>
              <button role="menuitem" onClick={() => { setMenuOpen(false); navigate('/account') }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-body text-muted hover:bg-well hover:text-ink">
                <span className="w-4 h-4 text-faint [&>svg]:w-4 [&>svg]:h-4" aria-hidden="true">{GEAR}</span>
                Account settings
              </button>
              <button role="menuitem" onClick={logout}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-body text-muted hover:bg-missing-soft hover:text-missing-strong">
                <svg className="w-4 h-4 text-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout
              </button>
            </div>
          )}
          <button onClick={() => setMenuOpen(o => !o)} aria-haspopup="menu" aria-expanded={menuOpen} title={fullName}
            className={`sb-me${menuOpen ? ' open' : ''}`}>
            <span className="sb-ava">{initials}</span>
            <span className="sb-who">
              <span className="block text-small font-semibold text-ink truncate">{fullName}</span>
              <span className="block text-label text-faint">{ROLE_NAME[user?.role] ?? ''}</span>
            </span>
            <svg className={`sb-chev w-3.5 h-3.5 text-faint shrink-0 transition ${menuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4M16 15l-4 4-4-4" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  )
}
