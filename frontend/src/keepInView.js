// 22 Nov (her request: "in any circumstances" no popup off screen): one small watcher for the whole app, like
// scrollFade.js. Whenever a menu, popover, tooltip, list or dialog shows (or the window changes size), it is
// measured and, if any edge is outside the window, nudged back inside with an 8px margin. A popup taller than the
// window gets a max height and scrolls inside. Works with any positioning (anchor, absolute, fixed), so new popups
// are covered without opting in. Recharts tooltips are left alone (Recharts keeps them inside the chart itself).
const SELECTOR = '[popover], [role="menu"], [role="listbox"], [role="tooltip"], [role="dialog"], [role="alertdialog"], [data-keep-in-view]'
const GAP = 8

const shown = (el) => {
  if (el.closest('.recharts-wrapper')) return false
  if (el.matches('[popover]') && !el.matches(':popover-open')) return false
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'
}

export function fit(el) {
  if (!(el instanceof HTMLElement) || !shown(el)) return
  const cs = getComputedStyle(el)
  // only floating things: a dialog laid out in the page flow is not moved
  if (!/absolute|fixed/.test(cs.position) && !el.matches('[popover]')) return
  const W = document.documentElement.clientWidth, H = window.innerHeight
  // the shift we added last time, so it is adjusted, not stacked
  const ox = parseFloat(el.dataset.kivX || '0'), oy = parseFloat(el.dataset.kivY || '0')
  const base = el.dataset.kivBase ?? (el.dataset.kivBase = cs.translate && cs.translate !== 'none' ? cs.translate : '0px 0px')
  const [bx, by = '0px'] = base.split(' ')
  let r = el.getBoundingClientRect()
  if (r.height > H - 2 * GAP) { el.style.maxHeight = `${H - 2 * GAP}px`; el.style.overflowY = 'auto'; r = el.getBoundingClientRect() }
  if (r.width > W - 2 * GAP) { el.style.maxWidth = `${W - 2 * GAP}px`; r = el.getBoundingClientRect() }
  const left = r.left - ox, right = r.right - ox, top = r.top - oy, bottom = r.bottom - oy   // where it sits unshifted
  let dx = 0, dy = 0
  if (right > W - GAP) dx = W - GAP - right
  if (left + dx < GAP) dx = GAP - left
  if (bottom > H - GAP) dy = H - GAP - bottom
  if (top + dy < GAP) dy = GAP - top
  if (Math.abs(dx - ox) < 0.5 && Math.abs(dy - oy) < 0.5) return
  el.dataset.kivX = dx; el.dataset.kivY = dy
  el.style.translate = dx || dy ? `calc(${bx} + ${dx}px) calc(${by} + ${dy}px)` : ''
}

let queued = false
function fitAll() {
  if (queued) return
  queued = true
  requestAnimationFrame(() => {
    queued = false
    document.querySelectorAll(SELECTOR).forEach(fit)
    // custom dropdowns: the floating box beside any open button (aria-expanded="true")
    document.querySelectorAll('[aria-expanded="true"]').forEach(btn => {
      const own = btn.getAttribute('aria-controls') && document.getElementById(btn.getAttribute('aria-controls'))
      if (own) return fit(own)
      for (const sib of btn.parentElement?.children || []) if (sib !== btn && !sib.matches(SELECTOR)) fit(sib)
    })
  })
}

export function startKeepInView() {
  if (typeof window === 'undefined' || !window.MutationObserver) return
  new MutationObserver(fitAll).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open', 'aria-expanded'] })
  addEventListener('resize', fitAll)
  addEventListener('scroll', fitAll, true)
  document.addEventListener('toggle', fitAll, true)   // popover open / close
  fitAll()
}
