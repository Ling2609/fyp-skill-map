// Job level read from the title by the backend (/recommend "level"). Shown on the card; jobs are never hidden by
// default (only if the student ticks "Hide senior roles" on Job Matches).
// No tag when the title doesn't say a level ("unspecified"): most postings, and they're not assumed senior.
const LEVELS = {
  junior:  { label: 'Entry level', className: 'bg-emerald-50 text-emerald-700' },
  senior:  { label: 'Senior',      className: 'bg-amber-50 text-amber-700' },
  lead:    { label: 'Lead',        className: 'bg-amber-50 text-amber-700' },
  manager: { label: 'Manager',     className: 'bg-amber-50 text-amber-700' },
}

export default function LevelTag({ level }) {
  const tag = LEVELS[level]
  if (!tag) return null
  return (
    <span
      title="Level from the job title"
      className={`text-xs px-2 py-0.5 rounded-md font-medium shrink-0 ${tag.className}`}
    >
      {tag.label}
    </span>
  )
}
