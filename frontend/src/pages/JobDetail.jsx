import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../api'

const GRADE_LABELS = {
  1.0: 'A', 0.9: 'A-', 0.8: 'B+', 0.7: 'B', 0.6: 'B-', 0.5: 'C+',
}

const gradeLabel = (weight) => GRADE_LABELS[weight] || ''

export default function JobDetail() {
  const navigate = useNavigate()
  const { jobId } = useParams()
  const [gap, setGap] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('description')
  const [bullets, setBullets] = useState(null)
  const [bulletsLoading, setBulletsLoading] = useState(false)

  const stored = localStorage.getItem('selectedModules')
  const modules = stored ? JSON.parse(stored) : []

  useEffect(() => {
    if (!stored || modules.length === 0) {
      navigate('/modules')
    } else {
      api.post('/skillgap/', { modules, job_id: decodeURIComponent(jobId) })
        .then(res => { setGap(res.data); setLoading(false) })
        .catch(err => {
          setError(err.response?.data?.detail || 'Failed to load skill gap analysis')
          setLoading(false)
        })
    }
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

        {/* Job header */}
        <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-gray-800">{gap?.job?.job_title}</h1>
              <p className="text-sm text-gray-500 mt-1">{gap?.job?.company} · {gap?.job?.location}</p>
              <div className="mt-2">
                {gap?.job?.salary && gap.job.salary !== 'nan' ? (
                  <span className="text-xs bg-green-50 text-green-700 px-2.5 py-1 rounded-full font-medium">
                    💰 {gap.job.salary}
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">Salary not disclosed</span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className={`text-4xl font-bold ${coverageColor}`}>{coverage}%</p>
              <p className="text-xs text-gray-400 mt-0.5">skill match</p>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex justify-between text-xs text-gray-400 mb-1.5">
              <span>{gap?.summary?.matched_skills} of {gap?.summary?.job_skills_total} required skills matched</span>
              <span>{gap?.summary?.missing_skills} to develop</span>
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

        {/* Skill Gap Tab */}
        {activeTab === 'gap' && (
          <div className="grid grid-cols-2 gap-4">

            {/* Skills you have */}
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                <h2 className="text-sm font-semibold text-gray-700">
                  Skills You Have
                  <span className="ml-1.5 text-xs font-normal text-gray-400">({gap?.summary?.matched_skills})</span>
                </h2>
              </div>
              <div className="space-y-2.5">
                {gap?.matched_skills?.length === 0 ? (
                  <p className="text-xs text-gray-400">No matched skills found</p>
                ) : (
                  gap?.matched_skills?.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-3 pb-2.5 border-b border-gray-50 last:border-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-medium text-gray-800">{item.job_skill}</span>
                          {gradeLabel(item.grade_weight) && (
                            <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-semibold">
                              {gradeLabel(item.grade_weight)}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-400">via {item.matched_graduate_skill}</span>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                        item.similarity >= 0.8 ? 'text-green-700 bg-green-50' :
                        item.similarity >= 0.65 ? 'text-yellow-700 bg-yellow-50' :
                        'text-orange-700 bg-orange-50'
                      }`}>
                        {Math.round(item.similarity * 100)}%
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-4">

              {/* Skills to develop */}
              <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                  <h2 className="text-sm font-semibold text-gray-700">
                    Skills to Develop
                    <span className="ml-1.5 text-xs font-normal text-gray-400">({gap?.summary?.missing_skills})</span>
                  </h2>
                </div>
                <div className="space-y-2.5">
                  {gap?.missing_skills?.length === 0 ? (
                    <p className="text-xs text-gray-400">No missing skills — great match!</p>
                  ) : (
                    gap?.missing_skills?.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-3 pb-2.5 border-b border-gray-50 last:border-0 last:pb-0">
                        <span className="text-xs font-medium text-gray-700">{item.job_skill}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded-full">Missing</span>
                          <button
                            onClick={() => navigate(`/chatbot?skill=${encodeURIComponent(item.job_skill)}&job=${encodeURIComponent(gap?.job?.job_title || '')}`)}
                            className="text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-full transition"
                            title="Get a learning plan for this skill"
                          >
                            Learn →
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Bonus skills */}
              {gap?.graduate_only_skills?.length > 0 && (
                <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                    <h2 className="text-sm font-semibold text-gray-700">Your Bonus Skills</h2>
                  </div>
                  <p className="text-xs text-gray-400 mb-3">Not required but adds value</p>
                  <div className="flex flex-wrap gap-1.5">
                    {gap.graduate_only_skills.slice(0, 10).map((item, idx) => (
                      <span key={idx} className="text-xs text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full">
                        {item.skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}