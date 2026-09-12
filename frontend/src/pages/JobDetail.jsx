import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../api'

export default function JobDetail() {
  const navigate = useNavigate()
  const { jobId } = useParams()

  const [gap, setGap] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const stored = sessionStorage.getItem('selectedModules')
    const modules = stored ? JSON.parse(stored) : []

    if (!stored || modules.length === 0) {
      navigate('/modules')
      return
    }

    const decodedJobId = decodeURIComponent(jobId)

    api.post('/skillgap/', {
      modules,
      job_id: decodedJobId,
    })
      .then(res => {
        setGap(res.data)
        setLoading(false)
      })
      .catch(err => {
        setError(err.response?.data?.detail || 'Failed to load skill gap analysis')
        setLoading(false)
      })
  }, [jobId, navigate])

  if (loading) {
    return (
      <div className="h-[calc(100vh-64px)] bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-700 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Analysing skill gap...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-[calc(100vh-64px)] bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 text-sm mb-4">{error}</p>
          <button onClick={() => navigate(-1)} className="text-blue-700 text-sm hover:underline">
            ← Go back
          </button>
        </div>
      </div>
    )
  }

  const coveragePercent = gap?.summary?.coverage_percent || 0
  const getCoverageColor = (pct) => {
    if (pct >= 70) return 'text-green-600'
    if (pct >= 40) return 'text-yellow-600'
    return 'text-red-500'
  }
  const getCoverageBarColor = (pct) => {
    if (pct >= 70) return 'bg-green-500'
    if (pct >= 40) return 'bg-yellow-500'
    return 'bg-red-400'
  }

  return (
    <div className="h-[calc(100vh-64px)] bg-gray-50 flex flex-col">

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-8 py-4 shrink-0">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="text-xs text-blue-600 hover:underline"
          >
            ← Back to Results
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="max-w-4xl mx-auto space-y-5">

          {/* Job Info Card */}
          <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-gray-800">{gap?.job?.job_title}</h1>
                <p className="text-sm text-gray-500 mt-1">
                  {gap?.job?.company} · {gap?.job?.location}
                </p>
              </div>
              {/* Coverage score */}
              <div className="text-right shrink-0">
                <p className={`text-3xl font-bold ${getCoverageColor(coveragePercent)}`}>
                  {coveragePercent}%
                </p>
                <p className="text-xs text-gray-400 mt-0.5">skill coverage</p>
              </div>
            </div>

            {/* Coverage bar */}
            <div className="mt-4">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>{gap?.summary?.matched_skills} of {gap?.summary?.job_skills_total} required skills matched</span>
                <span>{gap?.summary?.missing_skills} skills to develop</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${getCoverageBarColor(coveragePercent)}`}
                  style={{ width: `${coveragePercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Two column — matched + missing */}
          <div className="grid grid-cols-2 gap-4">

            {/* Matched skills */}
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
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-700 truncate">{item.job_skill}</p>
                        <p className="text-xs text-gray-400 truncate">via: {item.matched_graduate_skill}</p>
                      </div>
                      <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded shrink-0">
                        {Math.round(item.similarity * 100)}%
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Missing skills */}
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
                      <span className="text-xs text-red-500 bg-red-50 px-1.5 py-0.5 rounded shrink-0">
                        Missing
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Your extra skills */}
          {gap?.graduate_only_skills?.length > 0 && (
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <h2 className="text-sm font-semibold text-gray-700">
                  Your Additional Skills
                </h2>
                <span className="text-xs text-gray-400">(not required for this role but valuable)</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {gap.graduate_only_skills.map((item, idx) => (
                  <span
                    key={idx}
                    className="text-xs bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full border border-blue-100"
                  >
                    {item.skill}
                  </span>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}