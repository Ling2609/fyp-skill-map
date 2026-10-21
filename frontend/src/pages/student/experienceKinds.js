// 21 Oct (references.md "What employers look for in graduates", "Languages and CGPA"): the choices for work
// experience, activities and languages. The same keys as the backend (models/profile.py EXPERIENCE_CATEGORIES,
// routers/experience.py CATEGORY_LABELS, routers/profile.py LANGUAGE_LEVELS). "Other" is always offered.
export const CATEGORIES = {
  work: [['internship', 'Internship'], ['placement', 'Industrial placement'], ['part_time', 'Part-time job'],
         ['freelance', 'Freelance'], ['other', 'Other']],
  activity: [['club', 'Club or society'], ['hackathon', 'Hackathon'], ['competition', 'Competition'],
             ['volunteering', 'Volunteering'], ['event', 'Event organising'], ['other', 'Other']],
}
// LinkedIn's five levels (its profile API), most fluent first
export const LANGUAGE_LEVELS = [['native', 'Native or bilingual'], ['full_professional', 'Full professional'],
  ['professional_working', 'Professional working'], ['limited_working', 'Limited working'], ['elementary', 'Elementary']]
export const levelLabel = (key) => LANGUAGE_LEVELS.find(([k]) => k === key)?.[1] || ''
export const categoryLabel = (kind, key) => CATEGORIES[kind]?.find(([k]) => k === key)?.[1] || 'Other'
