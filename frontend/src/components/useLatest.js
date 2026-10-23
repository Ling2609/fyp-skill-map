import { useCallback, useRef } from 'react'

// 23 Oct (bug sweep: an older answer arriving after a newer one overwrote it). Call `start()` when a request starts;
// it returns a check that stays true only while no newer request has started, so only the latest answer is shown.
//     const start = useLatest()
//     const isLatest = start()
//     api.get(...).then(res => { if (isLatest()) setData(res.data) })
// The same idea as React's "ignore" flag (react.dev/learn/synchronizing-with-effects), for requests that start from
// a click or a refresh as well as from an effect.
export function useLatest() {
  const counter = useRef(0)
  return useCallback(() => {
    const mine = ++counter.current
    return () => mine === counter.current
  }, [])
}
