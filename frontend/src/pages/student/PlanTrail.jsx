// 27 Nov (her second review: the footprints and the flag looked childish): the gap is now one slim bar — teal for the
// skills already on the profile, a pale track for the rest, and a small coral tick where this plan's skill sits. Calm,
// readable in greyscale, and the same shape as the bar drawn in the PDF.
export default function PlanTrail({ plan }) {
  // a plan started without a job has no ad to measure: it shows how many of the student's matches ask for the skill
  if (!plan?.dots?.length && plan?.demand?.jobs) {
    const of = plan.demand.of ?? plan.demand.jobs
    const share = Math.min(1, plan.demand.jobs / Math.max(of, 1))
    return (
      <div className="plan-trail">
        <p className="plan-trail-copy">
          <b>{plan.skill || 'This skill'}</b> is asked for in <b>{plan.demand.jobs} of your {of}</b> top job matches
          {' — this plan gets you there'}
        </p>
        <div className="plan-bar" aria-hidden="true">
          <span className="plan-bar-track" />
          <span className="plan-bar-fill" style={{ width: `${share * 100}%` }} />
        </div>
        <p className="sr-only">{plan.demand.jobs} of your {of} top job matches ask for {plan.skill}.</p>
      </div>
    )
  }
  if (!plan?.dots?.length) return null
  const have = plan.dots.filter(d => d.have).length
  const of = plan.of ?? plan.dots.length
  const missing = plan.dots.filter(d => !d.have).map(d => d.name)
  const share = of ? have / of : 0
  return (
    <div className="plan-trail">
      <p className="plan-trail-copy">
        <b>You already have {have} of {of}</b> skills this ad asks for
        {plan.skill ? <> — this plan adds <b className="text-missing-strong">{plan.skill}</b></> : null}
      </p>
      <div className="plan-bar" aria-hidden="true">
        <span className="plan-bar-track" />
        <span className="plan-bar-fill" style={{ width: `${share * 100}%` }} />
        {share < 1 && <span className="plan-bar-marker" style={{ left: `${share * 100}%` }} />}
      </div>
      <p className="sr-only">
        {have} of {of} of this ad's skills are already on your profile.
        {missing.length ? ` Still missing: ${missing.join(', ')}.` : ' Nothing is missing for this ad.'}
      </p>
    </div>
  )
}
