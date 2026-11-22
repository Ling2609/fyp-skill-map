import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { skillName } from '../../skillName'

// 22 Nov (her call: Recharts on the admin dashboard): the most common skill gaps as a bar chart. A bar is clicked to
// pick it for a workshop (up to 4); a visually hidden checkbox list does the same for keyboard and screen readers.
const mix = (a, b, t) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(' ')})`
const colour = (t) => mix([248, 196, 176], [164, 60, 32], Math.min(1, t))

function trendOf(now, then) {
  if (then === undefined) return { text: 'new', tone: '#5d6680' }
  const d = now - then
  if (!d) return { text: '=', tone: '#5d6680' }
  return { text: `${d < 0 ? '▼' : '▲'} ${Math.abs(d)}`, tone: d < 0 ? '#0b6b61' : '#a8432a' }
}

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null
  const r = payload[0].payload
  return (
    <div className="gap-tip">
      <b>{r.name}</b>
      <span>{r.students} of {r.of} students lack it</span>
      {r.trend && r.trend.text !== 'new' && <span style={{ color: r.trend.tone }}>{r.trend.text === '=' ? 'Same as' : r.trend.text + ' since'} {r.since}</span>}
      <span className="gap-tip-hint">{r.picked ? 'Picked for the workshop · click to remove' : 'Click to pick for a workshop'}</span>
    </div>
  )
}

export default function GapsChart({ gaps, before, since, picked, onToggle }) {
  const top = Math.max(1, ...gaps.map(g => g.students))
  const rows = gaps.map(g => ({
    skill: g.skill, name: skillName(g.skill), students: g.students, of: g.of_students, since,
    picked: picked.includes(g.skill),
    trend: before ? trendOf(g.students, before.gaps.find(x => x.skill.toLowerCase() === g.skill.toLowerCase())?.students) : null,
  }))
  const full = picked.length >= 4
  // 22 Nov (her pick): name on the left and count + weekly change on the right, on a line above each bar
  const label = ({ x, y, width, index }) => {
    const r = rows[index]
    const right = x + (r.students ? width * r.of / r.students : 0)
    return (
      <g>
        {/* 22 Nov (her review): a visible tick box, so it reads as something to pick */}
        <rect x={x + 0.75} y={y - 20.25} width={14.5} height={14.5} rx={4} fill={r.picked ? '#2557c4' : '#fff'}
          stroke={r.picked ? '#2557c4' : full ? '#d5dae5' : '#8a93a8'} strokeWidth={1.5} />
        {r.picked && <path d={`M${x + 4} ${y - 13} l3 3 l5.5 -6`} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
        <text x={x + 23} y={y - 8} fontSize={13} fill={!r.picked && full ? '#8a93a8' : '#2d3348'} fontWeight={r.picked ? 700 : 500}>{r.name}</text>
        <text x={right} y={y - 7} textAnchor="end" fontSize={12.5} fill="#5d6680">
          {r.trend && <tspan fill={r.trend.tone} fontWeight={700}>{r.trend.text}</tspan>}
          <tspan dx={r.trend ? 8 : 0} fontWeight={600} fill="#2d3348">{r.students}/{r.of}</tspan>
        </text>
      </g>
    )
  }
  return (
    <div className="gap-chart" style={{ '--rows': rows.length }}>
      <figure className="m-0 h-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 18, right: 4, bottom: 0, left: 4 }} barSize={10}
            // 22 Nov (her review): a click anywhere on a row picks it, not only on the bar or the words
            onClick={(st) => { const r = rows[st?.activeTooltipIndex]; if (r && (r.picked || !full)) onToggle(r.skill) }}
            style={{ cursor: 'pointer' }}>
            <XAxis type="number" domain={[0, rows[0]?.of || top]} hide />
            <YAxis type="category" dataKey="name" hide />
            <Tooltip content={<Tip />} cursor={{ fill: '#f3f6fb' }} />
            <Bar dataKey="students" radius={5} isAnimationActive={false} background={{ fill: '#eef1f6', radius: 5 }}>
              {rows.map(r => <Cell key={r.skill} fill={colour(r.students / top)} />)}
              <LabelList dataKey="students" content={label} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </figure>
      {/* the same choices for keyboard and screen readers */}
      <div role="group" aria-label="Most common skill gaps: pick up to 4 for a workshop" className="sr-only">
        {rows.map(r => (
          <label key={r.skill}>
            <input type="checkbox" checked={r.picked} disabled={!r.picked && full} onChange={() => onToggle(r.skill)} />
            {r.name}: {r.students} of {r.of} students lack it{r.trend ? `, ${r.trend.text === 'new' ? 'new this week' : r.trend.text === '=' ? 'no change' : r.trend.text.replace('▼', 'down').replace('▲', 'up') + ' since ' + since}` : ''}
          </label>
        ))}
      </div>
    </div>
  )
}
