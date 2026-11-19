// 20 Nov (her request, for every page): anything that scrolls inside a card shows there is more, by fading its last
// visible item (and its first, once scrolled down). Marks scroll areas with data-fade="bottom|top|both"; the mask
// itself is in index.css. One small listener for the whole app, so no page has to opt in.
const isScroller = (el) => {
  if (!(el instanceof HTMLElement) || el === document.documentElement || el === document.body) return false
  const oy = getComputedStyle(el).overflowY
  return (oy === 'auto' || oy === 'scroll') && el.scrollHeight - el.clientHeight > 2
}

function mark(el) {
  if (!(el instanceof HTMLElement)) return
  // 20 Nov (her review: "things blurry"): only lists inside a card fade; a page-level area that scrolls whole cards
  // (and a save bar at its foot) never does
  if (!isScroller(el) || el.querySelector('section, .emp-tile, [class*="rounded-2xl"], [class*="rounded-[24px]"]')) {
    if (el.dataset.fade) delete el.dataset.fade
    return
  }
  const top = el.scrollTop > 2
  const end = el.scrollTop + el.clientHeight >= el.scrollHeight - 2
  const v = top && !end ? 'both' : top ? 'top' : 'bottom'
  if (el.dataset.fade !== v) el.dataset.fade = v
}

let queued = false
function sweep() {
  if (queued) return
  queued = true
  requestAnimationFrame(() => {
    queued = false
    // lists, panels and text areas that scroll by themselves; skip form fields (their text should never fade)
    for (const el of document.querySelectorAll('#main *:not(textarea):not(select):not(input)')) {
      const oy = el.style.overflowY || ''
      if (el.dataset.fade || oy || el.scrollHeight > el.clientHeight + 2) mark(el)
    }
  })
}

export function startScrollFade() {
  document.addEventListener('scroll', (e) => mark(e.target), true)
  addEventListener('resize', sweep)
  new MutationObserver(sweep).observe(document.body, { childList: true, subtree: true })
  sweep()
}
