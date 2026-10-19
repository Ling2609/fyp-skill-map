// 19 Oct (E6, her layout G1): what the ad asks for besides skills, as short pills in one full-width row of the job
// header. Read by fixed rules (backend app/services/ad_requirements.py) and checked on 30 unseen live ads. Short
// labels only: the full sentences stay in the description, and each pill's tooltip shows the ad's own words.
// Citizenship is not shown (E6 found 0 of 2 real cases). Display only: nothing here changes the % or the ranking.

const FIELD_MAX = 100

const pillCls = 'text-xs text-slate-700 bg-slate-50 border border-gray-200 px-2.5 py-1 rounded-full'

export function AdRequirementPills({ req }) {
  if (!req) return null
  const pills = []
  if (req.qualification) pills.push({ key: 'q', text: req.qualification.level === 'phd' ? 'PhD' : req.qualification.level === 'other' ? req.qualification.name : `${req.qualification.name} or above`, quote: req.qualification.quote })
  if (req.field) {
    const f = req.field.field
    pills.push({ key: 'f', text: f.length > FIELD_MAX ? `${f.slice(0, FIELD_MAX).replace(/[\s,]+\S*$/, '')}…` : f, quote: req.field.quote })
  }
  if (req.languages) pills.push({ key: 'l', text: req.languages.languages.join(', '), quote: req.languages.quote })
  if (pills.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-4 pt-4 border-t border-gray-100">
      <span className="text-xs text-gray-500 mr-1">The ad asks for</span>
      {pills.map(p => (
        <span key={p.key} className={pillCls} title={p.quote ? `From the ad: “${p.quote}”` : undefined}>{p.text}</span>
      ))}
    </div>
  )
}

// "MYR 108000 – MYR 144000" a year -> "about RM 9,000 – 12,000 a month" (rounded to the nearest 100)
function perMonth(amount) {
  const nums = (amount.match(/\d[\d,]*(?:\.\d+)?\s?k?/gi) || []).map(n => {
    const v = parseFloat(n.replace(/,/g, ''))
    return /k/i.test(n) ? v * 1000 : v
  }).filter(v => v >= 1000)
  if (!nums.length) return ''
  const fmt = v => (Math.round(v / 12 / 100) * 100).toLocaleString('en-GB')
  return `about RM ${nums.map(fmt).join(' – ')} a month`
}

// The salary written in the ad text, for a job whose salary field is empty (her finding, 19 Oct)
export function SalaryFromAd({ salary }) {
  if (!salary) return null
  const per = salary.period === 'year' ? ' a year' : salary.period === 'month' ? ' a month' : ''
  const monthly = salary.period === 'year' ? perMonth(salary.salary) : ''
  return (
    <span title={salary.quote ? `From the ad: “${salary.quote}”` : undefined}>
      <span className="text-green-700 font-medium">{salary.salary}{per}</span>
      <span className="text-gray-500"> (from the ad){monthly ? ` · ${monthly}` : ''}</span>
    </span>
  )
}
