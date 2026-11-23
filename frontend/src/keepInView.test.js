import { describe, expect, it, beforeEach } from 'vitest'
import { fit } from './keepInView'

// a floating box whose measured position we control (jsdom has no layout)
function box({ left, top, width, height }) {
  const el = document.createElement('div')
  el.setAttribute('data-keep-in-view', '')
  el.style.position = 'absolute'
  document.body.appendChild(el)
  el.getBoundingClientRect = () => {
    const dx = parseFloat(el.dataset.kivX || '0'), dy = parseFloat(el.dataset.kivY || '0')
    return { left: left + dx, right: left + dx + width, top: top + dy, bottom: top + dy + height, width, height }
  }
  return el
}

describe('keepInView', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    Object.defineProperty(document.documentElement, 'clientWidth', { value: 400, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
  })

  it('pulls a popup sticking out on the right back inside, 8px from the edge', () => {
    const el = box({ left: 300, top: 100, width: 200, height: 100 })
    fit(el)
    expect(el.dataset.kivX).toBe('-108')
    expect(el.style.translate).toContain('-108px')
  })

  it('pulls a popup sticking out on the left back inside', () => {
    const el = box({ left: -197, top: 100, width: 300, height: 100 })
    fit(el)
    expect(el.dataset.kivX).toBe('205')
  })

  it('lifts a popup that runs past the bottom', () => {
    const el = box({ left: 20, top: 700, width: 200, height: 200 })
    fit(el)
    expect(el.dataset.kivY).toBe('-108')
  })

  it('leaves a popup that already fits alone', () => {
    const el = box({ left: 20, top: 20, width: 200, height: 100 })
    fit(el)
    expect(el.style.translate).toBe('')
  })

  it('does not stack the shift when measured again', () => {
    const el = box({ left: 300, top: 100, width: 200, height: 100 })
    fit(el); fit(el)
    expect(el.dataset.kivX).toBe('-108')
  })
})
