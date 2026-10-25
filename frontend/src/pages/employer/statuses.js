// Application statuses an employer sets (11 Oct, batch 2). Students see "rejected" as "Not selected".
export const STATUSES = [['applied', 'Applied'], ['shortlisted', 'Shortlisted'], ['accepted', 'Accepted'], ['rejected', 'Rejected']]
export const STATUS_CLS = {
  applied: 'bg-slate-100 text-slate-700 border-slate-200', shortlisted: 'bg-blue-50 text-blue-700 border-blue-200',
  accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200', rejected: 'bg-rose-50 text-rose-700 border-rose-200',
}
export const fmtDay = (iso) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''

// 25 Oct (her review: "Not opened" was unclear): "Not viewed yet", the same word as the student's "Viewed" step,
// which is recorded the first time the employer opens the application
export const NOT_VIEWED_TIP = 'You haven\'t opened this application yet. The student sees "Viewed" once you do.'
