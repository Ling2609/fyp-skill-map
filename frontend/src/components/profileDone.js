// Which of the five profile items a student has added (ProfileTracker), from GET /profile/showcase's shape
export const doneFrom = (s) => ({
  modules: s.module_count > 0,
  projects: s.projects.length > 0,
  experience: s.experiences.length > 0,
  certs: s.certifications.length > 0 || s.awards.length > 0,
  about: Boolean((s.headline || s.about) && s.languages.length),
})
