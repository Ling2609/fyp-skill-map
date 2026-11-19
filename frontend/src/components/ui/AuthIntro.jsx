import { useEffect, useRef, useState } from 'react'
import { STAGE_HTML } from './authStage'
import './authStage.css'

// ── The SkillMap intro on the entry screens (19 Nov, her approved mock review/auth-intro.html) ─────────────────────
// Apple's product pages keep one object still while the words change around it, one idea per beat: here the map
// stage stays and SkillMap's own story plays on it. Sign-up research: the intro never blocks the form, so it pauses
// while you type, while you hover it, or when you press the chapter you are on (WCAG 2.2.2: moving content can be
// stopped; her request: no separate pause button). Each chapter lasts as long as its animation plus a short read, and
// the story loops. Reduced motion: nothing plays; the chapters still step through it.
// [chapter label, title, sentence, stage beat, seconds]
const STORIES = {
  s: [
    ['Your modules', 'Your modules already count.', 'Add your grades and projects. SkillMap reads the skills they prove.', 1, 2.4],
    ['Real job ads', 'Then it reads real job ads.', 'Each live ad is checked for the skills it asks for, so you see a match, not a guess.', 2, 2.6],
    ['Where you stand', 'See where you stand.', 'How many skills you have, and which one to learn next to open more jobs.', 3, 2.8],
    ['AI for gaps', 'Close a gap with the AI Assistant.', 'Ask how to learn a missing skill and get a plan you can start today.', 4, 3.4],
    ['Meet employers', 'Meet the employer.', 'Apply on SkillMap and follow every step: applied, viewed, shortlisted, decided.', 5, 3.1],
  ],
  e: [
    ['Post a job', 'Post a job in plain words.', 'Paste the ad. SkillMap picks out the skills it asks for.', 1, 2.6],
    ['Who fits', 'See graduates who fit.', 'Ranked by skills they have proven, not by keywords on a CV.', 2, 2.2],
    ['The evidence', 'Check the evidence.', 'Every skill links back to where it came from: a module, a repo, a job.', 3, 2.6],
    ['Invite', 'Invite and decide.', 'Invite a graduate, then move them along: viewed, shortlisted, decided.', 5, 3.1],
  ],
}
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export function AuthIntro({ story = 's', headline }) {
  const list = STORIES[story] || STORIES.s
  const [beat, setBeat] = useState(1)
  const [held, setHeld] = useState({ hover: false, typing: false, user: false })
  const [still] = useState(reducedMotion)
  const box = useRef(null), stage = useRef(null)
  const paused = still || held.hover || held.typing || held.user

  // a new story (Register's Student / Employer switch) starts at its first chapter
  const [shownStory, setShownStory] = useState(story)
  if (shownStory !== story) { setShownStory(story); setBeat(1) }

  // the stage: drawn at 560×400, scaled to its box
  useEffect(() => {
    const el = box.current
    if (!el) return
    const fit = () => stage.current?.style.setProperty('--k', el.clientWidth / 560)
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // the stage beat. The old beat fades out while the next arrives; replaying the same beat resets it first
  useEffect(() => {
    const el = stage.current
    if (!el) return
    const to = String(list[beat - 1][3])
    if (el.dataset.beat !== to) { el.dataset.beat = to; return }
    el.dataset.beat = '0'
    const id = requestAnimationFrame(() => requestAnimationFrame(() => { el.dataset.beat = to }))
    return () => cancelAnimationFrame(id)
  }, [beat, list, story])

  // typing in the form holds the story; leaving the form lets it carry on
  useEffect(() => {
    const onIn = (e) => { if (e.target.closest?.('.auth-card')) setHeld(h => ({ ...h, typing: true })) }
    const onOut = (e) => { if (!e.relatedTarget?.closest?.('.auth-card')) setHeld(h => ({ ...h, typing: false })) }
    document.addEventListener('focusin', onIn)
    document.addEventListener('focusout', onOut)
    return () => { document.removeEventListener('focusin', onIn); document.removeEventListener('focusout', onOut) }
  }, [])

  const next = () => setBeat(b => (b < list.length ? b + 1 : 1))
  const pick = (i) => {
    if (i === beat && !still) { setHeld(h => ({ ...h, user: !h.user })); return }
    setBeat(i)
  }

  return (
    <div className="sm-lede">
      <h1 className="sm-h1">{headline}</h1>
      <div className="sm-caption">
        {list.map((b, i) => (
          <p key={b[0]} className={i + 1 === beat ? 'on' : ''} aria-hidden={i + 1 !== beat}>
            <b><span className="n">0{i + 1}</span>{b[1]}</b><span>{b[2]}</span>
          </p>
        ))}
      </div>
      <div ref={box} className="sm-stagebox" aria-hidden="true"
        onMouseEnter={() => setHeld(h => ({ ...h, hover: true }))} onMouseLeave={() => setHeld(h => ({ ...h, hover: false }))}>
        <div ref={stage} className="sm-stage" data-story={story} data-beat="0" dangerouslySetInnerHTML={{ __html: STAGE_HTML }} />
      </div>
      <ol className={`sm-chapters ${paused ? 'paused' : ''}`}>
        {list.map((b, i) => {
          const n = i + 1, now = n === beat
          return (
            <li key={b[0]} className={n < beat ? 'done' : now ? 'now' : ''} style={{ '--beat': `${b[4]}s` }}>
              <button type="button" onClick={() => pick(n)}
                aria-label={now && !still ? `${held.user ? 'Play' : 'Pause'} the intro at chapter ${n}: ${b[1]}` : `Chapter ${n}: ${b[1]}`}
                aria-current={now ? 'step' : undefined} aria-pressed={now && !still ? held.user : undefined}>
                {/* the bar fills over the chapter's time; when it is full the next chapter starts */}
                <span className="bar"><i key={`${story}-${beat}`} onAnimationEnd={now && !still ? next : undefined} /></span>
                <span className="lbl">{b[0]}{now && paused && !still && <span className="held"> · paused</span>}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
