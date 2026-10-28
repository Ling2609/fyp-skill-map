import { AxiosError } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import api, { PAGE_CACHE, memoryCache } from './api'

// A stand-in for the server: the adapter answers every request, so the real interceptors in api.js run.
let seen
const answer = (status = 200, data = {}) => async (config) => {
  seen.push(config)
  const response = { data, status, statusText: '', headers: {}, config }
  if (status >= 400) throw new AxiosError('failed', 'ERR_BAD_REQUEST', config, null, response)
  return response
}
const loginRedirect = () => window.location.href

beforeEach(() => {
  seen = []
  memoryCache.clear()
  vi.stubGlobal('location', { pathname: '/dashboard', href: '' })
})
afterEach(() => vi.unstubAllGlobals())

describe('every request carries the sign-in token', () => {
  it('adds it when there is one', async () => {
    localStorage.setItem('token', 'abc')
    api.defaults.adapter = answer()
    await api.get('/profile/skills')
    expect(seen[0].headers.Authorization).toBe('Bearer abc')
  })
  it('sends none when nobody is signed in', async () => {
    api.defaults.adapter = answer()
    await api.get('/jobs/subcategories')
    expect(seen[0].headers.Authorization).toBeUndefined()
  })
})

describe('an input check that fails (422) never blanks a page', () => {
  it('turns the list of field errors into one plain sentence', async () => {
    api.defaults.adapter = answer(422, { detail: [{ loc: ['body', 'email'], msg: 'bad', type: 'value_error' }] })
    const err = await api.post('/auth/register', {}).catch(e => e)
    expect(err.response.data.detail).toBe("Something in that request wasn't valid. Go back and try again.")
  })
  it('leaves an ordinary text message alone', async () => {
    api.defaults.adapter = answer(400, { detail: 'Wrong current password' })
    const err = await api.put('/auth/me/password', {}).catch(e => e)
    expect(err.response.data.detail).toBe('Wrong current password')
  })
})

describe('an expired sign-in (401) sends the student back to sign in', () => {
  beforeEach(() => { localStorage.setItem('token', 'old'); sessionStorage.setItem('x', '1') })

  it('clears the token and everything saved, then goes to /login', async () => {
    api.defaults.adapter = answer(401, { detail: 'Could not validate credentials' })
    await api.get('/recommend/goal').catch(() => {})
    expect(localStorage.getItem('token')).toBeNull()
    expect(sessionStorage.getItem('x')).toBeNull()
    expect(loginRedirect()).toBe('/login?expired=1')
  })
  it('says so when the password was changed on another device', async () => {
    api.defaults.adapter = answer(401, { detail: 'Your password was changed. Please sign in again.' })
    await api.get('/auth/me').catch(() => {})
    expect(loginRedirect()).toBe('/login?expired=password')
  })
  it('says so when the account was deactivated', async () => {
    api.defaults.adapter = answer(401, { detail: 'This account has been deactivated.' })
    await api.get('/auth/me').catch(() => {})
    expect(loginRedirect()).toBe('/login?expired=deactivated')
  })
  it('leaves a wrong password on the sign-in form alone (also a 401)', async () => {
    api.defaults.adapter = answer(401, { detail: 'Incorrect username or password' })
    await api.post('/auth/login', {}).catch(() => {})
    expect(localStorage.getItem('token')).toBe('old')
    expect(loginRedirect()).toBe('')
  })
  it.each(['/', '/login', '/register', '/forgot-password'])('does not redirect on the public page %s', async (path) => {
    vi.stubGlobal('location', { pathname: path, href: '' })
    api.defaults.adapter = answer(401)
    await api.get('/auth/me').catch(() => {})
    expect(loginRedirect()).toBe('')
    expect(localStorage.getItem('token')).toBe('old')
  })
  it('does nothing when nobody was signed in', async () => {
    localStorage.clear()
    api.defaults.adapter = answer(401)
    await api.get('/recommend/goal').catch(() => {})
    expect(loginRedirect()).toBe('')
  })
})

describe('a change to the profile drops the saved slow answers at once', () => {
  const save = () => { sessionStorage.setItem(PAGE_CACHE, '{"a":1}'); memoryCache.set('a', { data: 1 }) }
  it.each(['post', 'put', 'delete', 'patch'])('after a successful %s to /profile', async (method) => {
    api.defaults.adapter = answer()
    save()
    await api[method]('/profile/projects/3')
    expect(sessionStorage.getItem(PAGE_CACHE)).toBeNull()
    expect(memoryCache.size).toBe(0)
  })
  it('but not after a plain read of /profile', async () => {
    api.defaults.adapter = answer()
    save()
    await api.get('/profile/skills')
    expect(sessionStorage.getItem(PAGE_CACHE)).not.toBeNull()
    expect(memoryCache.size).toBe(1)
  })
  it('and not after a change somewhere else', async () => {
    api.defaults.adapter = answer()
    save()
    await api.post('/applications/apply', {})
    expect(memoryCache.size).toBe(1)
  })
  it('and not when the change failed', async () => {
    api.defaults.adapter = answer(500)
    save()
    await api.post('/profile/projects', {}).catch(() => {})
    expect(memoryCache.size).toBe(1)
  })
})
