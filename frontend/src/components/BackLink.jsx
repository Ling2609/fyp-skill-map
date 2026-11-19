// 20 Oct (her review: "← Back to …" was easy to miss; mock-up B2; references.md "Back from the AI Assistant"): one back
// link for every page that has one, in a white strip at the top left above the page title. 21 Oct (her review): closer to
// the left edge (the page's own content keeps its margin). Larger and darker than
// before, with an arrow icon and an underline, so it reads as a link (GOV.UK back-link style), not as a page label.
export default function BackLink({ label, onClick }) {
  return (
    // 19 Nov (her review: "should fuse in naturally, not a white strip"): no strip; the link sits on the page's colour
    // wash at the page's own left edge (the same width every page uses)
    <div className="shrink-0 mx-auto w-full max-w-[1256px] px-4 sm:px-8 pt-3 -mb-1">
      <button type="button" onClick={onClick}
        className="inline-flex items-center gap-1.5 -ml-1 rounded-lg px-1 py-1 text-sm font-semibold text-ink-soft underline decoration-[rgb(20_30_60/25%)] underline-offset-4 hover:text-accent-strong hover:decoration-accent/40 transition">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        Back to {label}
      </button>
    </div>
  )
}
