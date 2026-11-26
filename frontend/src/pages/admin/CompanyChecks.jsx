import { useState } from 'react'

// 26 Nov (her ask): the SSM sites take no search in the link, so the number copies with one click and the two
// official SSM sites open in a new tab; they search by company name or registration number
// one site (her pick, 26 Nov): MyData SSM, the newer of SSM's two portals, free to search by name or number
const SSM_SEARCH = 'https://www.mydata-ssm.com.my/homePage'

const COPY_ICON = <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></svg>
const TICK_ICON = <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-10" /></svg>
const SEARCH_ICON = <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>

function CopyButton({ text, what }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* no clipboard (http, old browser): the number stays visible to copy by hand */ }
  }
  return (
    <button type="button" onClick={copy} className={`co-ico${copied ? ' done' : ''}`} title={copied ? 'Copied' : `Copy ${what}`}
      aria-label={copied ? `${what} copied` : `Copy ${what}`}>{copied ? TICK_ICON : COPY_ICON}</button>
  )
}

// 20 Nov: what the career office checks before approving: the website (opens in a new tab), the SSM number, and a
// flag when the email isn't a company address or doesn't match the website.
// 26 Nov (her review: loose chips, then labelled lines, made the row too tall): ONE line of two chips, the row as tall
// as a row without them. The email check is a mark on the website chip (✓ / !, explained on hover and read out);
// the SSM chip carries Copy and Look up (MyData SSM: search by company name or SSM number) as small icon buttons.
export function CompanyChecks({ u }) {
  if (u.role !== 'employer' || (!u.company_website && !u.company_ssm)) return u.role === 'employer'
    ? <span className="co-check warn">No website or SSM (older sign-up)</span> : null
  const site = (u.company_website || '').replace(/^https?:\/\//, '').replace(/\/$/, '')
  const mark = u.free_email ? ['warn', '!', 'Personal email, not a company one']
    : u.email_matches_site ? ['ok', '✓', 'Email matches the website']
    : u.company_website ? ['warn', '!', "Email doesn't match the website"] : null
  return (
    <span className="co-checks">
      {u.company_website ? (
        <a href={u.company_website} target="_blank" rel="noopener noreferrer" className="co-check link" title={mark?.[2]}>
          {mark && <b className={`co-mark ${mark[0]}`} aria-hidden="true">{mark[1]}</b>}
          {site} ↗{mark && <span className="sr-only"> ({mark[2]})</span>}
        </a>
      ) : <span className="co-check">No website{u.free_email && ' · personal email'}</span>}
      {u.company_ssm && (
        <span className="co-check co-ssm">
          SSM <span className="co-num">{u.company_ssm}</span>
          <CopyButton text={u.company_ssm} what={`SSM number ${u.company_ssm}`} />
          <a href={SSM_SEARCH} target="_blank" rel="noopener noreferrer" className="co-ico" title="Look up on MyData SSM (company name or SSM number)"
            aria-label="Look up the company by name or SSM number on MyData SSM (opens in a new tab)">{SEARCH_ICON}</a>
        </span>
      )}
    </span>
  )
}
