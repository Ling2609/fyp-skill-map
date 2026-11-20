import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Replies are Markdown (GitHub-flavoured: tables, task lists). The old line-by-line renderer showed tables, "---"
// and bold inside headings as raw symbols (6 Oct). react-markdown builds React elements and ignores raw HTML,
// so a reply cannot inject markup into the page.
const MD = {
  h1: ({ children }) => <p className="text-sm font-semibold text-slate-900 mt-4 mb-1 first:mt-0">{children}</p>,
  h2: ({ children }) => <p className="text-sm font-semibold text-slate-900 mt-4 mb-1 first:mt-0">{children}</p>,
  h3: ({ children }) => <p className="text-sm font-semibold text-slate-800 mt-3 mb-1 first:mt-0">{children}</p>,
  h4: ({ children }) => <p className="text-sm font-semibold text-slate-800 mt-3 mb-1 first:mt-0">{children}</p>,
  p: ({ children }) => <p className="text-sm text-slate-600 leading-relaxed my-1.5">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline wrap-break-word">{children}</a>
  ),
  ul: ({ children, className }) => (
    <ul className={`text-sm text-slate-600 leading-relaxed my-1.5 space-y-1 ${className?.includes('contains-task-list') ? 'list-none pl-1' : 'list-disc pl-5 marker:text-blue-400'}`}>{children}</ul>
  ),
  ol: ({ children }) => <ol className="text-sm text-slate-600 leading-relaxed my-1.5 space-y-1 list-decimal pl-5 marker:text-slate-400">{children}</ol>,
  li: ({ children }) => <li className="[&>p]:my-0">{children}</li>,
  input: ({ checked }) => <input type="checkbox" checked={!!checked} readOnly className="mr-1.5 align-middle accent-blue-600" />,
  hr: () => <hr className="my-3 border-slate-200" />,
  code: ({ children }) => <code className="text-[13px] bg-slate-100 text-slate-800 rounded px-1 py-0.5">{children}</code>,
  pre: ({ children }) => <pre className="my-2 bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-x-auto [&>code]:bg-transparent [&>code]:p-0">{children}</pre>,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-xs text-left">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-slate-50 text-slate-500">{children}</thead>,
  th: ({ children }) => <th className="px-3 py-2 font-medium whitespace-nowrap">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2 align-top text-slate-600 border-t border-slate-200">{children}</td>,
}

export default function ChatMarkdown({ children }) {
  return <div className="learning-plan-reading"><Markdown remarkPlugins={[remarkGfm]} components={MD}>{children}</Markdown></div>
}
