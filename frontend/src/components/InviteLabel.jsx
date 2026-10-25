// 25 Oct (her plan, option D): what an employer sees about an invitation (backend app/services/invitations.py):
// Invited (date) while it's open, Declined · reason (or "No reason given"), or No reply after 14 days.
const fmt = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const CLS = {
  invited: 'text-blue-700 bg-blue-50',
  declined: 'text-slate-700 bg-slate-100',
  no_reply: 'text-slate-600 bg-slate-100',
}

export default function InviteLabel({ invite, className = '' }) {
  if (!invite) return null
  const text = invite.state === 'invited' ? `Invited ${fmt(invite.invited_at)}` : invite.label
  return (
    // the tooltip always carries the full text, so a label cut short in a narrow column ("Declined · Alrea…") can be read
    <span title={invite.state === 'declined' ? `${invite.label} (on ${fmt(invite.at)})` : invite.state === 'no_reply'
      ? `Invited ${fmt(invite.invited_at)}; no answer within 14 days` : text}
      className={`shrink-0 max-w-56 truncate text-xs font-semibold rounded-full px-2.5 py-1 ${CLS[invite.state]} ${className}`}>
      {text}
    </span>
  )
}
