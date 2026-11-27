import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Replies are Markdown (GitHub-flavoured: tables, task lists). The old line-by-line renderer showed tables, "---"
// and bold inside headings as raw symbols (6 Oct). react-markdown builds React elements and ignores raw HTML,
// so a reply cannot inject markup into the page.
// 27 Nov (her review: a learning plan on screen read as one flat block, the title and the sections looking the
// same): "### Learning plan: X" gets its own title style, the "#### Section" labels become small accent labels,
// and the plan table gets a coloured head, striped rows and a tinted last row (the "Add it to SkillMap" step).
// The PDF stays black and white on purpose (she prints it).
// 27 Nov (her review: "add some icon, make it interesting a bit"): one small mark per plan section, so the shape of a
// plan is visible at a glance. Decorative only (aria-hidden), the words carry the meaning.
const ICONS = {
  play: <path d="M5 3.5v13l11-6.5z" />,
  book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><path d="M4 5.5v15" /></>,
  route: <><circle cx="5.5" cy="5.5" r="1.8" /><circle cx="18" cy="18" r="1.8" /><path d="M7.3 5.5h6.2a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h7" /></>,
  code: <><path d="M8.5 8 5 11.5 8.5 15" /><path d="M15.5 8 19 11.5 15.5 15" /></>,
  alert: <><path d="M12 4.5 21 20H3z" /><path d="M12 10v4.5M12 17.5v.01" /></>,
  case: <><rect x="3.5" y="7.5" width="17" height="12" rx="2" /><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" /></>,
  check: <><circle cx="12" cy="12" r="8.5" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>,
}
const SECTION = [
  [/quick start/i, 'play'],
  [/resource/i, 'book'],
  [/your plan/i, 'route'],
  [/worked example/i, 'code'],
  [/common mistake/i, 'alert'],
  [/show it|portfolio/i, 'case'],
  [/check your progress|check/i, 'check'],
]
const textOf = (node) => (typeof node === 'string' ? node
  : Array.isArray(node) ? node.map(textOf).join('') : node?.props?.children ? textOf(node.props.children) : '')
function SectionIcon({ children }) {
  const key = SECTION.find(([re]) => re.test(textOf(children)))?.[1]
  if (!key) return null
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0">{ICONS[key]}</svg>
  )
}

const MD = {
  h1: ({ children }) => <p className="plan-title">{children}</p>,
  h2: ({ children }) => <p className="plan-title">{children}</p>,
  h3: ({ children }) => <p className="plan-title">{children}</p>,
  h4: ({ children }) => <p className="plan-section"><SectionIcon>{children}</SectionIcon>{children}</p>,
  h5: ({ children }) => <p className="plan-section"><SectionIcon>{children}</SectionIcon>{children}</p>,
  h6: ({ children }) => <p className="plan-section">{children}</p>,
  p: ({ children }) => <p className="text-sm text-ink-soft leading-relaxed my-1.5">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  em: ({ children }) => <em className="italic text-ink-soft">{children}</em>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent font-medium hover:underline wrap-break-word">{children}</a>
  ),
  ul: ({ children, className }) => (
    <ul className={`text-sm text-ink-soft leading-relaxed my-1.5 space-y-1 ${className?.includes('contains-task-list') ? 'list-none pl-1' : 'list-disc pl-5 marker:text-accent'}`}>{children}</ul>
  ),
  ol: ({ children }) => <ol className="text-sm text-ink-soft leading-relaxed my-1.5 space-y-1 list-decimal pl-5 marker:text-faint">{children}</ol>,
  li: ({ children }) => <li className="[&>p]:my-0">{children}</li>,
  input: ({ checked }) => <input type="checkbox" checked={!!checked} readOnly className="mr-1.5 align-middle accent-accent" />,
  hr: () => <hr className="my-3 border-line" />,
  code: ({ children }) => <code className="text-[13px] bg-sunken text-ink rounded px-1 py-0.5">{children}</code>,
  pre: ({ children }) => <pre className="my-2 bg-sunken border border-line rounded-lg p-3 overflow-x-auto [&>code]:bg-transparent [&>code]:p-0">{children}</pre>,
  table: ({ children }) => (
    <div tabIndex={0} className="plan-table my-3 overflow-x-auto rounded-xl border border-line shadow-card">
      <table className="w-full text-xs text-left">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-accent-soft text-accent-strong">{children}</thead>,
  th: ({ children }) => <th className="px-3 py-2 font-semibold whitespace-nowrap">{children}</th>,
  tbody: ({ children }) => (
    <tbody className="[&>tr:nth-child(even)]:bg-canvas [&>tr:last-child]:bg-have-soft/70">{children}</tbody>
  ),
  td: ({ children }) => <td className="px-3 py-2 align-top text-ink-soft border-t border-line">{children}</td>,
}

// 27 Nov: `plan` marks a learning-plan reply, so its step table can read as a route (numbered steps joined by a
// line, the time as a quiet cell, the "Add it to SkillMap" row tinted). Replies that are not plans keep the plain look.
export default function ChatMarkdown({ children, plan = false }) {
  return (
    <div className={plan ? 'learning-plan-reading is-plan' : 'learning-plan-reading'}>
      <Markdown remarkPlugins={[remarkGfm]} components={MD}>{children}</Markdown>
    </div>
  )
}
