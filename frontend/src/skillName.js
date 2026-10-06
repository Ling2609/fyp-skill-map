// How a skill name is shown (6 Oct, her choice): Title Case, the same on every page. Names are saved as the job ad
// or the student wrote them ("business process analysis", "UI/UX design"); only the display changes, never the
// saved name, the matching, or a quote from the ad.
//   - an all-lower-case word gets a capital: "business process analysis" -> "Business Process Analysis"
//   - small joining words stay lower unless first: "Version Control with Git"
//   - a word that already has capitals is kept: "UI/UX", "iOS", "ISTQB", "JavaScript"
//   - brands written in lower case on purpose are kept (the only 2 among 2,611 live job skill names, 6 Oct)
const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with'])
const KEEP_AS_WRITTEN = new Set(['dbt', 'shadcn/ui'])

export const skillName = (text) => {
  if (!text) return text
  return text.split(' ').map((word, i) => {
    if (word !== word.toLowerCase() || KEEP_AS_WRITTEN.has(word) || (i > 0 && SMALL_WORDS.has(word))) return word
    return word.charAt(0).toUpperCase() + word.slice(1)
  }).join(' ')
}
