import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

const GRADE_OPTIONS = [
  { label: 'A (4.0)', value: 4.0 },
  { label: 'A- (3.7)', value: 3.7 },
  { label: 'B+ (3.3)', value: 3.3 },
  { label: 'B (3.0)', value: 3.0 },
  { label: 'B- (2.7)', value: 2.7 },
  { label: 'C+ (2.3)', value: 2.3 },
  { label: 'C (2.0)', value: 2.0 },
]

export default function Modules() {
  const navigate = useNavigate()
  const [modules, setModules] = useState([])
  const [selectedYear, setSelectedYear] = useState(1)
  const [selections, setSelections] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/modules/').then(res => {
      setModules(res.data)
      const defaults = {}
      res.data.forEach(mod => {
        if (mod.type === 'common' || mod.type === 'specialised') {
          defaults[mod.code] = 3.0
        }
      })
      setSelections(defaults)
      setLoading(false)
    })
  }, [])

  const yearModules = modules.filter(m => m.level === selectedYear)
  const compulsory = yearModules.filter(m => m.type === 'common' || m.type === 'specialised')
  const electives = yearModules.filter(m => m.type === 'elective')

  const toggleElective = (code) => {
    setSelections(prev => {
      if (prev[code] !== undefined) {
        const updated = { ...prev }
        delete updated[code]
        return updated
      }
      return { ...prev, [code]: 3.0 }
    })
  }

  const setGrade = (code, grade) => {
    setSelections(prev => ({ ...prev, [code]: parseFloat(grade) }))
  }

  const handleGetRecommendations = () => {
    const moduleList = Object.entries(selections).map(([code, grade]) => ({
      module_code: code,
      grade,
    }))
    sessionStorage.setItem('selectedModules', JSON.stringify(moduleList))
    navigate('/recommend')
  }

  const selectedCount = Object.keys(selections).length

  if (loading) {
    return (
      <div className="h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-700 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading modules...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-gray-50 flex flex-col p-6">
      <div className="max-w-6xl mx-auto w-full flex flex-col h-full gap-4">

        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">My Modules</h1>
            <p className="text-gray-500 text-sm mt-1">Select your modules and enter your grades</p>
          </div>
          <button
            onClick={handleGetRecommendations}
            disabled={selectedCount === 0}
            className="bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 transition disabled:opacity-50"
          >
            Get Recommendations ({selectedCount} modules)
          </button>
        </div>

        {/* Year Tabs */}
        <div className="flex gap-2 shrink-0">
          {[1, 2, 3].map(year => (
            <button
              key={year}
              onClick={() => setSelectedYear(year)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                selectedYear === year
                  ? 'bg-blue-700 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300'
              }`}
            >
              Year {year}
            </button>
          ))}
        </div>

        {/* Split Panel */}
        <div className="flex gap-4 flex-1 min-h-0">

          {/* Left — Compulsory */}
          <div className="flex-4 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col min-h-0">
            <div className="px-5 py-3 border-b border-gray-100 shrink-0">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Compulsory Modules
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">{compulsory.length} modules · all required</p>
            </div>
            <div className="overflow-auto flex-1 px-5 py-1 space-y-0">
              {compulsory.map(mod => (
                <div
                  key={mod.code}
                  className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{mod.name}</p>
                      <p className="text-xs text-gray-400">{mod.code}</p>
                    </div>
                  </div>
                  <select
                    value={selections[mod.code] ?? 3.0}
                    onChange={e => setGrade(mod.code, e.target.value)}
                    className="ml-3 border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shrink-0"
                  >
                    {GRADE_OPTIONS.map(g => (
                      <option key={g.value} value={g.value}>{g.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Right — Elective */}
          <div className="flex-2 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col min-h-0">
            <div className="px-5 py-4 border-b border-gray-100 shrink-0">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Elective Modules
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">Select the electives you took</p>
            </div>
            <div className="overflow-auto flex-1 px-5 py-3 space-y-1">
              {electives.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No electives for Year {selectedYear}</p>
              ) : (
                electives.map(mod => (
                  <div key={mod.code} className="py-3 border-b border-gray-50 last:border-0">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selections[mod.code] !== undefined}
                        onChange={() => toggleElective(mod.code)}
                        className="w-4 h-4 mt-0.5 accent-blue-700 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800">{mod.name}</p>
                        <p className="text-xs text-gray-400">{mod.code}</p>
                        {selections[mod.code] !== undefined && (
                          <select
                            value={selections[mod.code]}
                            onChange={e => setGrade(mod.code, e.target.value)}
                            className="mt-2 border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
                          >
                            {GRADE_OPTIONS.map(g => (
                              <option key={g.value} value={g.value}>{g.label}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}