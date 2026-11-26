// How well a student fits a job, in ONE set of bands used everywhere (17 Nov, her call: "clear and consistent"):
// the Dashboard chart, the Job Matches chart and the Job Matches filter all cut at the same points, with the same
// names and colours. A job's share = skills she has / skills it lists (both integers from the API).
// None is grey (nothing yet); the rest go from light to deep teal: deeper = more of the job's skills.
// short: the Dashboard key, kept on one line (26 Nov, her review); the full label everywhere else and for screen readers
export const FIT_BANDS = [
  { key: 'none', label: 'None', short: 'None', tone: 'bg-neutral', test: (s) => s === 0 },
  { key: 'under', label: 'Under 25%', short: '<25%', tone: 'bg-fit1', test: (s) => s > 0 && s < 0.25 },
  { key: 'quarter', label: '25-49%', short: '25–49%', tone: 'bg-fit2', test: (s) => s >= 0.25 && s < 0.5 },
  { key: 'mid', label: '50-74%', short: '50–74%', tone: 'bg-fit3', test: (s) => s >= 0.5 && s < 0.75 },
  { key: 'top', label: '75% or more', short: '75%+', tone: 'bg-fit4', test: (s) => s >= 0.75 },
]

// The filter offers every band, plus "Half or more" (the last two together: what the Dashboard headline counts)
export const HALF_OR_MORE = { key: 'half', label: '50% or more', test: (s) => s >= 0.5 }
export const FIT_FILTERS = [HALF_OR_MORE, ...FIT_BANDS]

export const shareOf = (job) => (job.skills_total ? job.skills_matched / job.skills_total : 0)
export const filterOf = (key) => FIT_FILTERS.find(f => f.key === key)
export const countBands = (shares) => FIT_BANDS.map(b => shares.filter(b.test).length)
