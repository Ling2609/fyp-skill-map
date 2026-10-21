import { useLayoutEffect, useRef, useState } from 'react'

// 20 Oct (her review of the employer dashboard: half-cut rows look messy): a list that shows only the rows that fit
// its card in full, then "Show all N" to scroll through the rest inside the card. The card keeps its size, so the
// page still fits the screen. Rows should be one line high (truncate long text) so they measure the same.
export default function FitList({ items, renderItem, className = '', footerCls = '', more = 'Show all' }) {
  const box = useRef(null)
  const [fit, setFit] = useState(items.length)
  const [all, setAll] = useState(false)
  const [minH, setMinH] = useState(0)

  useLayoutEffect(() => {
    const el = box.current
    if (!el || all) return
    const measure = () => {
      const row = el.querySelector('li')
      if (!row) return
      const rowH = row.getBoundingClientRect().height || 1
      const footerH = 40                                  // the "Show all" line, when it is needed
      const space = el.clientHeight
      const n = Math.floor(space / rowH) >= items.length ? items.length : Math.max(1, Math.floor((space - footerH) / rowH))
      setFit(n)
      // 21 Oct (her report: a row cut in half on a shorter laptop screen): never smaller than one whole row (and the
      // "Show all" line when more are hidden), so the card grows and the page scrolls instead of cutting a row
      setMinH(Math.ceil(rowH) + (items.length > 1 ? footerH : 0))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [items.length, all])

  const shown = all ? items : items.slice(0, fit)
  const hidden = items.length - shown.length
  return (
    // contain: size: the list's own length doesn't set the card's height (only minH does), so a long list still
    // shows whole rows and "Show all" instead of stretching the card
    <div ref={box} style={{ minHeight: minH, contain: 'size' }}
      className={`flex-1 flex flex-col ${all ? 'overflow-y-auto' : 'overflow-hidden'} ${className}`}>
      <ul className="divide-y divide-slate-100">{shown.map(renderItem)}</ul>
      {hidden > 0 && (
        <button type="button" onClick={() => setAll(true)}
          className={`mt-auto shrink-0 h-10 px-5 text-left text-sm font-medium text-blue-700 hover:underline border-t border-slate-100 ${footerCls}`}>
          {more} {items.length} <span className="text-slate-500 font-normal">({hidden} more)</span>
        </button>
      )}
    </div>
  )
}
