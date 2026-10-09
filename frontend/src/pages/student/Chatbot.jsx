import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import api from '../../api'
import { cached, ALL_MATCHES } from '../../pageCache'
import PageHeader from '../../components/PageHeader'

const MODES = [
  {
    key: 'career_counsellor',
    label: 'Career Counsellor',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    description: 'Explore career paths and get personalised direction based on your skills and goals.',
    placeholder: 'Ask about your career direction, work style, or which roles suit you…',
    greeting: "👋 Hi! I'm your Career Counsellor. I can help you explore career paths that suit your skills and personality. What kind of work environment do you thrive in — fast-paced startups, structured corporations, or something else?",
  },
  {
    key: 'skill_development',
    label: 'Skill Development',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    description: 'Get a step-by-step learning plan for any skill, with specific resources and project ideas.',
    placeholder: 'Ask how to learn a skill, e.g. "How do I learn Docker?"',
    greeting: "🚀 Hi! I'm your Skill Development Guide. Tell me which skill you want to learn and I'll give you a focused learning plan with specific courses, tutorials, and a project idea to build your portfolio. What skill are you working on?",
  },
]

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2.5 justify-start">
      <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
        <svg className="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-3">
        <div className="flex gap-1 items-center h-4">
          <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  )
}

// Replies are Markdown (GitHub-flavoured: tables, task lists). The old line-by-line renderer showed tables, "---"
// and bold inside headings as raw symbols (6 Oct). react-markdown builds React elements and ignores raw HTML,
// so a reply cannot inject markup into the page.
const MD = {
  h1: ({ children }) => <p className="text-sm font-semibold text-slate-900 mt-4 mb-1 first:mt-0">{children}</p>,
  h2: ({ children }) => <p className="text-sm font-semibold text-slate-900 mt-4 mb-1 first:mt-0">{children}</p>,
  h3: ({ children }) => <p className="text-sm font-semibold text-slate-800 mt-3 mb-1 first:mt-0">{children}</p>,
  h4: ({ children }) => <p className="text-sm font-medium text-slate-800 mt-3 mb-1 first:mt-0">{children}</p>,
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
  hr: () => <hr className="my-3 border-slate-100" />,
  code: ({ children }) => <code className="text-[13px] bg-slate-100 text-slate-800 rounded px-1 py-0.5">{children}</code>,
  pre: ({ children }) => <pre className="my-2 bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-x-auto [&>code]:bg-transparent [&>code]:p-0">{children}</pre>,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-xs text-left">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-slate-50 text-slate-500">{children}</thead>,
  th: ({ children }) => <th className="px-3 py-2 font-medium whitespace-nowrap">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2 align-top text-slate-600 border-t border-slate-100">{children}</td>,
}

function MessageBubble({ msg }) {
  const isUser = msg.role === 'user'

  return (
    <div className={`flex items-end gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
          <svg className="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </div>
      )}
      <div
        className={`max-w-[75%] min-w-0 px-4 py-3 rounded-2xl ${
          isUser
            ? 'bg-blue-600 text-white rounded-br-sm'
            : 'bg-white border border-slate-200 rounded-bl-sm shadow-sm'
        }`}
      >
        {isUser
          ? <p className="text-sm text-white leading-relaxed">{msg.content}</p>
          : <Markdown remarkPlugins={[remarkGfm]} components={MD}>{msg.content}</Markdown>
        }
      </div>
    </div>
  )
}

export default function Chatbot() {
  const location = useLocation()
  const navigate = useNavigate()
  const fromJob = location.state?.fromJob   // opened from a job's skill gap: offer the way back to it
  const params = new URLSearchParams(location.search)
  const preloadSkill = params.get('skill')
  const preloadJob = params.get('job')
  // From the Dashboard's "Talk to the counsellor" (9 Oct): a first message written from her profile, put in the box
  // but NOT sent, so she can change it first
  const preloadAsk = params.get('ask')

  const initialMode = preloadSkill ? 'skill_development' : 'career_counsellor'
  const [mode, setMode] = useState(initialMode)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const hasAutoSent = useRef(false)
  const askUsed = useRef(false)          // the counsellor's pre-filled question is offered once

  // Saved chats (MongoDB, 6 Oct). sessionId = the chat being shown; null = a new chat, saved on its first reply
  const [sessionId, setSessionId] = useState(null)
  const sessionRef = useRef(null)
  const [sessions, setSessions] = useState([])
  const [historyNote, setHistoryNote] = useState('')    // why the list can't be shown (MongoDB off)
  const [confirmDelete, setConfirmDelete] = useState(null)
  // The list can be folded away for more room (her request, 6 Oct); remembered on this browser
  const [listOpen, setListOpen] = useState(() => {
    try { return localStorage.getItem('chatListOpen') !== '0' } catch { return true }
  })
  const toggleList = () => setListOpen(open => {
    try { localStorage.setItem('chatListOpen', open ? '0' : '1') } catch { /* not saved: fine */ }
    return !open
  })
  const [chatKey, setChatKey] = useState(0)            // bumped to start or open a chat
  const pendingChat = useRef(null)                     // messages of a chat being opened
  // What the chat is about: from "Learn →" on a job, or from the saved chat being continued
  const [chatCtx, setChatCtx] = useState({ target_skill: preloadSkill, job_title: preloadJob })

  const currentMode = MODES.find(m => m.key === mode)

  const userSkills = useRef(null)   // loaded once from /profile/skills
  const topJobs = useRef(null)      // loaded once from /recommend/ (same list as Job Matches' default view)

  const loadSessions = useCallback(async () => {
    try {
      const res = await api.get('/chatbot/sessions')
      setSessions(res.data)
      setHistoryNote('')
    } catch (err) {
      setHistoryNote(err.response?.status === 503 ? 'Chat history is off: MongoDB is not running, so chats are not saved.'
        : "Couldn't load your past chats.")
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    api.get('/chatbot/sessions')
      .then(res => { if (!cancelled) setSessions(res.data) })
      .catch(err => {
        if (!cancelled) setHistoryNote(err.response?.status === 503
          ? 'Chat history is off: MongoDB is not running, so chats are not saved.' : "Couldn't load your past chats.")
      })
    return () => { cancelled = true }
  }, [])

  const getContext = useCallback(async () => {
    const ctx = {}
    // The student's real skill profile (works even if Job Matches wasn't opened yet)
    if (userSkills.current === null) {
      try {
        const data = await cached('/profile/skills')
        userSkills.current = data.skills || []
      } catch {
        // leave it as null so the next message tries again
      }
    }
    ctx.user_skills = userSkills.current ?? []
    if (topJobs.current === null) {
      try {
        const data = await cached('/recommend/', ALL_MATCHES)   // usually already loaded by Dashboard / Job Matches
        topJobs.current = data.recommendations?.slice(0, 3).map(j => ({
          job_title: j.job_title,
          company: j.company,
          match_percent: j.coverage_percent ?? j.match_percent,   // % of required skills the student has
        })) || []
      } catch (err) {
        // Empty profile (400): no jobs to mention, don't ask again. Other errors: try again next message
        if (err.response?.status === 400) topJobs.current = []
      }
    }
    if (topJobs.current?.length) ctx.matched_jobs = topJobs.current
    if (chatCtx.job_title) ctx.job_title = chatCtx.job_title
    if (chatCtx.target_skill) ctx.target_skill = chatCtx.target_skill
    return ctx
  }, [chatCtx])

  const sendMessages = useCallback(async (msgs) => {
    setLoading(true)
    try {
      const ctx = await getContext()
      const res = await api.post('/chatbot/', {
        mode,
        // Only the last 20 messages: keeps each request small (backend limit is 40)
        messages: msgs.filter(m => !m.failed).slice(-20).map(m => ({ role: m.role, content: m.content })),
        ...ctx,
        session_id: sessionRef.current,
      })
      setMessages(prev => [...prev, { role: 'assistant', content: res.data.reply }])
      if (res.data.session_id) {
        sessionRef.current = res.data.session_id
        setSessionId(res.data.session_id)
        loadSessions()                              // the new or updated chat moves to the top of the list
      }
    } catch (err) {
      // Mark the message that failed so it isn't re-sent with every later message
      // (otherwise one bad message, e.g. too long, would break the whole chat)
      // The daily-limit message says when to try again (429); other failures stay general
      const text = err.response?.status === 429 && err.response.data?.detail
        ? err.response.data.detail : 'Something went wrong. Please try again.'
      setMessages(prev => {
        const next = [...prev]
        const last = next.length - 1
        if (last >= 0 && next[last].role === 'user') next[last] = { ...next[last], failed: true }
        return [...next, { role: 'assistant', content: text, failed: true }]
      })
    } finally {
      setLoading(false)
    }
  }, [mode, getContext, loadSessions])

  // Start (or open) the chat each time chatKey changes: greeting first, then a saved chat's messages, or the
  // "I want to learn X" question when the page was opened from "Learn →" on a job
  useEffect(() => {
    const initMessages = [{ role: 'assistant', content: currentMode.greeting }]
    let shouldAutoSend = false
    if (pendingChat.current) {
      initMessages.push(...pendingChat.current)
      pendingChat.current = null
    } else if (chatCtx.target_skill && mode === 'skill_development' && !hasAutoSent.current) {
      initMessages.push({ role: 'user', content: `I want to learn ${chatCtx.target_skill}. Can you give me a learning plan?` })
      shouldAutoSend = true
    }
    const timer = setTimeout(() => {
      setMessages(initMessages)
      setInput(!askUsed.current && preloadAsk && mode === 'career_counsellor' ? preloadAsk : '')
      askUsed.current = true
      if (shouldAutoSend) {
        hasAutoSent.current = true
        sendMessages(initMessages)
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [chatKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) return
    const newMessages = [...messages, { role: 'user', content: text }]
    setMessages(newMessages)
    setInput('')
    await sendMessages(newMessages)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // A new, empty chat in the given mode (not about a job any more)
  const newChat = (newMode = mode) => {
    if (loading) return
    hasAutoSent.current = true          // never re-send "I want to learn X" in a new chat
    sessionRef.current = null
    setSessionId(null)
    setChatCtx({ target_skill: null, job_title: null })
    setMode(newMode)
    setChatKey(k => k + 1)
  }

  const switchMode = (newMode) => {
    if (newMode === mode || loading) return   // don't switch while a reply is on its way
    newChat(newMode)                          // a chat keeps one mode, so another mode is another chat
  }

  const openSession = async (id) => {
    if (loading || id === sessionId) return
    try {
      const res = await api.get(`/chatbot/sessions/${id}`)
      pendingChat.current = res.data.messages
      hasAutoSent.current = true
      sessionRef.current = id
      setSessionId(id)
      setChatCtx({ target_skill: res.data.context?.target_skill || null, job_title: res.data.context?.job_title || null })
      setMode(res.data.mode)
      setChatKey(k => k + 1)
    } catch {
      setHistoryNote("Couldn't open that chat. Please try again.")
    }
  }

  // Opened from the Dashboard's "Continue a chat": open that chat straight away
  const startSession = location.state?.openSession
  useEffect(() => {
    if (!startSession) return
    const timer = setTimeout(() => openSession(startSession), 0)
    return () => clearTimeout(timer)
  }, [startSession]) // eslint-disable-line react-hooks/exhaustive-deps

  const deleteSession = async (id) => {
    setConfirmDelete(null)
    try {
      await api.delete(`/chatbot/sessions/${id}`)
      if (id === sessionId) newChat()
      loadSessions()
    } catch {
      setHistoryNote("Couldn't delete that chat. Please try again.")
    }
  }

  // "Learn ISTQB · Software QA Engineer" for chats started from a job, else the first question
  const chatLabel = (s) => s.context?.target_skill
    ? `Learn ${s.context.target_skill}${s.context.job_title ? ` · ${s.context.job_title}` : ''}` : s.title
  const today = new Date().toDateString()
  const groups = [
    ['Today', sessions.filter(s => new Date(s.updated_at).toDateString() === today)],
    ['Earlier', sessions.filter(s => new Date(s.updated_at).toDateString() !== today)],
  ].filter(([, list]) => list.length)

  return (
    <div className="flex flex-col h-screen">

      <PageHeader>
        <div className="flex items-start justify-between pb-4 pt-1">
          <div>
            <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-widest mb-2">AI Assistant</p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{currentMode.label}</h1>
            <p className="text-xs text-slate-400 mt-1">Powered by Groq · Context-aware</p>
          </div>
          {/* Mode switcher */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1 mt-1">
            {MODES.map(m => (
              <button
                key={m.key}
                onClick={() => switchMode(m.key)}
                disabled={loading}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all disabled:cursor-not-allowed ${
                  mode === m.key
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {m.icon}
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="pb-3">
          {/* Opened from a job (6 Oct, her choice B): say which job the plan is for, with the way back beside it */}
          <div className="flex items-center justify-between gap-3 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            {chatCtx.target_skill && mode === 'skill_development' ? (
              <p className="min-w-0 truncate">
                Learning <span className="font-medium text-blue-600">{chatCtx.target_skill}</span>
                {chatCtx.job_title && <> for <span className="font-medium text-slate-700">{chatCtx.job_title}</span></>}
              </p>
            ) : (
              <p className="min-w-0">{currentMode.description}</p>
            )}
            {fromJob && (
              <button onClick={() => navigate(-1)} title={`Back to ${fromJob}`}
                className="shrink-0 font-medium text-blue-600 hover:text-blue-700 hover:underline">
                ← Back to job
              </button>
            )}
          </div>
        </div>
      </PageHeader>

      <div className="flex flex-1 min-h-0">
        {/* Past chats (her choice A, 6 Oct): always visible on the left, like ChatGPT / Claude / Gemini */}
        {!listOpen ? (
          <aside className="w-12 shrink-0 bg-white border-r border-slate-200 flex flex-col items-center gap-2 py-3">
            <button onClick={toggleList} title="Show past chats" aria-label="Show past chats"
              className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            </button>
            <button onClick={() => newChat()} disabled={loading} title="New chat" aria-label="New chat"
              className="w-8 h-8 rounded-lg bg-blue-600 text-white text-base leading-none hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition">
              +
            </button>
          </aside>
        ) : (
        <aside className="w-56 shrink-0 bg-white border-r border-slate-200 flex flex-col min-h-0">
          <div className="p-3 flex items-center gap-2">
            <button onClick={() => newChat()} disabled={loading}
              className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg py-2 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition">
              <span className="text-sm leading-none">+</span> New chat
            </button>
            <button onClick={toggleList} title="Hide past chats" aria-label="Hide past chats"
              className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition shrink-0">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-2 pb-3" aria-label="Past chats">
            {historyNote && <p className="text-[11px] text-amber-700 bg-amber-50 rounded-md px-2 py-1.5 mx-1 mb-2">{historyNote}</p>}
            {!historyNote && !sessions.length && (
              <p className="text-[11px] text-slate-400 px-2">Your chats will be saved here.</p>
            )}
            {groups.map(([label, list]) => (
              <div key={label} className="mb-2">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 mt-2 mb-1">{label}</p>
                {list.map(s => (
                  <div key={s.id} className={`group flex items-center rounded-md ${s.id === sessionId ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                    {confirmDelete === s.id ? (
                      <div className="flex items-center justify-between w-full px-2 py-1.5 text-[11px]">
                        <span className="text-slate-600">Delete this chat?</span>
                        <span className="flex gap-2">
                          <button onClick={() => deleteSession(s.id)} className="font-medium text-rose-600 hover:underline">Delete</button>
                          <button onClick={() => setConfirmDelete(null)} className="text-slate-500 hover:underline">Cancel</button>
                        </span>
                      </div>
                    ) : (
                      <>
                        <button onClick={() => openSession(s.id)} title={chatLabel(s)}
                          className={`flex-1 min-w-0 text-left px-2 py-1.5 text-xs truncate ${s.id === sessionId ? 'text-blue-700 font-medium' : 'text-slate-600'}`}>
                          {chatLabel(s)}
                        </button>
                        <button onClick={() => setConfirmDelete(s.id)} aria-label="Delete chat"
                          className="shrink-0 px-2 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 focus:opacity-100 transition">×</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </nav>
        </aside>
        )}

        <div className="flex-1 flex flex-col min-w-0">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-5 bg-slate-50">
          <div className="space-y-4">
            {messages.map((msg, idx) => (
              <MessageBubble key={idx} msg={msg} />
            ))}
            {loading && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input */}
        <div className="bg-white border-t border-slate-200 px-6 py-4 shrink-0">
          <div className="flex gap-3">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={currentMode.placeholder}
              maxLength={4000}
              rows={1}
              className="flex-1 resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition leading-relaxed"
              style={{ maxHeight: '120px', overflowY: 'auto' }}
              disabled={loading}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              aria-label="Send message"
              className="w-11 h-11 bg-blue-600 text-white rounded-xl flex items-center justify-center hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition shrink-0 self-end"
            >
              {/* Heroicons v2 paper-airplane: points right, the way the message goes (v1's pointed up) */}
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                  d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
              </svg>
            </button>
          </div>
          <p className="text-center text-xs text-slate-300 mt-2">Enter to send · Shift+Enter for new line</p>
        </div>
        </div>
      </div>
    </div>
  )
}