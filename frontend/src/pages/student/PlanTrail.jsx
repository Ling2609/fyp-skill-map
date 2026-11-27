// 27 Nov (her review: a plan should feel like progress, not a wall of text): the gap a plan closes, as a trail of
// footprints — the ones already walked are teal, the skill this plan adds is coral, and a flag marks the ad's
// requirement met. Same footprint motif as the Dashboard's goal trail, so the two screens speak one language.
// Decorative shapes carry the summary in a screen-reader sentence; the visible line says it in words too.
const FOOT = (
  <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <ellipse cx="8" cy="10.2" rx="3.1" ry="4.1" />
    <circle cx="5.4" cy="5.1" r="1.25" />
    <circle cx="7.4" cy="4.1" r="1.2" />
    <circle cx="9.4" cy="4.3" r="1.15" />
    <circle cx="11" cy="5.4" r="1" />
  </svg>
)
const FLAG = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
    <path d="M4 13.5V2.5" />
    <path d="M4 3.2h7.2L9.4 6l1.8 2.8H4z" fill="currentColor" stroke="none" />
  </svg>
)

export default function PlanTrail({ plan }) {
  // 27 Nov: a plan started without a job has no ad to measure, so it shows how many of the student's top matches ask
  // for the skill instead ("asked for in 7 of your 12 matches"), using the numbers /recommend/ already returned.
  if (!plan?.dots?.length && plan?.demand?.jobs) {
    const of = plan.demand.of ?? plan.demand.jobs
    const marks = Math.min(of, 14)
    const filled = Math.round((plan.demand.jobs / Math.max(of, 1)) * marks)
    return (
      <div className="plan-trail">
        <p className="plan-trail-copy">
          <b>{plan.skill || 'This skill'}</b> is asked for in <b>{plan.demand.jobs} of your {of}</b> top job matches
          {' — this plan gets you there'}
        </p>
        <ol className="plan-trail-track" aria-hidden="true">
          {Array.from({ length: marks }, (_, i) => <li key={i} className={i < filled ? 'had' : 'need'}>{FOOT}</li>)}
          <li className="goal">{FLAG}</li>
        </ol>
        <p className="sr-only">{plan.demand.jobs} of your {of} top job matches ask for {plan.skill}.</p>
      </div>
    )
  }
  if (!plan?.dots?.length) return null
  const have = plan.dots.filter(d => d.have).length
  const of = plan.of ?? plan.dots.length
  const missing = plan.dots.filter(d => !d.have).map(d => d.name)
  return (
    <div className="plan-trail">
      <p className="plan-trail-copy">
        <b>You already have {have} of {of}</b> skills this ad asks for
        {plan.skill ? <> — this plan adds <b className="text-missing-strong">{plan.skill}</b></> : null}
      </p>
      <ol className="plan-trail-track" aria-hidden="true">
        {plan.dots.map(d => (
          <li key={d.name} className={d.have ? 'had' : 'need'} title={d.name}>{FOOT}</li>
        ))}
        <li className="goal">{FLAG}</li>
      </ol>
      <p className="sr-only">
        {have} of {of} of this ad's skills are already on your profile.
        {missing.length ? ` Still missing: ${missing.join(', ')}.` : ' Nothing is missing for this ad.'}
      </p>
    </div>
  )
}
