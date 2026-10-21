// 20 Oct (her review: "← Back to …" was easy to miss; mock-up B2; references.md "Back from the AI Assistant"): one back
// link for every page that has one, in a white strip at the top left above the page title. 21 Oct (her review): closer to
// the left edge (the page's own content keeps its margin). Larger and darker than
// before, with an arrow icon and an underline, so it reads as a link (GOV.UK back-link style), not as a page label.
export default function BackLink({ label, onClick }) {
  return (
    <div className="shrink-0 bg-white border-b border-slate-200 px-3 sm:px-4 py-2.5">
      <button type="button" onClick={onClick}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 underline decoration-slate-300 underline-offset-4 hover:text-blue-700 hover:decoration-blue-300 transition">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        Back to {label}
      </button>
    </div>
  )
}
