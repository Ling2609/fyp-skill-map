import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../../api'

// The grade itself, not its weight: the weight is the same for C+ and C, so a C showed as "C+" (5 Oct)
const GRADE_LETTERS = { '4.0': 'A', '3.7': 'A-', '3.3': 'B+', '3.0': 'B', '2.7': 'B-', '2.3': 'C+', '2.0': 'C' }

const gradeLabel = (grade) => (grade == null ? '' : GRADE_LETTERS[Number(grade).toFixed(1)] || '')

// "today", "3 days ago", "2 weeks ago"
const daysSince = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : 0)

const postedAgo = (iso) => {
  if (!iso) return ''
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (isNaN(days)) return ''
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  return `${Math.floor(days / 7)} weeks ago`
}


export default function JobDetail() {
  const navigate = useNavigate()
  const { jobId } = useParams()
  const [gap, setGap] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('description')
  const [bullets, setBullets] = useState(null)
  const [bulletsLoading, setBulletsLoading] = useState(false)
  const [showSources, setShowSources] = useState(false)

  useEffect(() => {
    // The backend builds the profile from the logged-in user's saved record
    api.post('/skillgap/', { job_id: decodeURIComponent(jobId) })
      .then(res => { setGap(res.data); setLoading(false) })
      .catch(err => {
        setError(err.response?.data?.detail || 'Failed to load skill gap analysis')
        setLoading(false)
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab !== 'description' || bullets !== null || !gap) return
    let cancelled = false
    setTimeout(() => {
      if (!cancelled) setBulletsLoading(true)
    }, 0)
    api.get(`/jobs/${encodeURIComponent(jobId)}/description`)
      .then(res => { if (!cancelled) setBullets(res.data.bullets || []) })
      .catch(() => { if (!cancelled) setBullets([]) })
      .finally(() => { if (!cancelled) setBulletsLoading(false) })
    return () => { cancelled = true }
  }, [activeTab, gap]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-700 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading job details...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 text-sm mb-4">{error}</p>
          <button onClick={() => navigate(-1)} className="text-blue-700 text-sm hover:underline">← Go back</button>
        </div>
      </div>
    )
  }

  const coverage = gap?.summary?.coverage_percent || 0
  const coverageColor = coverage >= 70 ? 'text-green-600' : coverage >= 40 ? 'text-yellow-600' : 'text-red-500'
  const barColor = coverage >= 70 ? 'bg-green-500' : coverage >= 40 ? 'bg-yellow-500' : 'bg-red-400'

  // Layout (summary first): 1) what to learn, 2) what you already have (with where it comes from).
  // Only skills you have count (same skill, or SBERT >= 0.7). Gaps carry no "partly / related" reason:
  // below 0.7 closeness is not reliable evidence, so it isn't shown as one (step 2, 30 Sep).
  const gapRows = gap?.missing_skills || []

  // Matches: strongest first. Fallbacks keep the page correct with an older backend.
  const matchedRows = [...(gap?.matched_skills || [])]
    .sort((a, b) => b.similarity - a.similarity)
    .map(m => ({
      ...m,
      evidence_source: m.evidence_source || 'module',
    }))

  // "Show where these come from": group matched skills by their source (module / project / cert)
  const sourceGroups = Object.entries(
    matchedRows.reduce((acc, m) => {
      const key = m.matched_via_module || 'Other'
      if (!acc[key]) {
        acc[key] = {
          // Module names like "Project in Software Engineering" read like a project, so say what it is
          label: m.evidence_source === 'module' && key !== 'Other' ? `Module: ${key}` : key,
          grade: m.evidence_source === 'module' ? gradeLabel(m.grade) : '',
          items: [],
        }
      }
      acc[key].items.push(m)
      return acc
    }, {})
  ).sort((a, b) => b[1].items.length - a[1].items.length)

  const totalRequired = gapRows.length + matchedRows.length
  // Stage 3A: the % counts required skills; a job that requires nothing specific is scored on its preferred ones
  // What the % counts: required skills; if the ad requires none, the skills it lists without a level, else its preferred ones
  const basisWord = { preferred: 'preferred', unspecified: 'listed' }[gap?.summary?.coverage_basis] || 'required'
  const BasisWord = basisWord[0].toUpperCase() + basisWord.slice(1)
  // Nice-to-have skills: shown apart, never in the %. (Skills the role will teach and soft skills are left
  // out of the % too, but not listed here: the first reads oddly to a student, the second is in the description.)
  const niceToHave = gap?.nice_to_have || []

  return (
    <div className="min-h-screen">

      {/* Top nav */}
      <div className="bg-white border-b border-gray-100 px-6 py-3">
        <div className="max-w-4xl mx-auto">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 transition">
            <span>←</span>
            <span>Back to Results</span>
          </button>
        </div>
      </div>

      <div className="px-6 py-5 max-w-4xl mx-auto space-y-4">

        {/* Job header: info + action on top, one score row underneath */}
        <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-gray-800">{gap?.job?.job_title}</h1>
              <p className="text-sm text-gray-500 mt-1">{gap?.job?.company} · {gap?.job?.location}</p>
              <p className="text-xs text-gray-400 mt-1.5">
                {gap?.job?.salary && gap.job.salary !== 'nan'
                  ? <span className="text-green-700 font-medium">{gap.job.salary}</span>
                  : 'Salary not disclosed'}
                {gap?.job?.source === 'live'
                  ? (postedAgo(gap.job.listing_date) ? ` · Posted ${postedAgo(gap.job.listing_date)}` : '')
                  : ' · Past posting from JobStreet (2024)'}
              </p>
            </div>
            {gap?.job?.source === 'live' && gap.job.source_url && (
              <div className="shrink-0 flex flex-col items-end gap-1">
              <a
                href={gap.job.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 px-4 py-2 rounded-lg transition"
              >
                Apply on {gap.job.publisher || 'employer site'} ↗
              </a>
              {/* F8: most postings close within about a month (references.md); SkillMap can't check without credits */}
              {daysSince(gap.job.listing_date) > 30 && (
                <p className="text-xs text-amber-600">Posted over a month ago · it may have closed</p>
              )}
              </div>
            )}
          </div>

          {/* Score: one number, one bar (they say the same thing) */}
          <div className="mt-5">
            <div className="flex items-baseline justify-between mb-1.5">
              <p className="text-sm text-gray-600">
                <span className={`text-2xl font-bold ${coverageColor}`}>{Math.round(coverage)}%</span>
                <span className="ml-2">
                  of {basisWord} skills · you have {gap?.summary?.matched_skills} of {gap?.summary?.job_skills_total}
                </span>
              </p>
              <span className="text-xs text-gray-400">{gap?.summary?.missing_skills} to develop</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className={`h-2 rounded-full ${barColor}`} style={{ width: `${coverage}%` }} />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-100 shadow-sm">
          {[
            { key: 'description', label: 'Job Description' },
            { key: 'gap', label: 'Skill Gap Analysis' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === tab.key
                  ? 'bg-blue-700 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Job Description Tab */}
        {activeTab === 'description' && (
          <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
            {bulletsLoading ? (
              <div className="flex items-center gap-2 text-gray-400 text-sm py-4">
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                Formatting description...
              </div>
            ) : bullets?.length > 0 ? (
              <ul className="space-y-2">
                {bullets.map((point, idx) => {
                  const isMainHeader = point.startsWith('## ')
                  const isSubHeader = point.startsWith('### ')
                  const displayText = point.replace(/^##+ /, '').replace(/^\d+\.\s+/, '').replace(/^-\s+/, '').trim()

                  if (isMainHeader) {
                    return (
                      <li key={idx} className="pt-4 first:pt-0">
                        <p className="text-sm font-semibold text-gray-800 uppercase tracking-wide border-b border-gray-100 pb-2">
                          {displayText}
                        </p>
                      </li>
                    )
                  }

                  if (isSubHeader) {
                    return (
                      <li key={idx} className="pt-2">
                        <p className="text-sm font-medium text-gray-700 italic">{displayText}</p>
                      </li>
                    )
                  }

                  return (
                    <li key={idx} className="flex items-start gap-2.5 text-sm text-gray-600 leading-relaxed">
                      <span className="text-blue-400 shrink-0">•</span>
                      <span>{point.replace(/^-\s+/, '').trim()}</span>
                    </li>
                  )
                })}
              </ul>
            ) : gap?.job?.description ? (
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                {gap.job.description}
              </p>
            ) : (
              <p className="text-sm text-gray-400">No description available.</p>
            )}
          </div>
        )}

        {/* Skill Gap Tab — summary first: to learn → you already have (with where it comes from) */}
        {activeTab === 'gap' && (
          <div className="space-y-4">

            {/* 1. To learn */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">
                  {BasisWord} skills you're missing <span className="text-red-600">({gapRows.length})</span>
                </h2>
              </div>
              {gapRows.length === 0 ? (
                <p className="text-xs text-gray-500 px-5 py-4">None. You have every {basisWord} skill this job lists.</p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {gapRows.map((item, idx) => {
                    return (
                      <li key={idx} className="flex items-start gap-3 px-5 py-2.5">
                        <span className="w-5 h-5 mt-0.5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 bg-red-100 text-red-600">
                          ✕
                        </span>
                        {/* Why it's a requirement, in the ad's own words (Stage 1 evidence quote; none for older jobs).
                            Always shown, wrapped to 2 lines: objective 3 is an explained gap, so no click needed */}
                        <span className="flex-1 min-w-0">
                          <span className="block text-xs font-medium text-gray-800">{item.job_skill}</span>
                          {item.ad_quote && (
                            <span className="block mt-0.5 text-[11px] text-gray-500 line-clamp-2" title={item.ad_quote}>
                              From the ad: <i>“{item.ad_quote}”</i>
                            </span>
                          )}
                        </span>
                        <button
                          onClick={() => navigate(`/chatbot?skill=${encodeURIComponent(item.job_skill)}&job=${encodeURIComponent(gap?.job?.job_title || '')}&reason=${encodeURIComponent(item.gap_reason || '')}`)}
                          className="text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-full transition font-medium shrink-0"
                        >
                          Learn →
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* 2. You already have — chips by default, grouped by source on click */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">
                  {BasisWord} skills you have <span className="text-green-700">({matchedRows.length} of {totalRequired})</span>
                </h2>
                {matchedRows.length > 0 && (
                  <button
                    onClick={() => setShowSources(v => !v)}
                    className="text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-100 px-3 py-1 rounded-full transition"
                  >
                    {showSources ? 'Hide sources ▴' : 'Show where these come from ▾'}
                  </button>
                )}
              </div>

              {matchedRows.length === 0 ? (
                <p className="text-xs text-gray-400 px-5 py-4">None of this job's skills match your record yet.</p>
              ) : !showSources ? (
                <div className="flex flex-wrap gap-1.5 px-5 py-4">
                  {matchedRows.map((item, idx) => (
                    <span key={idx} title={item.ad_quote ? `From the ad: “${item.ad_quote}”` : undefined}
                      className="inline-flex items-center gap-1.5 text-xs text-gray-700 bg-slate-50 border border-gray-200 px-2.5 py-1 rounded-lg">
                      <span className="text-green-600 font-bold">✓</span>
                      {item.job_skill}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {sourceGroups.map(([source, group]) => (
                    <div key={source} className="px-5 py-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="text-xs font-semibold text-gray-700">{group.label}</span>
                        {group.grade && (
                          <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-semibold">{group.grade}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {group.items.map((item, idx) => (
                          <span key={idx} title={item.ad_quote ? `From the ad: “${item.ad_quote}”` : undefined}
                            className="inline-flex items-center gap-1.5 text-xs text-gray-700 bg-slate-50 border border-gray-200 px-2.5 py-1 rounded-lg">
                            <span className="text-green-600 font-bold">✓</span>
                            {item.job_skill}
                            {item.matched_graduate_skill && item.matched_graduate_skill.toLowerCase() !== item.job_skill.toLowerCase() && (
                              <span className="text-[10px] text-gray-400">via {item.matched_graduate_skill}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 3. Nice-to-have skills: a bonus, not counted in the % (only for jobs extracted with levels, Stage 1) */}
            {niceToHave.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-700">
                    Nice-to-have skills <span className="text-green-700">({niceToHave.filter(n => n.has).length} of {niceToHave.length})</span>
                    <span className="ml-2 font-normal text-xs text-gray-400">bonus · not counted in the %</span>
                  </h2>
                </div>
                <div className="flex flex-wrap gap-1.5 px-5 py-4">
                  {niceToHave.map((item, idx) => (
                    <span key={idx} title={item.ad_quote ? `From the ad: “${item.ad_quote}”` : undefined}
                      className="inline-flex items-center gap-1.5 text-xs text-gray-700 bg-slate-50 border border-gray-200 px-2.5 py-1 rounded-lg">
                      {item.has && <span className="text-green-600 font-bold">✓</span>}
                      {item.job_skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  )
}