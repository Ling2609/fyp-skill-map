// Why "Not selected" (14 Oct, transparency flow; her design: preset reasons, and "Other" opens a box to write one).
// Students read these on My Applications. "Missing required skills" shows each student their own missing skills.
export const REASONS = [
  ['missing_skills', 'Missing required skills'],
  ['position_filled', 'Position filled'],
  ['experience', 'More experience needed'],
  ['other', 'Other'],
]
export const NOTE_MAX = 300
// valid to send: no reason, a preset, or "other" with something written
export const reasonOk = ({ reason, note }) => reason !== 'other' || (note || '').trim().length > 0
