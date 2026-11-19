// The SkillMap mark: "meet on the map" — the icon chosen in
// mockups\skillmap-people\icons\compass.svg, geometry unchanged.
// Drawn as the original: one colour (the accent), no badge behind it, with the
// route and its start point cut out in white (DESIGN-SYSTEM.md §4).
export default function Logo({ size = 'md', className = '' }) {
  const box = size === 'sm' ? 'w-5 h-5' : size === 'lg' ? 'w-10 h-10' : 'w-7 h-7'
  return (
    <svg className={`shrink-0 text-accent ${box} ${className}`} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      {/* the folded map, with its middle panel a shade lighter */}
      <path d="m6 19 12-6 12 6 12-6v25l-12 5-12-6-12 6Z" fill="currentColor" />
      <path d="M18 13v24l12 6V19Z" fill="#fff" fillOpacity=".25" />
      {/* the two people markers above the map */}
      <circle cx="12" cy="7" r="4" fill="currentColor" />
      <circle cx="36" cy="7" r="4" fill="currentColor" />
      {/* the route between them, ending open */}
      <path d="M12 26c8-11 15 15 24-1" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <circle cx="12" cy="26" r="2.8" fill="#fff" />
      <circle cx="36" cy="25" r="3.4" fill="currentColor" stroke="#fff" strokeWidth="2" />
    </svg>
  )
}
