import { useLocation } from 'react-router-dom'
import { Bell, navIcon } from './Sidebar'

// 19 Nov (her pick B, mock review/page-headers.html): every page header is the Dashboard's glass card: frosted glass,
// the map texture, soft blue/teal/coral glows and the page's menu icon in a blue tile. The page's own eyebrow, title
// and one line stay as children (styled by .page-glass in index.css), so no page had to change its markup.
// `strong` (21 Oct, a heavier line under an applicant's heading) is still accepted from callers; the card itself now
// sets the heading apart from the CV below.
export default function PageHeader({ children, icon, bell = false }) {
  const { pathname } = useLocation()
  const ic = icon === undefined ? navIcon(pathname) : icon
  return (
    <div className="page-glass shrink-0 mx-4 mt-4 mb-1 sm:mx-8">
      {ic && <span className="page-glass-ic" aria-hidden="true">{ic}</span>}
      {/* the bell only on a Dashboard (20 Nov, her call); other pages show the menu's badges */}
      <div className={`relative px-4 pt-5 sm:px-7 ${bell ? 'flex items-start gap-4' : ''} ${ic ? 'page-glass-body' : ''}`}>
        {bell ? <><div className="min-w-0 flex-1">{children}</div><Bell className="-mt-1" /></> : children}
      </div>
    </div>
  )
}

// The header's counts: one white strip (19 Nov, her review: "slightly more contrast"). items: [number, label, tone]
// with tone 'blue' (all), 'good' (offers), 'todo' (needs you) or none, and an optional small second line
export function HeadStats({ items }) {
  return (
    <dl className="head-stats">
      {items.map(([n, label, tone, sub], i) => (
        <div key={i} className={tone || ''}><dt>{label}{sub && <small>{sub}</small>}</dt><dd>{n}</dd></div>
      ))}
    </dl>
  )
}
