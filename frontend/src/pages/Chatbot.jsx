import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import api from '../api'
import PageHeader from '../components/PageHeader'

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

function MessageBubble({ msg }) {
  const isUser = msg.role === 'user'

  const renderContent = (text) => {
    const lines = text.split('\n').filter(l => l.trim() !== '')
    return lines.map((line, i) => {
      const isBullet = /^[-•*]\s/.test(line.trim()) || /^\d+\.\s/.test(line.trim())
      const isHeader = /^\*\*[^*]+\*\*$/.test(line.trim()) || /^#{1,3}\s/.test(line.trim())

      const formatBold = (str) => {
        const parts = str.split(/\*\*(.*?)\*\*/g)
        return parts.map((part, pi) =>
          pi % 2 === 1 ? <strong key={pi} className="font-semibold text-slate-900">{part}</strong> : part
        )
      }

      if (isHeader) {
        const clean = line.replace(/^#{1,3}\s/, '').replace(/^\*\*|\*\*$/g, '').trim()
        return (
          <p key={i} className="text-sm font-semibold text-slate-800 mt-3 mb-1 first:mt-0">{clean}</p>
        )
      }

      if (isBullet) {
        const clean = line.trim().replace(/^[-•*]\s/, '').replace(/^\d+\.\s/, '')
        return (
          <div key={i} className="flex items-start gap-2 text-sm text-slate-600 leading-relaxed">
            <span className="text-blue-400 shrink-0 mt-0.5">•</span>
            <span>{formatBold(clean)}</span>
          </div>
        )
      }

      return (
        <p key={i} className="text-sm text-slate-600 leading-relaxed">{formatBold(line)}</p>
      )
    })
  }

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
        className={`max-w-[75%] px-4 py-3 rounded-2xl space-y-1 ${
          isUser
            ? 'bg-blue-600 text-white rounded-br-sm'
            : 'bg-white border border-slate-200 rounded-bl-sm shadow-sm'
        }`}
      >
        {isUser
          ? <p className="text-sm text-white leading-relaxed">{msg.content}</p>
          : renderContent(msg.content)
        }
      </div>
    </div>
  )
}

export default function Chatbot() {
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const preloadSkill = params.get('skill')
  const preloadJob = params.get('job')

  const initialMode = preloadSkill ? 'skill_development' : 'career_counsellor'
  const [mode, setMode] = useState(initialMode)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const hasAutoSent = useRef(false)

  const currentMode = MODES.find(m => m.key === mode)

  const getContext = useCallback(() => {
    const ctx = {}
    const savedResults = sessionStorage.getItem('lastRecommendResults')
    if (savedResults) {
      const data = JSON.parse(savedResults)
      ctx.user_skills = data.graduate_profile?.skills || []
      ctx.matched_jobs = data.recommendations?.slice(0, 3).map(j => ({
        job_title: j.job_title,
        company: j.company,
        match_percent: j.match_percent,
      })) || []
    }
    if (preloadJob) ctx.job_title = preloadJob
    if (preloadSkill) ctx.target_skill = preloadSkill
    return ctx
  }, [preloadJob, preloadSkill])

  const sendMessages = useCallback(async (msgs) => {
    setLoading(true)
    try {
      const ctx = getContext()
      const res = await api.post('/chatbot/', {
        mode,
        messages: msgs.map(m => ({ role: m.role, content: m.content })),
        ...ctx,
      })
      setMessages(prev => [...prev, { role: 'assistant', content: res.data.reply }])
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Something went wrong. Please try again.',
      }])
    } finally {
      setLoading(false)
    }
  }, [mode, getContext])

  useEffect(() => {
    const greeting = currentMode.greeting
    const initMessages = [{ role: 'assistant', content: greeting }]
    let shouldAutoSend = false

    if (preloadSkill && mode === 'skill_development' && !hasAutoSent.current) {
      const userMsg = {
        role: 'user',
        content: `I want to learn ${preloadSkill}. Can you give me a learning plan?`,
      }
      initMessages.push(userMsg)
      shouldAutoSend = true
    }

    const timer = setTimeout(() => {
      setMessages(initMessages)
      setInput('')
      if (shouldAutoSend) {
        hasAutoSent.current = true
        sendMessages(initMessages)
      }
    }, 0)

    return () => clearTimeout(timer)
  }, [mode, preloadSkill, currentMode, sendMessages])

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

  const switchMode = (newMode) => {
    if (newMode === mode) return
    hasAutoSent.current = false
    setMode(newMode)
  }

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
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
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
          <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            {currentMode.description}
            {preloadSkill && mode === 'skill_development' && (
              <span className="ml-1 font-medium text-blue-600">
                · Learning: {preloadSkill}
              </span>
            )}
          </p>
        </div>
      </PageHeader>

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
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        <p className="text-center text-xs text-slate-300 mt-2">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  )
}