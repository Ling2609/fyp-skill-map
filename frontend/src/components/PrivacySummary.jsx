import { Link } from 'react-router-dom'

// Sign-up consent (14 Oct; her review: like most sign-up forms, one tick box with the notice as a blue link). The short
// summary (ICO's first layer) is at the top of the Privacy notice page, which opens in a new tab so the form keeps
// what was typed.
export default function PrivacySummary({ accepted, onChange, showError }) {
  return (
    <div>
      <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
        <input type="checkbox" checked={accepted} onChange={e => onChange(e.target.checked)}
          className="mt-0.5 w-4 h-4 accent-blue-700" />
        <span>I have read and agree to the{' '}
          <Link to="/privacy?from=signup" target="_blank" rel="noopener" className="text-blue-700 hover:underline">Privacy notice</Link>.</span>
      </label>
      {showError && !accepted && <p className="text-xs text-red-500 mt-1">Please accept the privacy notice to create an account.</p>}
    </div>
  )
}
