import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import api, { PAGE_CACHE, memoryCache } from './api'
import { ALL_MATCHES, cached, peek } from './pageCache'

let calls
const serve = (data = { ok: true }, delay = 0) => {
  api.defaults.adapter = async (config) => {
    calls.push(`${config.method} ${config.url}`)
    if (delay) await new Promise(r => setTimeout(r, delay))
    return { data: typeof data === 'function' ? data(config) : data, status: 200, statusText: '', headers: {}, config }
  }
}

beforeEach(() => { calls = []; memoryCache.clear() })
afterEach(() => vi.useRealTimers())

describe('slow answers are kept, so moving between pages does not reload them', () => {
  it('asks the server once and answers the second time from the saved copy', async () => {
    serve({ jobs: [1, 2] })
    expect(await cached('/recommend/goal')).toEqual({ jobs: [1, 2] })
    expect(await cached('/recommend/goal')).toEqual({ jobs: [1, 2] })
    expect(calls).toEqual(['get /recommend/goal'])
  })
  it('peek shows the saved answer without sending anything, or null when there is none', async () => {
    serve()
    expect(peek('/recommend/goal')).toBeNull()
    await cached('/recommend/goal')
    expect(peek('/recommend/goal')).toEqual({ ok: true })
    expect(calls).toHaveLength(1)
  })
  it('the same request asked twice at once runs once', async () => {
    serve({ ok: 1 }, 20)
    const [a, b] = await Promise.all([cached('/recommend/fit'), cached('/recommend/fit')])
    expect(a).toEqual(b)
    expect(calls).toHaveLength(1)
  })
  it('a POST is kept per body: the same body once, a different body separately', async () => {
    serve((config) => ({ echoed: JSON.parse(config.data) }))
    await cached('/recommend/', ALL_MATCHES)
    await cached('/recommend/', { ...ALL_MATCHES })           // same content, new object
    await cached('/recommend/', { ...ALL_MATCHES, category: 'Developers' })
    expect(calls).toEqual(['post /recommend/', 'post /recommend/'])
    expect((await cached('/recommend/', { ...ALL_MATCHES, category: 'Developers' })).echoed.category).toBe('Developers')
  })
  it('the default Job Matches request is the one Dashboard and the chatbot share', () => {
    expect(ALL_MATCHES).toEqual({ top_n: 0, role_filter: '', category: '' })
  })
})

describe('a saved answer does not go out of date', () => {
  it('is dropped after 15 minutes (changes on the server side)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    serve()
    await cached('/recommend/goal')
    vi.setSystemTime(Date.now() + 14 * 60000)
    expect(peek('/recommend/goal')).not.toBeNull()
    vi.setSystemTime(Date.now() + 2 * 60000)                 // 16 minutes in all
    expect(peek('/recommend/goal')).toBeNull()
    await cached('/recommend/goal')
    expect(calls).toHaveLength(2)
  })
  it('is dropped at once after the student changes the profile', async () => {
    serve()
    await cached('/recommend/goal')
    await api.put('/profile/about', {})
    expect(peek('/recommend/goal')).toBeNull()
    await cached('/recommend/goal')
    expect(calls.filter(c => c === 'get /recommend/goal')).toHaveLength(2)
  })
  it('a failed request is not saved, and the next ask tries again', async () => {
    api.defaults.adapter = async () => { throw new Error('network down') }
    await expect(cached('/recommend/goal')).rejects.toThrow('network down')
    serve()
    expect(await cached('/recommend/goal')).toEqual({ ok: true })
  })
})

describe('the saved copy stays small', () => {
  it('keeps the 15 newest answers in sessionStorage', async () => {
    serve()
    for (let i = 0; i < 20; i++) await cached(`/skillgap/job-${i}`)
    expect(Object.keys(JSON.parse(sessionStorage.getItem(PAGE_CACHE)))).toHaveLength(15)
  })
  it('still works when the browser blocks storage (just no saved copy there)', async () => {
    serve()
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    expect(await cached('/recommend/goal')).toEqual({ ok: true })
    set.mockRestore()
    expect(peek('/recommend/goal')).toEqual({ ok: true })    // the in-memory copy is still there
  })
})
