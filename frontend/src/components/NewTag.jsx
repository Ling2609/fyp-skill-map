// The "new" mark (27 Nov): three short rays, as on the career office's skill-gap chart (pages/admin/GapsChart.jsx), plus
// the word, so "new" is never told by the icon or colour alone (WCAG 1.4.1).
// 27 Nov (her pick): the Contents entry turns the rays the other way (RAYS_MIRRORED), because its mark sits at the end of
// the line; the box heading and the "New" pill keep this one. Both come from here, so no two marks can disagree.
export const RAYS = 'M1 9.5h3.5M2.6 3.4l2.8 2.8M9 1.2v3.6'
export const RAYS_MIRRORED = 'M10 9.5h-3.5M8.4 3.4l-2.8 2.8M2 1.2v3.6'
export const NEW_RAYS = RAYS

export function NewRays({ className = 'h-3 w-3', mirrored = false }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 11 11" className={`shrink-0 ${className}`}>
      <path d={mirrored ? RAYS_MIRRORED : RAYS} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  )
}

export default function NewTag({ label = 'New', className = '' }) {
  // 27 Nov (her review): filled, not tinted - inside the "In short" blue card a tinted pill was the same colour as the
  // card behind it. Solid accent reads on the card, on the white document and on the glass header (white on #2557c4 = 6.5:1)
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-accent px-1.5 py-px align-[1px] text-[11px] font-semibold text-white ${className}`}>
      <NewRays className="h-2.5 w-2.5" />{label}
    </span>
  )
}
