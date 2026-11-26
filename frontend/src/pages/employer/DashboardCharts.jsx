import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

// 22 Nov (her call: "use a chart library for a better employer dashboard"): two small charts from data the dashboard
// already has. Colours = the status dots used everywhere else on the employer pages.
const STATUS = [
  ['applied', 'Applied', '#3d73da'], ['shortlisted', 'Shortlisted', '#8858ba'],
  ['accepted', 'Accepted', '#008575'], ['rejected', 'Rejected', '#b95336'],
]
const AXIS = { fontSize: 11.5, fill: '#5d6680' }
const short = (t) => (t.length > 18 ? t.slice(0, 17) + '…' : t)

// applicants by status, one bar per open job
export function StatusChart({ jobs }) {
  const rows = jobs.map(j => ({ job: j.title, ...j.counts }))
  const total = rows.reduce((n, r) => n + STATUS.reduce((m, [k]) => m + (r[k] || 0), 0), 0)
  const summary = jobs.map(j => `${j.title}: ${STATUS.map(([k, l]) => `${j.counts[k] || 0} ${l.toLowerCase()}`).join(', ')}`).join('. ')
  if (!total) return <p className="emp-chart-empty">No applicants yet, so there is nothing to chart.</p>
  return (
    <figure className="emp-chart" role="img" aria-label={`Applicants by status. ${summary}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 4 }} barCategoryGap="24%">
          <CartesianGrid horizontal={false} stroke="#eef1f6" />
          <XAxis type="number" allowDecimals={false} hide />
          <YAxis type="category" dataKey="job" width={120} tick={AXIS} tickFormatter={short} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: '#f3f6fb' }} contentStyle={{ borderRadius: 10, fontSize: 12.5 }} />
          {/* 26 Nov (her review): the key in a column at the right, not a line above the bars */}
          <Legend iconType="circle" iconSize={8} layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 12, paddingLeft: 12, lineHeight: '20px' }} />
          {STATUS.map(([k, l, c], i) => (
            <Bar key={k} dataKey={k} name={l} stackId="s" fill={c} isAnimationActive={false}
              radius={i === STATUS.length - 1 ? [0, 5, 5, 0] : 0} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </figure>
  )
}

// the last 14 days: applications received and the employer's own actions, per day
export function ActivityChart({ activity, now = new Date() }) {
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 13 + i)
    return { key: d.toDateString(), day: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), received: 0, yours: 0 }
  })
  const at = Object.fromEntries(days.map(d => [d.key, d]))
  for (const e of activity) {
    const d = at[new Date(e.at).toDateString()]
    if (d) d[e.kind === 'applied' || e.kind === 'declined' ? 'received' : 'yours']++
  }
  const received = days.reduce((n, d) => n + d.received, 0), yours = days.reduce((n, d) => n + d.yours, 0)
  return (
    <figure className="emp-chart emp-chart-sm" role="img"
      aria-label={`Last 14 days: ${received} from students (applications and replies), ${yours} by you.`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={days} margin={{ top: 4, right: 8, bottom: 0, left: -24 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke="#eef1f6" />
          <XAxis dataKey="day" tick={AXIS} interval={3} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: '#f3f6fb' }} contentStyle={{ borderRadius: 10, fontSize: 12.5 }} />
          <Bar dataKey="received" name="From students" stackId="a" fill="#3d73da" isAnimationActive={false} />
          <Bar dataKey="yours" name="By you" stackId="a" fill="#13998c" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </figure>
  )
}
