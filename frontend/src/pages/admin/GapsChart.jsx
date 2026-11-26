import { useLayoutEffect, useRef, useState } from 'react'
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { skillName } from '../../skillName'

// 22 Nov (her call: Recharts on the admin dashboard): the most common skill gaps as a bar chart. A bar is clicked to
// pick it for a workshop (up to 4); a visually hidden checkbox list does the same for keyboard and screen readers.
const mix = (a, b, t) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(' ')})`
const colour = (t) => mix([248, 196, 176], [164, 60, 32], Math.min(1, t))

// 26 Nov (her review: "explain and give colours for new, increase, decrease"): one colour per meaning, always with
// its symbol, so colour is never the only sign (WCAG 1.4.1). Up = more students lack it (worse, coral); down = fewer
// (better, teal); new = not in the list last time (information, blue); = no change (grey). GapKey explains them.
const TREND = {
  up: { tone: '#a8432a', label: 'more students lack it' },
  down: { tone: '#0b6b61', label: 'fewer students lack it' },
  new: { tone: '#2557c4', label: 'not in the list then' },
  same: { tone: '#5d6680', label: 'no change' },
}
function trendOf(now, then) {
  if (then === undefined) return { kind: 'new', text: 'new', tone: TREND.new.tone }
  const d = now - then
  if (!d) return { kind: 'same', text: '=', tone: TREND.same.tone }
  const kind = d < 0 ? 'down' : 'up'
  return { kind, text: `${d < 0 ? '▼' : '▲'} ${Math.abs(d)}`, tone: TREND[kind].tone }
}
function said(t, since) {
  if (t.kind === 'new') return `new: not in the list on ${since}`
  if (t.kind === 'same') return `no change since ${since}`
  const n = Number(t.text.slice(2))
  return `${n} ${t.kind === 'up' ? 'more' : 'fewer'} ${n === 1 ? 'student lacks' : 'students lack'} it than on ${since}`
}

// 26 Nov (her review: "new" needs a mark like the arrows): three short lines bursting out, drawn in the new colour
const NEW_RAYS = 'M1 9.5h3.5M2.6 3.4l2.8 2.8M9 1.2v3.6'
const NewMark = ({ x = 0, y = 0 }) => (
  <path d={NEW_RAYS} transform={`translate(${x} ${y})`} fill="none" stroke={TREND.new.tone} strokeWidth={1.8} strokeLinecap="round" />
)

// the key in the card's info tip: what each change mark means
export function GapKey({ since }) {
  const items = [['▲', 'up'], ['▼', 'down'], ['new', 'new'], ['=', 'same']]
  return (
    <ul className="gap-key" aria-label={`What the change marks mean, compared with ${since}`}>
      <li className="gap-key-head">Compared with {since}:</li>
      {items.map(([mark, kind]) => (
        <li key={kind}><b data-kind={kind}>{kind === 'new' && <svg aria-hidden="true" viewBox="0 0 11 11" width="12" height="12" className="gap-key-rays"><path d={NEW_RAYS} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" /></svg>}{mark}</b> {TREND[kind].label}</li>
      ))}
    </ul>
  )
}

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null
  const r = payload[0].payload
  return (
    <div className="gap-tip">
      <b>{r.name}</b>
      <span>{r.students} of {r.of} students lack it</span>
      {r.trend && <span style={{ color: r.trend.tone }}>{said(r.trend, r.since)}</span>}
      <span className="gap-tip-hint">{r.picked ? 'Picked for the workshop · click to remove' : 'Click to pick for a workshop'}</span>
    </div>
  )
}

// the count and its change mark at the row's right; "new" also gets the rays, placed by measuring the text
function Count({ x, y, r }) {
  const ref = useRef(null)
  const [left, setLeft] = useState(null)
  useLayoutEffect(() => { if (r.trend?.kind === 'new' && ref.current) setLeft(ref.current.getBBox().x) }, [x, y, r.trend?.kind, r.students])
  return (
    <>
      {r.trend?.kind === 'new' && left !== null && <NewMark x={left - 15} y={y - 13} />}
      <text ref={ref} x={x} y={y} textAnchor="end" fontSize={12.5} fill="#5d6680">
        {r.trend && <tspan fill={r.trend.tone} fontWeight={700}>{r.trend.text}</tspan>}
        <tspan dx={r.trend ? 8 : 0} fontWeight={600} fill="#2d3348">{r.students}/{r.of}</tspan>
      </text>
    </>
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
        <Count x={right} y={y - 7} r={r} />
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
            {r.name}: {r.students} of {r.of} students lack it{r.trend ? `, ${said(r.trend, since)}` : ''}
          </label>
        ))}
      </div>
    </div>
  )
}
