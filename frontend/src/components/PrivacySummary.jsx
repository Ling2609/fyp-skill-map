import { Link } from 'react-router-dom'

// Sign-up consent (14 Oct; her review: like most sign-up forms, one tick box with the notice as a blue link). The short
// summary (ICO's first layer) is at the top of the Privacy notice page, which opens in a new tab so the form keeps
// what was typed.
export default function PrivacySummary({ accepted, onChange, showError }) {
  return (
    <div>
      <label className="flex cursor-pointer items-start gap-2 text-small leading-snug text-ink-soft">
        <input
          type="checkbox" checked={accepted} onChange={e => onChange(e.target.checked)}
          aria-invalid={(showError && !accepted) || undefined}
          className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--color-accent)]"
        />
        <span>I have read and agree to the{' '}
          <Link to="/privacy?from=signup" target="_blank" rel="noopener" className="text-accent underline hover:no-underline">Privacy notice</Link>.</span>
      </label>
      {showError && !accepted && (
        <p className="m-0 mt-1 text-small text-missing-strong">Please accept the privacy notice to create an account.</p>
      )}
    </div>
  )
}
