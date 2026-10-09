/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react'

const SidebarContext = createContext()

// Below 768px (phones, a narrow window) the sidebar starts as the icon rail, so pages keep most of the width.
// The « button still opens it. Before 9 Oct it was always open, leaving a phone about 190px for the page.
const NARROW = '(max-width: 767px)'
const isNarrow = () => typeof window !== 'undefined' && window.matchMedia?.(NARROW).matches

export function SidebarProvider({ children }) {
  const [collapsed, setCollapsed] = useState(isNarrow)
  useEffect(() => {
    const mq = window.matchMedia?.(NARROW)
    if (!mq) return
    const onChange = (e) => { if (e.matches) setCollapsed(true) }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  return useContext(SidebarContext)
}
