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
  const [stats, setStats] = useState(null)
  const [user, setUser] = useState(null)

  useEffect(() => {
    api.get('/jobs/stats').then(res => setStats(res.data)).catch(() => {})
    api.get('/auth/me').then(res => setUser(res.data)).catch(() => {})
  }, [])

  const firstName = user?.full_name?.split(' ')[0] || 'there'

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto">

        {/* Greeting */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            {getGreeting()}, {firstName}! 👋
          </h1>
          <p className="text-gray-500 mt-1">
            Track your skills and discover your next opportunity in the Malaysian job market.
          </p>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-sm text-gray-500">Jobs Available</p>
              </div>
              <p className="text-3xl font-bold text-blue-700">{stats.total_jobs}</p>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-sm text-gray-500">Skills Indexed</p>
              </div>
              <p className="text-3xl font-bold text-green-600">{stats.total_skills}</p>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <p className="text-sm text-gray-500">Avg Skills / Job</p>
              </div>
              <p className="text-3xl font-bold text-purple-600">{stats.avg_skills_per_job}</p>
            </div>
          </div>
        )}

        {/* Feature cards */}
        <div className="grid grid-cols-2 gap-4">
          <div
            onClick={() => navigate('/modules')}
            className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 cursor-pointer hover:border-blue-300 hover:shadow-md transition group"
          >
            <div className="text-2xl mb-3">📚</div>
            <h2 className="text-base font-semibold text-gray-800 group-hover:text-blue-700 transition">My Modules</h2>
            <p className="text-sm text-gray-500 mt-1">
              Select your modules and grades to build your skill profile
            </p>
            <span className="inline-block mt-3 text-sm text-blue-700 font-medium">Get started →</span>
          </div>

          <div
            onClick={() => navigate('/recommend')}
            className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 cursor-pointer hover:border-blue-300 hover:shadow-md transition group"
          >
            <div className="text-2xl mb-3">💼</div>
            <h2 className="text-base font-semibold text-gray-800 group-hover:text-blue-700 transition">Job Recommendations</h2>
            <p className="text-sm text-gray-500 mt-1">
              Find jobs that match your skills from the Malaysian job market
            </p>
            <span className="inline-block mt-3 text-sm text-blue-700 font-medium">Explore jobs →</span>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 opacity-60">
            <div className="text-2xl mb-3">🔍</div>
            <h2 className="text-base font-semibold text-gray-800">Skill Gap Analysis</h2>
            <p className="text-sm text-gray-500 mt-1">
              See exactly which skills you need for your target job
            </p>
            <span className="inline-block mt-3 text-sm text-gray-400 font-medium">Select a job first →</span>
          </div>

          <div
            onClick={() => navigate('/chatbot')}
            className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 cursor-pointer hover:border-blue-300 hover:shadow-md transition group"
          >
            <div className="text-2xl mb-3">🤖</div>
            <h2 className="text-base font-semibold text-gray-800 group-hover:text-blue-700 transition">AI Career Assistant</h2>
            <p className="text-sm text-gray-500 mt-1">
              Get personalised guidance on your skill development path
            </p>
            <span className="inline-block mt-3 text-sm text-blue-700 font-medium">Chat now →</span>
          </div>
        </div>

      </div>
    </div>
  )
}