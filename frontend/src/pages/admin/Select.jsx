// A dropdown with its own arrow, set in from the right edge (7 Oct, her review: the browser's arrow sat against the
// border). The native <select> is kept for keyboard and screen-reader behaviour; only its look changes.
export default function Select({ id, label, value, onChange, children }) {
  return (
    <div className="relative">
      <label className="sr-only" htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={onChange}
        className="appearance-none pl-3 pr-10 py-2 text-sm bg-white border border-slate-200 rounded-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500">
        {children}
      </select>
      <svg aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"
        fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
      </svg>
    </div>
  )
}
