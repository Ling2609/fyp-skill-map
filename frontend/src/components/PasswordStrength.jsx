// Password guidance (4 Oct; NIST SP 800-63B-4, references.md "Password strength"): length is what counts, so the bar
// grows with length and never demands capitals, numbers or symbols (NIST: no forced mixing). The server makes the
// real check (8+ characters, not a common password, not your username) when you save.
const LEVELS = [
  { min: 0,  label: 'Too short', bars: 1, colour: 'bg-red-400',     text: 'text-red-500' },
  { min: 8,  label: 'OK',        bars: 2, colour: 'bg-amber-400',   text: 'text-amber-600' },
  { min: 12, label: 'Good',      bars: 3, colour: 'bg-emerald-400', text: 'text-emerald-600' },
  { min: 16, label: 'Strong',    bars: 4, colour: 'bg-emerald-500', text: 'text-emerald-700' },
]

export default function PasswordStrength({ password }) {
  if (!password) return null
  const level = [...LEVELS].reverse().find(l => password.length >= l.min)
  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1 mb-1">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full ${i <= level.bars ? level.colour : 'bg-gray-200'}`} />
        ))}
      </div>
      <p className={`text-xs ${level.text}`}>
        {level.label}{level.bars < 3 && <span className="text-gray-400"> · longer is stronger, e.g. a few random words</span>}
      </p>
    </div>
  )
}
