import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

const getGreeting = () => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [{ topJobs, profileStats }] = useState(() => {
    const savedResults = sessionStorage.getItem('lastRecommendResults')
    const savedModules = sessionStorage.getItem('selectedModules')

    if (savedResults) {
      const data = JSON.parse(savedResults)
      const top3 = data.recommendations?.slice(0, 3) || []
      return {
        topJobs: top3,
        profileStats: {
          skills: data.graduate_profile?.unique_skills || 0,
          bestMatch: top3[0]?.match_percent || 0,
          bestMatchTitle: top3[0]?.job_title || null,
          modules: data.graduate_profile?.modules_count || 0,
        },
      }
    }

    if (savedModules) {
      const modules = JSON.parse(savedModules)
      return {
        topJobs: [],
        profileStats: {
          skills: null,
          bestMatch: null,
          bestMatchTitle: null,
          modules: modules.length,
        },
      }
    }

    return { topJobs: [], profileStats: null }
  })

  useEffect(() => {
    api.get('/auth/me').then(res => setUser(res.data)).catch(() => {})
  }, [])

  const firstName = user?.first_name || 'there'

  const getMatchColor = (percent) => {
    if (percent >= 70) return 'text-green-600'
    if (percent >= 40) return 'text-yellow-600'
    return 'text-red-500'
  }

  const getDotColor = (percent) => {
    if (percent >= 70) return 'bg-green-500'
    if (percent >= 40) return 'bg-yellow-500'
    return 'bg-red-400'
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Greeting */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {getGreeting()}, {firstName}! 👋
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            Track your skills and discover your next opportunity in the Malaysian job market.
          </p>
        </div>

        {/* Profile Stats */}
        {profileStats && (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-sm text-gray-500">Your Skills</p>
              </div>
              {profileStats.skills ? (
                <>
                  <p className="text-3xl font-bold text-blue-700">{profileStats.skills}</p>
                  <p className="text-xs text-gray-400 mt-1">from {profileStats.modules} modules</p>
                </>
              ) : (
                <>
                  <p className="text-3xl font-bold text-gray-300">—</p>
                  <p className="text-xs text-gray-400 mt-1">select modules first</p>
                </>
              )}
            </div>

            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <p className="text-sm text-gray-500">Best Match</p>
              </div>
              {profileStats.bestMatch ? (
                <>
                  <p className={`text-3xl font-bold ${getMatchColor(profileStats.bestMatch)}`}>
                    {profileStats.bestMatch}%
                  </p>
                  <p className="text-xs text-gray-400 mt-1 truncate">{profileStats.bestMatchTitle}</p>
                </>
              ) : (
                <>
                  <p className="text-3xl font-bold text-gray-300">—</p>
                  <p className="text-xs text-gray-400 mt-1">find jobs first</p>
                </>
              )}
            </div>

            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <p className="text-sm text-gray-500">Modules Selected</p>
              </div>
              <p className="text-3xl font-bold text-purple-600">{profileStats.modules}</p>
              <p className="text-xs text-gray-400 mt-1">
                {profileStats.modules > 0 ? 'modules configured' : 'none selected yet'}
              </p>
            </div>
          </div>
        )}

        {/* Top Job Matches */}
        {topJobs.length > 0 && (
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Top Job Matches</h2>
              <button
                onClick={() => navigate('/recommend')}
                className="text-xs text-blue-600 hover:underline"
              >
                View all →
              </button>
            </div>
            <div className="space-y-2">
              {topJobs.map((job, idx) => (
                <div
                  key={job.job_id}
                  onClick={() => navigate(`/jobs/${encodeURIComponent(job.job_id)}`)}
                  className="flex items-center justify-between gap-3 py-2.5 border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50 rounded-lg px-2 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs text-gray-400 w-4 flex-shrink-0">{idx + 1}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{job.job_title}</p>
                      <p className="text-xs text-gray-400">{job.company} · {job.location}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <div className={`w-2 h-2 rounded-full ${getDotColor(job.match_percent)}`} />
                    <span className={`text-xs font-semibold ${getMatchColor(job.match_percent)}`}>
                      {job.match_percent}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Feature Cards */}
        <div className="grid grid-cols-2 gap-4">
          <div
            onClick={() => navigate('/modules')}
            className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 cursor-pointer hover:border-blue-300 hover:shadow-md transition group"
          >
            <div className="text-2xl mb-3">📚</div>
            <h2 className="text-base font-semibold text-gray-800 group-hover:text-blue-700 transition">My Modules</h2>
            <p className="text-sm text-gray-500 mt-1">Select your modules and grades to build your skill profile</p>
            <span className="inline-block mt-3 text-sm text-blue-700 font-medium">Get started →</span>
          </div>

          <div
            onClick={() => navigate('/recommend')}
            className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 cursor-pointer hover:border-blue-300 hover:shadow-md transition group"
          >
            <div className="text-2xl mb-3">💼</div>
            <h2 className="text-base font-semibold text-gray-800 group-hover:text-blue-700 transition">Job Recommendations</h2>
            <p className="text-sm text-gray-500 mt-1">Find jobs that match your skills from the Malaysian job market</p>
            <span className="inline-block mt-3 text-sm text-blue-700 font-medium">Explore jobs →</span>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 opacity-60">
            <div className="text-2xl mb-3">🔍</div>
            <h2 className="text-base font-semibold text-gray-800">Skill Gap Analysis</h2>
            <p className="text-sm text-gray-500 mt-1">See exactly which skills you need for your target job</p>
            <span className="inline-block mt-3 text-sm text-gray-400 font-medium">Select a job first →</span>
          </div>

          <div
            onClick={() => navigate('/chatbot')}
            className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 cursor-pointer hover:border-blue-300 hover:shadow-md transition group"
          >
            <div className="text-2xl mb-3">🤖</div>
            <h2 className="text-base font-semibold text-gray-800 group-hover:text-blue-700 transition">AI Career Assistant</h2>
            <p className="text-sm text-gray-500 mt-1">Get personalised guidance on your skill development path</p>
            <span className="inline-block mt-3 text-sm text-blue-700 font-medium">Chat now →</span>
          </div>
        </div>

      </div>
    </div>
  )
}