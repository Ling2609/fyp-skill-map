import { useEffect, useLayoutEffect, useRef, useState } from 'react'

// A list that shows only the rows that fit. Used by the employer Dashboard.
// 20 Oct: rows that fit a card locked to the screen height. 25 Oct (her review, twice: "fit in one screen"; "no need to
// show all, show a few, and See all goes to the relevant page"): with `fill`, the list takes the height its card is
// given and shows the whole rows that fit (at least `least`). Its card never grows past its own rows, so space a short
// list doesn't need goes to the other cards. The card's title line links to the full list (onShown says how many
// rows are showing, so the card knows whether to offer "See all"). Without `fill` (phones) it shows `max` rows.

// A row's own height, even while it is stretched: from its first child's top to its last child's bottom (for a row
// whose children sit side by side, the tallest one), plus its padding and top border.
function natural(li) {
  const kids = [...li.children]
  if (!kids.length) return li.getBoundingClientRect().height
  const top = Math.min(...kids.map(k => k.getBoundingClientRect().top))
  const bottom = Math.max(...kids.map(k => k.getBoundingClientRect().bottom))
  const cs = getComputedStyle(li)
  return bottom - top + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth)
}

// `last`: the column's last card, which always reaches the column's bottom (her review: the columns' bottoms line up),
// so it isn't capped at its rows; spare height stays at the bottom of the card.
export default function FitList({ items, renderItem, className = '', max = 5, least = 1, fill = false, last = false, onShown }) {
  const box = useRef(null)
  const low = Math.min(least, items.length)
  const [fit, setFit] = useState(Math.min(max, items.length))
  const [minH, setMinH] = useState(0)

  useLayoutEffect(() => {
    const el = box.current
    if (!fill || !el) return
    const sec = el.closest('section')
    const measure = () => {
      const row = el.querySelector('li')
      if (!row) return
      const rowH = natural(row) || 1
      setMinH(Math.ceil(rowH * low))
      setFit(Math.min(items.length, Math.max(low, Math.floor(el.clientHeight / rowH))))
      // the card grows only while it has rows to show, and never shrinks below its title plus `least` whole rows
      // (a card hides what overflows, so without this a short screen could cut a row in half)
      if (sec) {
        const r = el.getBoundingClientRect(), s = sec.getBoundingClientRect()
        const rest = r.top - s.top + (s.bottom - r.bottom) + 2
        if (!last) sec.style.maxHeight = `${Math.ceil(rest + rowH * items.length)}px`
        sec.style.minHeight = `${Math.ceil(rest + rowH * low)}px`
      }
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => { ro.disconnect(); if (sec) { sec.style.maxHeight = ''; sec.style.minHeight = '' } }
  }, [fill, last, items.length, low])

  const shown = items.slice(0, fill ? fit : max)
  useEffect(() => { onShown?.(shown.length) }, [shown.length])   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    // fill: contain: size, so the rows shown don't set the card's height (only minH and the column do)
    <div ref={box} style={fill ? { minHeight: minH, contain: 'size' } : undefined}
      className={`${fill ? 'flex-1 overflow-hidden' : ''} ${className}`}>
      {/* fill: while some rows are hidden, the rows shown share the height left over (less than a row), so no blank
          strip sits under them; when all rows show, they keep their own height */}
      <ul className={`divide-y divide-slate-100 ${fill && shown.length < items.length ? 'h-full flex flex-col [&>li]:grow' : ''}`}>{shown.map(renderItem)}</ul>
    </div>
  )
}
