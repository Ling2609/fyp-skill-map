import { useLayoutEffect, useRef, useState } from 'react'

// A list that shows its first rows, then "Show all N (x more)".
// 20 Oct: rows that fit a card locked to the screen height. 25 Oct (her review: crowded cards beside blank ones, then
// "I just want things to fill and fit"): the employer Dashboard's cards size to their content, and the LAST card of
// each column fills what is left (`fill`): it shows at least `max` rows and, when its column is shorter than the
// other, as many more whole rows as fit. "Show all" calls onShowAll (a pop-up with the whole list), so opening it
// never changes the page's layout; without onShowAll the list opens in place.
export default function FitList({ items, renderItem, className = '', max = 5, more = 'Show all', onShowAll, fill = false }) {
  const box = useRef(null)
  const base = Math.min(max, items.length)
  const [fit, setFit] = useState(base)
  const [minH, setMinH] = useState(0)
  const [all, setAll] = useState(false)

  useLayoutEffect(() => {
    const el = box.current
    if (!fill || !el) return
    const measure = () => {
      const row = el.querySelector('li')
      if (!row) return
      const rowH = row.getBoundingClientRect().height || 1
      const footerH = 40                                      // the "Show all" line
      const needFooter = (n) => (n < items.length ? footerH : 0)
      setMinH(Math.ceil(rowH * base + needFooter(base)))      // its own size: `max` rows, like the other lists
      const space = el.clientHeight
      const n = Math.floor(space / rowH) >= items.length ? items.length
        : Math.max(base, Math.floor((space - footerH) / rowH))
      setFit(n)
      // 25 Oct (her review: a blank area under the last graduate): the card grows only while it has rows to show,
      // never past all of them; any space left over stays outside the card, on the page background
      const sec = el.closest('section')
      if (sec) {
        const above = el.getBoundingClientRect().top - sec.getBoundingClientRect().top
        sec.style.maxHeight = `${Math.ceil(above + rowH * items.length + 2)}px`
      }
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [fill, items.length, base])

  const shown = all ? items : items.slice(0, fill ? fit : max)
  const hidden = items.length - shown.length
  return (
    // fill: contain: size, so the rows shown don't set the card's height (only minH and the column do)
    <div ref={box} style={fill ? { minHeight: minH, contain: 'size' } : undefined}
      className={`${fill ? 'flex-1 flex flex-col overflow-hidden' : ''} ${className}`}>
      <ul className="divide-y divide-slate-100">{shown.map(renderItem)}</ul>
      {hidden > 0 && (
        <button type="button" onClick={() => (onShowAll ? onShowAll() : setAll(true))}
          className={`${fill ? 'mt-auto shrink-0' : ''} w-full h-10 px-5 text-left text-sm font-medium text-blue-700 hover:underline border-t border-slate-200`}>
          {more} {items.length} <span className="text-slate-500 font-normal">({hidden} more)</span>
        </button>
      )}
    </div>
  )
}
