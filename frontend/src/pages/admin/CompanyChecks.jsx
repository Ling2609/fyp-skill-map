// 20 Nov: what the career office checks before approving: the website (opens in a new tab), the SSM number, and a
// flag when the email isn't a company address or doesn't match the website
export function CompanyChecks({ u }) {
  if (u.role !== 'employer' || (!u.company_website && !u.company_ssm)) return u.role === 'employer'
    ? <span className="co-check warn">No website or SSM (older sign-up)</span> : null
  const site = (u.company_website || '').replace(/^https?:\/\//, '').replace(/\/$/, '')
  return (
    <span className="co-checks">
      {u.company_website ? <a href={u.company_website} target="_blank" rel="noopener noreferrer" className="co-check link">{site} ↗</a>
        : <span className="co-check">No website</span>}
      {u.company_ssm && <span className="co-check">SSM {u.company_ssm}</span>}
      {u.free_email ? <span className="co-check warn">Personal email, not a company one</span>
        : u.email_matches_site ? <span className="co-check ok">✓ Email matches website</span>
        : u.company_website ? <span className="co-check warn">Email doesn't match website</span> : null}
    </span>
  )
}
