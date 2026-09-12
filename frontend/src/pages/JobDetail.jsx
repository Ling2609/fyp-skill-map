import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../api'

const GRADE_LABELS = {
  1.0: 'A', 0.9: 'A-', 0.8: 'B+', 0.7: 'B', 0.6: 'B-', 0.5: 'C+',
}

const gradeLabel = (weight) => GRADE_LABELS[weight] || ''

const formatDescription = (text) => {
  if (!text) return []
  // Split on multiple spaces or numbered points
  return text
    .replace(/\s{2,}/g, '\n')
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 10)
}

export default function JobDetail() {
  const navigate = useNavigate()
  const { jobId } = useParams()
  const [gap, setGap] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('description')

  useEffect(() => {
    const stored = sessionStorage.getItem('selectedModules')
    const modules = stored ? JSON.parse(stored) : []

    if (!stored || modules.length === 0) {
      navigate('/modules')
      return
    }
    api.post('/skillgap/', { modules, job_id: decodeURIComponent(jobId) })
      .then(res => { setGap(res.data); setLoading(false) })
      .catch(err => {
        setError(err.response?.data?.detail || 'Failed to load skill gap analysis')
        setLoading(false)
      })
  }, [jobId, navigate])

  if (loading) {
    return (
      <div className="h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-700 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Analysing skill gap...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-screen bg-gray-50 flex items-center justify-center">
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
  const descLines = formatDescription(gap?.job?.description)

  return (
    <div className="h-screen bg-gray-50 flex flex-col">

      {/* Top nav */}
      <div className="bg-white border-b border-gray-100 px-8 py-3 shrink-0">
        <div className="max-w-4xl mx-auto">
          <button onClick={() => navigate(-1)} className="text-xs text-blue-600 hover:underline">
            ← Back to Results
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-8 py-5">
        <div className="max-w-4xl mx-auto space-y-4">

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

            {/* Coverage bar */}
            <div className="mt-4">
              <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                <span>{gap?.summary?.matched_skills} of {gap?.summary?.job_skills_total} required skills matched</span>
                <span>{gap?.summary?.missing_skills} skills to develop</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className={`h-2 rounded-full ${barColor}`} style={{ width: `${coverage}%` }} />
              </div>
            </div>
          </div>

          {/* Tabs — description first */}
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
                    ? 'bg-blue-700 text-white'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Job Description tab */}
          {activeTab === 'description' && (
            <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
              {descLines.length > 0 ? (
                <ul className="space-y-2">
                  {descLines.map((line, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-gray-600">
                      <span className="text-gray-300 mt-1 shrink-0">•</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-400 text-sm">No job description available.</p>
              )}
            </div>
          )}

          {/* Skill Gap tab */}
          {activeTab === 'gap' && (
            <div className="grid grid-cols-2 gap-4">

              {/* Skills you have */}
              <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <h2 className="text-sm font-semibold text-gray-700">
                    Skills You Have ({gap?.summary?.matched_skills})
                  </h2>
                </div>
                <div className="space-y-2">
                  {gap?.matched_skills?.length === 0 ? (
                    <p className="text-xs text-gray-400">No matched skills found</p>
                  ) : (
                    gap?.matched_skills?.map((item, idx) => (
                      <div key={idx} className="flex items-start justify-between gap-2 py-1.5 border-b border-gray-50 last:border-0">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-xs font-medium text-gray-700 truncate">{item.job_skill}</p>
                            {gradeLabel(item.grade_weight) && (
                              <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-semibold shrink-0">
                                {gradeLabel(item.grade_weight)}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 truncate">via: {item.matched_graduate_skill}</p>
                        </div>
                        <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 font-medium ${
                          item.similarity >= 0.8 ? 'text-green-600 bg-green-50' :
                          item.similarity >= 0.65 ? 'text-yellow-600 bg-yellow-50' :
                          'text-orange-600 bg-orange-50'
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
                    <div className="w-2 h-2 rounded-full bg-red-400" />
                    <h2 className="text-sm font-semibold text-gray-700">
                      Skills to Develop ({gap?.summary?.missing_skills})
                    </h2>
                  </div>
                  <div className="space-y-2">
                    {gap?.missing_skills?.length === 0 ? (
                      <p className="text-xs text-gray-400">No missing skills — great match!</p>
                    ) : (
                      gap?.missing_skills?.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-2 py-1.5 border-b border-gray-50 last:border-0">
                          <p className="text-xs font-medium text-gray-700 truncate">{item.job_skill}</p>
                          <span className="text-xs text-red-500 bg-red-50 px-1.5 py-0.5 rounded shrink-0">Missing</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Bonus skills */}
                {gap?.graduate_only_skills?.length > 0 && (
                  <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      <h2 className="text-sm font-semibold text-gray-700">Your Bonus Skills</h2>
                    </div>
                    <p className="text-xs text-gray-400 mb-3">Not required but adds value</p>
                    <div className="flex flex-wrap gap-1.5">
                      {gap.graduate_only_skills.slice(0, 8).map((item, idx) => (
                        <span key={idx} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full border border-blue-100">
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
    </div>
  )
}