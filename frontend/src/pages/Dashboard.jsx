import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)

  useEffect(() => {
    api.get('/jobs/stats').then(res => setStats(res.data)).catch(() => {})
  }, [])

  return (
    <div className="h-screen bg-gray-50 flex flex-col justify-center p-6">
      <div className="max-w-5xl mx-auto w-full">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">
            Map your academic skills to the Malaysian job market
          </p>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <p className="text-sm text-gray-500">Jobs Available</p>
              <p className="text-3xl font-bold text-blue-700 mt-1">{stats.total_jobs}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <p className="text-sm text-gray-500">Skills Indexed</p>
              <p className="text-3xl font-bold text-blue-700 mt-1">{stats.total_skills}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <p className="text-sm text-gray-500">Avg Skills / Job</p>
              <p className="text-3xl font-bold text-blue-700 mt-1">{stats.avg_skills_per_job}</p>
            </div>
          </div>
        )}

        {/* Action Cards */}
        <div className="grid grid-cols-2 gap-4">
          <div
            onClick={() => navigate('/modules')}
            className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 cursor-pointer hover:border-blue-300 hover:shadow-md transition"
          >
            <div className="text-2xl mb-3">📚</div>
            <h2 className="text-base font-semibold text-gray-800">My Modules</h2>
            <p className="text-sm text-gray-500 mt-1">
              Select your modules and grades to build your skill profile
            </p>
            <span className="inline-block mt-3 text-sm text-blue-700 font-medium">
              Get started →
            </span>
          </div>

          <div
            onClick={() => navigate('/recommend')}
            className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 cursor-pointer hover:border-blue-300 hover:shadow-md transition"
          >
            <div className="text-2xl mb-3">💼</div>
            <h2 className="text-base font-semibold text-gray-800">Job Recommendations</h2>
            <p className="text-sm text-gray-500 mt-1">
              Find jobs that match your skills from the Malaysian job market
            </p>
            <span className="inline-block mt-3 text-sm text-blue-700 font-medium">
              Explore jobs →
            </span>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 opacity-60">
            <div className="text-2xl mb-3">🔍</div>
            <h2 className="text-base font-semibold text-gray-800">Skill Gap Analysis</h2>
            <p className="text-sm text-gray-500 mt-1">
              See exactly which skills you need for your target job
            </p>
            <span className="inline-block mt-3 text-sm text-gray-400 font-medium">
              Select a job first →
            </span>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 opacity-60">
            <div className="text-2xl mb-3">🤖</div>
            <h2 className="text-base font-semibold text-gray-800">AI Career Chatbot</h2>
            <p className="text-sm text-gray-500 mt-1">
              Get personalised guidance on your skill development path
            </p>
            <span className="inline-block mt-3 text-sm text-gray-400 font-medium">
              Coming soon →
            </span>
          </div>
        </div>

      </div>
    </div>
  )
}