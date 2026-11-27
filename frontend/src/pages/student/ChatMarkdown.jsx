import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Replies are Markdown (GitHub-flavoured: tables, task lists). The old line-by-line renderer showed tables, "---"
// and bold inside headings as raw symbols (6 Oct). react-markdown builds React elements and ignores raw HTML,
// so a reply cannot inject markup into the page.
// 27 Nov (her review: a learning plan on screen read as one flat block, the title and the sections looking the
// same): "### Learning plan: X" gets its own title style, the "#### Section" labels become small accent labels,
// and the plan table gets a coloured head, striped rows and a tinted last row (the "Add it to SkillMap" step).
// The PDF stays black and white on purpose (she prints it).
const MD = {
  h1: ({ children }) => <p className="plan-title">{children}</p>,
  h2: ({ children }) => <p className="plan-title">{children}</p>,
  h3: ({ children }) => <p className="plan-title">{children}</p>,
  h4: ({ children }) => <p className="plan-section">{children}</p>,
  h5: ({ children }) => <p className="plan-section">{children}</p>,
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
    <div tabIndex={0} className="my-3 overflow-x-auto rounded-xl border border-line shadow-card">
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
