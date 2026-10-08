// Small helpers shared by the Skill Profile tabs (8 Oct; kept apart from profileParts.jsx because a file that
// exports React components should export only components, so the page can reload in place while editing).

export const inputCls = 'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500'
export const ADDED_BY_YOU = 'Added by you'
export const errText = (err, fallback) => err.response?.data?.detail || fallback
// 'Python, SQL; data analysis' -> ['Python', 'SQL', 'data analysis']
export const splitSkills = (text) => text.split(/[,;\n•]+/).map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// "2025-11" (an award's month) -> "Nov 2025"
export const monthLabel = (value) => {
  const [year, month] = (value || '').split('-')
  return year && month ? `${MONTHS[Number(month) - 1]} ${year}` : ''
}
