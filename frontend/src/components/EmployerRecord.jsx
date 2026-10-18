import InfoTip from './InfoTip'

// 18 Oct (improvement #1, wording W1; research: references.md "#1 wording research"): the employer's own promised
// reply date and whether it kept it on past jobs, in plain words and "x of y" (not a %). One component, so Job Detail
// (before applying) and My Applications (after) always say the same thing. SkillMap posts only: on a job from
// another site SkillMap never sees the replies, so record is null and nothing is shown.
export const RECORD_TIP = "Counted for jobs whose reply date has passed or that are closed, once there are 3 such jobs. It's the employer's own promise, not a SkillMap rating."

export function PromisedDate({ company, date, className = 'text-xs font-medium text-slate-700' }) {
  return <p className={className}>{company || 'The employer'} promises to reply by {date}</p>
}

export default function EmployerRecord({ company, record, className = 'text-xs text-slate-600' }) {
  if (!record) return null
  if (!record.shown) return <p className="text-xs text-slate-500">New on SkillMap: no reply record yet.</p>
  return (
    <p className={className}>
      {company ? `${company} replied` : 'It replied'} to every applicant by its promised date on {record.on_time} of its {record.of} past jobs.
      <InfoTip label="About this record">{RECORD_TIP}</InfoTip>
    </p>
  )
}
