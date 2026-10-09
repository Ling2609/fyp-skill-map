// Small helpers shared by the My Profile tabs (8 Oct; kept apart from profileParts.jsx because a file that
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

// GET /profile/showcase -> the body PUT /profile/about expects (it takes every About field at once, 8 Oct)
export const aboutBody = (d) => ({
  headline: d.headline || '', about: d.about || '',
  linkedin_url: d.links?.linkedin || '', portfolio_url: d.links?.portfolio || '', github_url: d.links?.github || '',
  visible_to_employers: !!d.visible_to_employers, show_grades_to_employers: !!d.show_grades_to_employers,
})

// A programme picked, and an intake too whenever that programme has intakes
export const studyComplete = (options, value) => {
  const programme = options?.programmes.find(p => p.id === value?.programme_id)
  return !!programme && (!programme.intakes.length || !!value.intake_id)
}

// Buttons on My Profile (9 Oct): one blue main action per tab
export const btnBlueCls = 'text-sm font-medium px-4 py-2 rounded-xl bg-blue-700 text-white hover:bg-blue-800 transition'

// The light-blue button for a page's own tools ("Links & visibility", "Import from GitHub"), the same look as
// "Update profile" on Job Matches (9 Oct)
export const softBtnCls = 'flex items-center gap-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3.5 py-2 hover:bg-blue-100 hover:border-blue-300 transition'

// Where a tab's skills come from (A6, 9 Oct). Students enter their own grades, so "from university" would be wrong;
// what differs is who decides the skills: the programme (module descriptions, reviewed by the career office) or the
// student (projects, certificates, awards: read by AI, confirmed by the student). Employers will see the same labels.
export const sourcePillCls = 'text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 cursor-help'
export const SELF_DECLARED_TIP = 'You added these. SkillMap reads the skills with AI and you confirm them.'
export const PROGRAMME_TIP = "These skills come from your programme's module descriptions, reviewed by the career office. You enter the grades."
